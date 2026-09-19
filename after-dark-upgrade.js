
(()=>{
  const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>[...p.querySelectorAll(s)];
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const titleOf=x=>x&& (x.title||x.name) || "UNTITLED";
  const yearOf=x=>((x&&(x.release_date||x.first_air_date))||"").slice(0,4)||"—";
  const typeOf=x=>((x&&x.genre_ids)||[]).map(Number).includes(16)?"animation":(x&&x.media_type==="tv")||(x&&x.first_air_date)?"series":"film";
  const posterOf=x=>x&&x.poster_path?"https://image.tmdb.org/t/p/w780"+x.poster_path:"";
  const FILE_KEY="afterDarkFileNumbers",META_KEY="afterDarkArchiveMeta";
  let fileMap={};try{fileMap=JSON.parse(localStorage.getItem(FILE_KEY)||"{}")}catch{}
  function saveFiles(){try{localStorage.setItem(FILE_KEY,JSON.stringify(fileMap))}catch{}}
  function fileNo(id){const k=String(id);if(fileMap[k])return Number(fileMap[k]);const nums=Object.values(fileMap).map(Number).filter(Number.isFinite);const n=(nums.length?Math.max(...nums):0)+1;fileMap[k]=n;saveFiles();return n}
  function fileLabel(id){return String(fileNo(id)).padStart(3,"0")}
  function touchMeta(){try{localStorage.setItem(META_KEY,JSON.stringify({updatedAt:new Date().toISOString()}))}catch{}}
  function meta(){try{return JSON.parse(localStorage.getItem(META_KEY)||"{}")}catch{return{}}}

  window.openFilmCard=async function(id,supplied){
    const film=supplied||(window.films&&window.films.find(x=>Number(x.tmdbId)===Number(id)));
    if(!film)return;
    let modal=$("#afterDarkFilmDetail");
    if(!modal){
      modal=document.createElement("div");modal.id="afterDarkFilmDetail";modal.className="ad-film-detail";
      modal.innerHTML='<div class="ad-film-detail-backdrop"></div><div class="ad-film-detail-window"><button class="ad-film-detail-close" type="button">CLOSE ×</button><div class="ad-film-detail-grid"><div class="ad-film-detail-poster"><img class="ad-film-detail-image" alt=""><span class="ad-film-detail-file"></span></div><div class="ad-film-detail-content"><div class="ad-film-detail-kicker">PRIVATE ARCHIVE / FILM DOSSIER</div><div class="ad-film-detail-number"></div><div class="ad-film-detail-meta"></div><h2 class="ad-film-detail-title"></h2><p class="ad-film-detail-original"></p><p class="ad-film-detail-overview">LOADING DESCRIPTION…</p><div class="ad-film-detail-extra"></div><div class="ad-film-detail-actions"><button type="button" data-detail-action="watched">MARK AS WATCHED</button><button type="button" data-detail-action="rate">RATE</button><button type="button" data-detail-action="tmdb">OPEN TMDB ↗</button></div></div></div></div>';
      document.body.appendChild(modal);
      const close=()=>{modal.classList.remove("active");document.body.style.overflow=""};
      $(".ad-film-detail-close",modal).addEventListener("click",close);$(".ad-film-detail-backdrop",modal).addEventListener("click",close);
      modal.addEventListener("click",e=>{
        const b=e.target.closest("[data-detail-action]");if(!b)return;const current=modal._film;if(!current)return;
        if(b.dataset.detailAction==="watched"){current.watched=true;if(window.save)window.save("afterDarkArchive",window.films);touchMeta();b.textContent="WATCHED ✓";if(window.renderArchive)window.renderArchive()}
        else if(b.dataset.detailAction==="rate"){close();$("#ratings")&&$("#ratings").scrollIntoView({behavior:"smooth"});window.openAuthIfNeeded&&window.openAuthIfNeeded()}
        else if(b.dataset.detailAction==="tmdb"){window.open("https://www.themoviedb.org/"+(typeOf(current)==="series"?"tv":"movie")+"/"+(current.tmdbId||current.id),"_blank","noopener")}
      });
    }
    modal._film=film;const file=fileLabel(id),name=titleOf(film),image=$(".ad-film-detail-image",modal);
    image.src=posterOf(film)||"";image.alt=name;
    $(".ad-film-detail-file",modal).textContent="FILE / "+file;
    $(".ad-film-detail-number",modal).textContent=file;
    $(".ad-film-detail-meta",modal).textContent=typeOf(film).toUpperCase()+" · "+yearOf(film)+" · ★ "+Number(film.vote_average||0).toFixed(1);
    $(".ad-film-detail-title",modal).textContent=name.toUpperCase();$(".ad-film-detail-original",modal).textContent="";$(".ad-film-detail-overview",modal).textContent="LOADING DESCRIPTION…";$(".ad-film-detail-extra",modal).innerHTML="";
    const wb=$("[data-detail-action='watched']",modal);if(wb)wb.textContent=film.watched?"WATCHED ✓":"MARK AS WATCHED";
    modal.classList.add("active");document.body.style.overflow="hidden";
    try{
      const endpoint=typeOf(film)==="series"?"/tv/"+id:"/movie/"+id,creditsEndpoint=typeOf(film)==="series"?"/tv/"+id+"/credits":"/movie/"+id+"/credits";
      const pair=await Promise.all([window.tmdb(endpoint,{language:"ru-RU"}),window.tmdb(creditsEndpoint,{language:"ru-RU"})]);const details=pair[0],credits=pair[1];
      if(!modal.classList.contains("active"))return;
      $(".ad-film-detail-original",modal).textContent=details.original_title||details.original_name||"";
      $(".ad-film-detail-overview",modal).textContent=details.overview||"DESCRIPTION IS NOT AVAILABLE.";
      const people=typeOf(film)==="series"?(details.created_by||[]).slice(0,2).map(x=>x.name):(credits.crew||[]).filter(x=>x.job==="Director").slice(0,2).map(x=>x.name);
      const genres=(details.genres||[]).slice(0,5).map(x=>x.name).filter(Boolean),countries=(details.production_countries||[]).slice(0,3).map(x=>x.iso_3166_1).filter(Boolean);
      $(".ad-film-detail-extra",modal).innerHTML=(people.length?"<span>"+esc(typeOf(film)==="series"?"CREATED BY":"DIRECTED BY")+" · "+esc(people.join(" / "))+"</span>":"")+(genres.length?"<span>"+esc(genres.join(" / "))+"</span>":"")+(countries.length?"<span>"+esc(countries.join(" / "))+"</span>":"");
    }catch{$(".ad-film-detail-overview",modal).textContent="DESCRIPTION COULD NOT BE LOADED."}
  };

  function setup(){
    const track=$("#archiveTrack");
    if(track&&!track.dataset.adStartUpgrade){
      track.dataset.adStartUpgrade="1";
      track.addEventListener("click",e=>{
        const b=e.target.closest("[data-action='watch']");if(!b)return;
        e.preventDefault();e.stopImmediatePropagation();
        const id=Number(b.dataset.id||b.closest(".archive-card")&&b.closest(".archive-card").dataset.id),film=window.films&&window.films.find(x=>Number(x.tmdbId)===id);
        if(film)window.openFilmCard(id,film);
      },true);
    }
    const open=$("#movieNightOpen");
    if(open&&!open.dataset.adOpenUpgrade){
      open.dataset.adOpenUpgrade="1";
      open.addEventListener("click",e=>{
        e.preventDefault();e.stopImmediatePropagation();const r=window.movieNight&&window.movieNight.result;if(!r)return;
        window.openFilmCard(r.id,{tmdbId:r.id,title:r.title,name:r.name,poster_path:r.poster_path||"",release_date:r.release_date||"",first_air_date:r.first_air_date||"",type:typeOf(r),vote_average:r.vote_average||0,genre_ids:r.genre_ids||[],watched:false});
      },true);
    }
    const controls=$(".archive-controls"),wrap=$(".archive-track-wrap");
    if(controls&&wrap&&!$(".ad-library-view-toggle")){
      const toggle=document.createElement("div");toggle.className="ad-library-view-toggle";toggle.innerHTML='<button type="button" class="active" data-view="cards">CARDS</button><button type="button" data-view="index">INDEX</button>';controls.appendChild(toggle);
      toggle.addEventListener("click",e=>{const b=e.target.closest("[data-view]");if(!b)return;toggle.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));wrap.classList.toggle("ad-index-view",b.dataset.view==="index")});
    }
    updateMeta();document.documentElement.classList.add("ad-readable");
  }
  function updateMeta(){
    const films=window.films||[],m=meta(),d=m.updatedAt?new Date(m.updatedAt):null,dt=d&&!isNaN(d) ? d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}):"—",count=String(films.length).padStart(3,"0");
    let box=$("#adArchiveMeta");if(!box){box=document.createElement("div");box.id="adArchiveMeta";box.className="ad-archive-meta";$(".archive-controls")&&$(".archive-controls").appendChild(box)}
    box.innerHTML="<span>ARCHIVE / "+count+" TITLES</span><span>LAST UPDATED / "+dt+"</span><span>PRIVATE / 02 VIEWERS</span>";
    const footer=$(".site-footer");if(footer){let f=footer.querySelector(".ad-footer-meta");if(!f){f=document.createElement("div");f.className="ad-footer-meta";$(".footer-center",footer)&&$(".footer-center",footer).appendChild(f)}f.innerHTML="<span>"+count+" TITLES CATALOGUED</span><span>02 VIEWERS</span><span>LAST UPDATED / "+dt+"</span>"}
  }
  function boot(){setup();const track=$("#archiveTrack");if(track)new MutationObserver(()=>{setup();updateMeta()}).observe(track,{childList:true});setInterval(updateMeta,1500);document.addEventListener("click",e=>{if(e.target.closest("[data-action='remove'],[data-action='watch'],[data-action='add'],#movieNightAdd"))touchMeta()},true)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();