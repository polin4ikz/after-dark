/* AFTER DARK — safe third-party embed player foundation.
   Official HTTPS embed URLs only. Source URLs stay on this device; Supabase is untouched. */
(function () {
  "use strict";
  const SOURCE_STORAGE_KEY = "after-dark:watch-source:v1";
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

  function restoreSourceCache() {
    try {
      if (typeof localStorage === "undefined") return;
      const saved = JSON.parse(localStorage.getItem(SOURCE_STORAGE_KEY) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return;
      for (const [key, value] of Object.entries(saved)) {
        if (!/^(movie|tv):[0-9]+$/.test(key) || !value || typeof value.url !== "string") continue;
        try {
          // Revalidate persisted values before ever using them as iframe URLs.
          SOURCE_CACHE.set(key, normalizeEmbedUrl(value.url));
        } catch { /* Ignore stale or malformed saved entries. */ }
      }
    } catch { /* Storage may be unavailable or contain invalid JSON. */ }
  }

  function persistSourceCache() {
    try {
      if (typeof localStorage === "undefined") return;
      const saved = Object.fromEntries(SOURCE_CACHE.entries());
      localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(saved));
    } catch { /* Playback should still work if browser storage is full or disabled. */ }
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
      '<p class="ad-watch-player__hint">Сначала проверь легальные варианты просмотра. Internet Archive — каталог, а совпадение названия не гарантирует наличие полного фильма.</p>',
      '<button class="ad-watch-player__search" type="button" data-ad-archive-search>ПОИСКАТЬ В INTERNET ARCHIVE ↗</button>',
      '<div class="ad-watch-player__results" aria-live="polite"></div>',
      '<form class="ad-watch-player__form"><label for="adWatchSource">ИЛИ ССЫЛКА НА ВСТРАИВАЕМЫЙ ПЛЕЕР</label>',
      '<div class="ad-watch-player__input-row"><input id="adWatchSource" name="source" type="url" inputmode="url" placeholder="https://archive.org/embed/…" autocomplete="url"><button type="submit">ОТКРЫТЬ ↗</button></div></form>',
      '<p class="ad-watch-player__status" aria-live="polite"></p><div class="ad-watch-player__stage"></div>',
      '<p class="ad-watch-player__footnote">YouTube · Vimeo · Archive.org / полноэкранный режим зависит от источника</p>',
      '</section>'
    ].join("");
    document.body.appendChild(modal);
    modal.addEventListener("click", async event => {
      const searchButton = event.target.closest("[data-ad-archive-search]");
      const resultButton = event.target.closest("[data-ad-archive-identifier]");
      if (resultButton) {
        const identifier = resultButton.dataset.adArchiveIdentifier || "";
        if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier)) return;
        const input = $("#adWatchSource", modal);
        input.value = "https://archive.org/embed/" + identifier;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        const form = $(".ad-watch-player__form", modal);
        if (form?.requestSubmit) form.requestSubmit();
        return;
      }
      if (!searchButton) return;
      const film = modal._film;
      const query = titleOf(film).trim();
      const results = $(".ad-watch-player__results", modal);
      if (!query || !results) return;
      searchButton.disabled = true;
      results.textContent = "ИЩУ В КАТАЛОГЕ…";
      try {
        const response = await fetch("/api/archive-search?q=" + encodeURIComponent(query), {
          headers: { accept: "application/json" }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "ARCHIVE_SEARCH_UNAVAILABLE");
        const blockedTitle = /\b(trailer|teaser|gameplay|walkthrough|playthrough|let'?s play|review|reaction|fan.?film|soundtrack|ost|game|игр[аыуеы]?|прохождени[ея]|трейлер|тизер|обзор|реакци[яи]|саундтрек)\b/i;
        const wanted = query.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const candidates = (Array.isArray(data.results) ? data.results : [])
          .filter(item => item && typeof item.identifier === "string" && typeof item.title === "string")
          .map(item => {
            const normalized = item.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
            const titleMatch = normalized === wanted || normalized.startsWith(wanted + " ") || wanted.startsWith(normalized + " ");
            return { ...item, titleMatch, blocked: blockedTitle.test(item.title) || blockedTitle.test(item.description || "") };
          });
        // Catalog title matches are never auto-opened: they may be podcasts, books, ads, or unrelated media.
        const visible = candidates.filter(item => !item.blocked);
        if (!visible.length) {
          results.innerHTML = '<p class="ad-watch-player__result-description">В Internet Archive не нашлось подходящих записей. Совпадение в каталоге в любом случае не подтверждает, что доступен полный фильм.</p>';
          return;
        }
        results.innerHTML = '<p class="ad-watch-player__result-description">Ниже — записи каталога, а не проверенные видеопотоки. Не открывай результат как фильм, если в нём не подтверждено наличие полного видео.</p>' + visible.map(item =>
          '<button type="button" class="ad-watch-player__result" data-ad-archive-identifier="' + esc(item.identifier) + '">' +
          '<span class="ad-watch-player__result-title">' + esc(item.title) + '</span>' +
          '<span class="ad-watch-player__result-meta">' + esc(item.year || "ГОД НЕ УКАЗАН") + '</span>' +
          (item.description ? '<span class="ad-watch-player__result-description">' + esc(item.description) + '</span>' : '') +
          '</button>'
        ).join("");
      } catch (error) {
        results.textContent = "НЕ УДАЛОСЬ ПОИСКАТЬ В INTERNET ARCHIVE. Попробуй позже или вставь ссылку вручную.";
      } finally {
        searchButton.disabled = false;
      }
    });
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
        if (key) {
          SOURCE_CACHE.set(key, source);
          persistSourceCache();
        }
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
    const results = $(".ad-watch-player__results", modal);
    if (results) results.replaceChildren();
    const searchButton = $("[data-ad-archive-search]", modal);
    if (searchButton) searchButton.disabled = false;
    const cached = SOURCE_CACHE.get(filmKey(film));
    input.value = cached ? cached.url : "";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("ad-watch-player-open");
    if (cached) {
      status.textContent = "ИСТОЧНИК ПОДКЛЮЧЁН · " + cached.provider.toUpperCase();
      stage.innerHTML = '<iframe src="' + esc(cached.url) + '" title="' + esc(titleOf(film)) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    } else {
      const searchUrl = "https://www.justwatch.com/de/suche?q=" + encodeURIComponent(titleOf(film));
      results.innerHTML = '<p class="ad-watch-player__result-description">Плеер не нашёл сохранённый источник. Проверь, где фильм доступен легально, или отдельно выполни поиск по Internet Archive.</p><a class="ad-watch-player__result" href="' + esc(searchUrl) + '" target="_blank" rel="noopener noreferrer">ПРОВЕРИТЬ СЕРВИСЫ ПРОСМОТРА ↗</a>';
    }
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
    restoreSourceCache();
    document.addEventListener("click", onWatchClick, true);
    injectButtons();
    new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });
    window.afterDarkWatchPlayer = { open: openPlayer, close: closePlayer, normalizeEmbedUrl };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { normalizeEmbedUrl, filmKey, restoreSourceCache, persistSourceCache, SOURCE_CACHE, SOURCE_STORAGE_KEY };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }
})();