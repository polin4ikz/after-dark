const TMDB_API_KEY="eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmMTZiYTQ0NDRjYWQ4ODdjZGY0ZDE1Yjk3MGZlNjlhYSIsIm5iZiI6MTc4NjY1NjM4NS43MDcsInN1YiI6IjZhN2UzNjgxMDYxNjdmYTY2ZmM3YWI2MCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WLWycZ1zW98G_x0bs90UHsFljmrwpPKoPvZBrP9ho2o";
const API="https://api.themoviedb.org/3",IMG="https://image.tmdb.org/t/p/w780";
const ARCHIVE_KEY="afterDarkArchive",USER_KEY="afterDarkUser",RATINGS_KEY="afterDarkRatings";
const SUPABASE_URL="https://kwphiydboppdpmdihpca.supabase.co";
const SUPABASE_KEY="sb_publishable_epCYFzDjeCWaAJdzLeCVDA_rxcQEbnh";
let supabaseClient=null;
const supabaseReady=new Promise((resolve,reject)=>{if(window.supabase){supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(supabaseClient);return}const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";s.onload=()=>{try{supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);resolve(supabaseClient)}catch(e){reject(e)}};s.onerror=()=>reject(new Error("SUPABASE SDK FAILED TO LOAD"));document.head.appendChild(s)});
const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];
const body=document.body,cursor=$(".cursor"),archiveTrack=$("#archiveTrack"),searchInput=$("#searchInput"),searchResults=$("#searchResults");
let films=load(ARCHIVE_KEY),currentType="all",searchController=null,searchTimer=null;
let movieNight={type:"all",genre:"any",year:"any",country:"any",rating:0,exclude:false,result:null,busy:false};
let ratings=load(RATINGS_KEY);
const GENRES={drama:18,comedy:35,thriller:53,horror:27,crime:80,romance:10749,fantasy:14,"sci-fi":878,mystery:9648,documentary:99};
const COUNTRIES={US:"USA",GB:"UK",FR:"FRANCE",DE:"GERMANY",IT:"ITALY",ES:"SPAIN",JP:"JAPAN",KR:"SOUTH KOREA",CN:"CHINA",HK:"HONG KONG",TW:"TAIWAN",IN:"INDIA",CA:"CANADA",AU:"AUSTRALIA",RU:"RUSSIA",SE:"SWEDEN",NO:"NORWAY",DK:"DENMARK",FI:"FINLAND",NL:"NETHERLANDS",BE:"BELGIUM",CH:"SWITZERLAND",PL:"POLAND",CZ:"CZECH REPUBLIC",BR:"BRAZIL",MX:"MEXICO",AR:"ARGENTINA",IE:"IRELAND",TR:"TURKEY",TH:"THAILAND",ID:"INDONESIA",IR:"IRAN",IL:"ISRAEL"};
const DEFAULT_RATINGS=[{id:1,title:"THE GODFATHER",type:"film",year:1972,polina:9.5,nastya:9.2,date:"2026-08-12"},{id:2,title:"BLACK SWAN",type:"film",year:2010,polina:9.1,nastya:9.4,date:"2026-08-09"},{id:3,title:"DARK",type:"series",year:2017,polina:9.4,nastya:8.9,date:"2026-08-04"},{id:4,title:"PERFECT BLUE",type:"animation",year:1997,polina:9.6,nastya:9.3,date:"2026-07-28"},{id:5,title:"HER",type:"film",year:2013,polina:8.9,nastya:9,date:"2026-07-21"}];
if(!ratings.length){ratings=DEFAULT_RATINGS;save(RATINGS_KEY,ratings)}
function load(k){try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[]}catch{return[]}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function titleOf(x){return x.title||x.name||"UNTITLED"}
function yearOf(x){return(x.release_date||x.first_air_date||"").slice(0,4)||"—"}
function typeOf(x){if((x.genre_ids||[]).map(Number).includes(16))return"animation";return x.media_type==="tv"||x.first_air_date?"series":"film"}
function posterOf(x){return x.poster_path?IMG+x.poster_path:""}
function tmdbUrl(x){const isSeries=x.media_type==="tv"||!!x.first_air_date;return`https://www.themoviedb.org/${isSeries?"tv":"movie"}/${x.tmdbId||x.id}`}
async function tmdb(path,params={},signal){const u=new URL(API+path);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")u.searchParams.set(k,v)});const r=await fetch(u,{signal,headers:{Authorization:`Bearer ${TMDB_API_KEY}`,accept:"application/json"}});if(!r.ok)throw Error(`TMDB ${r.status}`);return r.json()}
function initCursor(){if(!cursor)return;let x=innerWidth/2,y=innerHeight/2,cx=x,cy=y;document.addEventListener("pointermove",e=>{x=e.clientX;y=e.clientY;cursor.classList.remove("is-hidden")},{passive:true});function tick(){cx+=(x-cx)*.18;cy+=(y-cy)*.18;cursor.style.setProperty("--cursor-x",cx+"px");cursor.style.setProperty("--cursor-y",cy+"px");const hit=document.elementFromPoint(x,y);cursor.classList.toggle("is-hover",!!hit?.closest("button,a,input,select,.archive-card,.search-result,.rating-card"));requestAnimationFrame(tick)}tick()}
function initIndex(){$(".index-trigger")?.addEventListener("click",()=>$(".index-panel")?.classList.add("active"));$(".index-close")?.addEventListener("click",()=>$(".index-panel")?.classList.remove("active"));$$('.index-nav a').forEach(a=>a.addEventListener("click",()=>$(".index-panel")?.classList.remove("active")))}
function initHeaderAuth(){const meta=$(".header-meta"),old=$("#authButton");if(old)old.style.display="none";if(!meta||$(".header-auth-button"))return;const b=document.createElement("button");b.className="header-auth-button";b.type="button";b.textContent="LOG IN / REGISTER";b.addEventListener("click",handleAuthButton);const index=$(".index-trigger");meta.insertBefore(b,index||null)}
function updateArchiveCounters(n){const v=$("#visibleCount"),t=$("#totalCount");if(v)v.textContent=String(n).padStart(2,"0");if(t)t.textContent=String(films.length).padStart(2,"0")}
function archiveList(){return currentType==="all"?films:films.filter(f=>f.type===currentType)}
function archiveActions(f){return`<div class="archive-actions"><button class="archive-action" data-action="watch" data-id="${esc(f.tmdbId)}" type="button">${f.watched?"CONTINUE":"START"}</button><button class="archive-action rate" data-action="rate" data-id="${esc(f.tmdbId)}" type="button">RATE</button></div><button class="archive-remove" data-action="remove" data-id="${esc(f.tmdbId)}" type="button">REMOVE ×</button>`}
function renderArchive(){if(!archiveTrack)return;const list=archiveList();archiveTrack.innerHTML=list.length?list.map((f,i)=>`<article class="archive-card" data-id="${esc(f.tmdbId)}"><div class="archive-card-poster" data-action="detail">${posterOf(f)?`<img src="${esc(posterOf(f))}" alt="${esc(titleOf(f))}" loading="lazy">`:"<span>LOADING<br>POSTER</span>"}<span>${String(i+1).padStart(2,"0")}</span></div><div class="archive-card-meta"><span>${esc((f.type||"film").toUpperCase())}</span><span>${esc(yearOf(f))}</span></div><h3>${esc(titleOf(f))}</h3>${archiveActions(f)}</article>`).join(""):`<div class="archive-empty"><span>00</span><p>ARCHIVE IS EMPTY.</p><small>SEARCH FOR A TITLE ABOVE AND KEEP IT FOR LATER.</small></div>`;updateArchiveCounters(list.length);updateCarousel()}
async function enrichArchivePosters(){const missing=films.filter(f=>!f.poster_path&&f.tmdbId);if(!missing.length)return;await Promise.all(missing.slice(0,12).map(async f=>{try{const d=await tmdb(f.type==="series"?`/tv/${f.tmdbId}`:`/movie/${f.tmdbId}`,{language:"ru-RU"});if(d.poster_path){f.poster_path=d.poster_path;f.backdrop_path=d.backdrop_path||f.backdrop_path;save(ARCHIVE_KEY,films)}}catch{}}));renderArchive()}
function addFilm(f){if(films.some(x=>Number(x.tmdbId)===Number(f.id)))return false;films.unshift({tmdbId:f.id,title:titleOf(f),name:f.name,poster_path:f.poster_path||"",backdrop_path:f.backdrop_path||"",release_date:f.release_date||"",first_air_date:f.first_air_date||"",type:typeOf(f),vote_average:f.vote_average||0,genre_ids:f.genre_ids||[],originCountries:f.origin_country||[],watched:false});save(ARCHIVE_KEY,films);renderArchive();return true}
function openFilmCard(id){
  const film=films.find(x=>Number(x.tmdbId)===Number(id));
  if(!film)return;
  let modal=$("#afterDarkFilmDetail");
  if(!modal){
    modal=document.createElement("div");
    modal.id="afterDarkFilmDetail";
    modal.className="ad-film-detail";
    modal.innerHTML='<div class="ad-film-detail-backdrop"></div><div class="ad-film-detail-window"><button class="ad-film-detail-close" type="button">CLOSE ×</button><div class="ad-film-detail-grid"><div class="ad-film-detail-poster"><img class="ad-film-detail-image" alt=""><span class="ad-film-detail-file"></span></div><div class="ad-film-detail-content"><div class="ad-film-detail-kicker">ARCHIVE FILE</div><div class="ad-film-detail-number"></div><div class="ad-film-detail-meta"></div><h2 class="ad-film-detail-title"></h2><p class="ad-film-detail-original"></p><p class="ad-film-detail-overview">LOADING DESCRIPTION…</p><div class="ad-film-detail-extra"></div></div></div></div>';
    document.body.appendChild(modal);
    const close=()=>{modal.classList.remove("active");document.body.style.overflow=""};
    $(".ad-film-detail-close",modal).addEventListener("click",close);
    $(".ad-film-detail-backdrop",modal).addEventListener("click",close);
  }
  const list=archiveList(),index=Math.max(0,list.findIndex(x=>Number(x.tmdbId)===Number(id)))+1;
  const file=String(index).padStart(3,"0"),name=titleOf(film);
  const image=$(".ad-film-detail-image",modal);
  image.src=posterOf(film)||"";
  image.alt=name;
  $(".ad-film-detail-file",modal).textContent="FILE / "+file;
  $(".ad-film-detail-number",modal).textContent=file;
  $(".ad-film-detail-meta",modal).textContent=(film.type||"film").toUpperCase()+" · "+yearOf(film)+" · ★ "+Number(film.vote_average||0).toFixed(1);
  $(".ad-film-detail-title",modal).textContent=name.toUpperCase();
  $(".ad-film-detail-original",modal).textContent="";
  $(".ad-film-detail-overview",modal).textContent="LOADING DESCRIPTION…";
  $(".ad-film-detail-extra",modal).innerHTML="";
  modal.classList.add("active");
  document.body.style.overflow="hidden";
  const endpoint=film.type==="series"?"/tv/"+id:"/movie/"+id;
  const creditsEndpoint=film.type==="series"?"/tv/"+id+"/credits":"/movie/"+id+"/credits";
  Promise.all([tmdb(endpoint,{language:"ru-RU"}),tmdb(creditsEndpoint,{language:"ru-RU"})]).then(([details,credits])=>{
    $(".ad-film-detail-original",modal).textContent=details.original_title||details.original_name||"";
    $(".ad-film-detail-overview",modal).textContent=details.overview||"DESCRIPTION IS NOT AVAILABLE.";
    const people=film.type==="series"?(details.created_by||[]).slice(0,2).map(x=>x.name):(credits.crew||[]).filter(x=>x.job==="Director").slice(0,2).map(x=>x.name);
    const genres=(details.genres||[]).slice(0,4).map(x=>x.name).filter(Boolean);
    $(".ad-film-detail-extra",modal).innerHTML=[
      people.length?"<span>"+esc(film.type==="series"?"CREATED BY":"DIRECTED BY")+" · "+esc(people.join(" / "))+"</span>":"",
      genres.length?"<span>"+esc(genres.join(" / "))+"</span>":""
    ].join("");
  }).catch(()=>{$(".ad-film-detail-overview",modal).textContent="DESCRIPTION COULD NOT BE LOADED."});
}
function initArchive(){renderArchive();$('.filter').forEach(b=>b.addEventListener("click",()=>{$('.filter').forEach(x=>x.classList.remove("active"));b.classList.add("active");currentType=b.dataset.type||"all";renderArchive()}));let drag=false,moved=false,suppressClick=false,start=0,scroll=0;archiveTrack?.addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const id=Number(b.dataset.id),f=films.find(x=>Number(x.tmdbId)===id);if(!f)return;if(b.dataset.action==="detail"){openFilmCard(id);return}if(b.dataset.action==="remove"){films=films.filter(x=>Number(x.tmdbId)!==id);save(ARCHIVE_KEY,films);renderArchive()}else if(b.dataset.action==="watch"){f.watched=true;save(ARCHIVE_KEY,films);renderArchive();window.open(tmdbUrl(f),"_blank","noopener")}else if(b.dataset.action==="rate"){document.querySelector("#ratings")?.scrollIntoView({behavior:"smooth"});openAuthIfNeeded()}});archiveTrack?.addEventListener("pointerdown",e=>{if(e.target.closest("button,a"))return;drag=true;moved=false;start=e.clientX;scroll=archiveTrack.scrollLeft});archiveTrack?.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-start;if(Math.abs(dx)<8)return;if(!moved){moved=true;suppressClick=true;archiveTrack.classList.add("is-dragging");try{archiveTrack.setPointerCapture(e.pointerId)}catch{}}archiveTrack.scrollLeft=scroll-dx*1.15});["pointerup","pointercancel","lostpointercapture"].forEach(n=>archiveTrack?.addEventListener(n,()=>{drag=false;moved=false;archiveTrack.classList.remove("is-dragging");if(suppressClick)setTimeout(()=>{suppressClick=false},0)}))}function initCarousel(){if(!archiveTrack)return;let ui=$(".archive-carousel-ui");if(!ui){ui=document.createElement("div");ui.className="archive-carousel-ui";ui.innerHTML='<div class="archive-carousel-buttons"><button class="archive-carousel-button" data-carousel="prev" type="button">←</button><button class="archive-carousel-button" data-carousel="next" type="button">→</button></div><div class="archive-carousel-progress"></div><div class="archive-carousel-position">01 / 01</div>';$(".archive-track-wrap")?.appendChild(ui)}ui.addEventListener("click",e=>{const b=e.target.closest("[data-carousel]");if(!b)return;const amount=Math.max(280,archiveTrack.clientWidth*.62);archiveTrack.scrollBy({left:(b.dataset.carousel==="next"?amount:-amount),behavior:"smooth"});setTimeout(updateCarousel,450)});archiveTrack.addEventListener("scroll",()=>requestAnimationFrame(updateCarousel),{passive:true})}
function updateCarousel(){const pos=$(".archive-carousel-position");if(!pos||!archiveTrack)return;const max=Math.max(1,archiveTrack.scrollWidth-archiveTrack.clientWidth),p=Math.min(1,Math.max(0,archiveTrack.scrollLeft/max)),current=Math.round(p*Math.max(0,archiveList().length-1))+1;pos.textContent=`${String(current).padStart(2,"0")} / ${String(Math.max(1,archiveList().length)).padStart(2,"0")}`}
function renderSearch(items){window.__searchResults=items;if(!searchResults)return;searchResults.innerHTML=items.length?`<div class="search-results-head"><span>RESULTS</span><span>${String(items.length).padStart(2,"0")}</span></div>`+items.map((f,i)=>{const inA=films.some(x=>Number(x.tmdbId)===Number(f.id));return`<article class="search-result" data-id="${esc(f.id)}"><span class="search-result-index">${String(i+1).padStart(2,"0")}</span><div class="search-result-poster">${f.poster_path?`<img src="${esc(posterOf(f))}" alt="${esc(titleOf(f))}" loading="lazy">`:`<span>NO<br>IMAGE</span>`}</div><div class="search-result-info"><h3>${esc(titleOf(f))}</h3><p>${esc(typeOf(f).toUpperCase())} · ${esc(yearOf(f))} · ★ ${Number(f.vote_average||0).toFixed(1)}</p></div><button class="search-result-add ${inA?"added":""}" type="button" data-action="add">${inA?"IN ARCHIVE":"ADD +"}</button></article>`}).join(""):""}
async function search(){const q=searchInput?.value.trim();if(!q){searchResults.innerHTML="";return}searchController?.abort();searchController=new AbortController();searchResults.innerHTML='<div class="search-state">SEARCHING DATABASE<span></span></div>';try{const d=await tmdb("/search/multi",{query:q,include_adult:"false",language:"ru-RU",page:1},searchController.signal);renderSearch((d.results||[]).filter(x=>x.media_type==="movie"||x.media_type==="tv").slice(0,12))}catch(e){if(e.name!=="AbortError")searchResults.innerHTML='<div class="search-state">DATABASE CONNECTION FAILED</div>'}}
function initSearch(){$("#searchButton")?.addEventListener("click",search);searchInput?.addEventListener("keydown",e=>{if(e.key==="Enter")search()});searchInput?.addEventListener("input",()=>{clearTimeout(searchTimer);if(!searchInput.value.trim()){searchResults.innerHTML="";return}searchTimer=setTimeout(search,450)});searchResults?.addEventListener("click",e=>{const b=e.target.closest("[data-action='add']");if(!b)return;const row=b.closest(".search-result"),item=window.__searchResults?.find(x=>Number(x.id)===Number(row?.dataset.id));if(item&&addFilm(item)){b.textContent="IN ARCHIVE";b.classList.add("added")}})}
function setChoice(attr,value){$$(`[${attr}]`).forEach(b=>b.classList.toggle("active",b.getAttribute(attr)===value))}
function buildDiscoverParams(){const p={language:"ru-RU",page:Math.floor(Math.random()*8)+1,sort_by:"popularity.desc",include_adult:"false","vote_count.gte":20};if(movieNight.genre!=="any")p.with_genres=GENRES[movieNight.genre];if(movieNight.country!=="any")p.with_origin_country=movieNight.country;if(movieNight.rating)p["vote_average.gte"]=movieNight.rating;return p}
function dateParams(p){const y=movieNight.year;if(y==="before-1990"){p["primary_release_date.lte"]="1989-12-31";p["first_air_date.lte"]="1989-12-31"}else if(/^\d{4}-\d{4}$/.test(y)){const[a,b]=y.split("-");p["primary_release_date.gte"]=`${a}-01-01`;p["primary_release_date.lte"]=`${b}-12-31`;p["first_air_date.gte"]=`${a}-01-01`;p["first_air_date.lte"]=`${b}-12-31`}else if(y==="2020"){p["primary_release_date.gte"]="2020-01-01";p["first_air_date.gte"]="2020-01-01"}return p}
function initMovieNight(){const root=$("#movie-night");if(!root)return;$$('.movie-night-option[data-filter-type]').forEach(b=>b.addEventListener("click",()=>{movieNight.type=b.dataset.filterType;setChoice("data-filter-type",movieNight.type)}));$$('.movie-night-option[data-genre]').forEach(b=>b.addEventListener("click",()=>{movieNight.genre=b.dataset.genre;setChoice("data-genre",movieNight.genre)}));$$('.movie-night-option[data-year]').forEach(b=>b.addEventListener("click",()=>{movieNight.year=b.dataset.year;setChoice("data-year",movieNight.year)}));$$('.movie-night-option[data-rating]').forEach(b=>b.addEventListener("click",()=>{movieNight.rating=Number(b.dataset.rating);setChoice("data-rating",String(movieNight.rating))}));$("#movieNightCountry")?.addEventListener("change",e=>movieNight.country=e.target.value);$("#excludeArchive")?.addEventListener("change",e=>movieNight.exclude=e.target.checked);$("#decideButton")?.addEventListener("click",decideMovie);$("#movieNightModalBackdrop")?.addEventListener("click",closeMovieNight);$("#movieNightModalClose")?.addEventListener("click",closeMovieNight);$("#movieNightAdd")?.addEventListener("click",()=>{if(movieNight.result){addFilm(movieNight.result);updateMovieNightButtons()}});$("#movieNightOpen")?.addEventListener("click",()=>{if(movieNight.result)window.open(`https://www.themoviedb.org/${typeOf(movieNight.result)==="series"?"tv":"movie"}/${movieNight.result.id}`,"_blank","noopener")})}
async function decideMovie(){if(movieNight.busy)return;movieNight.busy=true;const modal=$("#movieNightModal"),reveal=$("#movieNightReveal"),final=$("#movieNightFinal"),track=$("#movieNightRevealTrack");modal?.classList.add("active");modal?.setAttribute("aria-hidden","false");body.classList.add("movie-night-modal-open");reveal?.classList.remove("done");final?.classList.remove("visible");track&&(track.innerHTML="<span>SEARCHING ARCHIVE</span>");let timer=null;try{let all=[];const wantsSeries=movieNight.type==="series",wantsAnimation=movieNight.type==="animation";const endpoints=wantsSeries?["/discover/tv"]:wantsAnimation||movieNight.type==="film"?["/discover/movie"]:["/discover/movie","/discover/tv"];const requests=endpoints.map(endpoint=>{const p=dateParams(buildDiscoverParams());if(endpoint==="/discover/movie"&&movieNight.type==="animation")p.with_genres=movieNight.genre==="any"?"16":`${GENRES[movieNight.genre]},16`;return tmdb(endpoint,p)});const ds=await Promise.all(requests);ds.forEach(d=>all.push(...(d.results||[])));all=all.filter(x=>x.poster_path&&(!movieNight.exclude||!films.some(f=>Number(f.tmdbId)===Number(x.id))));if(!all.length)throw Error("NO TITLES MATCH THE FILTERS");const winner=all[Math.floor(Math.random()*all.length)];movieNight.result=winner;
let i=0;
const names=all.slice(0,12).map(titleOf);

if(track){
  track.innerHTML="";

  const spawnTitle=()=>{
    const span=document.createElement("span");
    span.textContent=names[i%names.length];
    i++;

const points = [
  // ВЕРХ
  [-210, -115],
  [-135, -135],
  [-55, -125],
  [30, -135],
  [115, -120],
  [190, -100],

  // ВЕРХНЯЯ СЕРЕДИНА
  [-235, -65],
  [-155, -55],
  [-75, -70],
  [10, -60],
  [95, -65],
  [180, -55],
  [225, -35],

  // ЦЕНТР
  [-220, -5],
  [-145, 0],
  [-70, 10],
  [0, -5],
  [75, 5],
  [150, 0],
  [215, 15],

  // НИЖНЯЯ СЕРЕДИНА
  [-220, 50],
  [-145, 60],
  [-70, 70],
  [10, 65],
  [85, 70],
  [160, 60],
  [220, 50],

  // НИЗ
  [-185, 105],
  [-110, 120],
  [-30, 130],
  [55, 125],
  [135, 115],
  [190, 95],

  // САМЫЙ НИЗ
  [-125, 145],
  [-45, 150],
  [40, 145],
  [115, 135]
];

if (!window.movieNightPointPool || window.movieNightPointPool.length === 0) {
  window.movieNightPointPool = [...points]
    .map(point => ({ point, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(item => item.point);
}

const point = window.movieNightPointPool.pop();

const jitterX = (Math.random() - 0.5) * 55;
const jitterY = (Math.random() - 0.5) * 40;

span.style.left = `calc(50% + ${point[0] + jitterX}px)`;
span.style.top = `calc(50% + ${point[1] + jitterY}px)`;
span.style.setProperty("--delay", `${Math.random() * 0.08}s`);

    track.appendChild(span);

    setTimeout(()=>span.remove(),1500);
  };

for(let n=0;n<8;n++){
  setTimeout(spawnTitle,n*170);
}

timer=setInterval(spawnTitle,300);
}
await new Promise(r=>setTimeout(r,2100));clearInterval(timer);timer=null;showMovieNightResult(winner);reveal?.classList.add("done");final?.classList.add("visible")}catch(e){clearInterval(timer);if(track)track.innerHTML=`<span class="error">${esc(e.message||"NO MATCH")}</span>`;reveal?.classList.add("done")}finally{movieNight.busy=false}}
function showMovieNightResult(f){const p=$("#movieNightPoster"),t=$("#movieNightTitle"),y=$("#movieNightYear"),r=$("#movieNightRating"),ty=$("#movieNightType"),sm=$("#movieNightSubmeta"),ov=$("#movieNightOverview"),st=$("#movieNightArchiveStatus");if(p){p.src=posterOf(f);p.alt=titleOf(f)}if(t)t.textContent=titleOf(f).toUpperCase();if(y)y.textContent=yearOf(f);if(r)r.textContent=`★ ${Number(f.vote_average||0).toFixed(1)}`;if(ty)ty.textContent=typeOf(f).toUpperCase();if(sm)sm.textContent=(f.origin_country||[]).map(c=>COUNTRIES[c]||c).join(" / ")||"TMDB";if(ov)ov.textContent=f.overview||"No description available.";if(st)st.textContent=films.some(x=>Number(x.tmdbId)===Number(f.id))?"ALREADY IN ARCHIVE":"FROM TMDB";updateMovieNightButtons()}
function updateMovieNightButtons(){const b=$("#movieNightAdd");if(!b||!movieNight.result)return;const inA=films.some(x=>Number(x.tmdbId)===Number(movieNight.result.id));b.textContent=inA?"IN ARCHIVE":"ADD TO ARCHIVE";b.disabled=inA}
function closeMovieNight(){const modal=$("#movieNightModal");modal?.classList.remove("active");modal?.setAttribute("aria-hidden","true");body.classList.remove("movie-night-modal-open");movieNight.result=null}
let ratingFilter="all",ratingSort="high";
function renderRatings(){const list=$("#ratingsList");if(!list)return;let data=ratings.filter(r=>ratingFilter==="all"||r.type===ratingFilter);data.sort((a,b)=>{const av=(Number(a.polina||0)+Number(a.nastya||0))/2,bv=(Number(b.polina||0)+Number(b.nastya||0))/2;if(ratingSort==="low")return av-bv;if(ratingSort==="recent")return new Date(b.date)-new Date(a.date);if(ratingSort==="oldest")return new Date(a.date)-new Date(b.date);return bv-av});list.innerHTML=data.length?data.map((r,i)=>{const avg=((Number(r.polina||0)+Number(r.nastya||0))/2).toFixed(1);return`<article class="rating-card">
  <span class="rating-number">${String(i+1).padStart(2,"0")}</span>

  <div>
    <h3 class="rating-title">${esc(r.title)}</h3>
  </div>

  <div class="rating-info">
    <span>${esc((r.type||"film").toUpperCase())}</span>
    <span>${esc(r.year)}</span>
    <span>${esc(r.date||"—")}</span>
  </div>

  <div class="rating-scores">
    <div class="rating-score">
      POLINA
      <strong>${Number(r.polina||0).toFixed(1)}</strong>
    </div>

    <div class="rating-score">
      NASTYA
      <strong>${Number(r.nastya||0).toFixed(1)}</strong>
    </div>
  </div>

  <div class="rating-average">
    AVG
    <strong>${avg}</strong>
  </div>

  <button class="rating-delete" type="button" data-rating-id="${r.id}" aria-label="Delete rating">
    ×
  </button>
</article>`}).join(""):`<div class="rating-empty">NO RATINGS YET.</div>`}
function initRatings(){
  $$(".rating-filter").forEach(b=>b.addEventListener("click",()=>{
    ratingFilter=b.dataset.ratingFilter||"all";
    $$(".rating-filter").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    renderRatings();
  }));

  $$(".sort-button").forEach(b=>b.addEventListener("click",()=>{
    ratingSort=b.dataset.sort||"high";
    $$(".sort-button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    renderRatings();
  }));

  const ratingsList=$("#ratingsList");

  ratingsList?.addEventListener("click",e=>{
    const button=e.target.closest(".rating-delete");
    if(!button)return;

    const id=Number(button.dataset.ratingId);

    ratings=ratings.filter(r=>Number(r.id)!==id);
    save(RATINGS_KEY,ratings);
    renderRatings();
  });

  renderRatings();
}
let authMode="login";
function authError(message){alert(message||"AUTHENTICATION FAILED")}
function ensureAuthEmailField(){const form=$("#authForm");if(!form)return null;let email=$("#authEmail");if(email)return email;const password=form.querySelector('input[type="password"]');email=document.createElement("input");email.type="email";email.id="authEmail";email.placeholder="email";email.autocomplete="email";email.required=true;form.insertBefore(email,password||null);return email}
async function getProfile(session){if(!session)return null;await supabaseReady;for(let attempt=0;attempt<4;attempt++){try{const{data,error}=await supabaseClient.from("profiles").select("nickname").eq("id",session.user.id).maybeSingle();if(error)throw error;return data}catch(e){if(attempt===3)throw e;await new Promise(r=>setTimeout(r,300*(attempt+1)))}}return null}
async function updateAuthButton(session){const b=$(".header-auth-button");if(!b)return;if(!session){b.textContent="LOG IN / REGISTER";localStorage.removeItem(USER_KEY);return}const immediateName=session.user.user_metadata?.nickname||session.user.email?.split("@")[0]||"CINEMA";b.textContent=immediateName.toUpperCase();localStorage.setItem(USER_KEY,JSON.stringify({name:immediateName,mode:"supabase"}));try{const profile=await getProfile(session);const name=profile?.nickname||immediateName;b.textContent=name.toUpperCase();localStorage.setItem(USER_KEY,JSON.stringify({name,mode:"supabase"}))}catch(e){console.warn("PROFILE LOAD DELAYED",e.message)}}
async function handleAuthButton(){try{await supabaseReady;const{data:{session}}=await supabaseClient.auth.getSession();if(session){await supabaseClient.auth.signOut();return}openAuth()}catch(e){authError(e.message)}}
function openAuth(){const m=$("#authModal");if(!m)return;m.classList.add("active");document.body.style.overflow="hidden";syncAuthForm()}
async function openAuthIfNeeded(){try{await supabaseReady;const{data:{session}}=await supabaseClient.auth.getSession();if(!session)openAuth()}catch(e){authError(e.message)}}
function closeAuth(){$("#authModal")?.classList.remove("active");document.body.style.overflow=""}
function syncAuthForm(){const name=$("#authName"),email=ensureAuthEmailField(),password=$("#authForm input[type='password']"),submit=$("#authForm button"),tabs=$$(".auth-tab");if(name){name.style.display=authMode==="register"?"block":"none";name.required=authMode==="register"}if(email){email.style.display="block";email.required=true}if(password){password.id="authPassword";password.autocomplete=authMode==="register"?"new-password":"current-password"}if(submit)submit.textContent=authMode==="register"?"CREATE ACCOUNT ↗":"ENTER ↗";tabs.forEach(t=>t.classList.toggle("active",t.dataset.auth===authMode))}
async function submitAuth(){const form=$("#authForm"),name=$("#authName")?.value.trim()||"",email=$("#authEmail")?.value.trim()||"",password=$("#authPassword")?.value||"";if(!email||!password||(authMode==="register"&&!name)){authError("PLEASE FILL IN ALL FIELDS");return}try{await supabaseReady;if(authMode==="register"){const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{nickname:name}}});if(error)throw error;if(data.session){closeAuth();await updateAuthButton(data.session)}else{closeAuth();alert("ACCOUNT CREATED. CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT.")}}else{const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;closeAuth();await updateAuthButton(data.session)}}catch(e){authError(e.message)}}
async function initAuth(){try{await supabaseReady;ensureAuthEmailField();$("#authClose")?.addEventListener("click",closeAuth);$("#authModal")?.addEventListener("click",e=>{if(e.target.id==="authModal")closeAuth()});$$('.auth-tab').forEach(t=>t.addEventListener("click",()=>{authMode=t.dataset.auth||"login";syncAuthForm()}));$("#authForm")?.addEventListener("submit",e=>{e.preventDefault();submitAuth()});syncAuthForm();supabaseClient.auth.onAuthStateChange((_event,session)=>{updateAuthButton(session)});const{data:{session}}=await supabaseClient.auth.getSession();await updateAuthButton(session)}catch(e){console.error(e);authError("SUPABASE AUTH COULD NOT BE INITIALIZED")}}
function init(){initCursor();initIndex();initHeaderAuth();initSearch();initArchive();initCarousel();initMovieNight();/* Ratings are rendered by Supabase. */initAuth();enrichArchivePosters()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
