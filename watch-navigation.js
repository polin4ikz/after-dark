/* AFTER DARK — route WATCH actions to the existing dedicated player page. */
(function () {
  "use strict";
  const FILM_KEY = "after-dark:venom-current-film:v1";
  const $ = (selector, root = document) => root.querySelector(selector);

  function getArchiveFilm(id) {
    return window.afterDarkGetFilm?.(Number(id))
      || (window.getArchiveFilms?.() || []).find(item => Number(item.tmdbId ?? item.id) === Number(id))
      || null;
  }

  function filmFromButton(button) {
    if (button.dataset.adWatchTrigger === "movie-night") {
      const result = window.movieNight?.result;
      if (!result) return null;
      return Object.assign({}, result, {
        tmdbId: result.tmdbId ?? result.id,
        type: result.type === "tv" || result.media_type === "tv" || result.first_air_date
          ? "series" : (result.type || "film")
      });
    }
    if (button.dataset.adWatchTrigger === "detail") {
      return $("#afterDarkFilmDetail")?._film || null;
    }
    const card = button.closest(".archive-card");
    return card ? getArchiveFilm(card.dataset.id) : null;
  }

  function navigateToPlayer(film) {
    if (!film || !(film.tmdbId ?? film.id)) return false;
    const normalized = Object.assign({}, film, {
      tmdbId: film.tmdbId ?? film.tmdb_id ?? film.id,
      type: film.type === "series" || film.type === "tv" || film.media_type === "tv" || film.first_air_date
        ? "series" : (film.type || "film")
    });
    try {
      localStorage.setItem(FILM_KEY, JSON.stringify(normalized));
    } catch (_) {
      // The player page will explain if the browser blocks local storage.
    }
    window.location.href = "venom-watch.html";
    return true;
  }

  // This listener is loaded before watch-player.js and captures WATCH clicks first,
  // preventing the legacy modal from opening.
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-ad-watch-trigger]");
    if (!button) return;
    const film = filmFromButton(button);
    if (!film) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    navigateToPlayer(film);
  }, true);
})();