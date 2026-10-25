/* AFTER DARK — dedicated Venom player page. */
(function () {
  "use strict";
  const VERSION = "0.3.6";
  const PUBLIC_PATH = "https://cdn.jsdelivr.net/npm/player-venom@" + VERSION + "/dist/";
  const FILM_KEY = "after-dark:venom-current-film:v1";
  const SOURCE_KEY = "after-dark:venom-source:v1";
  const $ = s => document.querySelector(s);
  let playerInstance = null;
  let playerPromise = null;
  let activeSource = null;

  function filmKey(film) {
    const id = film && (film.tmdbId ?? film.id);
    if (id == null || !String(id).trim()) return "";
    const type = film.type === "series" || film.media_type === "tv" || film.first_air_date ? "tv" : "movie";
    return type + ":" + String(id);
  }
  function sources() {
    try { const x = JSON.parse(localStorage.getItem(SOURCE_KEY) || "{}"); return x && typeof x === "object" && !Array.isArray(x) ? x : {}; }
    catch (_) { return {}; }
  }
  function normalizeSource(raw, kind) {
    if (!["hls","dash","file"].includes(kind)) throw new Error("Выбери тип источника.");
    let url;
    try { url = new URL(String(raw || "").trim()); } catch (_) { throw new Error("Вставь прямую ссылку на видеопоток."); }
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Нужна безопасная HTTPS-ссылка.");
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) throw new Error("Локальные адреса не поддерживаются.");
    return {kind,url:url.href};
  }
  function status(message, error) { const el=$("#playerStatus"); el.textContent=message; el.classList.toggle("is-error",!!error); }
  function loadPlayer() {
    if (window.VenomPlayer && typeof window.VenomPlayer.make === "function") return Promise.resolve(window.VenomPlayer);
    if (playerPromise) return playerPromise;
    playerPromise = new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=PUBLIC_PATH+"player.js"; script.async=true;
      script.onload=()=>window.VenomPlayer&&typeof window.VenomPlayer.make==="function" ? resolve(window.VenomPlayer) : reject(new Error("Скрипт загрузился, но ожидаемый API VenomPlayer.make не найден. Нужно уточнить API пакета."));
      script.onerror=()=>reject(new Error("Не удалось загрузить Venom Player с CDN. Проверь подключение или VPN."));
      document.head.appendChild(script);
    });
    return playerPromise;
  }
  async function play(source) {
    activeSource=source;
    const stage=$("#playerStage");
    try { playerInstance?.destroy?.(); } catch (_) {}
    playerInstance=null;
    stage.replaceChildren();
    const mount=document.createElement("div"); mount.className="venom-mount"; mount.style.width="100%"; mount.style.height="100%"; stage.appendChild(mount);
    status("ЗАГРУЖАЮ VENOM PLAYER…");
    try {
      const VP=await loadPlayer();
      if (!mount.isConnected) return;
      const mediaSource=source.kind==="hls"?{hls:source.url}:source.kind==="dash"?{dash:source.url}:{file:{"Авто":source.url}};
      playerInstance=VP.make({container:mount,publicPath:PUBLIC_PATH,source:mediaSource,title:$("#mediaTitle").textContent,theme:"modern",aspectRatio:"16:9",autoLandscape:true,pip:true,trackProgress:15,doNotSaveProgress:false,cssVars:{"color-primary":"#8b1d2c","background-color-primary":"rgba(16,14,13,.96)"}});
      status("VENOM PLAYER · ИСТОЧНИК ПОДКЛЮЧЁН");
    } catch (e) {
      stage.replaceChildren();
      status(e && e.message ? e.message : "Не удалось запустить Venom Player.",true);
    }
  }
  function init() {
    let film=null;
    try { film=JSON.parse(localStorage.getItem(FILM_KEY)||"null"); } catch (_) {}
    if (!film || typeof film!=="object") {
      $("#mediaTitle").textContent="Фильм не выбран";
      $("#mediaMeta").textContent="Вернись в архив и нажми WATCH на выбранной карточке.";
      status("НЕ ПОЛУЧЕНЫ ДАННЫЕ ФИЛЬМА",true);
      return;
    }
    $("#mediaTitle").textContent=String(film.title||film.name||"Без названия");
    const type=film.type==="series"||film.media_type==="tv"||film.first_air_date?"СЕРИАЛ":"ФИЛЬМ";
    $("#mediaType").textContent=type;
    const year=String(film.release_date||film.first_air_date||"").slice(0,4);
    $("#mediaMeta").textContent=[year,film.original_title||film.original_name].filter(Boolean).join(" / ");
    const key=filmKey(film), saved=sources()[key];
    if(saved){try{const valid=normalizeSource(saved.url,saved.kind);$("#sourceUrl").value=valid.url;$("#sourceKind").value=valid.kind;play(valid);}catch(_){}}
    $("#sourceForm").addEventListener("submit",async e=>{
      e.preventDefault();
      let source;
      try{source=normalizeSource($("#sourceUrl").value,$("#sourceKind").value);}catch(err){status(err.message,true);return;}
      const all=sources(); if(key) all[key]=source;
      try{localStorage.setItem(SOURCE_KEY,JSON.stringify(all));}catch(_){}
      await play(source);
    });
    window.addEventListener("pagehide",()=>{try{playerInstance?.pause?.();playerInstance?.destroy?.();}catch(_){}});
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();