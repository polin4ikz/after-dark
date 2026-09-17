(()=>{
  const state={filter:"all",sort:"high",rows:[],session:null};
  let modal=null;

  const esc=v=>String(v??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[m]));
  const titleOf=x=>x?.title||x?.name||"UNTITLED";
  const yearOf=x=>(x?.release_date||x?.first_air_date||"").slice(0,4)||"—";

  function addStyles(){
    const style=document.createElement("style");
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
    `;
    document.head.appendChild(style);
  }

  function ensureModal(){
    if(modal)return modal;
    modal=document.createElement("div");
    modal.className="supabase-rating-modal";
    modal.innerHTML=`<div class="supabase-rating-box">
      <button class="supabase-rating-close" type="button">CLOSE ×</button>
      <span class="supabase-rating-label">PRIVATE RATING</span>
      <h3 class="supabase-rating-title"></h3>
      <p class="supabase-rating-current"></p>
      <input class="supabase-rating-input" type="number" min="0" max="10" step="0.5" inputmode="decimal" placeholder="0.0">
      <button class="supabase-rating-save" type="button">SAVE RATING ↗</button>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector(".supabase-rating-close").addEventListener("click",closeModal);
    modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
    modal.querySelector(".supabase-rating-save").addEventListener("click",saveRating);
    return modal;
  }

  function closeModal(){modal?.classList.remove("active");document.body.style.overflow=""}

  async function currentSession(){
    await supabaseReady;
    const{data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    return data.session||null;
  }

  async function openRating(id){
    try{
      const session=await currentSession();
      if(!session){openAuth();return}
      state.session=session;
      const film=films.find(x=>Number(x.tmdbId)===Number(id));
      if(!film)return;
      const{data,error}=await supabaseClient.from("ratings").select("rating").eq("tmdb_id",Number(id)).eq("user_id",session.user.id).maybeSingle();
      if(error)throw error;
      const m=ensureModal();
      m.dataset.tmdbId=String(id);
      m.querySelector(".supabase-rating-title").textContent=titleOf(film).toUpperCase();
      m.querySelector(".supabase-rating-current").textContent=data?`YOUR CURRENT RATING · ${Number(data.rating).toFixed(1)}`:"YOUR RATING · 0 — 10";
      m.querySelector(".supabase-rating-input").value=data?Number(data.rating):"";
      m.querySelector(".supabase-rating-save").disabled=false;
      m.classList.add("active");
      document.body.style.overflow="hidden";
      setTimeout(()=>m.querySelector(".supabase-rating-input")?.focus(),50);
    }catch(e){console.error("RATING OPEN FAILED",e);authError(e.message)}
  }

  async function saveRating(){
    const m=ensureModal(),id=Number(m.dataset.tmdbId),input=m.querySelector(".supabase-rating-input"),button=m.querySelector(".supabase-rating-save");
    const value=Number(input.value);
    if(!Number.isFinite(value)||value<0||value>10||Math.round(value*2)!==value*2){input.focus();return}
    try{
      button.disabled=true;
      const session=state.session||await currentSession();
      if(!session){closeModal();openAuth();return}
      const{error}=await supabaseClient.from("ratings").upsert({tmdb_id:id,user_id:session.user.id,rating:value,updated_at:new Date().toISOString()},{onConflict:"tmdb_id,user_id"});
      if(error)throw error;
      closeModal();
      await loadRatings();
    }catch(e){
      console.error("RATING SAVE FAILED",e);
      alert(`RATING COULD NOT BE SAVED: ${e.message}`);
    }finally{button.disabled=false}
  }

  async function deleteMyRating(id){
    try{
      const session=state.session||await currentSession();
      if(!session){openAuth();return}
      const{error}=await supabaseClient.from("ratings").delete().eq("tmdb_id",Number(id)).eq("user_id",session.user.id);
      if(error)throw error;
      await loadRatings();
    }catch(e){console.error("RATING DELETE FAILED",e);alert(`RATING COULD NOT BE DELETED: ${e.message}`)}
  }

  function personKey(name){return String(name||"").trim().toLowerCase()}

  function render(){
    const list=document.querySelector("#ratingsList");
    if(!list)return;
    let data=state.rows.filter(r=>state.filter==="all"||r.film.type===state.filter);
    data.sort((a,b)=>{
      if(state.sort==="recent")return new Date(b.latest||0)-new Date(a.latest||0);
      if(state.sort==="oldest")return new Date(a.latest||0)-new Date(b.latest||0);
      const av=a.average??-1,bv=b.average??-1;
      return state.sort==="low"?av-bv:bv-av;
    });
    list.innerHTML=data.length?data.map((r,i)=>{
      const polina=r.byPolina?.rating,nastya=r.byNastya?.rating,avg=r.average==null?"—":r.average.toFixed(1),own=r.byUser||null;
      return `<article class="rating-card">
        <span class="rating-number">${String(i+1).padStart(2,"0")}</span>
        <div><h3 class="rating-title">${esc(titleOf(r.film))}</h3></div>
        <div class="rating-info"><span>${esc((r.film.type||"film").toUpperCase())}</span><span>${esc(yearOf(r.film))}</span><span>${esc((r.latest||"").slice(0,10)||"—")}</span></div>
        <div class="rating-scores"><div class="rating-score">POLINA<strong>${polina==null?"—":Number(polina).toFixed(1)}</strong></div><div class="rating-score">NASTYA<strong>${nastya==null?"—":Number(nastya).toFixed(1)}</strong></div></div>
        <div class="rating-average">AVG<strong>${avg}</strong></div>
        ${own?`<button class="rating-delete" type="button" data-rating-id="${esc(r.film.tmdb_id)}" aria-label="Remove my rating">×</button>`:""}
      </article>`;
    }).join(""):"<div class=\"rating-empty\">NO RATINGS YET.</div>";
  }

  async function loadRatings(){
    try{
      await supabaseReady;
      const session=state.session||await currentSession();
      state.session=session;
      if(!session){state.rows=[];render();return}
      const{data:filmsData,error:filmsError}=await supabaseClient.from("archive").select("tmdb_id,title,name,release_date,first_air_date,type").order("created_at",{ascending:false});
      if(filmsError)throw filmsError;
      const{data:ratingData,error:ratingError}=await supabaseClient.from("ratings").select("tmdb_id,user_id,rating,created_at,updated_at").order("updated_at",{ascending:false});
      if(ratingError)throw ratingError;
      const{data:profiles,error:profileError}=await supabaseClient.from("profiles").select("id,nickname");
      if(profileError)throw profileError;
      const names=new Map((profiles||[]).map(p=>[p.id,p.nickname]));
      const grouped=new Map();
      (ratingData||[]).forEach(row=>{
        const film=(filmsData||[]).find(f=>Number(f.tmdb_id)===Number(row.tmdb_id));
        if(!film)return;
        if(!grouped.has(row.tmdb_id))grouped.set(row.tmdb_id,{film,items:[]});
        grouped.get(row.tmdb_id).items.push({...row,nickname:names.get(row.user_id)||"USER"});
      });
      state.rows=[...grouped.values()].map(g=>{
        const byPolina=g.items.find(x=>personKey(x.nickname)==="polina");
        const byNastya=g.items.find(x=>personKey(x.nickname)==="nastya");
        const byUser=state.session?g.items.find(x=>x.user_id===state.session.user.id):null;
        const values=g.items.map(x=>Number(x.rating)).filter(Number.isFinite);
        const latest=g.items.reduce((max,x)=>x.updated_at>max?x.updated_at:max,"");
        return{...g,byPolina,byNastya,byUser,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,latest};
      });
      render();
    }catch(e){
      console.error("RATINGS LOAD FAILED",e);
      const list=document.querySelector("#ratingsList");
      if(list)list.innerHTML='<div class="rating-empty">RATINGS CONNECTION FAILED.</div>';
    }
  }

  function intercept(){
    document.addEventListener("click",async e=>{
      const rate=e.target.closest("#archiveTrack [data-action='rate']");
      if(rate){e.preventDefault();e.stopImmediatePropagation();await openRating(Number(rate.dataset.id));return}
      const del=e.target.closest("#ratingsList .rating-delete");
      if(del){e.preventDefault();e.stopImmediatePropagation();await deleteMyRating(Number(del.dataset.ratingId));return}
      const filter=e.target.closest("#ratings .rating-filter");
      if(filter){e.preventDefault();e.stopImmediatePropagation();state.filter=filter.dataset.ratingFilter||"all";document.querySelectorAll("#ratings .rating-filter").forEach(x=>x.classList.remove("active"));filter.classList.add("active");render();return}
      const sort=e.target.closest("#ratings .sort-button");
      if(sort){e.preventDefault();e.stopImmediatePropagation();state.sort=sort.dataset.sort||"high";document.querySelectorAll("#ratings .sort-button").forEach(x=>x.classList.remove("active"));sort.classList.add("active");render()}
    },true);
  }

  async function init(){
    addStyles();
    intercept();
    try{
      await supabaseReady;
      supabaseClient.auth.onAuthStateChange((_event,session)=>{state.session=session||null;loadRatings()});
      await loadRatings();
    }catch(e){console.error("SUPABASE RATINGS INIT FAILED",e)}
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();