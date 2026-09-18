(()=>{

  function initFilmDetail(){
    const track=document.querySelector("#archiveTrack");
    if(!track || document.querySelector("#afterDarkFilmDetail")) return;

    const modal=document.createElement("div");
    modal.id="afterDarkFilmDetail";
    modal.className="ad-film-detail";
    modal.innerHTML=\`
      <div class="ad-film-detail-backdrop"></div>
      <div class="ad-film-detail-window" role="dialog" aria-modal="true" aria-label="Film details">
        <button class="ad-film-detail-close" type="button" aria-label="Close">CLOSE ×</button>
        <div class="ad-film-detail-grid">
          <div class="ad-film-detail-poster">
            <img class="ad-film-detail-image" src="" alt="">
            <span class="ad-film-detail-file">FILE / 001</span>
          </div>
          <div class="ad-film-detail-content">
            <div class="ad-film-detail-kicker">ARCHIVE FILE</div>
            <div class="ad-film-detail-number">001</div>
            <div class="ad-film-detail-meta"></div>
            <h2 class="ad-film-detail-title"></h2>
            <p class="ad-film-detail-original"></p>
            <p class="ad-film-detail-overview"></p>
            <div class="ad-film-detail-extra"></div>
          </div>
        </div>
      </div>\`;

    document.body.appendChild(modal);

    const style=document.createElement("style");
    style.textContent=\`
      .ad-film-detail{
        position:fixed;
        inset:0;
        z-index:10000;
        display:none;
        align-items:center;
        justify-content:center;
        padding:40px;
      }
      .ad-film-detail.active{display:flex}
      .ad-film-detail-backdrop{
        position:absolute;
        inset:0;
        background:rgba(18,10,13,.82);
        backdrop-filter:blur(10px);
      }
      .ad-film-detail-window{
        position:relative;
        z-index:1;
        width:min(980px,92vw);
        max-height:88vh;
        overflow:auto;
        background:#eee7dc;
        color:#171214;
        border:1px solid rgba(23,18,20,.18);
        box-shadow:0 30px 90px rgba(0,0,0,.35);
      }
      .ad-film-detail-close{
        position:absolute;
        z-index:3;
        top:18px;
        right:20px;
        border:0;
        background:transparent;
        color:inherit;
        font:500 10px/1 "Geist Mono",monospace;
        letter-spacing:.1em;
        cursor:pointer;
      }
      .ad-film-detail-grid{
        display:grid;
        grid-template-columns:minmax(250px,38%) 1fr;
        min-height:560px;
      }
      .ad-film-detail-poster{
        position:relative;
        min-height:560px;
        background:#171214;
        overflow:hidden;
      }
      .ad-film-detail-image{
        width:100%;
        height:100%;
        min-height:560px;
        object-fit:cover;
        display:block;
      }
      .ad-film-detail-file{
        position:absolute;
        left:20px;
        bottom:18px;
        color:#eee7dc;
        font:500 9px/1 "Geist Mono",monospace;
        letter-spacing:.12em;
      }
      .ad-film-detail-content{
        padding:58px 54px 48px;
        display:flex;
        flex-direction:column;
        justify-content:center;
      }
      .ad-film-detail-kicker{
        font:500 9px/1 "Geist Mono",monospace;
        letter-spacing:.14em;
        opacity:.5;
      }
      .ad-film-detail-number{
        margin:12px 0 26px;
        font:400 13px/1 "Geist Mono",monospace;
        opacity:.5;
      }
      .ad-film-detail-meta{
        display:flex;
        flex-wrap:wrap;
        gap:10px;
        margin-bottom:14px;
        font:500 9px/1.4 "Geist Mono",monospace;
        letter-spacing:.1em;
        text-transform:uppercase;
        opacity:.62;
      }
      .ad-film-detail-title{
        max-width:680px;
        margin:0;
        font:500 clamp(38px,5vw,68px)/.9 "Bricolage Grotesque",sans-serif;
        letter-spacing:-.055em;
        text-transform:uppercase;
      }
      .ad-film-detail-original{
        margin:14px 0 28px;
        font:400 18px/1.1 "Instrument Serif",serif;
        opacity:.62;
      }
      .ad-film-detail-overview{
        max-width:680px;
        margin:0;
        font:400 15px/1.65 "Bricolage Grotesque",sans-serif;
        letter-spacing:-.01em;
      }
      .ad-film-detail-extra{
        display:flex;
        flex-wrap:wrap;
        gap:22px;
        margin-top:30px;
        padding-top:18px;
        border-top:1px solid rgba(23,18,20,.18);
        font:500 9px/1.5 "Geist Mono",monospace;
        letter-spacing:.08em;
        text-transform:uppercase;
        opacity:.62;
      }
      .ad-film-detail-window.is-loading .ad-film-detail-content{opacity:.5}
      @media(max-width:760px){
        .ad-film-detail{padding:16px}
        .ad-film-detail-grid{grid-template-columns:1fr}
        .ad-film-detail-poster,.ad-film-detail-image{min-height:300px;height:300px}
        .ad-film-detail-content{padding:32px 26px}
      }
    \`;
    document.head.appendChild(style);

    const close=()=>{modal.classList.remove("active");document.body.style.overflow=""};
    modal.querySelector(".ad-film-detail-close").addEventListener("click",close);
    modal.querySelector(".ad-film-detail-backdrop").addEventListener("click",close);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&modal.classList.contains("active"))close()});

    document.addEventListener("click",async e=>{
      const card=e.target.closest("#archiveTrack .archive-card");
      if(!card) return;

      if(e.target.closest("[data-action]") || e.target.closest("button,a")) return;

      const id=Number(card.dataset.id);
      const film=films.find(x=>Number(x.tmdbId)===id);
      if(!film) return;

      e.preventDefault();
      e.stopPropagation();

      const image=modal.querySelector(".ad-film-detail-image");
      const file=modal.querySelector(".ad-film-detail-file");
      const number=modal.querySelector(".ad-film-detail-number");
      const meta=modal.querySelector(".ad-film-detail-meta");
      const title=modal.querySelector(".ad-film-detail-title");
      const original=modal.querySelector(".ad-film-detail-original");
      const overview=modal.querySelector(".ad-film-detail-overview");
      const extra=modal.querySelector(".ad-film-detail-extra");

      const index=films.findIndex(x=>Number(x.tmdbId)===id)+1;
      const baseTitle=titleOf(film);

      image.src=posterOf(film)||"";
      image.alt=baseTitle;
      file.textContent=\`FILE / \${String(Math.max(1,index)).padStart(3,"0")}\`;
      number.textContent=String(Math.max(1,index)).padStart(3,"0");
      meta.textContent=\`\${(film.type||"film").toUpperCase()}  ·  \${yearOf(film)}  ·  ★ \${Number(film.vote_average||0).toFixed(1)}\`;
      title.textContent=baseTitle.toUpperCase();
      original.textContent="";
      overview.textContent="LOADING DESCRIPTION…";
      extra.textContent="";

      modal.classList.add("active","is-loading");
      document.body.style.overflow="hidden";

      try{
        const endpoint=film.type==="series"?\`/tv/\${id}\`:\`/movie/\${id}\`;
        const creditsEndpoint=film.type==="series"?\`/tv/\${id}/credits\`:\`/movie/\${id}/credits\`;
        const [details,credits]=await Promise.all([
          tmdb(endpoint,{language:"ru-RU"}),
          tmdb(creditsEndpoint,{language:"ru-RU"})
        ]);

        original.textContent=details.original_title||details.original_name||"";
        overview.textContent=details.overview||"DESCRIPTION IS NOT AVAILABLE.";

        const people=film.type==="series"
          ? (details.created_by||[]).slice(0,2).map(x=>x.name)
          : (credits.crew||[]).filter(x=>x.job==="Director").slice(0,2).map(x=>x.name);

        const countries=(details.production_countries||[]).map(x=>x.iso_3166_1||"").filter(Boolean);
        const genres=(details.genres||[]).slice(0,4).map(x=>x.name).filter(Boolean);

        extra.innerHTML=[
          people.length?\`<span>\${esc(film.type==="series"?"CREATED BY":"DIRECTED BY")} · \${esc(people.join(" / "))}</span>\`:"",
          genres.length?\`<span>\${esc(genres.join(" / "))}</span>\`:"",
          countries.length?\`<span>\${esc(countries.join(" / "))}</span>\`:""
        ].join("");

        if(details.poster_path && !film.poster_path){
          film.poster_path=details.poster_path;
          film.backdrop_path=details.backdrop_path||film.backdrop_path;
          save(ARCHIVE_KEY,films);
        }
      }catch(error){
        console.error("FILM DETAIL LOAD FAILED",error);
        overview.textContent="DESCRIPTION COULD NOT BE LOADED.";
      }finally{
        modal.classList.remove("is-loading");
      }
    },true);;
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initFilmDetail);
  else initFilmDetail();

})();