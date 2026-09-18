(()=>{
  let sortMode="high",filterMode="all",session=null;
  const esc=v=>String(v??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[m]));
  const titleOf=x=>x?.title||x?.name||"UNTITLED";
  const yearOf=x=>(x?.release_date||x?.first_air_date||"").slice(0,4)||"—";
  async function getSession(){await supabaseReady;const{data,error}=await supabaseClient.auth.getSession();if(error)throw error;return data.session||null}
  async function ensureProfile(s){
    if(!s?.user?.id)return;
    const{data,error}=await supabaseClient.from("profiles").select("id,nickname").eq("id",s.user.id).maybeSingle();
    if(error)throw error;
    if(data?.nickname?.trim())return data;
    const nickname=String(s.user.user_metadata?.nickname||s.user.email?.split("@")[0]||"USER").trim();
    const{data:created,error:createError}=await supabaseClient.from("profiles").upsert({id:s.user.id,nickname},{onConflict:"id"}).select("id,nickname").single();
    if(createError)throw createError;
    return created;
  }
  async function syncHeader(){try{session=await getSession();if(session)await ensureProfile(session);await updateAuthButton(session)}catch(e){console.error("AUTH SESSION SYNC FAILED",e)}}
  function installAuthFallback(){
    const form=document.querySelector("#authForm");if(!form)return;
    form.addEventListener("submit",async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const name=document.querySelector("#authName")?.value.trim()||"",email=document.querySelector("#authEmail")?.value.trim()||"",password=document.querySelector("#authPassword")?.value||"",mode=document.querySelector(".auth-tab.active")?.dataset.auth||"login";
      if(!email||!password||(mode==="register"&&!name)){authError("PLEASE FILL IN ALL FIELDS");return}
      try{
        await supabaseReady;
        if(mode==="register"){
          const{data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{nickname:name}}});if(error)throw error;
          if(data.session){await ensureProfile(data.session);closeAuth();await updateAuthButton(data.session)}else{closeAuth();alert("ACCOUNT CREATED.")}
        }else{
          const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;
          session=data.session||null;await ensureProfile(session);closeAuth();await updateAuthButton(session);
        }
      }catch(error){console.error("AUTH LOGIN FAILED",error);authError(error.message||"AUTHENTICATION FAILED")}
    },true);
  }
  async function renderSupabaseRatings(){
    const list=document.querySelector("#ratingsList");if(!list)return;
    try{
      session=await getSession();if(!session){list.innerHTML='<div class="rating-empty">LOG IN TO VIEW RATINGS.</div>';return}
      await ensureProfile(session);
      const[{data:filmsData,error:filmsError},{data:ratingData,error:ratingError},{data:profiles,error:profilesError}]=await Promise.all([
        supabaseClient.from("archive").select("tmdb_id,title,name,release_date,first_air_date,type,created_at").order("created_at",{ascending:false}),
        supabaseClient.from("ratings").select("tmdb_id,user_id,rating,created_at,updated_at").order("updated_at",{ascending:false}),
        supabaseClient.from("profiles").select("id,nickname").order("nickname",{ascending:true})
      ]);
      if(filmsError)throw filmsError;if(ratingError)throw ratingError;if(profilesError)throw profilesError;
      const people=(profiles||[]).filter(p=>p?.id&&String(p.nickname||"").trim());
      if(!people.length)throw new Error("NO PROFILES FOUND IN public.profiles");
      const filmMap=new Map((filmsData||[]).map(f=>[Number(f.tmdb_id),f])),grouped=new Map();
      (ratingData||[]).forEach(row=>{const film=filmMap.get(Number(row.tmdb_id));if(!film)return;if(!grouped.has(Number(row.tmdb_id)))grouped.set(Number(row.tmdb_id),{film,items:[]});grouped.get(Number(row.tmdb_id)).items.push(row)});
      let rows=[...grouped.values()].map(group=>{const values=group.items.map(x=>Number(x.rating)).filter(Number.isFinite);const latest=group.items.reduce((max,x)=>x.updated_at>max?x.updated_at:max,"");return{...group,average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,latest}});
      rows=rows.filter(r=>filterMode==="all"||r.film.type===filterMode);
      rows.sort((a,b)=>{if(sortMode==="recent")return new Date(b.latest||0)-new Date(a.latest||0);if(sortMode==="oldest")return new Date(a.latest||0)-new Date(b.latest||0);return sortMode==="low"?(a.average??-1)-(b.average??-1):(b.average??-1)-(a.average??-1)});
      list.innerHTML=rows.length?rows.map((row,index)=>{
        const byUser=new Map(row.items.map(item=>[item.user_id,item.rating]));
        const peopleHtml=people.map(person=>{const value=byUser.get(person.id);return `<div class="rating-score">${esc(String(person.nickname).toUpperCase())}<strong>${value==null?"—":Number(value).toFixed(1)}</strong></div>`}).join("");
        const avg=row.average==null?"—":row.average.toFixed(1),mine=row.items.some(item=>item.user_id===session.user.id);
        return `<article class="rating-card"><span class="rating-number">${String(index+1).padStart(2,"0")}</span><div><h3 class="rating-title">${esc(titleOf(row.film))}</h3></div><div class="rating-info"><span>${esc((row.film.type||"film").toUpperCase())}</span><span>${esc(yearOf(row.film))}</span><span>${esc((row.latest||"").slice(0,10)||"—")}</span></div><div class="rating-scores">${peopleHtml}</div><div class="rating-average">AVG<strong>${avg}</strong></div>${mine?`<button class="rating-delete" type="button" data-rating-id="${esc(row.film.tmdb_id)}" aria-label="Remove my rating">×</button>`:""}</article>`;
      }).join(""):"<div class=\"rating-empty\">NO RATINGS YET.</div>";
    }catch(error){console.error("SUPABASE RATINGS RENDER FAILED",error);list.innerHTML='<div class="rating-empty">RATINGS CONNECTION FAILED.</div>'}
  }
  function bindRatingControls(){
    document.querySelectorAll("#ratings .rating-filter").forEach(button=>button.addEventListener("click",()=>{filterMode=button.dataset.ratingFilter||"all";document.querySelectorAll("#ratings .rating-filter").forEach(x=>x.classList.remove("active"));button.classList.add("active");renderSupabaseRatings()},true));
    document.querySelectorAll("#ratings .sort-button").forEach(button=>button.addEventListener("click",()=>{sortMode=button.dataset.sort||"high";document.querySelectorAll("#ratings .sort-button").forEach(x=>x.classList.remove("active"));button.classList.add("active");renderSupabaseRatings()},true));
  }
  async function init(){try{await supabaseReady;installAuthFallback();bindRatingControls();await syncHeader();supabaseClient.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession||null;if(session)await ensureProfile(session);await updateAuthButton(session)})}catch(error){console.error("SITE SUPABASE FIX FAILED",error)}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
  function forceRatingsColumns(){
    const list=document.querySelector("#ratingsList");if(!list)return;
    list.querySelectorAll(".rating-card").forEach(card=>{
      const scores=card.querySelector(".rating-scores");
      if(scores){scores.style.display="grid";scores.style.gridTemplateColumns="repeat(auto-fit,minmax(72px,1fr))";scores.style.gap="18px";scores.style.visibility="visible";scores.style.opacity="1";}
    });
    let head=list.querySelector(".ratings-dynamic-head");
    const first=list.querySelector(".rating-card");
    const names=first?[...first.querySelectorAll(".rating-score span")].map(x=>x.textContent.trim()).filter(Boolean):[];
    if(!names.length){head?.remove();return}
    if(!head){head=document.createElement("div");head.className="ratings-dynamic-head";list.insertBefore(head,first||null)}
    head.innerHTML="";
    const left=document.createElement("span");left.textContent="YOUR RATINGS";head.appendChild(left);
    names.forEach(name=>{const x=document.createElement("span");x.textContent=name;head.appendChild(x)});
    const avg=document.createElement("span");avg.textContent="AVG";head.appendChild(avg);
    head.style.display="grid";head.style.gridTemplateColumns="1fr repeat("+names.length+",90px) 70px";head.style.gap="18px";head.style.padding="0 0 10px";head.style.borderBottom="1px solid rgba(232,221,200,.15)";head.style.font="8px Geist Mono,monospace";head.style.letterSpacing=".08em";head.style.color="#bdb09a";
  }
  const ratingsColumnObserver=new MutationObserver(()=>requestAnimationFrame(forceRatingsColumns));
  if(document.querySelector("#ratingsList"))ratingsColumnObserver.observe(document.querySelector("#ratingsList"),{childList:true,subtree:true});
  window.addEventListener("load",forceRatingsColumns);
  setTimeout(forceRatingsColumns,500);

})();
