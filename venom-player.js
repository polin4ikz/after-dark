/* AFTER DARK — Venom HTML5/HLS/DASH player experiment.
   This plays a direct media URL supplied by the user; it does not discover or scrape streaming services. */
(function () {
  "use strict";
  const VERSION = "0.3.6";
  const PUBLIC_PATH = "https://cdn.jsdelivr.net/npm/player-venom@" + VERSION + "/dist/";
  const STORAGE_KEY = "after-dark:venom-source:v1";
  const PROGRESS_STORAGE_KEY = "after-dark:venom-progress:v1";
  let activeFilmKey = "";
  let progressCleanup = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  let playerPromise = null;
  let playerInstance = null;
  let activeStage = null;
  let matteboxPromise = null;
  let matteboxInstance = null;
  let matteboxRequestToken = "";

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
  function resumeTimeFor(progress) {
    return progress && progress.time > 10 && (!progress.duration || progress.time < progress.duration - 15) ? progress.time : 0;
  }
  function createProgressCapture(key, isActive = () => activeFilmKey === key) {
    let lastWrite = -10;
    return event => {
      const media = event.target;
      if (!key || !isActive() || !media || typeof media.currentTime !== "number") return;
      const current = media.currentTime;
      const duration = Number(media.duration);
      if (!Number.isFinite(current) || current < 0) return;
      const rounded = Math.floor(current);
      if (event.type === "ended") {
        try { localStorage.removeItem(progressKey(key)); } catch (_) {}
        return;
      }
      if (event.type !== "timeupdate" || rounded - lastWrite >= 10) {
        saveProgress(key, rounded, duration);
        lastWrite = rounded;
      }
    };
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
      const timeout = setTimeout(() => finishWithError(new Error("Загрузка Venom Player заняла слишком много времени. Проверь подключение и VPN.")), 15000);
      const cleanup = () => {
        clearTimeout(timeout);
        script.removeEventListener("error", onError);
        script.removeEventListener("load", onLoad);
      };
      const finishWithError = error => {
        if (settled) return;
        settled = true;
        cleanup();
        playerPromise = null;
        script.remove();
        reject(error);
      };
      const onError = () => finishWithError(new Error("Не удалось загрузить Venom Player с CDN. Проверь подключение и VPN."));
      const onLoad = () => {
        if (settled) return;
        if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") {
          settled = true;
          cleanup();
          resolve(window.VenomPlayer);
        } else {
          finishWithError(new Error("Venom Player загрузился, но API VenomPlayer.make не найден."));
        }
      };
      script.addEventListener("error", onError);
      script.addEventListener("load", onLoad);
      script.src = PUBLIC_PATH + "player.js";
      script.async = true;
      script.dataset.afterDarkVenom = "true";
      document.head.appendChild(script);
    });
    return playerPromise;
  }
  function loadMattebox() {
    if (window.mattebox && typeof window.mattebox.preset === "function") return Promise.resolve(window.mattebox);
    if (matteboxPromise) return matteboxPromise;
    matteboxPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => finish(new Error("Mattebox CDN timeout")), 12000);
      let settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { matteboxPromise = null; reject(error); }
        else resolve(window.mattebox);
      }
      script.onload = () => window.mattebox?.preset ? finish() : finish(new Error("Mattebox API missing"));
      script.onerror = () => finish(new Error("Mattebox CDN failed"));
      script.src = "https://cdn.jsdelivr.net/npm/mattebox@0.15.0/dist/cdn/mattebox.min.js";
      script.async = true;
      document.head.appendChild(script);
    });
    return matteboxPromise;
  }
  function isRussianTrack(track) {
    const lang = String(track?.lang || track?.language || "").trim();
    const name = String(track?.name || track?.label || "").trim();
    return /^ru(?:[-_][a-z0-9]+)*$/i.test(lang) || /^rus$/i.test(lang) || /русск|russian/i.test(name);
  }
  function mountMatteboxTrackControls(form, engine) {
    let panel = $(".ad-mattebox-audio", form);
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "ad-mattebox-audio";
      const label = document.createElement("label");
      label.textContent = "ЗВУКОВАЯ ДОРОЖКА";
      const select = document.createElement("select");
      select.className = "ad-mattebox-audio__select";
      select.setAttribute("aria-label", "Звуковая дорожка");
      panel.append(label, select);
      form.appendChild(panel);
      select.addEventListener("change", () => {
        if (matteboxInstance !== engine) return;
        const tracks = (engine.tracks?.available || []).filter(track => track.contentType === "audio" && engine.tracks.selectable(track.id));
        const track = tracks[Number(select.value)];
        if (track) {
          engine.tracks.select(track.id);
          setStatus(form.closest("#adWatchPlayer"), isRussianTrack(track) ? "ВЫБРАНА РУССКАЯ ОЗВУЧКА" : "ВЫБРАНА ДОРОЖКА: " + (track.name || track.lang || "аудио"), false);
        }
      });
    }
    const select = $(".ad-mattebox-audio__select", panel);
    const tracks = (engine.tracks?.available || []).filter(track => track.contentType === "audio" && engine.tracks.selectable(track.id));
    if (!tracks.length) {
      select.replaceChildren(new Option("Источник не предоставил список дорожек", "-1"));
      select.disabled = true;
      panel.hidden = false;
      return;
    }
    let russianIndex = tracks.findIndex(isRussianTrack);
    if (russianIndex >= 0 && !engine.__afterDarkRussianSelected) {
      try {
        engine.tracks.select(tracks[russianIndex].id);
        engine.__afterDarkRussianSelected = true;
      } catch (_) {}
    }
    const active = engine.tracks.active("audio");
    const activeIndex = tracks.findIndex(track => active && String(track.id) === String(active.id));
    select.replaceChildren();
    tracks.forEach((track, index) => {
      const label = [track.lang || "язык не указан", track.name || "", track.channels ? track.channels + " каналов" : ""].filter(Boolean).join(" · ");
      select.add(new Option(label || "Аудио " + (index + 1), String(index), false, index === activeIndex || (activeIndex < 0 && index === russianIndex)));
    });
    select.disabled = tracks.length < 2;
    panel.hidden = false;
    if (russianIndex >= 0) setStatus(form.closest("#adWatchPlayer"), "РУССКАЯ ДОРОЖКА НАЙДЕНА · ВЫБИРАЮ АВТОМАТИЧЕСКИ", false);
    else setStatus(form.closest("#adWatchPlayer"), tracks.some(track => track.lang || track.name) ? "РУССКАЯ ДОРОЖКА НЕ ЗАЯВЛЕНА В МЕТАДАННЫХ" : "ЯЗЫКИ ДОРОЖЕК НЕ УКАЗАНЫ ИСТОЧНИКОМ", false);
  }
  async function tryMattebox(modal, form, stage, source, requestToken) {
    if (!["hls", "dash"].includes(source.kind)) return false;
    if (form.dataset.disableMatteboxOnce === "1") { delete form.dataset.disableMatteboxOnce; return false; }
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "AFTER DARK video player");
    const mount = document.createElement("div");
    mount.className = "ad-mattebox-mount";
    mount.appendChild(video);
    stage.replaceChildren(mount);
    setStatus(modal, "ПРОБУЮ MATTEBOX · " + source.kind.toUpperCase(), false);
    try {
      await loadMattebox();
      if (!modal.classList.contains("is-open") || !mount.isConnected || modal.dataset.venomRequestToken !== requestToken) return true;
      const engine = window.mattebox.preset();
      matteboxInstance = engine;
      matteboxRequestToken = requestToken;
      engine.on("tracks:changed", () => {
        if (matteboxInstance === engine && modal.dataset.venomRequestToken === requestToken) mountMatteboxTrackControls(form, engine);
      });
      engine.on("tracks:selected", () => {
        if (matteboxInstance === engine && modal.dataset.venomRequestToken === requestToken) mountMatteboxTrackControls(form, engine);
      });
      const fallback = () => {
        if (matteboxInstance !== engine || modal.dataset.venomRequestToken !== requestToken) return;
        try { engine.unload(); engine.detach(); } catch (_) {}
        matteboxInstance = null;
        form.dataset.disableMatteboxOnce = "1";
        setStatus(modal, "MATTEBOX НЕ ЗАПУСТИЛСЯ · ПЕРЕКЛЮЧАЮСЬ НА VENOM", false);
        form.requestSubmit();
      };
      engine.on("error", fallback);
      await engine.attach(video);
      engine.load(source.url);
      activeFilmKey = filmKey(modal._film);
      activeStage = stage;
      const key = activeFilmKey;
      const saved = readProgress(key);
      const resumeTime = resumeTimeFor(saved);
      const onTime = () => {
        if (matteboxInstance !== engine || !key) return;
        if (video.currentTime > 0 && video.currentTime % 10 < 0.7) saveProgress(key, video.currentTime, video.duration);
      };
      video.addEventListener("timeupdate", onTime);
      progressCleanup = () => video.removeEventListener("timeupdate", onTime);
      if (resumeTime > 0) video.addEventListener("loadedmetadata", () => { try { video.currentTime = resumeTime; } catch (_) {} }, { once: true });
      const all = readSources();
      if (key) { all[key] = source; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (_) {} }
      window.setTimeout(() => {
        if (matteboxInstance !== engine || modal.dataset.venomRequestToken !== requestToken) return;
        mountMatteboxTrackControls(form, engine);
        if (video.readyState === 0) fallback();
      }, 10000);
      setStatus(modal, "MATTEBOX ПОДКЛЮЧЁН · ПРОВЕРЯЮ АУДИОДОРОЖКИ", false);
      delete form.dataset.disableMatteboxOnce;
      return true;
    } catch (_) {
      if (matteboxInstance) { try { matteboxInstance.unload(); matteboxInstance.detach(); } catch (_) {} matteboxInstance = null; }
      form.dataset.disableMatteboxOnce = "1";
      return false;
    }
  }
  function setStatus(modal, message, isError) {
    const status = $(".ad-watch-player__status", modal);
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }
  function stopPlayer() {
    try { playerInstance?.pause?.(); } catch (_) {}
    try { progressCleanup?.(); } catch (_) {}
    progressCleanup = null;
    try { playerInstance?.destroy?.(); } catch (_) {}
    playerInstance = null;
    if (matteboxInstance) {
      try { matteboxInstance.unload(); matteboxInstance.detach(); } catch (_) {}
      matteboxInstance = null;
    }
    matteboxRequestToken = "";
    const matteboxAudioPanel = $(".ad-mattebox-audio");
    if (matteboxAudioPanel) matteboxAudioPanel.hidden = true;
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
      '<p class="ad-venom-note">Источник сохраняется только в этом браузере. Доступность зависит от ссылки, CORS и прав источника.</p>',
      '<div class="ad-venom-resume" hidden><span class="ad-venom-resume__label"></span><button type="button" class="ad-venom-start-over">НАЧАТЬ СНАЧАЛА ↺</button></div>'
    ].join("");
    const originalForm = $(".ad-watch-player__form:not(.ad-venom-panel)", modal);
    if (originalForm) originalForm.insertAdjacentElement("afterend", form);
    else $(".ad-watch-player__window", modal)?.appendChild(form);

    const resumePanel = $(".ad-venom-resume", form);
    const resumeLabel = $(".ad-venom-resume__label", form);
    const startOverButton = $(".ad-venom-start-over", form);
    startOverButton.addEventListener("click", () => {
      const key = filmKey(modal._film);
      if (!key) return;
      // Pause/destroy first: the pause event can save one final progress tick.
      // Remove it only after that event has been detached, or the next launch may resume again.
      stopPlayer();
      try { localStorage.removeItem(progressKey(key)); } catch (_) {}
      if (resumePanel) resumePanel.hidden = true;
      const input = $("#adVenomSource", form);
      if (input && input.value.trim()) {
        form.requestSubmit();
      } else {
        setStatus(modal, "ПРОГРЕСС СБРОШЕН · ВСТАВЬ ССЫЛКУ И ЗАПУСТИ ВИДЕО С НАЧАЛА", false);
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const film = modal._film;
      const key = filmKey(film);
      const requestToken = String((Number(modal.dataset.venomRequestToken) || 0) + 1);
      modal.dataset.venomRequestToken = requestToken;
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
      setStatus(modal, "ЗАГРУЖАЮ ПЛЕЕР…", false);
      try {
        const usedMattebox = await tryMattebox(modal, form, stage, source, requestToken);
        if (usedMattebox) return;
        // Mattebox may have mounted a temporary video before failing; restore the Venom mount.
        stage.replaceChildren(container);
        const VenomPlayer = await loadPlayer();
        if (!modal.classList.contains("is-open") || !container.isConnected || modal.dataset.venomRequestToken !== requestToken) return;
        const savedProgress = readProgress(key);
        const resumeTime = resumeTimeFor(savedProgress);
        const mediaSource = source.kind === "hls" ? { hls: source.url }
          : source.kind === "dash" ? { dash: source.url }
          : { file: { 720: source.url } };
        activeFilmKey = key;
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
          // Our own per-film key is authoritative; disable Venom's generic localStorage progress.
          doNotSaveProgress: true,
          cssVars: {
            "color-primary": "#8b1d2c",
            "background-color-primary": "rgba(16, 14, 13, .96)"
          }
        });
        activeStage = stage;
        // Read progress from the actual HTMLMediaElement, not undocumented event payloads.
        // Media events do not bubble, so capture phase is required on the player container.
        const captureProgress = createProgressCapture(key);
        const progressEvents = ["timeupdate", "pause", "ended"];
        progressEvents.forEach(name => container.addEventListener(name, captureProgress, true));
        progressCleanup = () => progressEvents.forEach(name => container.removeEventListener(name, captureProgress, true));
        if (key) {
          const all = readSources();
          all[key] = source;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch (_) {}
        }
        delete form.dataset.disableMatteboxOnce;
        setStatus(modal, resumeTime ? "ПРОДОЛЖАЕМ С " + formatTime(resumeTime) + " · VENOM PLAYER" : "VENOM PLAYER · ИСТОЧНИК ПОДКЛЮЧЁН", false);
      } catch (error) {
        if (modal.dataset.venomRequestToken !== requestToken || !modal.classList.contains("is-open")) return;
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
    const resumePanel = panel && $(".ad-venom-resume", panel);
    const resumeLabel = panel && $(".ad-venom-resume__label", panel);
    const startOverButton = panel && $(".ad-venom-start-over", panel);
    const resumeTime = resumeTimeFor(readProgress(key));
    if (resumePanel) resumePanel.hidden = !resumeTime;
    if (resumeLabel && resumeTime) resumeLabel.textContent = "ПРОДОЛЖИТЬ С " + formatTime(resumeTime);
    if (startOverButton) startOverButton.hidden = !resumeTime;
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
  if (typeof module !== "undefined" && module.exports) module.exports = { normalizeSource, filmKey, readProgress, saveProgress, formatTime, resumeTimeFor, PROGRESS_STORAGE_KEY, createProgressCapture };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();
