
(()=>{
 const $=(s,p=document)=>p.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
 const titleOf=x=>x&&(x.title||x.name)||"UNTITLED", yearOf=x=>((x&&(x.release_date||x.first_air_date))||"").slice(0,4)||"—";
 const typeOf=x=>((x&&x.genre_ids)||[]).map(Number).includes(16)?"animation":(x&&x.media_type==="tv")||(x&&x.first_air_date)?"series":"film";
 const posterOf=x=>x&&x.poster_path?"https://image.tmdb.org/t/p/w780"+x.poster_path:"";
 const archive=()=>{try{return JSON.parse(localStorage.getItem("afterDarkArchive")||"[]")}catch{return[]}};
 const touch=()=>{try{localStorage.setItem("afterDarkArchiveMeta",JSON.stringify({updatedAt:new Date().toISOString()}))}catch{}};
 window.openFilmCard=async function(id,supplied){
  const film=supplied||archive().find(x=>Number(x.tmdbId)===Number(id));if(!film)return;
  let modal=$("#afterDarkFilmDetail");
  if(!modal){modal=document.createElement("div");modal.id="afterDarkFilmDetail";modal.className="ad-film-detail";modal.innerHTML='<div class="ad-film-detail-backdrop"></div><div class="ad-film-detail-window"><button class="ad-film-detail-close" type="button">CLOSE ×</button><div class="ad-film-detail-grid"><div class="ad-film-detail-poster"><img class="ad-film-detail-image" alt=""></div><div class="ad-film-detail-content"><div class="ad-film-detail-kicker">ARCHIVE FILE</div><div class="ad-film-detail-meta"></div><h2 class="ad-film-detail-title"></h2><p class="ad-film-detail-original"></p><p class="ad-film-detail-overview">LOADING DESCRIPTION…</p><div class="ad-film-detail-extra"></div><div class="ad-film-detail-actions"><button type="button" data-detail-action="watched">MARK AS WATCHED</button><button type="button" data-detail-action="rate">RATE</button><button type="button" data-detail-action="tmdb">OPEN TMDB ↗</button></div></div></div></div>';document.body.appendChild(modal);
   const close=()=>{modal.classList.remove("active");const mn=$("#movieNightModal");mn?.classList.remove("active");mn?.setAttribute("aria-hidden","true");document.body.classList.remove("movie-night-modal-open");document.body.style.overflow=""};$(".ad-film-detail-close",modal).addEventListener("click",close);$(".ad-film-detail-backdrop",modal).addEventListener("click",close);
   modal.addEventListener("click",e=>{const b=e.target.closest("[data-detail-action]");if(!b)return;if(b.dataset.detailAction==="tmdb")window.open("https://www.themoviedb.org/"+(typeOf(modal._film)==="series"?"tv":"movie")+"/"+(modal._film.tmdbId||modal._film.id),"_blank","noopener");if(b.dataset.detailAction==="rate"){close();$("#ratings")?.scrollIntoView({behavior:"smooth"});window.openAuthIfNeeded?.()}if(b.dataset.detailAction==="watched"){const list=archive();const item=list.find(x=>Number(x.tmdbId)===Number(modal._film.tmdbId));if(item)item.watched=true;try{localStorage.setItem("afterDarkArchive",JSON.stringify(list))}catch{}touch();b.textContent="WATCHED ✓";window.renderArchive?.()}});
  }
  modal._film=film;$(".ad-film-detail-image",modal).src=posterOf(film);$(".ad-film-detail-image",modal).alt=titleOf(film);$(".ad-film-detail-meta",modal).textContent=typeOf(film).toUpperCase()+" · "+yearOf(film)+" · ★ "+Number(film.vote_average||0).toFixed(1);$(".ad-film-detail-title",modal).textContent=titleOf(film).toUpperCase();$(".ad-film-detail-original",modal).textContent="";$(".ad-film-detail-overview",modal).textContent="LOADING DESCRIPTION…";$(".ad-film-detail-extra",modal).innerHTML="";
  const wb=$("[data-detail-action='watched']",modal);if(wb)wb.textContent=film.watched?"WATCHED ✓":"MARK AS WATCHED";modal.classList.add("active");document.body.style.overflow="hidden";
  try{const ep=typeOf(film)==="series"?"/tv/"+id:"/movie/"+id,cp=typeOf(film)==="series"?"/tv/"+id+"/credits":"/movie/"+id+"/credits",r=await Promise.all([window.tmdb(ep,{language:"ru-RU"}),window.tmdb(cp,{language:"ru-RU"})]),d=r[0],cr=r[1];$(".ad-film-detail-original",modal).textContent=d.original_title||d.original_name||"";$(".ad-film-detail-overview",modal).textContent=d.overview||"DESCRIPTION IS NOT AVAILABLE.";const p=typeOf(film)==="series"?(d.created_by||[]).slice(0,2).map(x=>x.name):(cr.crew||[]).filter(x=>x.job==="Director").slice(0,2).map(x=>x.name),g=(d.genres||[]).slice(0,5).map(x=>x.name),c=(d.production_countries||[]).slice(0,3).map(x=>x.name||x.iso_3166_1);$(".ad-film-detail-extra",modal).innerHTML=(p.length?"<div><small>"+esc(typeOf(film)==="series"?"CREATED BY":"DIRECTED BY")+"</small><span>"+esc(p.join(" / "))+"</span></div>":"")+(g.length?"<div><small>GENRE</small><span>"+esc(g.join(" / "))+"</span></div>":"")+(c.length?"<div><small>COUNTRY</small><span>"+esc(c.join(" / "))+"</span></div>":"")}catch{$(".ad-film-detail-overview",modal).textContent="DESCRIPTION COULD NOT BE LOADED."}
 };
 const track=$("#archiveTrack");if(track&&!track.dataset.adFinalActions){track.dataset.adFinalActions="1";track.addEventListener("click",async e=>{const b=e.target.closest("[data-action]");if(!b)return;const id=Number(b.dataset.id||b.closest(".archive-card")?.dataset.id);if(!id)return;if(b.dataset.action==="watch"){e.preventDefault();e.stopImmediatePropagation();window.openFilmCard(id);return}if(b.dataset.action==="remove"){e.preventDefault();e.stopImmediatePropagation();const y=window.scrollY||0;const list=archive().filter(x=>Number(x.tmdbId)!==id);try{localStorage.setItem("afterDarkArchive",JSON.stringify(list))}catch{};window.removeArchiveFilmLocal?.(id);try{await window.archiveSyncRemove?.(id)}catch{};touch();requestAnimationFrame(()=>window.scrollTo(0,y))}},true)}
 const open=$("#movieNightOpen");if(open&&!open.dataset.adFinal){open.dataset.adFinal="1";open.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();const q=$("#movieNightTitle")?.textContent?.trim();if(!q)return;window.tmdb("/search/multi",{query:q,include_adult:"false",language:"ru-RU",page:1}).then(d=>{const r=(d.results||[]).find(x=>x.media_type==="movie"||x.media_type==="tv");if(r){const mn=$("#movieNightModal");mn?.classList.remove("active");mn?.setAttribute("aria-hidden","true");document.body.classList.remove("movie-night-modal-open");window.openFilmCard(r.id,{tmdbId:r.id,title:r.title,name:r.name,poster_path:r.poster_path||"",release_date:r.release_date||"",first_air_date:r.first_air_date||"",type:typeOf(r),vote_average:r.vote_average||0,genre_ids:r.genre_ids||[]})}})},true)}
 const filterControls=$(".archive-controls");if(filterControls&&!filterControls.dataset.adFilterFinal){filterControls.dataset.adFilterFinal="1";filterControls.addEventListener("click",e=>{const b=e.target.closest(".filter");if(!b)return;requestAnimationFrame(()=>{const all=[...document.querySelectorAll(".archive-card")];const type=b.dataset.type||"all";all.forEach(card=>{const id=Number(card.dataset.id);const item=archive().find(x=>Number(x.tmdbId)===id);card.style.display=type==="all"||item?.type===type?"":"none"});const visible=type==="all"?archive().length:archive().filter(x=>x.type===type).length;const vc=$("#visibleCount");if(vc)vc.textContent=String(visible).padStart(2,"0");const tc=$("#totalCount");if(tc)tc.textContent=String(archive().length).padStart(2,"0")})})}const meta=()=>{const f=archive(),m=(()=>{try{return JSON.parse(localStorage.getItem("afterDarkArchiveMeta")||"{}")}catch{return{}}})(),d=m.updatedAt?new Date(m.updatedAt):null,dt=d&&!isNaN(d) ? d.toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"}):"—",n=String(f.length).padStart(3,"0");let box=$("#adArchiveMeta");if(!box){box=document.createElement("div");box.id="adArchiveMeta";box.className="ad-archive-meta";controls?.appendChild(box)}box.innerHTML="<span>ARCHIVE / "+n+" TITLES</span><span>LAST UPDATED / "+dt+"</span><span>PRIVATE / 02 VIEWERS</span>";const foot=$(".site-footer"),center=$(".footer-center",foot);if(foot&&center){let x=foot.querySelector(".ad-footer-meta");if(!x){x=document.createElement("div");x.className="ad-footer-meta";center.appendChild(x)}x.innerHTML="<span>"+n+" TITLES CATALOGUED</span><span>02 VIEWERS</span><span>LAST UPDATED / "+dt+"</span>"}};
 const restoreScroll=()=>{try{const y=Number(sessionStorage.getItem("afterDarkRestoreScroll"));if(Number.isFinite(y)){sessionStorage.removeItem("afterDarkRestoreScroll");requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)))}}catch{}};restoreScroll();
 document.addEventListener("click",e=>{const closeBtn=e.target.closest("#movieNightModalClose"),backdrop=e.target.closest("#movieNightModalBackdrop");if(!closeBtn&&!backdrop)return;const mn=$("#movieNightModal");if(!mn)return;e.preventDefault();e.stopPropagation();mn.classList.remove("active");mn.setAttribute("aria-hidden","true");document.body.classList.remove("movie-night-modal-open");document.body.style.overflow=""},{capture:true});
 document.documentElement.classList.add("ad-readable");meta();setInterval(meta,1500);
})();
/* MOVIE NIGHT — interaction safety */
(()=>{
  const root=document.querySelector("#movie-night");
  if(!root||root.dataset.adMovieNightSafety)return;
  root.dataset.adMovieNightSafety="1";

  root.addEventListener("click",e=>{
    const option=e.target.closest(".movie-night-option");
    if(option){
      e.preventDefault();
      if(option.dataset.filterType!==undefined) movieNight.type=option.dataset.filterType;
      if(option.dataset.genre!==undefined) movieNight.genre=option.dataset.genre;
      if(option.dataset.year!==undefined) movieNight.year=option.dataset.year;
      if(option.dataset.rating!==undefined) movieNight.rating=Number(option.dataset.rating);
      const group=option.parentElement;
      group?.querySelectorAll(".movie-night-option").forEach(x=>x.classList.toggle("active",x===option));
      return;
    }

    const decide=e.target.closest("#decideButton");
    if(decide){
      e.preventDefault();
      window.decideMovie?.();
    }
  },true);

  const reveal=document.querySelector("#movieNightReveal");
  const final=document.querySelector("#movieNightFinal");
  const syncReveal=()=>{
    if(!reveal||!final)return;
    const done=reveal.classList.contains("done");
    reveal.style.pointerEvents=done?"none":"auto";
    final.style.position="relative";
    final.style.zIndex="5";
    final.style.pointerEvents=done?"auto":"none";
  };
  if(reveal){
    new MutationObserver(syncReveal).observe(reveal,{attributes:true,attributeFilter:["class"]});
  }
  syncReveal();

  document.querySelector("#movieNightModalClose")?.addEventListener("click",()=>window.closeMovieNight?.(),true);
  document.querySelector("#movieNightModalBackdrop")?.addEventListener("click",()=>window.closeMovieNight?.(),true);
  document.querySelector("#movieNightAdd")?.addEventListener("click",()=>{
    if(window.movieNight?.result){addFilm(window.movieNight.result);updateMovieNightButtons?.()}
  },true);
})();
