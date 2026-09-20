(()=>{
  const state={filter:"all",rows:[],session:null};
  let modal=null;
  const esc=v=>String(v??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[m]));
  const titleOf=x=>x?.title||x?.name||"UNTITLED";
  const yearOf=x=>(x?.release_date||x?.first_air_date||"").slice(0,4)||"—";

  function addStyles(){
    if(document.querySelector("#supabaseRatingsStyles"))return;
    const style=document.createElement("style");style.id="supabaseRatingsStyles";
    style.textContent=`
      .supabase-rating-modal{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,7,9,.74);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .22s ease}
      .supabase-rating-modal.active{opacity:1;pointer-events:auto}
      .supabase-rating-box{position:relative;width:min(440px,calc(100vw - 40px));padding:34px;background:#f1ece5;color:#171214;box-shadow:0 24px 80px rgba(0,0,0,.35)}
      .supabase-rating-close{position:absolute;right:28px;top:28px;border:0;background:transparent;color:inherit;font:500 10px/1 "Geist Mono",monospace;letter-spacing:.1em;cursor:pointer}
      .supabase-rating-label{display:block;margin-bottom:18px;font:500 9px/1 "Geist Mono",monospace;letter-spacing:.14em;opacity:.48}
      .supabase-rating-title{margin:0 40px 28px 0;font:400 34px/1 "Bricolage Grotesque",sans-serif;letter-spacing:-.04em;text-transform:uppercase}
      .supabase-rating-current{margin:0 0 18px;font:500 10px/1.5 "Geist Mono",monospace;letter-spacing:.1em;opacity:.55;text-transform:uppercase}
      .supabase-rating-input{width:100%;height:52px;padding:0 14px;border:1px solid rgba(23,18,20,.25);background:transparent;color:inherit;outline:none;font:500 18px/1 "Geist Mono",monospace}
      .supabase-rating-input:focus{border-color:#171214}
      .supabase-rating-save{width:100%;margin-top:18px;border:0;background:#171214;color:#f1ece5;height:48px;font:500 10px/1 "Geist Mono",monospace;letter-spacing:.13em;cursor:pointer}
      .supabase-rating-save:disabled{opacity:.45;cursor:wait}
      .ratings-list .rating-delete{cursor:pointer}
      .ratings-list .rating-scores{display:grid!important;grid-template-columns:repeat(var(--rating-people,1),minmax(72px,1fr))!important;gap:18px!important;min-width:0}
      .ratings-list .rating-score{display:flex!important;flex-direction:column!important;min-width:0!important;visibility:visible!important;opacity:1!important}
      .ratings-list .rating-score strong{display:block!important}
    `;
    
      #ratings .ratings-controls{display:flex!important;align-items:center!important;justify-content:flex-start!important;margin-bottom:34px!important}
      #ratings .rating-filters{display:flex!important;gap:0!important;border:1px solid rgba(23,18,20,.18)!important}
      #ratings .rating-filter{margin:0!important;padding:11px 16px!important;border:0!important;border-right:1px solid rgba(23,18,20,.14)!important;background:transparent!important;color:rgba(23,18,20,.52)!important;font:500 8px/1 "Geist Mono",monospace!important;letter-spacing:.12em!important;cursor:pointer!important}
      #ratings .rating-filter:last-child{border-right:0!important}
      #ratings .rating-filter.active{background:#171214!important;color:#f1ece5!important}
      #ratings .ratings-list{width:100%!important;display:block!important;border-top:1px solid rgba(23,18,20,.28)!important}
      #ratingsList .rating-card{position:relative!important;display:grid!important;grid-template-columns:34px 72px minmax(0,1fr) auto!important;align-items:center!important;gap:20px!important;min-height:126px!important;margin:0!important;padding:14px 42px 14px 0!important;border:0!important;border-bottom:1px solid rgba(23,18,20,.16)!important;background:transparent!important;cursor:pointer!important;transition:transform .25s ease,background .25s ease!important}
      #ratingsList .rating-card:hover{transform:translateX(8px)!important;background:rgba(23,18,20,.025)!important}
      #ratingsList .rating-number{align-self:start!important;padding-top:5px!important;font:500 8px/1 "Geist Mono",monospace!important;letter-spacing:.08em!important;color:rgba(145,23,40,.72)!important}
      #ratingsList .rating-poster{width:72px!important;height:96px!important;overflow:hidden!important;background:rgba(23,18,20,.08)!important}
      #ratingsList .rating-poster img{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;transition:transform .35s ease!important}
      #ratingsList .rating-card:hover .rating-poster img{transform:scale(1.06)!important}
      #ratingsList .rating-main{min-width:0!important;align-self:center!important}
      #ratingsList .rating-title{margin:0!important;font:500 clamp(22px,2.4vw,34px)/.96 "Bricolage Grotesque",sans-serif!important;letter-spacing:-.035em!important;text-transform:uppercase!important;color:#171214!important}
      #ratingsList .rating-info{display:flex!important;gap:12px!important;margin-top:9px!important;color:rgba(23,18,20,.5)!important;font:500 8px/1 "Geist Mono",monospace!important;letter-spacing:.12em!important}
      #ratingsList .rating-info span+span:before{content:"·";margin-right:12px;color:rgba(23,18,20,.25)!important}
      #ratingsList .rating-average{display:flex!important;align-items:baseline!important;gap:6px!important;min-width:112px!important;justify-content:flex-end!important;color:#171214!important}
      #ratingsList .rating-average strong{font:400 clamp(30px,3.4vw,52px)/.85 "Instrument Serif",Georgia,serif!important;letter-spacing:-.04em!important}
      #ratingsList .rating-average span{font:500 9px/1 "Geist Mono",monospace!important;letter-spacing:.08em!important;color:rgba(23,18,20,.46)!important}
      #ratingsList .rating-open-file{position:absolute!important;right:4px!important;bottom:15px!important;opacity:0!important;transform:translateX(5px)!important;color:#911728!important;font:500 7px/1 "Geist Mono",monospace!important;letter-spacing:.12em!important;transition:opacity .2s ease,transform .2s ease!important;pointer-events:none!important}
      #ratingsList .rating-card:hover .rating-open-file{opacity:1!important;transform:translateX(0)!important}
      #ratingsList .rating-delete{position:absolute!important;right:0!important;top:14px!important;width:20px!important;height:20px!important;padding:0!important;border:0!important;background:transparent!important;color:rgba(23,18,20,.38)!important;font:500 14px/20px "Geist Mono",monospace!important;z-index:3!important;cursor:pointer!important}
      #ratingsList .rating-delete:hover{color:#911728!important}
      #ratingsList .rating-scores{display:none!important}
      #ratingsList .rating-empty{padding:60px 0!important;border-bottom:1px solid rgba(23,18,20,.16)!important;color:rgba(23,18,20,.48)!important;font:500 9px/1 "Geist Mono",monospace!important;letter-spacing:.12em!important}
document.head.appendChild(style);
  }

  function ensureModal(){
    if(modal)return modal;
    modal=document.createElement("div");
    modal.className="supabase-rating-modal";
    modal.innerHTML=`<div class="supabase-rating-box"><button class="supabase-rating-close" type="button">CLOSE ×</button><span class="supabase-rating-label">PRIVATE RATING</span><h3 class="supabase-rating-title"></h3><p class="supabase-rating-current"></p><input class="supabase-rating-input" type="number" min="0" max="10" step="0.5" inputmode="decimal" placeholder="0.0"><button class="supabase-rating-save" type="button">SAVE RATING ↗</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector(".supabase-rating-close").addEventListener("click",closeModal);
    modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
    modal.querySelector(".supabase-rating-save").addEventListener("click",saveRating);
    return modal;
  }
  function closeModal(){modal?.classList.remove("active");document.body.style.overflow=""}
  async function currentSession(){await supabaseReady;const{data,error}=await supabaseClient.auth.getSession();if(error)throw error;return data.session||null}
  async function openRating(id){try{const session=await currentSession();if(!session){openAuth();return}state.session=session;const film=films.find(x=>Number(x.tmdbId)===Number(id));if(!film)return;const{data,error}=await supabaseClient.from("ratings").select("rating").eq("tmdb_id",Number(id)).eq("user_id",session.user.id).maybeSingle();if(error)throw error;const m=ensureModal();m.dataset.tmdbId=String(id);m.querySelector(".supabase-rating-title").textContent=titleOf(film).toUpperCase();m.querySelector(".supabase-rating-current").textContent=data?`YOUR CURRENT RATING · ${Number(data.rating).toFixed(1)}`:"YOUR RATING · 0 — 10";m.querySelector(".supabase-rating-input").value=data?Number(data.rating):"";m.querySelector(".supabase-rating-save").disabled=false;m.classList.add("active");document.body.style.overflow="hidden";setTimeout(()=>m.querySelector(".supabase-rating-input")?.focus(),50)}catch(e){console.error("RATING OPEN FAILED",e);authError(e.message)}}
  async function saveRating(){const m=ensureModal(),id=Number(m.dataset.tmdbId),input=m.querySelector(".supabase-rating-input"),button=m.querySelector(".supabase-rating-save"),value=Number(input.value);if(!Number.isFinite(value)||value<0||value>10||Math.round(value*2)!==value*2){input.focus();return}try{button.disabled=true;const session=state.session||await currentSession();if(!session){closeModal();openAuth();return}const{error}=await supabaseClient.from("ratings").upsert({tmdb_id:id,user_id:session.user.id,rating:value,updated_at:new Date().toISOString()},{onConflict:"tmdb_id,user_id"});if(error)throw error;closeModal();await loadRatings()}catch(e){console.error("RATING SAVE FAILED",e);alert(`RATING COULD NOT BE SAVED: ${e.message}`)}finally{button.disabled=false}}
  window.openSupabaseRating=openRating;
  async function deleteMyRating(id){try{const session=state.session||await currentSession();if(!session){openAuth();return}const{error}=await supabaseClient.from("ratings").delete().eq("tmdb_id",Number(id)).eq("user_id",session.user.id);if(error)throw error;await loadRatings()}catch(e){console.error("RATING DELETE FAILED",e);alert(`RATING COULD NOT BE DELETED: ${e.message}`)}}
  function render(){
    const list=document.querySelector("#ratingsList");if(!list)return;
    let data=state.rows.filter(r=>state.filter==="all"||r.film.type===state.filter);
    list.innerHTML=data.length?data.map((r,i)=>{
      const avg=r.average==null?"—":r.average.toFixed(1);
      return \`<article class="rating-card" data-tmdb-id="\${esc(r.film.tmdb_id)}"><span class="rating-number">\${String(i+1).padStart(2,"0")}</span><div class="rating-poster">\${r.film.poster_path?\`<img src="https://image.tmdb.org/t/p/w342\${esc(r.film.poster_path)}" alt="" loading="lazy">\`:""}</div><div class="rating-main"><h3 class="rating-title">\${esc(titleOf(r.film))}</h3><div class="rating-info"><span>\${esc((r.film.type||"film").toUpperCase())}</span><span>\${esc(yearOf(r.film))}</span></div></div><div class="rating-average"><strong>\${avg}</strong><span>/ 10</span></div>\${r.byUser?\`<button class="rating-delete" type="button" data-rating-id="\${esc(r.film.tmdb_id)}" aria-label="Remove my rating">×</button>\`:""}<span class="rating-open-file">OPEN FILE ↗</span></article>\`}).join(""):'<div class="rating-empty">NO RATINGS YET.</div>';
  }

  async function loadRatings(){
    try{
      await supabaseReady;
      const session=state.session||await currentSession();state.session=session;
      if(!session){state.rows=[];render();return}
      const filmsRes=await supabaseClient.from("archive").select("tmdb_id,title,name,poster_path,release_date,first_air_date,type,created_at").order("created_at",{ascending:false});
      if(filmsRes.error)throw filmsRes.error;
      const ratingsRes=await supabaseClient.from("ratings").select("tmdb_id,user_id,rating,created_at,updated_at").order("updated_at",{ascending:false});
      if(ratingsRes.error)throw ratingsRes.error;
      const filmMap=new Map((filmsRes.data||[]).map(f=>[Number(f.tmdb_id),f])),grouped=new Map();
      (ratingsRes.data||[]).forEach(row=>{const film=filmMap.get(Number(row.tmdb_id));if(!film)return;if(!grouped.has(Number(row.tmdb_id)))grouped.set(Number(row.tmdb_id),{film,items:[]});grouped.get(Number(row.tmdb_id)).items.push(row)});
      state.rows=[...grouped.values()].map(g=>{const values=g.items.map(x=>Number(x.rating)).filter(Number.isFinite);const latest=g.items.reduce((max,x)=>x.updated_at>max?x.updated_at:max,"");return{...g,byUser:g.items.find(x=>x.user_id===session.user.id),average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,latest}});
      render();
    }catch(e){
      console.error("RATINGS LOAD FAILED",e);
      const list=document.querySelector("#ratingsList");if(list)list.innerHTML='<div class="rating-empty">RATINGS CONNECTION FAILED</div>';
    }
  }

  function intercept(){document.addEventListener("click",async e=>{const rate=e.target.closest("#archiveTrack [data-action='rate']");if(rate){e.preventDefault();e.stopImmediatePropagation();await openRating(Number(rate.dataset.id));return}const del=e.target.closest("#ratingsList .rating-delete");if(del){e.preventDefault();e.stopImmediatePropagation();await deleteMyRating(Number(del.dataset.ratingId));return}const row=e.target.closest("#ratingsList .rating-card");if(row&&!e.target.closest(".rating-delete")){e.preventDefault();e.stopImmediatePropagation();window.openFilmCard?.(Number(row.dataset.tmdbId));return}const filter=e.target.closest("#ratings .rating-filter");if(filter){e.preventDefault();e.stopImmediatePropagation();state.filter=filter.dataset.ratingFilter||"all";document.querySelectorAll("#ratings .rating-filter").forEach(x=>x.classList.remove("active"));filter.classList.add("active");render();return},true)}
  async function init(){addStyles();intercept();try{await supabaseReady;supabaseClient.auth.onAuthStateChange((_event,session)=>{state.session=session||null;loadRatings()});await loadRatings()}catch(e){console.error("SUPABASE RATINGS INIT FAILED",e)}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();