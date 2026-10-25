/* AFTER DARK — automatic, conservative source discovery for the dedicated player page. */
(function () {
  "use strict";
  const FILM_KEY = "after-dark:venom-current-film:v1";
  const $ = selector => document.querySelector(selector);

  function status(message, error) {
    const el = $("#playerStatus");
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
  }
  function addNote(text) {
    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent = text;
    $("#sourceResults").appendChild(note);
  }
  function addExternalFallback(title) {
    const area = $("#sourceResults");
    const query = String(title || "").trim();
    const searches = [
      { label: "ПОИСКАТЬ В YOUTUBE", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(query + " full movie") },
      { label: "ПОИСКАТЬ НА LORDFILM", url: "https://www.google.com/search?q=" + encodeURIComponent('site:lordfilm ' + query + " смотреть онлайн") },
      { label: "ПОИСКАТЬ НА HDREZKA", url: "https://www.google.com/search?q=" + encodeURIComponent('site:hdrezka ' + query + " смотреть онлайн") },
      { label: "ПОИСК ПО ВСЕМУ ИНТЕРНЕТУ", url: "https://www.google.com/search?q=" + encodeURIComponent(query + " смотреть онлайн фильм плеер") },
      { label: "ПРОВЕРИТЬ ЛЕГАЛЬНЫЕ СЕРВИСЫ", url: "https://www.justwatch.com/de/search?q=" + encodeURIComponent(query) }
    ];
    for (const item of searches) {
      const link = document.createElement("a");
      link.className = "source-result source-result--external";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.label + " ↗";
      area.appendChild(link);
    }
  }
  function playArchiveSource(source, auto = false) {
    if (!source || typeof source.identifier !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(source.identifier)) return;
    const stage = $("#playerStage");
    stage.replaceChildren();
    const frame = document.createElement("iframe");
    frame.src = "https://archive.org/embed/" + encodeURIComponent(source.identifier) + (auto ? "?autoplay=1" : "");
    frame.title = "AFTER DARK — " + source.title;
    frame.allow = "autoplay; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.loading = "eager";
    stage.appendChild(frame);
    status("ИСТОЧНИК ПРОВЕРЕН · INTERNET ARCHIVE");
  }
  function renderCandidate(source) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-result";
    const title = document.createElement("span");
    title.className = "source-result__title";
    title.textContent = source.title + (source.year ? " (" + source.year + ")" : "");
    const meta = document.createElement("span");
    meta.className = "source-result__meta";
    const minutes = Math.round(Number(source.durationSeconds || 0) / 60);
    meta.textContent = "INTERNET ARCHIVE · " + minutes + " МИН. · ОТКРЫТАЯ ЛИЦЕНЗИЯ";
    button.append(title, meta);
    button.addEventListener("click", () => playArchiveSource(source, true));
    $("#sourceResults").appendChild(button);
  }
  function providerNames(region) {
    const offers = ["flatrate", "free", "ads", "rent", "buy"]
      .flatMap(key => Array.isArray(region[key]) ? region[key] : []);
    return [...new Set(offers.map(item => item && item.provider_name).filter(Boolean))];
  }
  async function showOfficialProviders(film) {
    const id = Number(film.tmdbId ?? film.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      addExternalFallback(String(film.title || film.name || ""));
      return;
    }
    const mediaType = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    try {
      const path = "/" + mediaType + "/" + id + "/watch/providers";
      const response = await fetch("/api/tmdb?path=" + encodeURIComponent(path), {
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error("PROVIDERS_UNAVAILABLE");
      const payload = await response.json();
      const regions = payload && payload.results || {};
      let count = 0;
      for (const [code, label] of [["RU", "РОССИЯ"], ["DE", "ГЕРМАНИЯ"], ["US", "США"]]) {
        const region = regions[code];
        if (!region) continue;
        const names = providerNames(region);
        if (!names.length || typeof region.link !== "string" || !/^https:\/\//i.test(region.link)) continue;
        const link = document.createElement("a");
        link.className = "source-result source-result--external";
        link.href = region.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label + " · " + names.join(" · ") + " ↗";
        $("#sourceResults").appendChild(link);
        count++;
      }
      if (!count) addExternalFallback(String(film.title || film.name || ""));
      const attribution = document.createElement("p");
      attribution.className = "source-attribution";
      attribution.append("Доступность сервисов: ");
      const justwatch = document.createElement("a");
      justwatch.href = "https://www.justwatch.com/";
      justwatch.target = "_blank";
      justwatch.rel = "noopener noreferrer";
      justwatch.textContent = "JustWatch";
      attribution.append(justwatch, " · данные через ");
      const tmdb = document.createElement("a");
      tmdb.href = "https://www.themoviedb.org/";
      tmdb.target = "_blank";
      tmdb.rel = "noopener noreferrer";
      tmdb.textContent = "TMDB API";
      attribution.append(tmdb, ". After Dark не связан с TMDB.");
      $("#sourceResults").appendChild(attribution);
    } catch (_) {
      addExternalFallback(String(film.title || film.name || ""));
    }
  }
  async function findSources(film) {
    const title = String(film.title || film.name || "").trim();
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    const area = $("#sourceResults");
    area.replaceChildren();
    status("ИЩУ ДОСТУПНЫЕ ИСТОЧНИКИ…");
    const params = new URLSearchParams({ q: title });
    if (year) params.set("year", year);
    try {
      const response = await fetch("/api/watch-sources?" + params.toString(), {
        headers: { accept: "application/json" }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "SEARCH_UNAVAILABLE");
      const results = Array.isArray(data.results) ? data.results : [];
      const exact = results.filter(item => item && item.confidence === "high");
      if (exact.length === 1) {
        playArchiveSource(exact[0], true);
        addNote("Найдено точное совпадение с открытой лицензией и полным видео. Если воспроизведение не началось автоматически, нажми Play.");
        return;
      }
      if (results.length) {
        status("НАШЛИСЬ ОТКРЫТЫЕ ВАРИАНТЫ · ВЫБЕРИ ПОДХОДЯЩИЙ");
        addNote("Найденные записи проверены на открытую лицензию и наличие видео длительностью от 40 минут. Сверь название перед просмотром.");
        results.forEach(renderCandidate);
      } else {
        status("В ОТКРЫТОМ АРХИВЕ НЕ НАШЁЛСЯ ПРОВЕРЕННЫЙ ИСТОЧНИК");
        addNote("Это не значит, что фильм недоступен: просто мы не нашли подтверждённый открытый видеопоток в этом источнике.");
      }
      addExternalFallback(title);
      await showOfficialProviders(film);
    } catch (_) {
      status("АВТОМАТИЧЕСКИЙ ПОТОК НЕ НАЙДЕН · ПОПРОБУЙ ДРУГИЕ ИСТОЧНИКИ");
      addExternalFallback(title);
      await showOfficialProviders(film);
    }
  }
  function init() {
    let film = null;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo === "nosferatu") {
      // Isolated playback smoke test; does not touch the shared archive or Supabase.
      film = { tmdbId: 653, type: "film", title: "Nosferatu", original_title: "Nosferatu", release_date: "1922-01-01" };
    } else {
      try { film = JSON.parse(localStorage.getItem(FILM_KEY) || "null"); } catch (_) {}
    }
    if (!film || typeof film !== "object") {
      $("#mediaTitle").textContent = "Фильм не выбран";
      $("#mediaMeta").textContent = "Вернись в архив и нажми WATCH на выбранной карточке.";
      status("НЕ ПОЛУЧЕНЫ ДАННЫЕ ФИЛЬМА", true);
      return;
    }
    const title = String(film.title || film.name || "Без названия");
    $("#mediaTitle").textContent = title;
    const isSeries = film.type === "series" || film.media_type === "tv" || Boolean(film.first_air_date);
    $("#mediaType").textContent = isSeries ? "СЕРИАЛ" : "ФИЛЬМ";
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    $("#mediaMeta").textContent = [year, film.original_title || film.original_name].filter(Boolean).join(" / ");
    findSources(film);
    window.addEventListener("pagehide", () => {
      const frame = $("#playerStage iframe");
      if (frame) frame.src = "about:blank";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();