/* AFTER DARK — safe third-party embed player foundation.
   Official HTTPS embed URLs only. Source URLs stay in memory; Supabase is untouched. */
(function () {
  "use strict";
  const SOURCE_CACHE = new Map();
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  function normalizeEmbedUrl(input) {
    if (typeof input !== "string" || !input.trim()) throw new Error("Вставь ссылку на официальный встраиваемый плеер.");
    let url;
    try { url = new URL(input.trim()); } catch { throw new Error("Не удалось распознать ссылку."); }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
      throw new Error("Поддерживаются только безопасные HTTPS-ссылки.");
    }
    const host = url.hostname.toLowerCase();
    let match;
    if (["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})\/?$/);
      if (!match && url.pathname === "/watch") {
        const id = url.searchParams.get("v") || "";
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) match = [url.pathname, id];
      }
      if (!match) throw new Error("Нужна ссылка на YouTube embed-плеер.");
      return { provider: "youtube", url: "https://www.youtube-nocookie.com/embed/" + match[1] + "?playsinline=1" };
    }
    if (host === "youtu.be") {
      match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
      if (!match) throw new Error("Не удалось распознать видео YouTube.");
      return { provider: "youtube", url: "https://www.youtube-nocookie.com/embed/" + match[1] + "?playsinline=1" };
    }
    if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
      match = url.pathname.match(host === "player.vimeo.com" ? /^\/video\/(\d+)\/?$/ : /^\/(\d+)\/?$/);
      if (!match) throw new Error("Нужна ссылка на видео Vimeo.");
      return { provider: "vimeo", url: "https://player.vimeo.com/video/" + match[1] };
    }
    if (host === "archive.org" || host === "www.archive.org") {
      match = url.pathname.match(/^\/(?:embed|details)\/([A-Za-z0-9._-]{1,120})\/?$/);
      if (!match) throw new Error("Нужна ссылка на страницу или embed Archive.org.");
      return { provider: "archive", url: "https://archive.org/embed/" + match[1] };
    }
    throw new Error("Этот сайт пока не поддерживается. Доступны YouTube, Vimeo и Archive.org.");
  }

  function filmKey(film) {
    const id = film && (film.tmdbId ?? film.id);
    if (id == null || !String(id).trim()) return "";
    const type = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    return type + ":" + String(id);
  }
  function titleOf(film) { return film && (film.title || film.name) || "Без названия"; }

  function ensureModal() {
    let modal = $("#adWatchPlayer");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "adWatchPlayer";
    modal.className = "ad-watch-player";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = [
      '<div class="ad-watch-player__backdrop" data-ad-watch-close></div>',
      '<section class="ad-watch-player__window" role="dialog" aria-modal="true" aria-labelledby="adWatchTitle">',
      '<div class="ad-watch-player__topline"><span>PRIVATE CINEMA / PLAYER</span><button type="button" data-ad-watch-close>ЗАКРЫТЬ ×</button></div>',
      '<h2 id="adWatchTitle" class="ad-watch-player__title"></h2>',
      '<p class="ad-watch-player__hint">Первый этап: подключи официальный embed-источник. Используй видео, которое разрешено встраивать и смотреть.</p>',
      '<form class="ad-watch-player__form"><label for="adWatchSource">ССЫЛКА НА ВСТРАИВАЕМЫЙ ПЛЕЕР</label>',
      '<div class="ad-watch-player__input-row"><input id="adWatchSource" name="source" type="url" inputmode="url" placeholder="https://www.youtube.com/embed/…" autocomplete="url" required><button type="submit">ОТКРЫТЬ ↗</button></div></form>',
      '<p class="ad-watch-player__status" aria-live="polite"></p><div class="ad-watch-player__stage"></div>',
      '<p class="ad-watch-player__footnote">YouTube · Vimeo · Archive.org / полноэкранный режим зависит от источника</p>',
      '</section>'
    ].join("");
    document.body.appendChild(modal);
    modal.addEventListener("submit", event => {
      const form = event.target.closest(".ad-watch-player__form");
      if (!form) return;
      event.preventDefault();
      const film = modal._film;
      const key = filmKey(film);
      const input = $("#adWatchSource", modal);
      const status = $(".ad-watch-player__status", modal);
      try {
        const source = normalizeEmbedUrl(input.value);
        if (key) SOURCE_CACHE.set(key, source);
        status.textContent = "ИСТОЧНИК ПОДКЛЮЧЁН · " + source.provider.toUpperCase();
        status.classList.remove("is-error");
        $(".ad-watch-player__stage", modal).innerHTML =
          '<iframe src="' + esc(source.url) + '" title="' + esc(titleOf(film)) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      } catch (error) {
        status.textContent = error.message || "Не удалось открыть источник.";
        status.classList.add("is-error");
        $(".ad-watch-player__stage", modal).replaceChildren();
      }
    });
    modal.addEventListener("click", event => {
      if (event.target.closest("[data-ad-watch-close]")) closePlayer();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && modal.classList.contains("is-open")) closePlayer();
    });
    return modal;
  }

  function openPlayer(film) {
    if (!film) return;
    const modal = ensureModal();
    modal._film = film;
    $("#adWatchTitle", modal).textContent = titleOf(film);
    const input = $("#adWatchSource", modal);
    const status = $(".ad-watch-player__status", modal);
    const stage = $(".ad-watch-player__stage", modal);
    stage.replaceChildren();
    status.textContent = "";
    status.classList.remove("is-error");
    const cached = SOURCE_CACHE.get(filmKey(film));
    input.value = cached ? cached.url : "";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("ad-watch-player-open");
    if (cached) {
      status.textContent = "ИСТОЧНИК ПОДКЛЮЧЁН · " + cached.provider.toUpperCase();
      stage.innerHTML = '<iframe src="' + esc(cached.url) + '" title="' + esc(titleOf(film)) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    } else input.focus();
  }
  function closePlayer() {
    const modal = $("#adWatchPlayer");
    if (!modal) return;
    $(".ad-watch-player__stage", modal).replaceChildren();
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ad-watch-player-open");
  }
  function getArchiveFilm(id) {
    return window.afterDarkGetFilm?.(Number(id))
      || (window.getArchiveFilms?.() || []).find(item => Number(item.tmdbId) === Number(id))
      || null;
  }
  function injectButtons() {
    document.querySelectorAll(".archive-card").forEach(card => {
      const actions = $(".archive-actions", card);
      if (!actions || actions.querySelector("[data-ad-watch-trigger]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "archive-action ad-watch-trigger";
      button.dataset.adWatchTrigger = "archive";
      button.textContent = "WATCH ↗";
      actions.appendChild(button);
    });
    const nightActions = $(".movie-night-final-actions");
    if (nightActions && !nightActions.querySelector("[data-ad-watch-trigger]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "movie-night-action ad-watch-trigger";
      button.dataset.adWatchTrigger = "movie-night";
      button.textContent = "WATCH ↗";
      nightActions.appendChild(button);
    }
    const detailActions = $(".ad-film-detail-actions");
    if (detailActions && !detailActions.querySelector("[data-ad-watch-trigger]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ad-watch-detail-trigger ad-watch-trigger";
      button.dataset.adWatchTrigger = "detail";
      button.textContent = "WATCH ↗";
      detailActions.prepend(button);
    }
  }
  function onWatchClick(event) {
    const button = event.target.closest("[data-ad-watch-trigger]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    let film = null;
    if (button.dataset.adWatchTrigger === "movie-night") {
      const result = window.movieNight?.result;
      if (result) film = Object.assign({}, result, {
        tmdbId: result.tmdbId ?? result.id,
        type: result.type || (result.media_type === "tv" || result.first_air_date ? "series" : "film")
      });
    } else if (button.dataset.adWatchTrigger === "detail") {
      film = $("#afterDarkFilmDetail")?._film || null;
    } else {
      const card = button.closest(".archive-card");
      film = card ? getArchiveFilm(card.dataset.id) : null;
    }
    if (film) openPlayer(film);
  }
  function init() {
    document.addEventListener("click", onWatchClick, true);
    injectButtons();
    new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
    window.afterDarkWatchPlayer = { open: openPlayer, close: closePlayer, normalizeEmbedUrl };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { normalizeEmbedUrl, filmKey };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();