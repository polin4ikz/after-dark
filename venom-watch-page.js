/* AFTER DARK — Russia-first source discovery for the dedicated player page. */
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
  function filmSearchTerms(filmOrTitle) {
    const film = typeof filmOrTitle === "object" && filmOrTitle !== null
      ? filmOrTitle
      : { title: String(filmOrTitle || "") };
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    const titles = [...new Set([
      film.title, film.name, film.original_title, film.original_name
    ].map(value => String(value || "").trim()).filter(Boolean))];
    return { titles, year, primary: titles[0] || "фильм" };
  }
  function addExternalFallback(filmOrTitle) {
    const area = $("#sourceResults");
    const { titles, year, primary } = filmSearchTerms(filmOrTitle);
    const ruTitle = titles.find(value => /[а-яё]/i.test(value)) || primary;
    const enTitle = titles.find(value => /[a-z]/i.test(value) && value !== ruTitle) || primary;
    const queryFor = title => [title, year, "смотреть онлайн"].filter(Boolean).join(" ");
    const searchLinks = [
      { label: "ЯНДЕКС · РУССКОЕ НАЗВАНИЕ", url: "https://yandex.ru/search/?text=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "ЯНДЕКС · ОРИГИНАЛЬНОЕ НАЗВАНИЕ", url: "https://yandex.ru/search/?text=" + encodeURIComponent(queryFor(enTitle)) },
      { label: "ЯНДЕКС ВИДЕО", url: "https://yandex.ru/video/search?text=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "VK ВИДЕО", url: "https://vk.com/video?q=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "RUTUBE", url: "https://rutube.ru/search/?query=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "YOUTUBE", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent([enTitle, year, "full movie"].filter(Boolean).join(" ")) },
      { label: "LORDFILM · ПОИСК", url: "https://www.google.com/search?gl=ru&hl=ru&q=" + encodeURIComponent('site:lordfilm ' + queryFor(ruTitle)) },
      { label: "HDREZKA · ПОИСК", url: "https://www.google.com/search?gl=ru&hl=ru&q=" + encodeURIComponent('site:hdrezka ' + queryFor(ruTitle)) },
      { label: "КИНОПОИСК · ПОИСК", url: "https://yandex.ru/search/?text=" + encodeURIComponent('site:kinopoisk.ru ' + ruTitle + (year ? " " + year : "")) },
      { label: "ВСЕ РЕЗУЛЬТАТЫ", url: "https://yandex.ru/search/?text=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "СЕРВИСЫ В РОССИИ", url: "https://www.justwatch.com/ru/search?q=" + encodeURIComponent(ruTitle + (year ? " " + year : "")) }
    ];
    for (const item of searchLinks) {
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
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const mediaType = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    try {
      const path = "/" + mediaType + "/" + id + "/watch/providers";
      const response = await fetch("/api/tmdb?path=" + encodeURIComponent(path), {
        headers: { accept: "application/json" }
      });
      if (!response.ok) return;
      const payload = await response.json();
      const region = payload && payload.results && payload.results.RU;
      if (!region) return;
      const names = providerNames(region);
      if (!names.length || typeof region.link !== "string" || !/^https:\/\//i.test(region.link)) return;
      const link = document.createElement("a");
      link.className = "source-result source-result--external";
      link.href = region.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "РОССИЯ · " + names.join(" · ") + " ↗";
      $("#sourceResults").appendChild(link);
      const attribution = document.createElement("p");
      attribution.className = "source-attribution";
      attribution.append("Доступность сервисов в России: ");
      const justwatch = document.createElement("a");
      justwatch.href = "https://www.justwatch.com/ru/";
      justwatch.target = "_blank";
      justwatch.rel = "noopener noreferrer";
      justwatch.textContent = "JustWatch Россия";
      attribution.append(justwatch, " · данные через TMDB API. Доступность может меняться.");
      $("#sourceResults").appendChild(attribution);
    } catch (_) {
      // External Russian search links remain available when provider metadata is offline.
    }
  }
  async function searchOpenArchive(film) {
    const { titles, year } = filmSearchTerms(film);
    const found = new Map();
    for (const title of titles) {
      const params = new URLSearchParams({ q: title });
      if (year) params.set("year", year);
      try {
        const response = await fetch("/api/watch-sources?" + params.toString(), {
          headers: { accept: "application/json" }
        });
        if (!response.ok) continue;
        const data = await response.json();
        for (const item of Array.isArray(data.results) ? data.results : []) {
          if (item && item.identifier) found.set(item.identifier, item);
        }
      } catch (_) {
        // Try the next title variant.
      }
      if (found.size) break;
    }
    return [...found.values()];
  }
  async function findSources(film) {
    const area = $("#sourceResults");
    area.replaceChildren();
    status("ИЩУ ИСТОЧНИКИ ДЛЯ РОССИИ…");
    try {
      const results = await searchOpenArchive(film);
      const exact = results.filter(item => item && item.confidence === "high");
      if (exact.length === 1) {
        playArchiveSource(exact[0], true);
        addNote("Найдено точное совпадение с открытой лицензией и полным видео. Если воспроизведение не началось автоматически, нажми Play.");
        return;
      }
      if (results.length) {
        status("НАШЛИСЬ ОТКРЫТЫЕ ВАРИАНТЫ · ВЫБЕРИ ПОДХОДЯЩИЙ");
        addNote("Это записи Internet Archive с открытой лицензией. Для современных коммерческих фильмов источник может не найтись — ниже есть поиск по российским площадкам.");
        results.forEach(renderCandidate);
      } else {
        status("В ОТКРЫТОМ АРХИВЕ ИСТОЧНИК НЕ НАЙДЕН");
        addNote("Открытый архив содержит не все фильмы. Ищу дальше по русскоязычным площадкам и сервисам для России.");
      }
    } catch (_) {
      status("АВТОМАТИЧЕСКИЙ ИСТОЧНИК НЕ НАЙДЕН · ПРОБУЮ ДРУГИЕ ПОИСКИ");
    }
    addExternalFallback(film);
    await showOfficialProviders(film);
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
