(() => {
  "use strict";
  const root = document.getElementById("continueTrack");
  const section = document.getElementById("continueWatching");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const progressApi = () => window.afterDarkProgress;
  const allFilms = () => window.getArchiveFilms?.() || [];
  const filmFor = row => window.afterDarkGetFilm?.(Number(row.tmdb_id)) || allFilms().find(f => Number(f.tmdbId ?? f.id) === Number(row.tmdb_id)) || {};
  const time = value => progressApi()?.formatTime?.(value) || "0:00";
  function render() {
    if (!root || !section || !progressApi()) return;
    const rows = progressApi().all().filter(row => row.status !== "completed" && Number(row.position_seconds) > 0)
      .sort((a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0)).slice(0, 8);
    section.hidden = rows.length === 0;
    if (!rows.length) { root.innerHTML = ""; return; }
    root.innerHTML = rows.map(row => {
      const film = filmFor(row);
      const title = row.title || film.title || film.name || "Без названия";
      const isSeries = row.media_type === "tv" || film.type === "series" || film.media_type === "tv";
      const episode = isSeries && row.episode_number ? `Сезон ${Number(row.season_number || 1)} · серия ${Number(row.episode_number)}` : (isSeries ? "Сериал" : "Фильм");
      const poster = film.poster_path ? `/api/tmdb-image?size=w342&path=${encodeURIComponent(film.poster_path)}` : "";
      const duration = Number(row.duration_seconds) > 0 ? time(row.duration_seconds) : "";
      const progress = Number(row.duration_seconds) > 0 ? Math.min(100, Math.round(Number(row.position_seconds) / Number(row.duration_seconds) * 100)) : 0;
      const external = /external|custom|url/i.test(String(row.source_provider || ""));
      return `<article class="continue-card">
        <div class="continue-poster">${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy">` : '<div class="poster-fallback"><b>AFTER<br>DARK</b><span>ПОСТЕР НЕ НАЙДЕН</span></div>'}</div>
        <div class="continue-info"><span class="continue-kind">${episode}</span><h3>${escapeHtml(title)}</h3>
          <div class="continue-times"><span>${time(row.position_seconds)}</span>${duration ? `<span>из ${duration}</span>` : ""}</div>
          <div class="continue-progress" aria-label="Просмотрено ${progress}%"><i style="width:${progress}%"></i></div>
          <button type="button" class="continue-resume" data-ad-watch-trigger="progress" data-id="${Number(row.tmdb_id)}">${external ? "Открыть источник" : "Продолжить просмотр"} <span>↗</span></button>
        </div>
      </article>`;
    }).join("");
  }
  document.addEventListener("error", event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackApplied) return;
    image.dataset.fallbackApplied = "true";
    const fallback = document.createElement("div");
    fallback.className = "poster-fallback";
    fallback.innerHTML = "<b>AFTER<br>DARK</b><span>ПОСТЕР НЕ ЗАГРУЗИЛСЯ</span>";
    image.replaceWith(fallback);
  }, true);
  window.addEventListener("afterdark:progress-updated", render);
  window.addEventListener("afterdark:archive-updated", render);
  document.addEventListener("DOMContentLoaded", render);
  render();
  window.afterDarkRenderContinueWatching = render;
})();