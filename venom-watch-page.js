/* AFTER DARK — Russia-first source discovery + native HLS/DASH audio track controls. */
(function () {
  "use strict";
  const FILM_KEY = "after-dark:venom-current-film:v1";
  const $ = selector => document.querySelector(selector);
  let hls = null;
  let dash = null;
  let activeVideo = null;

  function status(message, error) {
    const el = $("#playerStatus");
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
  }
  function streamStatus(message, error) {
    const el = $("#streamStatus");
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
  }
  function addNote(text) {
    const note = document.createElement("p");
    note.className = "source-note";
    note.textContent = text;
    $("#sourceResults").appendChild(note);
  }
  function addFrameFallback(url) {
    const area = $("#sourceResults");
    if (!area || !/^https:\/\//i.test(String(url || ""))) return;
    const link = document.createElement("a");
    link.className = "source-result source-result--external";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ЕСЛИ ПЛЕЕР БЕЛЫЙ — ОТКРЫТЬ ИСТОЧНИК ОТДЕЛЬНО ↗";
    area.prepend(link);
  }
  function filmSearchTerms(filmOrTitle) {
    const film = typeof filmOrTitle === "object" && filmOrTitle !== null ? filmOrTitle : { title: String(filmOrTitle || "") };
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    const titles = [...new Set([film.title, film.name, film.original_title, film.original_name].map(value => String(value || "").trim()).filter(Boolean))];
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
      { label: "LORDFILM · ПОИСК", url: "https://www.google.com/search?gl=ru&hl=ru&q=" + encodeURIComponent("site:lordfilm " + queryFor(ruTitle)) },
      { label: "HDREZKA · ПОИСК", url: "https://www.google.com/search?gl=ru&hl=ru&q=" + encodeURIComponent("site:hdrezka " + queryFor(ruTitle)) },
      { label: "КИНОПОИСК · ПОИСК", url: "https://yandex.ru/search/?text=" + encodeURIComponent("site:kinopoisk.ru " + ruTitle + (year ? " " + year : "")) },
      { label: "ВСЕ РЕЗУЛЬТАТЫ", url: "https://yandex.ru/search/?text=" + encodeURIComponent(queryFor(ruTitle)) },
      { label: "СЕРВИСЫ В РОССИИ", url: "https://www.justwatch.com/ru/search?q=" + encodeURIComponent(ruTitle + (year ? " " + year : "")) }
    ];
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "source-search-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "ДРУГИЕ ИСТОЧНИКИ И ПОИСК +";
    const panel = document.createElement("div");
    panel.className = "source-search-panel";
    panel.hidden = true;
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      panel.hidden = expanded;
      toggle.textContent = expanded ? "ДРУГИЕ ИСТОЧНИКИ И ПОИСК +" : "СКРЫТЬ ДОПОЛНИТЕЛЬНЫЙ ПОИСК −";
    });
    for (const item of searchLinks) {
      const link = document.createElement("a");
      link.className = "source-result source-result--external";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.label + " ↗";
      panel.appendChild(link);
    }
    area.append(toggle, panel);
  }
  function resetStreamEngines() {
    if (hls) { hls.destroy(); hls = null; }
    if (dash) { try { dash.reset(); } catch (_) {} dash = null; }
    activeVideo = null;
    $("#audioTrack").replaceChildren(new Option("Недоступно для этого источника", "-1"));
    $("#audioTrack").disabled = true;
    $("#subtitleTrack").replaceChildren(new Option("Нет доступных дорожек", "-1"));
    $("#subtitleTrack").disabled = true;
  }
  function setOptions(select, items, selectedIndex, emptyLabel) {
    select.replaceChildren();
    if (!items.length) {
      select.add(new Option(emptyLabel, "-1"));
      select.disabled = true;
      return;
    }
    items.forEach((item, index) => {
      const label = item.label || item.name || item.lang || ("Дорожка " + (index + 1));
      const option = new Option(label, String(item.id ?? index));
      select.add(option);
    });
    select.selectedIndex = Math.max(0, Math.min(Number(selectedIndex) || 0, items.length - 1));
    select.disabled = items.length < 2;
  }
  function refreshHlsTracks() {
    if (!hls) return;
    const audios = (hls.audioTracks || []).map((track, index) => ({
      id: index,
      label: [track.name, track.lang, track.attrs && track.attrs["LANGUAGE"]].filter(Boolean).join(" · ") || ("Аудио " + (index + 1))
    }));
    setOptions($("#audioTrack"), audios, hls.audioTrack, "В потоке нет аудиодорожек");
    const subtitles = (hls.subtitleTracks || []).map((track, index) => ({
      id: index,
      label: [track.name, track.lang].filter(Boolean).join(" · ") || ("Субтитры " + (index + 1))
    }));
    setOptions($("#subtitleTrack"), subtitles, hls.subtitleTrack, "Нет субтитров");
    streamStatus(audios.length > 1 ? "Найдено несколько аудиодорожек — можно переключать." : audios.length === 1 ? "В потоке одна аудиодорожка." : "Поток пока не передал список аудиодорожек.");
  }
  function refreshDashTracks() {
    if (!dash) return;
    const audios = (dash.getTracksFor("audio") || []).map((track, index) => ({
      id: index,
      label: [track.lang, track.labels && track.labels.map(x => x.text).filter(Boolean).join(", "), track.codec].filter(Boolean).join(" · ") || ("Аудио " + (index + 1))
    }));
    const subtitles = (dash.getTracksFor("text") || []).map((track, index) => ({
      id: index,
      label: [track.lang, track.labels && track.labels.map(x => x.text).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || ("Субтитры " + (index + 1))
    }));
    setOptions($("#audioTrack"), audios, 0, "В потоке нет аудиодорожек");
    setOptions($("#subtitleTrack"), subtitles, 0, "Нет субтитров");
    streamStatus(audios.length > 1 ? "Найдено несколько аудиодорожек — можно переключать." : audios.length === 1 ? "В потоке одна аудиодорожка." : "Поток пока не передал список аудиодорожек.");
  }
  function openDirectStream(rawUrl, allowUnknownEmbed = false) {
    let url;
    try { url = new URL(extractSubmittedUrl(rawUrl)); } catch (error) {
      if (error && error.message && /iframe|HTTPS|ссылку/i.test(error.message)) throw error;
      throw new Error("Проверь ссылку: вставь полный HTTPS-адрес или код iframe.");
    }
    // Auto-discovered external player iframes may use non-standard HTTPS ports.
    // Keep strict default-port validation for direct/manual URLs; the automatic resolver
    // passes allowUnknownEmbed=true only after its server-side candidate validation.
    if (url.protocol !== "https:" || url.username || url.password || (!allowUnknownEmbed && url.port && url.port !== "443")) {
      throw new Error("Поддерживаются только безопасные HTTPS-ссылки.");
    }
    const path = url.pathname.toLowerCase();
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let embedUrl = null;
    let embedProvider = "";
    let youtubeId = null;
    if (host === "youtu.be") youtubeId = path.split("/").filter(Boolean)[0] || null;
    else if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      youtubeId = path.startsWith("/embed/") || path.startsWith("/shorts/") || path.startsWith("/live/")
        ? path.split("/")[2] : url.searchParams.get("v");
    }
    if (youtubeId && /^[A-Za-z0-9_-]{11}$/.test(youtubeId) && ["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
      embedUrl = "https://www.youtube-nocookie.com/embed/" + youtubeId + "?autoplay=1&rel=0";
      embedProvider = "YOUTUBE";
    } else if (["rutube.ru", "rutube.com"].includes(host)) {
      const match = path.match(/^\/(?:video|play\/embed)\/([a-f0-9]{20,40})\/?$/i);
      if (match) { embedUrl = "https://rutube.ru/play/embed/" + match[1]; embedProvider = "RUTUBE"; }
    } else if (["vk.com", "m.vk.com", "vkvideo.ru"].includes(host)) {
      const videoMatch = path.match(/^\/video(-?\d+)_([0-9]+)/);
      const ext = path === "/video_ext.php" ? { oid: url.searchParams.get("oid"), id: url.searchParams.get("id"), hash: url.searchParams.get("hash") } : null;
      if (videoMatch) {
        embedUrl = "https://vk.com/video_ext.php?oid=" + encodeURIComponent(videoMatch[1]) + "&id=" + encodeURIComponent(videoMatch[2]);
        embedProvider = "VK VIDEO";
      } else if (ext && /^-?\d+$/.test(ext.oid || "") && /^\d+$/.test(ext.id || "") && /^[A-Za-z0-9_-]{0,128}$/.test(ext.hash || "")) {
        const embedHost = host === "vkvideo.ru" ? "https://vkvideo.ru" : "https://vk.com";
        embedUrl = embedHost + "/video_ext.php?oid=" + encodeURIComponent(ext.oid) + "&id=" + encodeURIComponent(ext.id) + (ext.hash ? "&hash=" + encodeURIComponent(ext.hash) : "") + (url.searchParams.get("hd") ? "&hd=" + encodeURIComponent(url.searchParams.get("hd")) : "");
        embedProvider = "VK VIDEO";
      }
    }
    if (embedUrl) {
      resetStreamEngines();
      const embedStage = $("#playerStage");
      embedStage.replaceChildren();
      const frame = document.createElement("iframe");
      frame.src = embedUrl;
      frame.title = "AFTER DARK — " + embedProvider;
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.loading = "eager";
      embedStage.appendChild(frame);
      addFrameFallback(embedUrl);
      status("ВСТРОЕННЫЙ ПЛЕЕР · " + embedProvider);
      streamStatus("Озвучка и субтитры для встроенного источника настраиваются внутри его плеера, если он предоставляет такие параметры.");
      return;
    }
    const kind = path.endsWith(".m3u8") ? "hls" : path.endsWith(".mpd") ? "dash" : /\.(mp4|webm|ogv|ogg|m4v)(?:$)/i.test(path) ? "file" : "unknown";
    if (kind === "unknown") {
      // Do not put an ordinary film webpage inside the video viewport.
      if (/^(?:www\.)?(?:google\.[^/]+|yandex\.[^/]+|bing\.com|duckduckgo\.com)$/i.test(host)) {
        throw new Error("Это поисковая выдача, а не видеоплеер. Открой конкретный источник и найди ссылку для встраивания.");
      }
      const looksLikeEmbed = /player|embed|video_ext|\/video\/|\/iframe|\/play\//i.test(url.pathname);
      if (!allowUnknownEmbed && !looksLikeEmbed) {
        throw new Error("Это похоже на обычную страницу сайта, а не на адрес видеоплеера. Нужен URL из src тега iframe (код «Встроить») или прямая ссылка на видео.");
      }
      resetStreamEngines();
      const stage = $("#playerStage");
      stage.replaceChildren();
      const frame = document.createElement("iframe");
      frame.src = url.href;
      frame.title = "AFTER DARK — встроенный видеоплеер";
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.loading = "eager";
      stage.appendChild(frame);
      addFrameFallback(url.href);
      status("ПРОБУЮ ОТКРЫТЬ ВСТРОЕННЫЙ ВИДЕОПЛЕЕР");
      streamStatus("Открыт адрес плеера. Если источник запрещает встраивание, браузер не позволит показать его внутри After Dark.");
      return;
    }
    resetStreamEngines();
    const stage = $("#playerStage");
    stage.replaceChildren();
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", "AFTER DARK video player");
    stage.appendChild(video);
    activeVideo = video;
    if (kind === "file") {
      video.src = url.href;
      video.addEventListener("loadedmetadata", () => {
        const tracks = video.audioTracks ? Array.from(video.audioTracks) : [];
        setOptions($("#audioTrack"), tracks.map((track, i) => ({ id: i, label: track.label || track.language || ("Аудио " + (i + 1)) })), tracks.findIndex(track => track.enabled), "Браузер не предоставил аудиодорожки");
        if (video.textTracks && video.textTracks.length) {
          const tracksText = Array.from(video.textTracks).map((track, i) => ({ id: i, label: track.label || track.language || ("Субтитры " + (i + 1)) }));
          setOptions($("#subtitleTrack"), tracksText, 0, "Нет субтитров");
        }
        streamStatus(tracks.length > 1 ? "Доступно несколько аудиодорожек." : "У этого файла или браузера может не быть доступного переключения озвучки.");
      }, { once: true });
      video.addEventListener("error", () => streamStatus("Видео не загрузилось. Источник может запрещать доступ с другого сайта или иметь неподдерживаемый формат.", true), { once: true });
      status("ПРЯМОЙ ВИДЕОФАЙЛ ПОДКЛЮЧЁН");
      return;
    }
    if (kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url.href;
        video.addEventListener("loadedmetadata", () => streamStatus("HLS открыт встроенным плеером браузера. Список озвучек зависит от поддержки браузера."), { once: true });
      } else if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls();
        hls.loadSource(url.href);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, refreshHlsTracks);
        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, refreshHlsTracks);
        hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, refreshHlsTracks);
        hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data && data.fatal) streamStatus("HLS-поток не открылся. Возможно, сервер не разрешает доступ с этого сайта (CORS) или ссылка устарела.", true);
        });
      } else throw new Error("Этот браузер не поддерживает HLS-потоки.");
      status("HLS-ПОТОК ПОДКЛЮЧЁН");
      return;
    }
    if (kind === "dash") {
      if (!window.dashjs || !window.dashjs.MediaPlayer) throw new Error("Не загрузилась библиотека DASH-плеера.");
      dash = window.dashjs.MediaPlayer().create();
      dash.initialize(video, url.href, false);
      dash.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, refreshDashTracks);
      dash.on(window.dashjs.MediaPlayer.events.ERROR, () => streamStatus("DASH-поток не открылся. Проверь ссылку и разрешение CORS на сервере.", true));
      status("DASH-ПОТОК ПОДКЛЮЧЁН");
    }
  }
  function playArchiveSource(source, auto = false) {
    if (!source || typeof source.identifier !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(source.identifier)) return;
    // Prefer a browser-playable direct file from the open-licensed archive record.
    // Keep Archive's own player as a fallback if the direct file is blocked or unsupported.
    let safeDirectUrl = false;
    try { const direct = new URL(source.directUrl); safeDirectUrl = direct.protocol === "https:" && direct.hostname === "archive.org" && /^\/download\/[A-Za-z0-9._-]+\/.+$/i.test(direct.pathname); } catch (_) {}
    if (safeDirectUrl) {
      try {
        openDirectStream(source.directUrl);
        status("ОТКРЫТЫЙ ИСТОЧНИК · ПРЯМОЙ ВИДЕОФАЙЛ");
        streamStatus("Если браузер не воспроизводит этот файл, можно открыть встроенный плеер Internet Archive.");
        const video = $("#playerStage video");
        if (video) video.addEventListener("error", () => playArchiveEmbedFallback(source), { once: true });
        return;
      } catch (_) {}
    }
    playArchiveEmbedFallback(source, auto);
  }
  function playArchiveEmbedFallback(source, auto = false) {
    if (!source || typeof source.identifier !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(source.identifier)) return;
    resetStreamEngines();
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
    status("ИСТОЧНИК ОТКРЫТ · INTERNET ARCHIVE");
    streamStatus("Для встроенного плеера Archive.org выбор дорожек управляется самим Archive.org; эти переключатели доступны для прямых HLS/DASH-потоков.");
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
    meta.textContent = "INTERNET ARCHIVE · " + minutes + " МИН. · " + (source.directUrl ? "ПРЯМОЙ ФАЙЛ" : "ВСТРОЕННЫЙ ПЛЕЕР") + " · ОТКРЫТАЯ ЛИЦЕНЗИЯ";
    button.append(title, meta);
    button.addEventListener("click", () => playArchiveSource(source, true));
    $("#sourceResults").appendChild(button);
  }
  function providerNames(region) {
    const offers = ["flatrate", "free", "ads", "rent", "buy"].flatMap(key => Array.isArray(region[key]) ? region[key] : []);
    return [...new Set(offers.map(item => item && item.provider_name).filter(Boolean))];
  }
  async function showOfficialProviders(film) {
    const id = Number(film.tmdbId ?? film.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const mediaType = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    try {
      const response = await fetch("/api/tmdb?path=" + encodeURIComponent("/" + mediaType + "/" + id + "/watch/providers"), { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const region = payload && payload.results && payload.results.RU;
      if (!region) return;
      const names = providerNames(region);
      if (!names.length || typeof region.link !== "string" || !/^https:\/\//i.test(region.link)) return;
      const link = document.createElement("a");
      link.className = "source-result source-result--external";
      link.href = region.link; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = "РОССИЯ · " + names.join(" · ") + " ↗";
      $("#sourceResults").appendChild(link);
      const attribution = document.createElement("p");
      attribution.className = "source-attribution";
      attribution.append("Доступность сервисов в России: ");
      const justwatch = document.createElement("a");
      justwatch.href = "https://www.justwatch.com/ru/"; justwatch.target = "_blank"; justwatch.rel = "noopener noreferrer"; justwatch.textContent = "JustWatch Россия";
      attribution.append(justwatch, " · данные через TMDB API. Доступность может меняться.");
      $("#sourceResults").appendChild(attribution);
    } catch (_) {}
  }
  async function searchOpenArchive(film) {
    const { titles, year } = filmSearchTerms(film);
    const found = new Map();
    for (const title of titles) {
      const params = new URLSearchParams({ q: title }); if (year) params.set("year", year);
      try {
        const response = await fetch("/api/watch-sources?" + params.toString(), { headers: { accept: "application/json" } });
        if (!response.ok) continue;
        const data = await response.json();
        for (const item of Array.isArray(data.results) ? data.results : []) if (item && item.identifier) found.set(item.identifier, item);
      } catch (_) {}
      if (found.size) break;
    }
    return [...found.values()];
  }
  function addAutomaticPlayerOption(film) {
    const area = $("#sourceResults");
    const { titles, year } = filmSearchTerms(film);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "source-result";
    button.textContent = "АВТОМАТИЧЕСКИ НАЙТИ И ВСТРОИТЬ ВИДЕОПЛЕЕР";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "ИЩУ И ИЗВЛЕКАЮ АДРЕС ПЛЕЕРА…";
      status("ИЩУ ВСТРОЕННЫЙ ПЛЕЕР ДЛЯ ЭТОГО ФИЛЬМА");
      streamStatus("After Dark ищет страницу фильма по названию и году, затем пытается извлечь отдельный адрес iframe. Некоторые источники блокируют автоматическое извлечение или встраивание.");
      let lastMessage = "";
      let found = false;
      try {
        // Two automatic passes: transient search-engine failures should not require a tap.
        for (let pass = 0; pass < 2 && !found; pass++) {
          for (const title of titles) {
            try {
              const params = new URLSearchParams({ title });
              if (year) params.set("year", year);
              const response = await fetch("/api/resolve-film-player?" + params.toString(), {
                headers: { accept: "application/json" }
              });
              const data = await response.json().catch(() => ({}));
              if (response.ok && data.embedUrl) {
                openDirectStream(data.embedUrl, true);
                status("ВСТРОЕННЫЙ ПЛЕЕР НАЙДЕН · " + String(data.provider || "ИСТОЧНИК").toUpperCase());
                streamStatus("Источник найден автоматически. Если плеер не запускается, сайт-источник может запрещать встраивание.");
                addNote("Источник найден автоматически по названию фильма; вручную вставлять ссылку не потребовалось.");
                found = true;
                break;
              }
              lastMessage = data.message || data.error || "Не удалось найти встроенный плеер.";
            } catch (requestError) {
              lastMessage = requestError && requestError.message || "Источник временно не ответил.";
            }
          }
          if (!found && pass === 0) {
            status("НЕ НАШЁЛ С ПЕРВОГО РАЗА · ПРОБУЮ ЕЩЁ РАЗ…");
            streamStatus("Повторный поиск идёт автоматически. Проверяю названия ещё раз; нажимать ничего не нужно.");
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        }
        if (!found) throw new Error(lastMessage || "Не удалось найти встроенный плеер для этого фильма.");
      } catch (error) {
        status("АВТОМАТИЧЕСКИЙ ПОИСК ПЛЕЕРА НЕ УДАЛСЯ", true);
        streamStatus((error.message || "Источник не найден.") + " Источники могли быть недоступны или запретить встраивание.", true);
      } finally {
        button.disabled = false;
        button.textContent = "ПОИСКАТЬ ЕЩЁ РАЗ";
      }
    });
    area.prepend(button);
    addNote("Автопоиск встроенного плеера доступен для этого фильма. Результат зависит от доступности источника и разрешения на встраивание.");
  }
  async function findSources(film) {
    const area = $("#sourceResults"); area.replaceChildren(); status("ИЩУ ИСТОЧНИКИ ДЛЯ РОССИИ…");
    addAutomaticPlayerOption(film);
    try {
      const results = await searchOpenArchive(film);
      const exact = results.filter(item => item && item.confidence === "high");
      if (exact.length === 1) {
        playArchiveSource(exact[0], true);
        addNote("Найдено точное совпадение с открытой лицензией. Если воспроизведение не началось автоматически, нажми Play.");
        return;
      }
      // Search known film pages and embed their player iframe, not the whole source page.
      const { titles: providerTitles, year: providerYear } = filmSearchTerms(film);
      for (const providerTitle of providerTitles) {
        try {
          const params = new URLSearchParams({ title: providerTitle });
          if (providerYear) params.set("year", providerYear);
          const response = await fetch("/api/resolve-film-player?" + params.toString(), { headers: { accept: "application/json" } });
          const resolved = await response.json().catch(() => ({}));
          if (response.ok && resolved.embedUrl) {
            openDirectStream(resolved.embedUrl, true);
            status("ВСТРОЕННЫЙ ПЛЕЕР НАЙДЕН · " + String(resolved.provider || "ИСТОЧНИК").toUpperCase());
            addNote("After Dark нашёл страницу фильма и извлёк адрес встроенного плеера. Если он не запускается, видеохост может запрещать встраивание.");
            return;
          }
        } catch (_) {}
      }
      if (results.length) {
        status("НАШЛИСЬ ОТКРЫТЫЕ ВАРИАНТЫ · ВЫБЕРИ ПОДХОДЯЩИЙ");
        addNote("Это записи Internet Archive с открытой лицензией. Совпадение названия не гарантирует, что там находится полный фильм.");
        results.forEach(renderCandidate);
      } else {
        status("В ОТКРЫТОМ АРХИВЕ НЕТ ПОДХОДЯЩЕГО ВИДЕОФАЙЛА");
        addNote("Автопоиск пока проверяет только Internet Archive и видео с открытой лицензией. Ссылки на другие сайты находятся в карточках выше; дополнительные поисковики скрыты в разделе ниже.");
      }
    } catch (_) {
      status("АВТОМАТИЧЕСКИЙ ИСТОЧНИК НЕ НАЙДЕН · ПОПРОБУЙ ДРУГИЕ ПОИСКИ");
    }
    addExternalFallback(film);
    // Start the expanded player resolver immediately; provider metadata must not block it.
    const retryButton = area.querySelector("button.source-result");
    if (retryButton && !retryButton.disabled) retryButton.click();
    await showOfficialProviders(film);
  }
  function init() {
    $("#audioTrack").addEventListener("change", () => {
      const index = Number($("#audioTrack").value);
      if (index < 0) return;
      if (hls) hls.audioTrack = index;
      else if (dash) {
        const tracks = dash.getTracksFor("audio") || [];
        if (tracks[index]) dash.setCurrentTrack(tracks[index]);
      } else if (activeVideo && activeVideo.audioTracks && activeVideo.audioTracks[index]) {
        Array.from(activeVideo.audioTracks).forEach((track, i) => { track.enabled = i === index; });
      }
    });
    $("#subtitleTrack").addEventListener("change", () => {
      const index = Number($("#subtitleTrack").value);
      if (index < 0) return;
      if (hls) hls.subtitleTrack = index;
      else if (dash) {
        const tracks = dash.getTracksFor("text") || [];
        if (tracks[index]) dash.setCurrentTrack(tracks[index]);
      } else if (activeVideo && activeVideo.textTracks && activeVideo.textTracks[index]) {
        Array.from(activeVideo.textTracks).forEach((track, i) => { track.mode = i === index ? "showing" : "disabled"; });
      }
    });
    let film = null;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo === "nosferatu") film = { tmdbId: 653, type: "film", title: "Nosferatu", original_title: "Nosferatu", release_date: "1922-01-01" };
    else if (demo === "devil-wears-prada") film = { tmdbId: 350, type: "film", title: "Дьявол носит Prada", original_title: "The Devil Wears Prada", release_date: "2006-06-30" };
    else { try { film = JSON.parse(localStorage.getItem(FILM_KEY) || "null"); } catch (_) {} }
    if (!film || typeof film !== "object") {
      $("#mediaTitle").textContent = "Фильм не выбран";
      $("#mediaMeta").textContent = "Вернись в архив и нажми WATCH на выбранной карточке.";
      status("НЕ ПОЛУЧЕНЫ ДАННЫЕ ФИЛЬМА", true);
      return;
    }
    $("#mediaTitle").textContent = String(film.title || film.name || "Без названия");
    const isSeries = film.type === "series" || film.media_type === "tv" || Boolean(film.first_air_date);
    $("#mediaType").textContent = isSeries ? "СЕРИАЛ" : "ФИЛЬМ";
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    $("#mediaMeta").textContent = [year, film.original_title || film.original_name].filter(Boolean).join(" / ");
    findSources(film);
    window.addEventListener("pagehide", () => {
      if (hls) hls.destroy();
      if (dash) { try { dash.reset(); } catch (_) {} }
      const frame = $("#playerStage iframe"); if (frame) frame.src = "about:blank";
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();