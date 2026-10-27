/* AFTER DARK — Venom HTML5/HLS/DASH player experiment.
   This plays a direct media URL supplied by the user; it does not discover or scrape streaming services. */
(function () {
  "use strict";
  const VERSION = "0.3.6";
  const PUBLIC_PATH = "https://cdn.jsdelivr.net/npm/player-venom@" + VERSION + "/dist/";
  const STORAGE_KEY = "after-dark:venom-source:v1";
  const PROGRESS_STORAGE_KEY = "after-dark:venom-progress:v1";
  let activeFilmKey = "";
  let lastProgressWrite = 0;
  const $ = (selector, root = document) => root.querySelector(selector);
  let playerPromise = null;
  let playerInstance = null;
  let activeStage = null;

  function filmKey(film) {
    const id = film && (film.tmdbId ?? film.id);
    if (id == null || !String(id).trim()) return "";
    const type = film.type === "series" || film.type === "tv" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    return type + ":" + String(id);
  }
  function readSources() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }
  function progressKey(key) { return key ? PROGRESS_STORAGE_KEY + ":" + key : ""; }
  function readProgress(key) {
    try {
      const storageKey = progressKey(key);
      if (!storageKey) return null;
      const item = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!item || !Number.isFinite(item.time) || item.time < 0) return null;
      return { time: Math.floor(item.time), duration: Number.isFinite(item.duration) && item.duration > 0 ? Math.floor(item.duration) : 0, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0 };
    } catch (_) { return null; }
  }
  function saveProgress(key, time, duration) {
    const storageKey = progressKey(key);
    if (!storageKey || !Number.isFinite(time) || time < 0) return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ time: Math.floor(time), duration: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0, updatedAt: Date.now() }));
      return true;
    } catch (_) { return false; }
  }
  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") : m + ":" + String(s).padStart(2, "0");
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
      // Do not attach a load listener to a possibly already-loaded script: that event
      // will not fire again and leaves the player UI waiting forever.
      const script = document.createElement("script");
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        playerPromise = null;
        reject(new Error("Не удалось загрузить Venom Player с CDN. Проверь подключение и VPN."));
      };
      script.addEventListener("error", fail, { once: true });
      script.addEventListener("load", () => {
        if (settled) return;
        if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") {
          settled = true;
          resolve(window.VenomPlayer);
        } else {
          settled = true;
          playerPromise = null;
          reject(new Error("Venom Player загрузился, но API VenomPlayer.make не найден."));
        }
      }, { once: true });
      script.src = PUBLIC_PATH + "player.js";
      script.async = true;
      script.dataset.afterDarkVenom = "true";
      document.head.appendChild(script);
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
    activeFilmKey = "";
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
        const savedProgress = readProgress(key);
        const resumeTime = savedProgress && savedProgress.time > 10 && (!savedProgress.duration || savedProgress.time < savedProgress.duration - 15) ? savedProgress.time : 0;
        const mediaSource = source.kind === "hls" ? { hls: source.url }
          : source.kind === "dash" ? { dash: source.url }
          : { file: { 720: source.url } };
        activeFilmKey = key;
        lastProgressWrite = -10;
        playerInstance = VenomPlayer.make({
          container,
          publicPath: PUBLIC_PATH,
          source: mediaSource,
          time: resumeTime,
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
        if (playerInstance && typeof playerInstance.on === "function") {
          const captureProgress = data => {
            if (!key || activeFilmKey !== key) return;
            const current = Number(data?.currentTime ?? data?.seconds ?? data?.time ?? data?.position ?? data?.target?.currentTime ?? data?.currentTarget?.currentTime ?? data?.detail?.currentTime);
            const duration = Number(data?.duration ?? data?.totalTime ?? data?.target?.duration ?? data?.currentTarget?.duration ?? data?.detail?.duration);
            if (!Number.isFinite(current) || current < 0) return;
            const rounded = Math.floor(current);
            if (rounded - lastProgressWrite >= 10) {
              saveProgress(key, rounded, duration);
              lastProgressWrite = rounded;
            }
          };
          playerInstance.on("timeupdate", captureProgress);
          playerInstance.on("viewProgress", captureProgress);
          playerInstance.on("ended", () => { try { localStorage.removeItem(progressKey(key)); } catch (_) {} });
        }
        if (key) {
          const all = readSources();
          all[key] = source;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (_) {}
        }
        setStatus(modal, resumeTime ? "ПРОДОЛЖАЕМ С " + formatTime(resumeTime) + " · VENOM PLAYER" : "VENOM PLAYER · ИСТОЧНИК ПОДКЛЮЧЁН", false);
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
    // Reopening the same title must relaunch its saved source too. The modal token
    // changes only on an explicit open, so observer callbacks cannot relaunch it in a loop.
    const openToken = modal.dataset.openToken || "";
    if (saved && modal.classList.contains("is-open") && openToken && panel.dataset.lastOpenToken !== openToken) {
      try {
        const valid = normalizeSource(saved.url, saved.kind);
        panel.dataset.lastOpenToken = openToken;
        if (input && kind) {
          input.value = valid.url;
          kind.value = valid.kind;
          panel.requestSubmit();
        }
      } catch (_) { panel.dataset.lastOpenToken = openToken; }
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
  if (typeof module !== "undefined" && module.exports) module.exports = { normalizeSource, filmKey, readProgress, saveProgress, formatTime, PROGRESS_STORAGE_KEY };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();
