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
  function makeExternalFallback(title) {
    const area = $("#sourceResults");
    const link = document.createElement("a");
    link.className = "source-result source-result--external";
    link.href = "https://www.justwatch.com/de/suche?q=" + encodeURIComponent(title);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ПРОВЕРИТЬ ЛЕГАЛЬНЫЕ СЕРВИСЫ ↗";
    area.appendChild(link);
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
        const note = document.createElement("p");
        note.className = "source-note";
        note.textContent = "Найдено точное совпадение с открытой лицензией и полным видео. Если воспроизведение не началось автоматически, нажми Play.";
        area.appendChild(note);
        return;
      }
      if (results.length) {
        status("НАШЛИСЬ ВАРИАНТЫ · ВЫБЕРИ ПОДХОДЯЩИЙ");
        const note = document.createElement("p");
        note.className = "source-note";
        note.textContent = "Найденные записи проверены на открытую лицензию и наличие видео длительностью от 40 минут. Сверь название перед просмотром.";
        area.appendChild(note);
        results.forEach(renderCandidate);
      } else {
        status("В ОТКРЫТОМ АРХИВЕ НЕ НАШЁЛСЯ ПРОВЕРЕННЫЙ ИСТОЧНИК");
        const note = document.createElement("p");
        note.className = "source-note";
        note.textContent = "Это не значит, что фильм недоступен: просто мы не нашли подтверждённый открытый видеопоток в этом источнике.";
        area.appendChild(note);
      }
      makeExternalFallback(title);
    } catch (_) {
      status("НЕ УДАЛОСЬ ПРОВЕРИТЬ ИСТОЧНИКИ · ПОПРОБУЙ ПОЗЖЕ", true);
      makeExternalFallback(title);
    }
  }
  function init() {
    let film = null;
    try { film = JSON.parse(localStorage.getItem(FILM_KEY) || "null"); } catch (_) {}
    if (!film || typeof film !== "object") {
      $("#mediaTitle").textContent = "Фильм не выбран";
      $("#mediaMeta").textContent = "Вернись в архив и нажми WATCH на выбранной карточке.";
      status("НЕ ПОЛУЧЕНЫ ДАННЫЕ ФИЛЬМА", true);
      makeExternalFallback("");
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