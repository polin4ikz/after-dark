/* AFTER DARK — Venom HTML5/HLS/DASH player experiment.
   This plays a direct media URL supplied by the user; it does not discover or scrape streaming services. */
(function () {
  "use strict";
  const VERSION = "0.3.6";
  const PUBLIC_PATH = "https://cdn.jsdelivr.net/npm/player-venom@" + VERSION + "/dist/";
  const STORAGE_KEY = "after-dark:venom-source:v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  let playerPromise = null;
  let playerInstance = null;
  let activeStage = null;

  function filmKey(film) {
    const id = film && (film.tmdbId ?? film.id);
    if (id == null || !String(id).trim()) return "";
    const type = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    return type + ":" + String(id);
  }
  function readSources() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function normalizeSource(rawUrl, kind) {
    if (!["hls", "dash", "file"].includes(kind)) throw new Error("Выбери тип источника.");
    let url;
    try { url = new URL(String(rawUrl || "").trim()); } catch (_) { throw new Error("Вставь прямую ссылку на видео или манифест."); }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      throw new Error("Нужна безопасная HTTPS-ссылка без логина и пароля.");
    }
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
      throw new Error("Локальные адреса не поддерживаются.");
    }
    return { kind, url: url.href };
  }
  function loadPlayer() {
    if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") return Promise.resolve(window.VenomPlayer);
    if (playerPromise) return playerPromise;
    playerPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-after-dark-venom="true"]');
      const script = existing || document.createElement("script");
      const fail = () => { playerPromise = null; reject(new Error("Не удалось загрузить Venom Player с CDN. Проверь подключение и VPN.")); };
      script.addEventListener("error", fail, { once: true });
      script.addEventListener("load", () => {
        if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") resolve(window.VenomPlayer);
        else { playerPromise = null; reject(new Error("Venom Player загрузился, но API VenomPlayer.make не найден.")); }
      }, { once: true });
      if (!existing) {
        script.src = PUBLIC_PATH + "player.js";
        script.async = true;
        script.dataset.afterDarkVenom = "true";
        document.head.appendChild(script);
      }
    });
    return playerPromise;
  }
  function setStatus(modal, message, isError) {
    const status = $(".ad-watch-player__status", modal);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }
  function stopPlayer() {
    try { playerInstance?.pause?.(); } catch (_) {}
    try { playerInstance?.destroy?.(); } catch (_) {}
    playerInstance = null;
    activeStage = null;
  }
  function mountPanel(modal) {
    if ($(".ad-venom-panel", modal)) return;
    const form = document.createElement("form");
    form.className = "ad-watch-player__form ad-venom-panel";
    form.innerHTML = [
      '<label for="adVenomKind">ИЛИ ЗАПУСТИТЬ VENOM PLAYER · ПРЯМОЙ ПОТОК</label>',
      '<p class="ad-venom-note">Нужна прямая HTTPS-ссылка на HLS (.m3u8), DASH (.mpd) или видеофайл (MP4/WebM). Обычная ссылка на страницу онлайн-кинотеатра не подойдёт.</p>',
      '<div class="ad-venom-controls">',
      '<select id="adVenomKind" name="kind" aria-label="Тип источника"><option value="hls">HLS · M3U8</option><option value="dash">DASH · MPD</option><option value="file">MP4 / WEBM</option></select>',
      '<input id="adVenomSource" name="source" type="url" inputmode="url" placeholder="https://…/master.m3u8" autocomplete="url" required>',
      '<button type="submit">ЗАПУСТИТЬ ↗</button>',
      '</div>',
      '<p class="ad-venom-note">Источник сохраняется только в этом браузере. Доступность зависит от ссылки, CORS и прав источника.</p>'
    ].join("");
    const originalForm = $(".ad-watch-player__form:not(.ad-venom-panel)", modal);
    if (originalForm) originalForm.insertAdjacentElement("afterend", form);
    else $(".ad-watch-player__window", modal)?.appendChild(form);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const film = modal._film;
      const key = filmKey(film);
      const stage = $(".ad-watch-player__stage", modal);
      const kind = $("#adVenomKind", form).value;
      let source;
      try { source = normalizeSource($("#adVenomSource", form).value, kind); }
      catch (error) { setStatus(modal, error.message, true); return; }
      if (!stage) return;
      stopPlayer();
      stage.replaceChildren();
      const container = document.createElement("div");
      container.className = "ad-venom-mount";
      container.setAttribute("aria-label", "Видеоплеер");
      stage.appendChild(container);
      setStatus(modal, "ЗАГРУЖАЮ VENOM PLAYER…", false);
      try {
        const VenomPlayer = await loadPlayer();
        if (!modal.classList.contains("is-open") || !container.isConnected) return;
        const mediaSource = source.kind === "hls" ? { hls: source.url }
          : source.kind === "dash" ? { dash: source.url }
          : { file: { "Авто": source.url } };
        playerInstance = VenomPlayer.make({
          container,
          publicPath: PUBLIC_PATH,
          source: mediaSource,
          title: String(film?.title || film?.name || "AFTER DARK"),
          theme: "modern",
          aspectRatio: "16:9",
          autoLandscape: true,
          pip: true,
          trackProgress: 15,
          doNotSaveProgress: false,
          cssVars: {
            "color-primary": "#8b1d2c",
            "background-color-primary": "rgba(16, 14, 13, .96)"
          }
        });
        activeStage = stage;
        if (key) {
          const all = readSources();
          all[key] = source;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (_) {}
        }
        setStatus(modal, "VENOM PLAYER · ИСТОЧНИК ПОДКЛЮЧЁН", false);
      } catch (error) {
        stage.replaceChildren();
        setStatus(modal, error?.message || "Не удалось запустить Venom Player.", true);
      }
    });
  }
  function observeModal(modal) {
    mountPanel(modal);
    const film = modal._film;
    const key = filmKey(film);
    const saved = readSources()[key];
    const input = $("#adVenomSource", modal);
    const kind = $("#adVenomKind", modal);
    const panel = $(".ad-venom-panel", modal);
    if (panel && panel.dataset.filmKey !== key) {
      panel.dataset.filmKey = key;
      if (input && kind) {
        input.value = "";
        kind.value = "hls";
        if (saved) {
          try {
            const valid = normalizeSource(saved.url, saved.kind);
            input.value = valid.url;
            kind.value = valid.kind;
          } catch (_) {}
        }
      }
    }
  }
  function init() {
    const observer = new MutationObserver(() => {
      const modal = $("#adWatchPlayer");
      if (modal) observeModal(modal);
      if (activeStage && (!activeStage.isConnected || !activeStage.firstElementChild)) stopPlayer();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", event => {
      if (event.target.closest("[data-ad-watch-close]")) stopPlayer();
    }, true);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") stopPlayer();
    });
    window.addEventListener("pagehide", stopPlayer);
    const existing = $("#adWatchPlayer");
    if (existing) observeModal(existing);
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { normalizeSource, filmKey };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();
