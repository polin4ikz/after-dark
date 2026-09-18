(()=>{
  // The legacy local ratings renderer must never run: Supabase owns Ratings now.
  window.initRatings=()=>{};

  function setChoice(attr,value){
    document.querySelectorAll(`[${attr}]`).forEach(b=>b.classList.toggle("active",b.getAttribute(attr)===value));
  }

  function initMovieNightFixed(){
    const root=document.querySelector("#movie-night");
    if(!root)return;
    document.querySelectorAll('.movie-night-option[data-filter-type]').forEach(b=>b.addEventListener("click",()=>{movieNight.type=b.dataset.filterType;setChoice("data-filter-type",movieNight.type)}));
    document.querySelectorAll('.movie-night-option[data-genre]').forEach(b=>b.addEventListener("click",()=>{movieNight.genre=b.dataset.genre;setChoice("data-genre",movieNight.genre)}));
    document.querySelectorAll('.movie-night-option[data-year]').forEach(b=>b.addEventListener("click",()=>{movieNight.year=b.dataset.year;setChoice("data-year",movieNight.year)}));
    document.querySelectorAll('.movie-night-option[data-rating]').forEach(b=>b.addEventListener("click",()=>{movieNight.rating=Number(b.dataset.rating);setChoice("data-rating",String(movieNight.rating))}));
    document.querySelector("#movieNightCountry")?.addEventListener("change",e=>movieNight.country=e.target.value);
    document.querySelector("#excludeArchive")?.addEventListener("change",e=>movieNight.exclude=e.target.checked);
    document.querySelector("#decideButton")?.addEventListener("click",decideMovieFixed);
    document.querySelector("#movieNightModalBackdrop")?.addEventListener("click",closeMovieNightFixed);
    document.querySelector("#movieNightModalClose")?.addEventListener("click",closeMovieNightFixed);
    document.querySelector("#movieNightAdd")?.addEventListener("click",async()=>{if(!movieNight.result)return;const added=addFilm(movieNight.result);if(!added){updateMovieNightButtonsFixed();return}const savedFilm=films.find(x=>Number(x.tmdbId)===Number(movieNight.result.id));const ok=savedFilm?await archiveSyncUpsert(savedFilm):false;if(!ok){films=films.filter(x=>Number(x.tmdbId)!==Number(movieNight.result.id));save(ARCHIVE_KEY,films);renderArchive();alert("COULD NOT SAVE TO ARCHIVE");return}updateMovieNightButtonsFixed()});
    document.querySelector("#movieNightOpen")?.addEventListener("click",()=>{if(movieNight.result)window.open(`https://www.themoviedb.org/${typeOf(movieNight.result)==="series"?"tv":"movie"}/${movieNight.result.id}`,"_blank","noopener")});
  }

  async function decideMovieFixed(){
    if(movieNight.busy)return;
    movieNight.busy=true;
    const modal=document.querySelector("#movieNightModal"),reveal=document.querySelector("#movieNightReveal"),final=document.querySelector("#movieNightFinal"),track=document.querySelector("#movieNightRevealTrack");
    modal?.classList.add("active");modal?.setAttribute("aria-hidden","false");document.body.classList.add("movie-night-modal-open");reveal?.classList.remove("done");final?.classList.remove("visible");if(track)track.innerHTML="<span>SEARCHING ARCHIVE</span>";
    let timer=null;
    try{
      let all=[];
      const wantsSeries=movieNight.type==="series",wantsAnimation=movieNight.type==="animation";
      const endpoints=wantsSeries?["/discover/tv"]:wantsAnimation||movieNight.type==="film"?["/discover/movie"]:["/discover/movie","/discover/tv"];
      const requests=endpoints.map(endpoint=>{const p=dateParams(buildDiscoverParams());if(endpoint==="/discover/movie"&&movieNight.type==="animation")p.with_genres=movieNight.genre==="any"?"16":`${GENRES[movieNight.genre]},16`;return tmdb(endpoint,p)});
      const ds=await Promise.all(requests);ds.forEach(d=>all.push(...(d.results||[])));
      all=all.filter(x=>x.poster_path&&(!movieNight.exclude||!films.some(f=>Number(f.tmdbId)===Number(x.id))));
      if(!all.length)throw Error("NO TITLES MATCH THE FILTERS");
      const winner=all[Math.floor(Math.random()*all.length)];movieNight.result=winner;
      let i=0;
      const names=all.slice(0,12).map(titleOf);
      if(track){
        track.innerHTML="";
        const points=[[-210,-115],[-135,-135],[-55,-125],[30,-135],[115,-120],[190,-100],[-235,-65],[-155,-55],[-75,-70],[10,-60],[95,-65],[180,-55],[225,-35],[-220,-5],[-145,0],[-70,10],[0,-5],[75,5],[150,0],[215,15],[-220,50],[-145,60],[-70,70],[10,65],[85,70],[160,60],[220,50],[-185,105],[-110,120],[-30,130],[55,125],[135,115],[190,95],[-125,145],[-45,150],[40,145],[115,135]];
        window.movieNightPointPool=[...points].sort(()=>Math.random()-.5);
        const spawnTitle=()=>{const span=document.createElement("span");span.textContent=names[i%names.length];i++;const point=window.movieNightPointPool.pop()||points[Math.floor(Math.random()*points.length)];span.style.left=`calc(50% + ${point[0]+(Math.random()-.5)*55}px)`;span.style.top=`calc(50% + ${point[1]+(Math.random()-.5)*40}px)`;span.style.setProperty("--delay",`${Math.random()*.08}s`);track.appendChild(span);setTimeout(()=>span.remove(),1500)};
        for(let n=0;n<8;n++)setTimeout(spawnTitle,n*170);
        timer=setInterval(spawnTitle,300);
      }
      await new Promise(r=>setTimeout(r,2100));clearInterval(timer);timer=null;showMovieNightResultFixed(winner);reveal?.classList.add("done");final?.classList.add("visible");
    }catch(e){clearInterval(timer);if(track)track.innerHTML=`<span class="error">${esc(e.message||"NO MATCH")}</span>`;reveal?.classList.add("done")}finally{movieNight.busy=false}
  }

  function showMovieNightResultFixed(f){
    const p=document.querySelector("#movieNightPoster"),t=document.querySelector("#movieNightTitle"),y=document.querySelector("#movieNightYear"),r=document.querySelector("#movieNightRating"),ty=document.querySelector("#movieNightType"),sm=document.querySelector("#movieNightSubmeta"),ov=document.querySelector("#movieNightOverview"),st=document.querySelector("#movieNightArchiveStatus");
    if(p){p.src=posterOf(f);p.alt=titleOf(f)}if(t)t.textContent=titleOf(f).toUpperCase();if(y)y.textContent=yearOf(f);if(r)r.textContent=`★ ${Number(f.vote_average||0).toFixed(1)}`;if(ty)ty.textContent=typeOf(f).toUpperCase();if(sm)sm.textContent=(f.origin_country||[]).map(c=>COUNTRIES[c]||c).join(" / ")||"TMDB";if(ov)ov.textContent=f.overview||"No description available.";if(st)st.textContent=films.some(x=>Number(x.tmdbId)===Number(f.id))?"ALREADY IN ARCHIVE":"FROM TMDB";updateMovieNightButtonsFixed();
  }

  function updateMovieNightButtonsFixed(){const b=document.querySelector("#movieNightAdd");if(!b||!movieNight.result)return;const inA=films.some(x=>Number(x.tmdbId)===Number(movieNight.result.id));b.textContent=inA?"IN ARCHIVE":"ADD TO ARCHIVE";b.disabled=inA}
  function closeMovieNightFixed(){const modal=document.querySelector("#movieNightModal");modal?.classList.remove("active");modal?.setAttribute("aria-hidden","true");document.body.classList.remove("movie-night-modal-open");movieNight.result=null}

  window.initMovieNight=initMovieNightFixed;
})();
