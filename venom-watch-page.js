/* AFTER DARK — Russia-first source discovery + native HLS/DASH audio track controls. */
(function () {
  "use strict";
  const FILM_KEY = "after-dark:venom-current-film:v1";
  const $ = selector => document.querySelector(selector);
  let hls = null;
  let dash = null;
  let activeVideo = null;
  let currentFilm = null;
  let lastProgressSavedAt = 0;
  let lastProgressSavedSecond = -1;
  let completionActionsShown = false;
  let restartCurrentEpisode = false;
  let selectedSeason = null;
  let selectedEpisode = null;
  let audioPreferenceApplied = false;
  let preferredRussianAudioSelected = false;
  let externalLinkResumeChosen = false;

  function findRussianAudioTrackIndex(tracks) {
    if (!Array.isArray(tracks)) return -1;
    return tracks.findIndex(track => {
      if (!track || typeof track !== "object") return false;
      const attrs = track.attrs && typeof track.attrs === "object" ? track.attrs : {};
      const language = String(
        track.lang || track.language || track.languageCode || track.langCode ||
        track.audioTrack?.language || attrs.LANGUAGE || attrs.language || ""
      ).trim();
      if (/^ru(?:[-_][a-z0-9]+)*$/i.test(language) || /^rus$/i.test(language)) return true;
      const labels = [
        track.name, track.label, track.title, track.displayName,
        attrs.NAME, attrs.name,
        ...(Array.isArray(track.labels) ? track.labels.map(item => item && (item.text || item.label || item.name)) : [])
      ].filter(Boolean).join(" ");
      return /русск|russian/i.test(labels);
    });
  }

  function hasAudioLanguageMetadata(tracks) {
    if (!Array.isArray(tracks)) return false;
    return tracks.some(track => {
      if (!track || typeof track !== "object") return false;
      const attrs = track.attrs && typeof track.attrs === "object" ? track.attrs : {};
      const labels = Array.isArray(track.labels)
        ? track.labels.map(item => item && (item.text || item.label || item.name)).filter(Boolean).join(" ")
        : "";
      return Boolean(String(
        track.lang || track.language || track.languageCode || track.langCode ||
        track.audioTrack?.language || attrs.LANGUAGE || attrs.language ||
        track.name || track.label || track.title || attrs.NAME || labels || ""
      ).trim());
    });
  }

  function audioTrackStatus(tracks, selectedRussian, total) {
    if (selectedRussian || preferredRussianAudioSelected) return "Выбрана русская озвучка по языковым метаданным потока.";
    if (!total) return "Поток пока не передал список аудиодорожек.";
    if (findRussianAudioTrackIndex(tracks) >= 0) return "Русская дорожка заявлена, но её выбор ещё не подтверждён.";
    if (!hasAudioLanguageMetadata(tracks)) return "У дорожек нет языковых меток. Нельзя подтвердить, есть ли русская озвучка; проверь меню источника.";
    return "В метаданных потока русская дорожка не указана. Доступные варианты можно выбрать ниже.";
  }

  function isSeriesFilm(film) {
    return !!film && (film.type === "series" || film.media_type === "tv" || Boolean(film.first_air_date));
  }
  function savedProgress(film) {
    return window.afterDarkProgress?.get(film?.tmdbId ?? film?.id) || null;
  }
  const EXTERNAL_SOURCES_KEY = "after-dark:external-watch-sources:v1";
  function readExternalSources() {
    try {
      const data = JSON.parse(localStorage.getItem(EXTERNAL_SOURCES_KEY) || "{}");
      return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch (_) { return {}; }
  }
  function parseWatchTime(value) {
    const parts = String(value || "").trim().split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\\d{1,2}$/.test(part))) return null;
    const numbers = parts.map(Number);
    if (numbers.slice(1).some(part => part > 59)) return null;
    const seconds = parts.length === 3 ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2] : numbers[0] * 60 + numbers[1];
    return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
  }
  function showExternalSource(film, url) {
    const panel = $("#externalSourceSaved");
    const link = $("#externalSourceLink");
    const input = $("#externalPosition");
    const statusText = $("#externalPositionStatus");
    if (!panel || !link || !input) return;
    const safe = new URL(url);
    link.href = safe.href;
    link.textContent = "ОТКРЫТЬ " + safe.hostname.replace(/^www\\./i, "").toLocaleUpperCase("ru-RU") + " ↗";
    panel.hidden = false;
    const saved = savedProgress(film);
    if (saved?.position_seconds) input.value = window.afterDarkProgress?.formatTime(saved.position_seconds) || "";
    if (statusText) statusText.textContent = saved?.source_provider === "external-link" && saved.position_seconds
      ? "Последнее место сохранено: " + (window.afterDarkProgress?.formatTime(saved.position_seconds) || "")
      : "Ссылка сохранена в этом браузере.";
  }
  function bindExternalProgress(film) {
    const id = Number(film?.tmdbId ?? film?.tmdb_id ?? film?.id);
    const savedUrl = readExternalSources()[String(id)];
    const input = $("#manualSourceUrl");
    if (savedUrl && input) {
      input.value = savedUrl;
      showExternalSource(film, savedUrl);
    }
    const saveButton = $("#saveExternalPosition");
    if (!saveButton || saveButton.dataset.bound) return;
    saveButton.dataset.bound = "1";
    saveButton.addEventListener("click", async () => {
      const timeInput = $("#externalPosition");
      const statusText = $("#externalPositionStatus");
      const seconds = parseWatchTime(timeInput?.value);
      if (seconds == null) {
        timeInput?.setCustomValidity("Введи время как 17:27 или 1:17:27.");
        timeInput?.reportValidity();
        return;
      }
      timeInput.setCustomValidity("");
      const previous = savedProgress(film) || {};
      const saved = await window.afterDarkProgress?.save?.({
        tmdb_id: id,
        title: film.title || film.name || "",
        media_type: isSeriesFilm(film) ? "tv" : "movie",
        position_seconds: seconds,
        duration_seconds: Number(previous.duration_seconds || 0),
        status: "in_progress",
        season_number: isSeriesFilm(film) ? (selectedSeason ?? previous.season_number ?? 1) : null,
        episode_number: isSeriesFilm(film) ? (selectedEpisode ?? previous.episode_number ?? 1) : null,
        source_provider: "external-link"
      });
      if (statusText) statusText.textContent = saved
        ? "Сохранено: " + (window.afterDarkProgress?.formatTime(seconds) || "")
        : "Не удалось сохранить время просмотра.";
    });
  }

  function askResumeChoice(film) {
    const saved = window.afterDarkProgress?.get(film?.tmdbId ?? film?.id) || null;
    const position = Number(saved?.position_seconds || 0);
    if (!saved || saved.status !== "in_progress" || position < 10) return Promise.resolve();
    const savedExternalUrl = saved.source_provider === "external-link" ? readExternalSources()[String(Number(film?.tmdbId ?? film?.tmdb_id ?? film?.id))] : "";
    const canResumeExternal = typeof savedExternalUrl === "string" && (savedExternalUrl.startsWith("https://") || savedExternalUrl.startsWith("http://"));
    const overlay = document.createElement("div");
    overlay.className = "resume-dialog-backdrop";
    overlay.setAttribute("role", "presentation");
    const dialog = document.createElement("section");
    dialog.className = "resume-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "resumeDialogTitle");
    const title = document.createElement("p");
    title.className = "resume-dialog__eyebrow";
    title.textContent = "ТВОЙ ПРОСМОТР";
    const heading = document.createElement("h2");
    heading.id = "resumeDialogTitle";
    const isSeries = isSeriesFilm(film);
    const season = Number(saved.season_number || 0);
    const episode = Number(saved.episode_number || 0);
    const episodeLabel = isSeries && season > 0 && episode > 0 ? " · " + season + " сезон, " + episode + " серия" : "";
    heading.textContent = "Ты остановилась" + episodeLabel + " — " + (window.afterDarkProgress?.formatTime ? window.afterDarkProgress.formatTime(position) : Math.floor(position / 60) + " мин.");
    const description = document.createElement("p");
    description.className = "resume-dialog__description";
    description.textContent = canResumeExternal
      ? "Откроется сохранённый сайт. Время записано вручную; на чужом плеере его нужно выставить самостоятельно."
      : "Продолжить с сохранённого места или начать просмотр сначала?";
    const actions = document.createElement("div");
    actions.className = "resume-dialog__actions";
    const continueButton = document.createElement("button");
    continueButton.type = "button";
    continueButton.className = "resume-dialog__continue";
    continueButton.textContent = canResumeExternal ? "Открыть сайт" : "Продолжить";
    const restartButton = document.createElement("button");
    restartButton.type = "button";
    restartButton.className = "resume-dialog__restart";
    restartButton.textContent = "Начать сначала";
    actions.append(continueButton, restartButton);
    dialog.append(title, heading, description, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return new Promise(resolve => {
      const finish = restart => {
        restartCurrentEpisode = restart;
        if (!restart && canResumeExternal) {
          window.open(savedExternalUrl, "_blank", "noopener,noreferrer");
          externalLinkResumeChosen = true;
        }
        overlay.remove();
        resolve();
      };
      continueButton.addEventListener("click", () => finish(false), { once: true });
      restartButton.addEventListener("click", () => finish(true), { once: true });
      continueButton.focus();
    });
  }
  function showCompletionActions(film) {
    if (!film || isSeriesFilm(film) || completionActionsShown) return;
    completionActionsShown = true;
    let panel = document.querySelector("#watchCompletionActions");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "watchCompletionActions";
      panel.className = "watch-completion-actions";
      const stage = $("#playerStage");
      stage?.insertAdjacentElement("afterend", panel);
    }
    const id = Number(film.tmdbId ?? film.id);
    panel.innerHTML = '<p>Фильм завершён. Сохранили просмотр в истории.</p><a class="source-result source-result--external" href="index.html?rate=' + id + '#ratings">ОЦЕНИТЬ ФИЛЬМ ↗</a><a class="source-result source-result--external" href="index.html#archive">ВЕРНУТЬСЯ В АРХИВ</a>';
  }
  function savePlaybackProgress(film, values, provider, force = false) {
    if (!film || !window.afterDarkProgress?.save) return;
    const currentTime = Number(values.currentTime ?? values.position_seconds ?? values.positionSeconds);
    const duration = Number(values.duration ?? values.duration_seconds ?? values.durationSeconds);
    if (!Number.isFinite(currentTime) || currentTime < 0) return;
    const now = Date.now();
    if (!force && now - lastProgressSavedAt < 8000 && Math.abs(currentTime - lastProgressSavedSecond) < 8) return;
    lastProgressSavedAt = now;
    lastProgressSavedSecond = currentTime;
    const series = isSeriesFilm(film);
    const ended = values.ended === true || values.event === "ended" || values.event === "complete" || values.event === "completed";
    const completed = !series && (ended || (Number.isFinite(duration) && duration > 0 && currentTime >= duration * 0.96));
    const season = Number(values.season ?? values.season_number);
    const episode = Number(values.episode ?? values.episode_number);
    window.afterDarkProgress.save({
      tmdb_id: Number(film.tmdbId ?? film.id),
      title: film.title || film.name || "",
      media_type: series ? "tv" : "movie",
      position_seconds: completed ? Math.max(0, Math.floor(duration || currentTime)) : Math.floor(currentTime),
      duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
      status: completed ? "completed" : "in_progress",
      season_number: Number.isInteger(season) && season > 0 ? season : undefined,
      episode_number: Number.isInteger(episode) && episode > 0 ? episode : undefined,
      source_provider: provider || "unknown"
    }).then(() => {
      if (completed) {
        status("ПРОСМОТР ЗАВЕРШЁН · СОХРАНЯЮ ИСТОРИЮ");
        showCompletionActions(film);
      }
    }).catch(error => console.warn("PLAYBACK PROGRESS SAVE FAILED", error));
  }
  function attachNativeProgress(video, film, provider) {
    const restore = () => {
      const p = savedProgress(film);
      if (!p || p.status !== "in_progress" || Number(p.position_seconds) < 10 || !Number.isFinite(video.duration)) return;
      if (Number(p.position_seconds) < video.duration - 5) {
        try { video.currentTime = Number(p.position_seconds); streamStatus("Продолжаем с " + window.afterDarkProgress.formatTime(p.position_seconds) + "."); } catch (_) {}
      }
    };
    if (video.readyState >= 1) restore();
    else video.addEventListener("loadedmetadata", restore, { once: true });
    video.addEventListener("timeupdate", () => savePlaybackProgress(film, { currentTime: video.currentTime, duration: video.duration }, provider));
    video.addEventListener("pause", () => savePlaybackProgress(film, { currentTime: video.currentTime, duration: video.duration }, provider, true));
    video.addEventListener("ended", () => savePlaybackProgress(film, { currentTime: video.currentTime, duration: video.duration, ended: true }, provider, true));
  }
  function attachFrameProgress(frame, film, providerName, origin) {
    if (!frame || !film || !origin) return;
    const saved = savedProgress(film);
    const onMessage = event => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "STELLAR_EMBED_READY") {
        try { frame.contentWindow.postMessage({ type: "STELLAR_EMBED_INIT" }, origin); } catch (_) {}
        return;
      }
      const isVidScene = data.type === "VIDSCENE_PLAYER_EVENT";
      const isStellar = data.type === "PLAYER_EVENT" || data.type === "MEDIA_DATA";
      if (!isVidScene && !isStellar) return;
      const payload = data.data && typeof data.data === "object" ? data.data : data;
      const eventName = String(payload.event || payload.name || "").toLowerCase();
      if (providerName === "VIDSCENE" && eventName === "loadedmetadata" && saved?.status === "in_progress" && Number(saved.position_seconds) > 10) {
        try {
          frame.contentWindow.postMessage({ type: "VIDSCENE_PLAYER_COMMAND", command: "seekTo", data: { time: Number(saved.position_seconds) } }, origin);
        } catch (_) {}
      }
      if (eventName === "episodechange") {
        savePlaybackProgress(film, { currentTime: 0, duration: 0, season: payload.season, episode: payload.episode, event: eventName }, providerName, true);
        return;
      }
      const currentTime = payload.currentTime ?? payload.current_time ?? payload.position ?? payload.position_seconds;
      const duration = payload.duration ?? payload.durationSeconds ?? payload.duration_seconds;
      const ended = eventName === "ended" || eventName === "complete" || eventName === "completed";
      if (currentTime !== undefined || ended) {
        savePlaybackProgress(film, { currentTime: currentTime ?? duration ?? 0, duration, season: payload.season, episode: payload.episode, event: eventName, ended }, providerName, ended || eventName === "pause" || eventName === "seeked");
      }
    };
    window.addEventListener("message", onMessage);
    frame.addEventListener("load", () => {
      if (providerName === "STELLAR") {
        try { frame.contentWindow.postMessage({ type: "STELLAR_EMBED_INIT" }, origin); } catch (_) {}
      }
    });
  }

  function status(message, error) {
    const el = $("#playerStatus");
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
  }
  function streamStatus(message, error) {
    const el = $("#streamStatus");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", Boolean(error));
    const stage = $("#playerStage");
    if (stage) {
      let indicator = $("#audioSourceState");
      if (!indicator) {
        indicator = document.createElement("p");
        indicator.id = "audioSourceState";
        indicator.className = "audio-source-state";
        indicator.setAttribute("role", "status");
        indicator.setAttribute("aria-live", "polite");
        stage.insertAdjacentElement("afterend", indicator);
      }
      const text = String(message || "");
      const isEmbedded = /Stellar|встроенн|iframe|сторонн/i.test(text);
      const isRussian = /выбрана русская озвучка|русская дорожка выбрана/i.test(text);
      indicator.textContent = isRussian
        ? "ЗВУК · РУССКАЯ ДОРОЖКА ВЫБРАНА"
        : isEmbedded
          ? "ЗВУК · УПРАВЛЯЕТСЯ ВНЕШНИМ ПЛЕЕРОМ"
          : /дорожк|аудио|озвучк|поток/i.test(text)
            ? "ЗВУК · " + text.toLocaleUpperCase("ru-RU")
            : "";
      indicator.hidden = !indicator.textContent;
      indicator.classList.toggle("is-error", Boolean(error));
      indicator.classList.toggle("is-russian", isRussian);
    }
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
  function chooseRussianArchiveCandidate(results) {
    if (!Array.isArray(results)) return null;
    const exact = results.filter(item => item && item.confidence === "high");
    const russianExact = exact.filter(item => item.russianAudioLikely === true);
    // Never auto-start a merely exact title match when its audio language is unknown.
    // A metadata hint is not proof of the actual soundtrack, so the user still confirms playback.
    return russianExact.length === 1 ? russianExact[0] : null;
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
    audioPreferenceApplied = false;
    preferredRussianAudioSelected = false;
    if (venomPlayerInstance) {
      try { venomPlayerInstance.destroy?.(); } catch (_) {}
      venomPlayerInstance = null;
    }
    if (matteboxInstance) {
      try { matteboxInstance.unload(); matteboxInstance.detach(); } catch (_) {}
      matteboxInstance = null;
    }
    if (hls) { hls.destroy(); hls = null; }
    if (dash) { try { dash.reset(); } catch (_) {} dash = null; }
    activeVideo = null;
    $("#trackControls").hidden = true;
    $("#audioTrack").replaceChildren(new Option("Источник не предоставляет выбор", "-1"));
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
    const tracks = hls.audioTracks || [];
    const audios = tracks.map((track, index) => ({
      id: index,
      label: [track.name, track.lang, track.attrs && track.attrs["LANGUAGE"]].filter(Boolean).join(" · ") || ("Аудио " + (index + 1))
    }));
    let selectedAudio = hls.audioTrack;
    let russianSelected = false;
    if (!audioPreferenceApplied && tracks.length) {
      const russianIndex = findRussianAudioTrackIndex(tracks);
      if (russianIndex >= 0) {
        hls.audioTrack = russianIndex;
        selectedAudio = russianIndex;
        russianSelected = true;
        preferredRussianAudioSelected = true;
        audioPreferenceApplied = true;
      }
    }
    setOptions($("#audioTrack"), audios, selectedAudio, "В потоке нет аудиодорожек");
    const subtitles = (hls.subtitleTracks || []).map((track, index) => ({
      id: index,
      label: [track.name, track.lang].filter(Boolean).join(" · ") || ("Субтитры " + (index + 1))
    }));
    setOptions($("#subtitleTrack"), subtitles, hls.subtitleTrack, "Нет субтитров");
    $("#trackControls").hidden = !(audios.length > 1 || subtitles.length > 0);
    streamStatus(audioTrackStatus(tracks, russianSelected, audios.length));
  }
  function refreshDashTracks() {
    if (!dash) return;
    const audioTracks = dash.getTracksFor("audio") || [];
    let selectedAudio = 0;
    try {
      const currentTrack = dash.getCurrentTrackFor && dash.getCurrentTrackFor("audio");
      const currentIndex = audioTracks.findIndex(track => track === currentTrack || (track && currentTrack && track.id != null && track.id === currentTrack.id));
      if (currentIndex >= 0) selectedAudio = currentIndex;
    } catch (_) {}
    let russianSelected = false;
    if (!audioPreferenceApplied && audioTracks.length) {
      const russianIndex = findRussianAudioTrackIndex(audioTracks);
      if (russianIndex >= 0) {
        try {
          dash.setCurrentTrack(audioTracks[russianIndex]);
          selectedAudio = russianIndex;
          russianSelected = true;
          preferredRussianAudioSelected = true;
          audioPreferenceApplied = true;
        } catch (_) {}
      }
    }
    const audios = audioTracks.map((track, index) => ({
      id: index,
      label: [track.lang, track.labels && track.labels.map(x => x.text).filter(Boolean).join(", "), track.codec].filter(Boolean).join(" · ") || ("Аудио " + (index + 1))
    }));
    const subtitles = (dash.getTracksFor("text") || []).map((track, index) => ({
      id: index,
      label: [track.lang, track.labels && track.labels.map(x => x.text).filter(Boolean).join(", ")].filter(Boolean).join(" · ") || ("Субтитры " + (index + 1))
    }));
    setOptions($("#audioTrack"), audios, selectedAudio, "В потоке нет аудиодорожек");
    setOptions($("#subtitleTrack"), subtitles, 0, "Нет субтитров");
    $("#trackControls").hidden = !(audios.length > 1 || subtitles.length > 0);
    streamStatus(audioTrackStatus(audioTracks, russianSelected, audios.length));
  }
  function configureNativeAudioTracks(video, sourceLabel) {
    let tracks = [];
    try { tracks = video.audioTracks ? Array.from(video.audioTracks) : []; } catch (_) {}
    let selectedAudio = tracks.findIndex(track => track && track.enabled);
    let russianSelected = false;
    if (!audioPreferenceApplied && tracks.length) {
      const russianIndex = findRussianAudioTrackIndex(tracks);
      if (russianIndex >= 0) {
        try {
          tracks.forEach((track, index) => { track.enabled = index === russianIndex; });
          selectedAudio = russianIndex;
          russianSelected = true;
          preferredRussianAudioSelected = true;
          audioPreferenceApplied = true;
        } catch (_) {}
      }
    }
    setOptions($("#audioTrack"), tracks.map((track, index) => ({
      id: index,
      label: [track.label, track.language, track.lang].filter(Boolean).join(" · ") || ("Аудио " + (index + 1))
    })), selectedAudio, "Браузер не предоставил аудиодорожки");

    let subtitles = [];
    try {
      subtitles = video.textTracks ? Array.from(video.textTracks).map((track, index) => ({
        id: index,
        label: [track.label, track.language].filter(Boolean).join(" · ") || ("Субтитры " + (index + 1))
      })) : [];
    } catch (_) {}
    if (subtitles.length) setOptions($("#subtitleTrack"), subtitles, 0, "Нет субтитров");
    $("#trackControls").hidden = !(tracks.length > 1 || subtitles.length > 0);
    streamStatus(tracks.length
      ? audioTrackStatus(tracks, russianSelected, tracks.length)
      : sourceLabel + " открыт нативным плеером. Браузер не передал After Dark список аудиодорожек — это не доказывает отсутствие русского звука. Проверь меню самого плеера.");
  }

  const MATTEBOX_CDN = "/api/vendor/mattebox@0.15.0/dist/cdn/mattebox.min.js";
  let matteboxScriptPromise = null;
  let matteboxInstance = null;
  let matteboxFallbackUrl = "";
  function loadMatteboxEngine() {
    if (window.mattebox && typeof window.mattebox.preset === "function") return Promise.resolve(window.mattebox);
    if (matteboxScriptPromise) return matteboxScriptPromise;
    matteboxScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MATTEBOX_CDN;
      script.async = true;
      script.onload = () => window.mattebox && typeof window.mattebox.preset === "function" ? resolve(window.mattebox) : reject(new Error("Mattebox загрузился без API."));
      script.onerror = () => reject(new Error("Не удалось загрузить Mattebox CDN."));
      document.head.appendChild(script);
    }).catch(error => { matteboxScriptPromise = null; throw error; });
    return matteboxScriptPromise;
  }
  function matteboxTracksChanged() {
    if (!matteboxInstance) return;
    const tracks = (matteboxInstance.tracks?.available || []).filter(track => track.contentType === "audio" && matteboxInstance.tracks.selectable(track.id));
    const russianIndex = findRussianAudioTrackIndex(tracks);
    if (!audioPreferenceApplied && russianIndex >= 0) {
      try { matteboxInstance.tracks.select(tracks[russianIndex].id); audioPreferenceApplied = true; preferredRussianAudioSelected = true; } catch (_) {}
    }
    const active = matteboxInstance.tracks.active("audio");
    const options = tracks.map((track, index) => ({ id: index, label: [track.lang || "", track.name || "", track.channels ? track.channels + " каналов" : ""].filter(Boolean).join(" · ") || "Аудио" }));
    setOptions($("#audioTrack"), options, Math.max(0, tracks.findIndex(track => active && String(track.id) === String(active.id))), "В потоке нет аудиодорожек");
    $("#trackControls").hidden = tracks.length < 2;
    streamStatus(audioTrackStatus(tracks, preferredRussianAudioSelected, tracks.length));
  }
  async function tryMatteboxDirectStream(url, kind, video) {
    try {
      await loadMatteboxEngine();
      const engine = window.mattebox.preset();
      matteboxInstance = engine;
      engine.on("tracks:changed", matteboxTracksChanged);
      engine.on("tracks:selected", matteboxTracksChanged);
      engine.on("error", () => {
        if (matteboxInstance !== engine) return;
        matteboxInstance = null;
        try { engine.unload(); engine.detach(); } catch (_) {}
        matteboxFallbackUrl = url.href;
        openDirectStream(url.href);
      });
      await engine.attach(video);
      engine.load(url.href);
      status("MATTEBOX · " + kind.toUpperCase() + " ПОДКЛЮЧЁН");
      streamStatus("Проверяю языки аудиодорожек. Русская озвучка выбирается автоматически, только если источник объявляет её в потоке.");
      window.setTimeout(() => { if (matteboxInstance === engine) matteboxTracksChanged(); }, 1800);
      window.setTimeout(() => {
        if (matteboxInstance !== engine) return;
        if (video.readyState === 0 && !(engine.tracks?.available || []).length) {
          try { engine.unload(); engine.detach(); } catch (_) {}
          matteboxInstance = null;
          matteboxFallbackUrl = url.href;
          streamStatus("Поток не ответил вовремя. Возвращаюсь к стандартному плееру.", true);
          openDirectStream(url.href);
        }
      }, 12000);
      return true;
    } catch (_) {
      if (matteboxInstance) { try { matteboxInstance.unload(); matteboxInstance.detach(); } catch (_) {} matteboxInstance = null; }
      matteboxFallbackUrl = url.href;
      openDirectStream(url.href);
      return true;
    }
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
      attachFrameProgress(frame, currentFilm, embedProvider || "EMBED", new URL(embedUrl).origin);
      addFrameFallback(embedUrl);
      status("ВСТРОЕННЫЙ ПЛЕЕР · " + embedProvider);
      streamStatus("Озвучка и субтитры для встроенного источника настраиваются внутри его плеера, если он предоставляет такие параметры.");
      return;
    }
    const kind = path.endsWith(".m3u8") ? "hls" : path.endsWith(".mpd") ? "dash" : /\.(mp4|webm|ogv|ogg|m4v)(?:$)/i.test(path) ? "file" : "unknown";
    const matteboxEnabled = new URLSearchParams(window.location.search).get("mattebox") !== "0";
    if (matteboxEnabled && matteboxFallbackUrl !== url.href && (kind === "hls" || kind === "dash")) {
      resetStreamEngines();
      const matteboxStage = $("#playerStage");
      matteboxStage.replaceChildren();
      const matteboxVideo = document.createElement("video");
      matteboxVideo.controls = true;
      matteboxVideo.playsInline = true;
      matteboxVideo.preload = "metadata";
      matteboxVideo.setAttribute("aria-label", "AFTER DARK video player");
      matteboxStage.appendChild(matteboxVideo);
      activeVideo = matteboxVideo;
      attachNativeProgress(matteboxVideo, currentFilm, "MATTEBOX");
      void tryMatteboxDirectStream(url, kind, matteboxVideo);
      return;
    }
    if (matteboxFallbackUrl === url.href) matteboxFallbackUrl = "";
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
      attachFrameProgress(frame, currentFilm, host.toUpperCase(), url.origin);
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
    attachNativeProgress(video, currentFilm, "NATIVE");
    if (kind === "file") {
      video.src = url.href;
      video.addEventListener("loadedmetadata", () => configureNativeAudioTracks(video, "Видео"), { once: true });
      if (video.audioTracks && typeof video.audioTracks.addEventListener === "function") {
        video.audioTracks.addEventListener("addtrack", () => configureNativeAudioTracks(video, "Видео"));
      }
      video.addEventListener("error", () => streamStatus("Видео не загрузилось. Источник может запрещать доступ с другого сайта или иметь неподдерживаемый формат.", true), { once: true });
      status("ПРЯМОЙ ВИДЕОФАЙЛ ПОДКЛЮЧЁН");
      return;
    }
    if (kind === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url.href;
        video.addEventListener("loadedmetadata", () => configureNativeAudioTracks(video, "HLS"), { once: true });
        if (video.audioTracks && typeof video.audioTracks.addEventListener === "function") {
          video.audioTracks.addEventListener("addtrack", () => configureNativeAudioTracks(video, "HLS"));
        }
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
  const VENOM_VERSION = "0.3.6";
  const VENOM_PUBLIC_PATH = "/api/vendor/player-venom@" + VENOM_VERSION + "/dist/";
  let venomPlayerInstance = null;
  let venomScriptPromise = null;

  function loadVenomPlayer() {
    if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") {
      return Promise.resolve(window.VenomPlayer);
    }
    if (venomScriptPromise) return venomScriptPromise;
    venomScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = VENOM_PUBLIC_PATH + "player.js";
      script.async = true;
      script.onload = () => {
        if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") resolve(window.VenomPlayer);
        else reject(new Error("Venom Player загрузился без ожидаемого API."));
      };
      script.onerror = () => reject(new Error("Не удалось загрузить Venom Player с CDN."));
      document.head.appendChild(script);
    }).catch(error => {
      venomScriptPromise = null;
      throw error;
    });
    return venomScriptPromise;
  }

  async function playVenomDirectSource(source) {
    let url;
    try { url = new URL(source && source.directUrl); } catch (_) { return false; }
    // Venom plays a direct media URL; it does not resolve film pages or protected streams.
    if (url.protocol !== "https:" || url.hostname !== "archive.org" ||
        !/^\/download\/[A-Za-z0-9._-]+\/.+$/i.test(url.pathname)) return false;
    const path = url.pathname.toLowerCase();
    const kind = path.endsWith(".m3u8") ? "hls"
      : path.endsWith(".mpd") ? "dash"
      : /\.(mp4|webm|m4v)$/i.test(path) ? "file" : "";
    if (!kind) return false;

    const stage = $("#playerStage");
    if (!stage) return false;
    if (new URLSearchParams(window.location.search).get("mattebox") === "1" && (kind === "hls" || kind === "dash")) {
      resetStreamEngines();
      stage.replaceChildren();
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", "AFTER DARK video player");
      stage.appendChild(video);
      activeVideo = video;
      attachNativeProgress(video, currentFilm, "MATTEBOX");
      void tryMatteboxDirectStream(url, kind, video);
      return true;
    }
    resetStreamEngines();
    stage.replaceChildren();
    const mount = document.createElement("div");
    mount.className = "ad-venom-mount";
    mount.setAttribute("aria-label", "Видеоплеер Venom");
    stage.appendChild(mount);
    status("ЗАГРУЖАЮ VENOM PLAYER…");
    streamStatus("Подключаю Venom к найденному прямому видеоисточнику.");

    let player = null;
    try {
      const VenomPlayer = await loadVenomPlayer();
      if (!mount.isConnected) return false;
      const mediaSource = kind === "hls" ? { hls: url.href }
        : kind === "dash" ? { dash: url.href }
        : { file: { "Авто": url.href } };
      player = VenomPlayer.make({
        container: mount,
        publicPath: VENOM_PUBLIC_PATH,
        source: mediaSource,
        title: String(source.title || currentFilm?.title || currentFilm?.name || "AFTER DARK"),
        theme: "modern",
        aspectRatio: "16:9",
        autoLandscape: true,
        pip: true,
        trackProgress: 15,
        doNotSaveProgress: true,
        cssVars: {
          "color-primary": "#8b1d2c",
          "background-color-primary": "rgba(16, 14, 13, .96)"
        }
      });
      venomPlayerInstance = player;
      const ready = await new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => finish(false), 8000);
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (value) {
            const video = mount.querySelector("video");
            if (video && !video.dataset.afterDarkProgressBound) {
              video.dataset.afterDarkProgressBound = "true";
              attachNativeProgress(video, currentFilm, "VENOM");
              activeVideo = video;
              // Venom may expose native audio/text tracks on supported browsers.
              // Reuse the Russian-first selector whenever those tracks are available.
              const refreshVenomNativeTracks = () => {
                if (mount.isConnected && activeVideo === video) configureNativeAudioTracks(video, "Venom");
              };
              refreshVenomNativeTracks();
              video.addEventListener("loadedmetadata", refreshVenomNativeTracks);
              video.addEventListener("loadeddata", refreshVenomNativeTracks);
              try {
                if (video.audioTracks && typeof video.audioTracks.addEventListener === "function") {
                  video.audioTracks.addEventListener("addtrack", refreshVenomNativeTracks);
                }
              } catch (_) {}
              video.addEventListener("error", () => {
                if (mount.isConnected) playArchiveEmbedFallback(source);
              }, { once: true });
              if (video.readyState >= 1) {
                const saved = savedProgress(currentFilm);
                const position = Number(saved?.position_seconds || 0);
                if (saved?.status === "in_progress" && position > 10 &&
                    Number.isFinite(video.duration) && position < video.duration - 5) {
                  try { video.currentTime = position; } catch (_) {}
                }
              }
            }
          }
          resolve(value);
        };
        if (typeof player?.once === "function") {
          player.once("ready", () => finish(true));
          player.once("error", () => finish(false));
        } else if (typeof player?.on === "function") {
          player.on("ready", () => finish(true));
          player.on("error", () => finish(false));
        }
        if (mount.querySelector("video")) finish(true);
      });
      if (!ready || !mount.isConnected) {
        try { player?.destroy?.(); } catch (_) {}
        if (venomPlayerInstance === player) venomPlayerInstance = null;
        if (mount.isConnected) mount.remove();
        return false;
      }
      status("VENOM PLAYER ГОТОВ · ПРЯМОЙ ИСТОЧНИК");
      streamStatus("Прогресс сохраняется в After Dark. Доступные качество и дорожки зависят от самого источника.");
      return true;
    } catch (error) {
      try { player?.destroy?.(); } catch (_) {}
      if (venomPlayerInstance === player) venomPlayerInstance = null;
      if (mount.isConnected) mount.remove();
      console.warn("Venom direct playback unavailable; falling back to native player.", error);
      return false;
    }
  }

  async function playArchiveSource(source, auto = false) {
    if (!source || typeof source.identifier !== "string" || !/^[A-Za-z0-9._-]{1,120}$/.test(source.identifier)) return;
    // Prefer a browser-playable direct file from the open-licensed archive record.
    // Keep Archive's own player as a fallback if the direct file is blocked or unsupported.
    let safeDirectUrl = false;
    try { const direct = new URL(source.directUrl); safeDirectUrl = direct.protocol === "https:" && direct.hostname === "archive.org" && /^\/download\/[A-Za-z0-9._-]+\/.+$/i.test(direct.pathname); } catch (_) {}
    if (safeDirectUrl) {
      if (await playVenomDirectSource(source)) return;
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
    meta.textContent = "INTERNET ARCHIVE · " + minutes + " МИН. · " + (source.directUrl ? "ПРЯМОЙ ФАЙЛ" : "ВСТРОЕННЫЙ ПЛЕЕР") + " · ОТКРЫТАЯ ЛИЦЕНЗИЯ" + (source.russianAudioLikely ? " · ЕСТЬ МЕТАДАННЫЕ О РУССКОМ ЯЗЫКЕ" : " · РУССКАЯ ОЗВУЧКА НЕ ПОДТВЕРЖДЕНА");
    button.append(title, meta);
    button.addEventListener("click", () => playArchiveSource(source, true));
    $("#sourceResults").appendChild(button);
  }
  function providerNames(region) {
    const offers = ["flatrate", "free", "ads", "rent", "buy"].flatMap(key => Array.isArray(region[key]) ? region[key] : []);
    return [...new Set(offers.map(item => item && item.provider_name).filter(Boolean))];
  }
  async function showWatchmodeProviders(film) {
    const id = Number(film.tmdbId ?? film.tmdb_id ?? film.id);
    if (!Number.isSafeInteger(id) || id <= 0 || $("#sourceResults .watchmode-attribution")) return;
    const type = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    try {
      const response = await fetch("/api/watchmode?tmdbId=" + encodeURIComponent(id) + "&type=" + type + "&region=RU", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const sources = Array.isArray(payload.sources) ? payload.sources : [];
      if (!sources.length) return;
      const heading = document.createElement("p");
      heading.className = "source-attribution watchmode-attribution";
      heading.textContent = "ГДЕ ДОСТУПЕН ФИЛЬМ · WATCHMODE";
      $("#sourceResults").appendChild(heading);
      sources.forEach(source => {
        if (!source || !source.webUrl || !/^https:\/\//i.test(source.webUrl)) return;
        const link = document.createElement("a");
        link.className = "source-result source-result--external";
        link.href = source.webUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
        const details = [source.name, source.type === "sub" ? "подписка" : source.type === "free" ? "бесплатно" : source.type === "rent" ? "аренда" : source.type === "buy" ? "покупка" : ""].filter(Boolean);
        link.textContent = details.join(" · ") + " ↗";
        $("#sourceResults").appendChild(link);
      });
      const languageNote = document.createElement("p");
      languageNote.className = "source-attribution";
      languageNote.textContent = "Список показывает доступность сервиса в выбранном регионе, но не подтверждает наличие русской аудиодорожки. Язык нужно проверить в карточке фильма или в меню самого сервиса.";
      $("#sourceResults").appendChild(languageNote);
    } catch (_) {}
  }
  async function showOfficialProviders(film) {
    if ($("#sourceResults .source-attribution")) return;
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
  function createCinemaLoader(providerName) {
    const loader = document.createElement("div");
    loader.className = "cinema-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.innerHTML = '<div class="cinema-loader__masthead"><span>AFTER DARK</span><small>PRIVATE CINEMA</small></div><span class="cinema-loader__edition">EST. 2026</span><div class="cinema-loader__art" aria-hidden="true"><span class="cinema-loader__orbit cinema-loader__orbit--outer"></span><span class="cinema-loader__orbit cinema-loader__orbit--inner"></span><span class="cinema-loader__orbit cinema-loader__orbit--tilt"></span><span class="cinema-loader__planet"></span><span class="cinema-loader__spark cinema-loader__spark--one"></span><span class="cinema-loader__spark cinema-loader__spark--two"></span></div><p class="cinema-loader__message">ПОДКЛЮЧАЕМ ПЛЕЕР</p><span class="cinema-loader__provider">' + providerName + ' / ПОДКЛЮЧЕНИЕ</span><div class="cinema-loader__progress"><span></span></div><span class="cinema-loader__edge">A F T E R&nbsp; D A R K</span>';
    return loader;
  }

  async function searchNeoWatchDirectSources(film, season, episode) {
    const id = Number(film.tmdbId ?? film.tmdb_id ?? film.id);
    const isSeries = isSeriesFilm(film);
    const type = isSeries ? "tv" : "movie";
    if (!Number.isSafeInteger(id) || id < 1) throw new Error("Не удалось определить TMDB ID.");
    if (isSeries && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
      throw new Error("Укажи сезон и серию.");
    }
    const idsResponse = await fetch("/api/tmdb?path=/" + type + "/" + encodeURIComponent(String(id)) + "/external_ids", {
      headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000)
    });
    if (!idsResponse.ok) throw new Error("TMDB не вернул внешние идентификаторы.");
    const ids = await idsResponse.json();
    const imdbId = String(ids && ids.imdb_id || "");
    if (!/^tt\d{5,12}$/.test(imdbId)) return { sources: [], catalog: [] };
    // For a series, request the complete season/episode catalog once. The API returns
    // per-episode voiceover labels; requesting only one episode hides series-wide coverage.
    const url = new URL("/api/v1/player/cdn/imdb/" + encodeURIComponent(imdbId), "https://api.neome.uk");
    const response = await fetch(url.href, {
      headers: { accept: "application/json" }, mode: "cors", signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error("CDN-источник ответил ошибкой " + response.status + ".");
    const payload = await response.json();
    const data = payload && payload.data || {};
    if (!payload.success) return { sources: [], catalog: [] };
    if (isSeries) {
      const catalog = (Array.isArray(data.episodes) ? data.episodes : []).filter(item =>
        item && Number.isInteger(Number(item.season)) && Number(item.season) > 0 &&
        Number.isInteger(Number(item.episode)) && Number(item.episode) > 0 &&
        typeof item.m3u8Url === "string" && item.m3u8Url
      );
      const current = catalog.filter(item => Number(item.season) === season && Number(item.episode) === episode);
      const seen = new Set();
      const sources = current.map(item => {
        let parsed;
        try { parsed = new URL(item.m3u8Url); } catch (_) { return null; }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443") || seen.has(parsed.href)) return null;
        seen.add(parsed.href);
        return { url: parsed.href, title: String(item.title || item.name || "Вариант озвучки").slice(0, 120), season, episode };
      }).filter(Boolean);
      return { sources, catalog };
    }
    const raw = String(data.m3u8Url || "");
    let parsed;
    try { parsed = new URL(raw); } catch (_) { return { sources: [], catalog: [] }; }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) return { sources: [], catalog: [] };
    return { sources: [{ url: parsed.href, title: String(data.title || data.provider || "CDN · HLS").slice(0, 120) }], catalog: [] };
  }

  async function loadOriginalLanguage(film) {
    if (/^(ru|en)(?:[-_]|$)/i.test(String(film.original_language || ""))) return String(film.original_language).slice(0, 2).toLowerCase();
    const id = Number(film.tmdbId ?? film.tmdb_id ?? film.id);
    if (!Number.isSafeInteger(id) || id < 1) return "";
    const type = isSeriesFilm(film) ? "tv" : "movie";
    try {
      const response = await fetch("/api/tmdb?path=" + encodeURIComponent("/" + type + "/" + id), {
        headers: { accept: "application/json" }
      });
      if (!response.ok) return "";
      const data = await response.json();
      const language = String(data.original_language || "");
      return /^(ru|en)(?:[-_]|$)/i.test(language) ? language.slice(0, 2).toLowerCase() : "";
    } catch (_) { return ""; }
  }

  function languageOf(item, originalLanguage = "") {
    const values = [
      item && item.label, item && item.name, item && item.title,
      item && item.language, item && item.lang, item && item.value, item && item.description
    ].filter(Boolean).join(" ").toLowerCase();
    if (/\b(ru|rus)\b|русск|russian/i.test(values)) return "ru";
    if (/\b(en|eng)\b|англ|english/i.test(values)) return "en";
    if (/\boriginal\b|оригинал/i.test(values)) {
      if (/^ru(?:[-_]|$)/i.test(String(originalLanguage))) return "ru";
      if (/^en(?:[-_]|$)/i.test(String(originalLanguage))) return "en";
    }
    return "";
  }
  function trackLabel(item, language) {
    const label = String(item && (item.label || item.name || item.title || item.value) || "");
    if (/\boriginal\b|оригинал/i.test(label)) {
      return language === "ru" ? "Русский · оригинал" : language === "en" ? "English · original" : label;
    }
    return label;
  }

  function mountVidriftControls(frame, film, initialSeason, initialEpisode) {
    const root = $("#vidriftControls");
    if (!root) return;
    root.replaceChildren();
    root.hidden = false;
    let expanded = false;
    let originalLanguage = String(film.original_language || "");
    let latestState = null;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "vidrift-controls__toggle";
    toggle.textContent = "КАЧЕСТВО · АУДИО · СУБТИТРЫ";
    toggle.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.className = "vidrift-controls__panel";
    panel.hidden = true;
    const note = document.createElement("p");
    note.className = "vidrift-controls__note";
    note.textContent = "Загружаю варианты RU / EN…";
    const list = document.createElement("div");
    list.className = "vidrift-controls__list";
    panel.append(note, list);
    root.append(toggle, panel);
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      panel.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
    });

    const addUnavailableSelect = (labelText, message) => {
      const label = document.createElement("label");
      label.className = "vidrift-controls__field";
      const caption = document.createElement("span");
      caption.textContent = labelText;
      const select = document.createElement("select");
      select.setAttribute("aria-label", labelText);
      const option = document.createElement("option");
      option.value = "";
      option.textContent = message;
      select.appendChild(option);
      select.disabled = true;
      label.append(caption, select);
      list.appendChild(label);
    };

    const addSelect = (labelText, field, items, selected) => {
      if (!Array.isArray(items) || items.length < 1) return;
      const label = document.createElement("label");
      label.className = "vidrift-controls__field";
      const caption = document.createElement("span");
      caption.textContent = labelText;
      const select = document.createElement("select");
      select.setAttribute("aria-label", labelText);
      for (const item of items) {
        const option = document.createElement("option");
        option.value = String(item.value);
        option.textContent = item.label;
        select.appendChild(option);
      }
      select.value = String(selected ?? items[0].value);
      select.disabled = items.length < 2;
      select.addEventListener("change", () => {
        if (frame.contentWindow) frame.contentWindow.postMessage({ type: "vidrift:set", [field]: select.value }, "https://embed.vidrift.net");
      });
      label.append(caption, select);
      list.appendChild(label);
    };

    frame._afterDarkSetOriginalLanguage = language => {
      if (!language) return;
      originalLanguage = language;
      if (latestState) frame._afterDarkVidriftState(latestState);
    };
    frame._afterDarkVidriftState = state => {
      latestState = state;
      list.replaceChildren();
      const sources = (Array.isArray(state.sources) ? state.sources : [])
        .map(item => { const lang = languageOf(item, originalLanguage); return { value: item.value, label: trackLabel(item, lang), lang }; })
        .filter(item => item.value != null && item.lang);
      const qualities = (Array.isArray(state.qualities) ? state.qualities : [])
        .map(item => ({ value: item.value, label: String(item.label || item.value || "") }))
        .filter(item => item.value != null);
      if (qualities.length) addSelect("КАЧЕСТВО", "quality", qualities, state.quality);
      else addUnavailableSelect("КАЧЕСТВО", "Качество недоступно");

      const audios = (Array.isArray(state.audios) ? state.audios : [])
        .map(item => { const lang = languageOf(item, originalLanguage); return { value: item.value, label: trackLabel(item, lang), lang }; })
        .filter(item => item.value != null && item.lang);
      const subtitles = (Array.isArray(state.subtitles) ? state.subtitles : [])
        .map(item => ({ value: item.value, label: String(item.label || item.value || ""), lang: languageOf(item, originalLanguage) }))
        .filter(item => item.value != null && (item.lang || String(item.value).toLowerCase() === "off"));

      if (audios.length > 1) addSelect("ОЗВУЧКА", "audio", audios, state.audio);
      else if (sources.length > 1) addSelect("ОЗВУЧКА", "source", sources, state.source);
      else if (audios.length === 1) addSelect("ОЗВУЧКА", "audio", audios, state.audio);
      else if (sources.length === 1) addSelect("ОЗВУЧКА", "source", sources, state.source);
      else addUnavailableSelect("ОЗВУЧКА", "Нет вариантов RU / EN");

      const subtitleLanguages = subtitles.filter(item => item.lang);
      if (subtitleLanguages.length) {
        const off = subtitles.find(item => String(item.value).toLowerCase() === "off");
        const choices = off ? [off, ...subtitleLanguages] : [{ value: "off", label: "Выкл." }, ...subtitleLanguages];
        addSelect("СУБТИТРЫ", "subtitle", choices, state.subtitle || "off");
      } else {
        addUnavailableSelect("СУБТИТРЫ", "Нет вариантов RU / EN");
      }

      note.textContent = "В меню всегда видны три настройки. Переключение доступно, если источник передал подходящие варианты.";
    };
  }

  function mountVidriftEpisodes(root, frame, film, initialSeason, initialEpisode) {
    if (!isSeriesFilm(film)) return;
    const id = Number(film.tmdbId ?? film.tmdb_id ?? film.id);
    const section = document.createElement("div");
    section.className = "vidrift-episodes";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "vidrift-controls__toggle vidrift-episodes__toggle";
    toggle.textContent = "ВЫБРАТЬ СЕРИЮ";
    toggle.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.className = "vidrift-controls__panel vidrift-episodes__panel";
    panel.hidden = true;
    const seasonSelect = document.createElement("select");
    seasonSelect.className = "vidrift-episodes__season";
    seasonSelect.setAttribute("aria-label", "Сезон");
    const episodeList = document.createElement("div");
    episodeList.className = "vidrift-episodes__list";
    const note = document.createElement("p");
    note.className = "vidrift-controls__note";
    note.textContent = "Загружаю названия серий…";
    const panelHeader = document.createElement("div");
    panelHeader.className = "vidrift-episodes__header";
    const panelTitle = document.createElement("strong");
    panelTitle.textContent = "СЕЗОН И СЕРИЯ";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "vidrift-episodes__close";
    closeButton.setAttribute("aria-label", "Закрыть список серий");
    closeButton.textContent = "×";
    panelHeader.append(panelTitle, closeButton);
    const seasonLabel = document.createElement("label");
    seasonLabel.className = "vidrift-episodes__season-label";
    seasonLabel.textContent = "СЕЗОН";
    seasonLabel.appendChild(seasonSelect);
    panel.append(panelHeader, note, seasonLabel, episodeList);
    section.append(toggle, panel);
    root.appendChild(section);
    const positionPanel = () => {
      const rect = toggle.getBoundingClientRect();
      const panelWidth = Math.max(240, Math.min(390, window.innerWidth - 32));
      const panelHeight = Math.min(520, window.innerHeight - 32);
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - panelWidth - 16));
      const top = Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - panelHeight - 16));
      panel.style.width = panelWidth + "px";
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    };
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) positionPanel();
    });
    closeButton.addEventListener("click", () => {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });

    const loadSeason = async seasonNumber => {
      episodeList.replaceChildren();
      note.textContent = "Загружаю серии…";
      try {
        const response = await fetch("/api/tmdb?path=" + encodeURIComponent("/tv/" + id + "/season/" + seasonNumber) + "&language=ru-RU", { headers: { accept: "application/json" } });
        if (!response.ok) throw new Error("episode metadata unavailable");
        const data = await response.json();
        const episodes = Array.isArray(data.episodes) ? data.episodes : [];
        if (!episodes.length) {
          note.textContent = "Список серий недоступен.";
          return;
        }
        note.textContent = "Выбери серию. Названия загружены на русском, если TMDB их предоставляет.";
        for (const item of episodes) {
          const episodeNumber = Number(item.episode_number);
          if (!Number.isInteger(episodeNumber) || episodeNumber < 1) continue;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "vidrift-episodes__item";
          button.textContent = String(episodeNumber).padStart(2, "0") + " · " + String(item.name || ("Серия " + episodeNumber));
          if (Number(seasonNumber) === Number(selectedSeason ?? initialSeason) && episodeNumber === Number(selectedEpisode ?? initialEpisode)) {
            button.setAttribute("aria-current", "true");
          }
          button.addEventListener("click", () => {
            const nextSeason = Number(seasonNumber);
            if (nextSeason === Number(selectedSeason ?? initialSeason) && episodeNumber === Number(selectedEpisode ?? initialEpisode)) {
              panel.hidden = true;
              toggle.setAttribute("aria-expanded", "false");
              return;
            }
            savePlaybackProgress(film, {
              currentTime: Number(frame._afterDarkCurrentTime || 0),
              duration: Number(frame._afterDarkDuration || 0),
              season: selectedSeason ?? initialSeason,
              episode: selectedEpisode ?? initialEpisode
            }, "VIDRIFT", true);
            selectedSeason = nextSeason;
            selectedEpisode = episodeNumber;
            restartCurrentEpisode = true;
            launchVidriftPlayer(film);
          });
          episodeList.appendChild(button);
        }
      } catch (_) {
        note.textContent = "Не удалось загрузить список серий. Проверь соединение и открой список ещё раз.";
      }
    };
    fetch("/api/tmdb?path=" + encodeURIComponent("/tv/" + id) + "&language=ru-RU", { headers: { accept: "application/json" } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("series metadata unavailable")))
      .then(data => {
        const seasons = (Array.isArray(data.seasons) ? data.seasons : []).filter(item => Number(item.season_number) > 0);
        if (!seasons.length) throw new Error("no seasons");
        seasonSelect.replaceChildren();
        for (const item of seasons) {
          const option = document.createElement("option");
          option.value = String(item.season_number);
          option.textContent = item.name || ("Сезон " + item.season_number);
          seasonSelect.appendChild(option);
        }
        const preferred = String(initialSeason || 1);
        seasonSelect.value = Array.from(seasonSelect.options).some(option => option.value === preferred) ? preferred : seasonSelect.options[0].value;
        void loadSeason(Number(seasonSelect.value));
        seasonSelect.addEventListener("change", () => { void loadSeason(Number(seasonSelect.value)); });
      })
      .catch(() => { note.textContent = "Не удалось загрузить сезоны на русском."; });
  }

  function launchVidriftPlayer(film) {
    const id = Number(film.tmdbId ?? film.tmdb_id ?? film.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      status("НЕ НАЙДЕН TMDB ID", true);
      return;
    }
    const isSeries = isSeriesFilm(film);
    const saved = savedProgress(film) || {};
    const season = isSeries ? Math.max(1, Math.floor(Number(selectedSeason ?? saved.season_number) || 1)) : 1;
    const episode = isSeries ? Math.max(1, Math.floor(Number(selectedEpisode ?? saved.episode_number) || 1)) : 1;
    selectedSeason = isSeries ? season : null;
    selectedEpisode = isSeries ? episode : null;
    const resumeAt = !restartCurrentEpisode && saved.status === "in_progress"
      ? Math.max(0, Math.floor(Number(saved.position_seconds) || 0)) : 0;
    restartCurrentEpisode = false;

    resetStreamEngines();
    const stage = $("#playerStage");
    const previousFrame = stage.querySelector("iframe");
    previousFrame?._afterDarkCleanup?.();
    stage.replaceChildren();
    const frame = document.createElement("iframe");
    frame.className = "vidrift-frame";
    frame.title = "AFTER DARK — " + (film.title || film.name || "VIDRIFT");
    frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.loading = "eager";
    const path = isSeries
      ? "/embed/tv/" + id + "/" + season + "/" + episode
      : "/embed/movie/" + id;
    const params = new URLSearchParams({
      brand: "AFTER DARK",
      brandColor: "7B1E2D",
      uiScale: "1.05",
      showTitle: "1",
      exit: "1",
      autoplay: "0",
      hide: "settings,subtitles,server,pausecard,episodes"
    });
    frame.src = "https://embed.vidrift.net" + path + "?" + params.toString();
    stage.appendChild(frame);
    let episodeInfo = null;
    if (isSeries) {
      episodeInfo = document.createElement("aside");
      episodeInfo.className = "vidrift-episode-info";
      episodeInfo.hidden = true;
      episodeInfo.setAttribute("aria-live", "polite");
      const episodeHeading = document.createElement("h2");
      const episodeDescription = document.createElement("p");
      episodeInfo.append(episodeHeading, episodeDescription);
      stage.appendChild(episodeInfo);
      const loadEpisodeInfo = async (episodeSeason, episodeNumber) => {
        episodeInfo.hidden = true;
        const request = "/api/tmdb?path=" + encodeURIComponent("/tv/" + id + "/season/" + episodeSeason + "/episode/" + episodeNumber) + "&language=ru-RU";
        try {
          const response = await fetch(request, { headers: { accept: "application/json" } });
          if (!response.ok) return;
          const details = await response.json();
          episodeHeading.textContent = details.name || ("Серия " + episodeNumber);
          episodeDescription.textContent = details.overview || "";
          episodeInfo.dataset.loadedFor = episodeSeason + ":" + episodeNumber;
        } catch (_) {}
      };
      void loadEpisodeInfo(season, episode);
      frame._afterDarkShowEpisodeInfo = () => {
        if (episodeInfo.dataset.loadedFor !== selectedSeason + ":" + selectedEpisode) void loadEpisodeInfo(selectedSeason, selectedEpisode);
        episodeInfo.hidden = false;
      };
      frame._afterDarkHideEpisodeInfo = () => { episodeInfo.hidden = true; };
    }
    mountVidriftControls(frame, film, season, episode);
    mountVidriftEpisodes($("#vidriftControls"), frame, film, season, episode);
    status("ЗАПУСКАЮ VIDRIFT");
    streamStatus("Загружаю фильм. Плеер сам начнёт воспроизведение без дополнительной кнопки; браузер может начать без звука до первого касания.");

    let origin = "https://embed.vidrift.net";
    const alternateOrigin = "https://embed.vidrift.in";
    let vidriftReady = false;
    const onMessage = event => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "vidrift:state") {
        vidriftReady = true;
        clearTimeout(fallbackTimer);
        frame._afterDarkCurrentTime = Number(data.currentTime) || frame._afterDarkCurrentTime || 0;
        frame._afterDarkDuration = Number(data.duration) || frame._afterDarkDuration || 0;
        frame._afterDarkVidriftState?.(data);
        status("VIDRIFT ГОТОВ · " + (data.paused ? "ПАУЗА" : "ВОСПРОИЗВЕДЕНИЕ"));
        return;
      }
      if (data.type === "vidrift:paused") frame._afterDarkShowEpisodeInfo?.();
      if (data.type === "vidrift:unpaused") frame._afterDarkHideEpisodeInfo?.();
      if (data.type === "vidrift:progress" || data.type === "vidrift:paused") {
        const currentTime = Number(data.currentTime);
        frame._afterDarkCurrentTime = Number.isFinite(currentTime) ? currentTime : frame._afterDarkCurrentTime || 0;
        frame._afterDarkDuration = Number(data.duration) || frame._afterDarkDuration || 0;
        const duration = Number(data.duration);
        if (Number.isFinite(currentTime)) {
          savePlaybackProgress(film, {
            currentTime,
            duration,
            season: data.season ?? season,
            episode: data.episode ?? episode,
            event: data.type === "vidrift:paused" ? "pause" : "progress"
          }, "VIDRIFT", data.type === "vidrift:paused");
        }
        return;
      }
      if (data.type === "vidrift:episode") {
        const nextSeason = Number(data.season);
        const nextEpisode = Number(data.episode);
        if (Number.isInteger(nextSeason) && nextSeason > 0 && Number.isInteger(nextEpisode) && nextEpisode > 0) {
          selectedSeason = nextSeason;
          selectedEpisode = nextEpisode;
          if (episodeInfo) { episodeInfo.dataset.loadedFor = ""; frame._afterDarkHideEpisodeInfo?.(); }
          savePlaybackProgress(film, { currentTime: 0, duration: 0, season: nextSeason, episode: nextEpisode }, "VIDRIFT", true);
          [500, 1400].forEach(delay => setTimeout(() => {
            if (frame.isConnected && frame.contentWindow) frame.contentWindow.postMessage({ type: "vidrift:get-state" }, origin);
          }, delay));
        }
        return;
      }
      if (data.type === "vidrift:exit") {
        status("ВОЗВРАТ В AFTER DARK");
        return;
      }
      if (data.type === "vidrift:command-error") {
        console.warn("VIDRIFT COMMAND ERROR", data);
        streamStatus("Не удалось применить настройку плеера: " + String(data.reason || "ошибка команды"), true);
      }
    };
    window.addEventListener("message", onMessage);
    const fallbackTimer = setTimeout(() => {
      if (vidriftReady || origin === alternateOrigin || !frame.isConnected) return;
      origin = alternateOrigin;
      status("ПРОБУЮ РЕЗЕРВНЫЙ ДОМЕН VIDRIFT");
      streamStatus("Основной адрес плеера не ответил. Переключаюсь на резервный адрес без изменения фильма и прогресса.");
      frame.src = origin + path + "?" + params.toString();
    }, 12000);
    frame.addEventListener("load", () => {
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({ type: "vidrift:get-state" }, origin);
        void loadOriginalLanguage(film).then(language => {
          if (language && frame.contentWindow && frame._afterDarkSetOriginalLanguage) {
            frame._afterDarkSetOriginalLanguage(language);
            frame.contentWindow.postMessage({ type: "vidrift:get-state" }, origin);
          }
        });
        if (resumeAt > 10) frame.contentWindow.postMessage({ type: "vidrift:resume", currentTime: resumeAt }, origin);
      }
    });
    frame.addEventListener("error", () => {
      if (origin !== alternateOrigin) {
        clearTimeout(fallbackTimer);
        origin = alternateOrigin;
        status("ПЕРЕКЛЮЧАЮ РЕЗЕРВНЫЙ ДОМЕН VIDRIFT");
        frame.src = origin + path + "?" + params.toString();
        return;
      }
      status("VIDRIFT НЕ ЗАГРУЗИЛСЯ", true);
      streamStatus("Не удалось загрузить основной и резервный адреса VidRift. Проверь подключение или выбери другой источник.", true);
    });
    const oldCleanup = frame._afterDarkCleanup;
    frame._afterDarkCleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(fallbackTimer);
      episodeInfo?.remove();
      if (oldCleanup) oldCleanup();
    };
    addNote("Источник: VidRift. Позиция просмотра и текущие сезон/серия сохраняются в истории After Dark.");
  }

  async function tryExternalPlayerFallback(film) {
    const id = String(film.tmdbId ?? film.tmdb_id ?? film.id ?? "");
    if (!/^\d{1,12}$/.test(id) || Number(id) <= 0) return false;
    const isSeries = isSeriesFilm(film);
    const previousProgress = savedProgress(film);
    const resumeAt = !restartCurrentEpisode && previousProgress?.status === "in_progress" ? Math.max(0, Math.floor(Number(previousProgress.position_seconds) || 0)) : 0;
    const season = Math.max(1, Math.floor(Number(selectedSeason ?? previousProgress?.season_number) || 1));
    const episode = Math.max(1, Math.floor(Number(selectedEpisode ?? previousProgress?.episode_number) || 1));
    restartCurrentEpisode = false;

    // Try independent ID-based embeds before the known-working Stellar fallback.
    // These services document playback embeds, but Russian audio must be checked
    // per title; none of their public docs guarantees a Russian audio track.
    const candidates = [];
    if (!film._forceStellar) {
      candidates.push({
        name: "VIDAPI",
        origin: "https://vaplayer.ru",
        url: (isSeries
          ? "https://vaplayer.ru/embed/tv/" + id + "/" + season + "/" + episode
          : "https://vaplayer.ru/embed/movie/" + id)
          + "?primaryColor=%237B1E2D&showTitle=false&autoplay=1&resumeAt=" + encodeURIComponent(String(resumeAt)) + (isSeries ? "&autonext=1" : ""),
        readyTypes: ["PLAYER_EVENT"],
        readyEvents: ["playing", "paused", "seeked", "completed"],
        errorEvents: ["error"]
      });
      candidates.push({
        name: "VIDSRC",
        origin: "https://vidsrc.sh",
        url: (isSeries
          ? "https://vidsrc.sh/embed/tv/" + id + "/" + season + "/" + episode
          : "https://vidsrc.sh/embed/movie/" + id)
          + "?ds_lang=ru&autoplay=1&startAt=" + encodeURIComponent(String(resumeAt)) + (isSeries ? "&autonext=1" : ""),
        readyTypes: ["PLAYER_EVENT"],
        readyEvents: ["playing", "paused", "seeked", "completed"],
        errorEvents: ["error"]
      });
      candidates.push({
        name: "NHD",
        origin: "https://nhdapi.com",
        url: isSeries
          ? "https://nhdapi.com/tv/" + id + "/" + season + "/" + episode
          : "https://nhdapi.com/movie/" + id,
        readyTypes: [],
        readyEvents: [],
        errorEvents: []
      });
    }

    // Keep Stellar as a fallback because the user has confirmed it currently plays.
    const stellarPath = isSeries ? "/ru/watch/embed/tv/" + id + "-" + season + "-" + episode : "/ru/watch/embed/movie/" + id;
    candidates.push({
      name: "STELLAR",
      origin: "https://stellar.rip",
      url: "https://stellar.rip" + stellarPath + "?theme=7B1E2D&title=false&poster=false&autoPlay=true&startAt=" + encodeURIComponent(String(resumeAt)) + (isSeries ? "&nextButton=true&autoNext=true" : ""),
      readyTypes: ["PLAYER_EVENT", "MEDIA_DATA"],
      readyEvents: ["play", "timeupdate", "playing"],
      errorEvents: ["error"]
    });

    for (const provider of candidates) {
      const stage = $("#playerStage");
      resetStreamEngines();
      stage.replaceChildren();
      const loader = createCinemaLoader(provider.name);
      stage.appendChild(loader);
      const frame = document.createElement("iframe");
      frame.src = provider.url;
      frame.title = "AFTER DARK — " + provider.name;
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.loading = "eager";
      stage.appendChild(frame);
      attachFrameProgress(frame, film, provider.name, provider.origin);
      status("ЗАПУСКАЮ ПЛЕЕР · " + provider.name);
      streamStatus("Подготавливаю видеопоток. Это может занять несколько секунд.");
      const providerHints = {
        VIDAPI: "ПРОБУЮ VIDAPI. В документации подтверждены TMDB ID, серии и субтитры; русскую аудиодорожку нужно проверить в меню плеера.",
        VIDSRC: "ПРОБУЮ VIDSRC. Есть выбор серий и русские субтитры; наличие русской озвучки пока не подтверждено.",
        NHD: "ПРОБУЮ NHD. Источник заявляет несколько вариантов воспроизведения; проверь меню Audio, если видео запустится.",
        STELLAR: "Открываю резервный Stellar."
      };
      streamStatus(providerHints[provider.name] || "Пробую источник.");

      const outcome = await new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
          resolve(value);
        };
        const onMessage = event => {
          if (event.origin !== provider.origin || event.source !== frame.contentWindow) return;
          const data = event.data;
          if (!data || typeof data !== "object") return;
          if (provider.name === "STELLAR" && data.type === "STELLAR_EMBED_READY") {
            try { frame.contentWindow.postMessage({ type: "STELLAR_EMBED_INIT" }, provider.origin); } catch (_) {}
            return;
          }
          if (!provider.readyTypes.includes(data.type)) return;
          const payload = data.data && typeof data.data === "object" ? data.data : data;
          // VidAPI documents player_status (not event/name) in PLAYER_EVENT.
          // Other providers commonly use event/name, so accept both shapes.
          const eventName = String(payload.player_status || payload.event || payload.name || "").toLowerCase();
          if (provider.readyEvents.includes(eventName)) finish("ready");
          else if (provider.errorEvents.includes(eventName)) finish("failed");
        };
        // Stellar should feel quick; don't wait the old 18 seconds before fallback.
        const timer = setTimeout(() => finish("timeout"), provider.name === "STELLAR" ? 10000 : 12000);
        window.addEventListener("message", onMessage);
        frame.addEventListener("error", () => finish("failed"), { once: true });
        // VidSrc/NHD do not expose a readiness message we can reliably depend on.
        // Keep the provider open after its iframe loads so it can be tested manually;
        // iframe load alone is not proof that a playable video exists.
        if (["VIDSRC", "NHD"].includes(provider.name)) {
          frame.addEventListener("load", () => finish("loaded"), { once: true });
        }
      });

      if (outcome === "ready" || (["VIDSRC", "NHD"].includes(provider.name) && outcome === "loaded")) {
        loader.classList.add("is-done");
        setTimeout(() => loader.remove(), 420);
        status("ПЛЕЕР ОТВЕТИЛ · " + provider.name);
        const successHints = {
          VIDAPI: "VIDAPI ответил событием плеера. Проверь видео и меню Audio: русская озвучка не гарантирована документацией.",
          VIDSRC: "Страница VidSrc загрузилась. Это ещё не подтверждает запуск видео; проверь воспроизведение и меню аудио.",
          NHD: "Страница NHD загрузилась. Это ещё не гарантирует доступность видео; проверь Audio/озвучку вручную.",
          STELLAR: "Stellar запущен. Язык интерфейса не задаёт язык аудио; дорожки зависят от потока."
        };
        streamStatus(successHints[provider.name] || "Плеер загружен.");
        addNote("Источник: " + provider.name + ". Наличие русского аудио проверяется отдельно для каждого фильма.");
        if (provider.name === "NHD") {
          const switchButton = document.createElement("button");
          switchButton.type = "button";
          switchButton.className = "source-result";
          switchButton.textContent = "НЕ РАБОТАЕТ? ОТКРЫТЬ В STELLAR";
          switchButton.addEventListener("click", () => {
            const stageNow = $("#playerStage");
            resetStreamEngines();
            stageNow.replaceChildren();
            void tryExternalPlayerFallback({ ...film, _forceStellar: true });
          });
          $("#sourceResults").prepend(switchButton);
        }
        return true;
      }
      loader.classList.add("is-done");
      frame.src = "about:blank";
      stage.replaceChildren();
      status("ИСТОЧНИК НЕ ОТВЕТИЛ · ПРОБУЮ СЛЕДУЮЩИЙ");
    }
    return false;
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
        // Prefer players with a documented playback-progress API, so resume works across devices.
        found = await tryExternalPlayerFallback(film);
        // If both ID-based players fail, retry page extraction twice before giving up.
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
                streamStatus("Источник найден автоматически. Для внешних плееров точное сохранение позиции зависит от того, передаёт ли источник события воспроизведения.");
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
        if (!found) throw new Error(lastMessage || "Все проверенные способы поиска и встроенные плееры не подтвердили доступное видео.");
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
    const area = $("#sourceResults");
    area.replaceChildren();
    status("ПОДГОТАВЛИВАЮ VIDRIFT…");
    launchVidriftPlayer(film);
  }

  function init() {
    const manualSourceForm = $("#manualSourceForm");
    const manualSourceInput = $("#manualSourceUrl");
    if (manualSourceForm && manualSourceInput && !manualSourceForm.dataset.bound) {
      manualSourceForm.dataset.bound = "1";
      manualSourceForm.addEventListener("submit", event => {
        event.preventDefault();
        const rawSource = manualSourceInput.value.trim();
        const filmId = Number(currentFilm?.tmdbId ?? currentFilm?.tmdb_id ?? currentFilm?.id);
        if (!rawSource || !Number.isSafeInteger(filmId) || filmId < 1) return;
        let sourceUrl;
        try {
          sourceUrl = new URL(rawSource);
          if (!["https:", "http:"].includes(sourceUrl.protocol)) throw new Error("Некорректная ссылка");
        } catch (_) {
          manualSourceInput.setCustomValidity("Вставь полную ссылку на сайт, начиная с https://");
          manualSourceInput.reportValidity();
          return;
        }
        manualSourceInput.setCustomValidity("");
        const savedSources = readExternalSources();
        savedSources[String(filmId)] = sourceUrl.href;
        try { localStorage.setItem(EXTERNAL_SOURCES_KEY, JSON.stringify(savedSources)); } catch (_) {}
        manualSourceInput.value = sourceUrl.href;
        showExternalSource(currentFilm, sourceUrl.href);
      });
    }
    $("#audioTrack").addEventListener("change", () => {
      const index = Number($("#audioTrack").value);
      if (index < 0) return;
      audioPreferenceApplied = true;
      let selectedTrack = null;
      if (matteboxInstance) {
        const tracks = (matteboxInstance.tracks?.available || []).filter(track => track.contentType === "audio" && matteboxInstance.tracks.selectable(track.id));
        selectedTrack = tracks[index] || null;
        if (selectedTrack) matteboxInstance.tracks.select(selectedTrack.id);
      } else if (hls) {
        selectedTrack = (hls.audioTracks || [])[index] || null;
        hls.audioTrack = index;
      } else if (dash) {
        const tracks = dash.getTracksFor("audio") || [];
        selectedTrack = tracks[index] || null;
        if (selectedTrack) dash.setCurrentTrack(selectedTrack);
      } else if (activeVideo && activeVideo.audioTracks && activeVideo.audioTracks[index]) {
        const tracks = Array.from(activeVideo.audioTracks);
        selectedTrack = tracks[index] || null;
        tracks.forEach((track, i) => { track.enabled = i === index; });
      }
      preferredRussianAudioSelected = selectedTrack ? findRussianAudioTrackIndex([selectedTrack]) === 0 : false;
      const trackLanguage = selectedTrack && String(selectedTrack.lang || selectedTrack.language || selectedTrack.languageCode || "").trim();
      const trackName = selectedTrack && String(selectedTrack.name || selectedTrack.label || selectedTrack.title || "").trim();
      streamStatus(preferredRussianAudioSelected
        ? "Выбрана русская озвучка."
        : selectedTrack
          ? "Выбрана дорожка: " + (trackName || trackLanguage || ("Аудио " + (index + 1))) + ". Русская озвучка не выбрана."
          : "Не удалось определить выбранную аудиодорожку.");
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
    currentFilm = film;
    bindExternalProgress(film);
    const initialStage = $("#playerStage");
    if (initialStage && !initialStage.querySelector(".cinema-loader")) initialStage.replaceChildren(createCinemaLoader("STELLAR"));
    const playerActions = document.querySelector(".player-actions");
    if (playerActions && !playerActions.dataset.bound) {
      playerActions.dataset.bound = "1";
      playerActions.addEventListener("click", async event => {
        const button = event.target.closest("[data-player-action]");
        if (!button || !currentFilm) return;
        const action = button.dataset.playerAction;
        const id = currentFilm.tmdbId ?? currentFilm.id;
        const saved = savedProgress(currentFilm) || {};
        if (action === "restart") {
          restartCurrentEpisode = true;
          await window.afterDarkProgress?.save?.({ tmdb_id: id, title: currentFilm.title || currentFilm.name || "", media_type: isSeriesFilm(currentFilm) ? "tv" : "movie", position_seconds: 0, duration_seconds: Number(saved.duration_seconds || 0), status: "in_progress", season_number: saved.season_number ?? 1, episode_number: saved.episode_number ?? 1, source_provider: saved.source_provider || "unknown" });
          await findSources(currentFilm);
          return;
        }
        if (action === "resume") { restartCurrentEpisode = false; await findSources(currentFilm); return; }
        if (action === "rate") { window.location.href = "index.html?rate=" + encodeURIComponent(String(id)) + "#ratings"; return; }
        if (action === "watched") {
          button.disabled = true;
          try {
            const progressSaved = await window.afterDarkProgress?.save?.({ tmdb_id: id, title: currentFilm.title || currentFilm.name || "", media_type: isSeriesFilm(currentFilm) ? "tv" : "movie", position_seconds: Number(saved.position_seconds || 0), duration_seconds: Number(saved.duration_seconds || 0), status: "completed", season_number: saved.season_number ?? null, episode_number: saved.episode_number ?? null, source_provider: saved.source_provider || "manual" });
            const archiveSaved = await window.afterDarkProgress?.markWatched?.({ tmdb_id: id, title: currentFilm.title || currentFilm.name || "", media_type: isSeriesFilm(currentFilm) ? "tv" : "movie" });
            if (archiveSaved) { button.textContent = "MARKED AS WATCHED ✓"; status("WATCH STATUS SAVED"); }
            else status("COULD NOT SAVE WATCH STATUS — CHECK CONNECTION", true);
          } catch (error) { console.error("MARK WATCHED FAILED", error); status("COULD NOT SAVE WATCH STATUS", true); }
          finally { button.disabled = false; }
        }
      });
    }
    $("#mediaTitle").textContent = String(film.title || film.name || "Без названия");
    const isSeries = film.type === "series" || film.media_type === "tv" || Boolean(film.first_air_date);
    $("#mediaType").textContent = isSeries ? "СЕРИАЛ" : "ФИЛЬМ";
    const year = String(film.release_date || film.first_air_date || "").slice(0, 4);
    $("#mediaMeta").textContent = [year, film.original_title || film.original_name].filter(Boolean).join(" / ");
    const savedEpisodeProgress = savedProgress(film) || {};
    selectedSeason = isSeries ? Math.max(1, Math.floor(Number(savedEpisodeProgress.season_number) || 1)) : null;
    selectedEpisode = isSeries ? Math.max(1, Math.floor(Number(savedEpisodeProgress.episode_number) || 1)) : null;
    Promise.race([Promise.resolve(window.afterDarkProgressReady).catch(() => false), new Promise(resolve => setTimeout(resolve, 1200))]).then(async () => { const saved = savedProgress(film) || {}; if (isSeries) { selectedSeason = Math.max(1, Math.floor(Number(saved.season_number) || selectedSeason || 1)); selectedEpisode = Math.max(1, Math.floor(Number(saved.episode_number) || selectedEpisode || 1)); } await askResumeChoice(film); if (externalLinkResumeChosen) { externalLinkResumeChosen = false; return; } return findSources(film); }).catch(error => { console.error("PLAYER INITIALIZATION FAILED", error); status("НЕ УДАЛОСЬ ПОДГОТОВИТЬ ПЛЕЕР", true); });
    window.addEventListener("pagehide", () => {
      if (venomPlayerInstance) { try { venomPlayerInstance.destroy?.(); } catch (_) {} venomPlayerInstance = null; }
      if (hls) hls.destroy();
      if (dash) { try { dash.reset(); } catch (_) {} }
      const frame = $("#playerStage iframe"); if (frame) { frame._afterDarkCleanup?.(); frame.src = "about:blank"; }
    });
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { findRussianAudioTrackIndex, chooseRussianArchiveCandidate };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
  }
})();