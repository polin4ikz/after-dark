/* =========================================================
   SUPABASE RUNTIME
   Shared archive sync + auth/profile bridge + ratings layout fix.
   Keeps Supabase-specific runtime concerns in one place.
========================================================= */

const archiveSyncReady=(async()=>{
  try{
    await supabaseReady;
    const{data:{user},error:authError}=await supabaseClient.auth.getUser();
    if(authError)throw authError;
    if(!user){console.warn("ARCHIVE SYNC: NO AUTH USER");return null}
    const{data,error}=await supabaseClient.from("archive").select("*").order("created_at",{ascending:false});
    if(error)throw error;
    if(data?.length){
      films=data.map(row=>({
        tmdbId:row.tmdb_id,
        title:row.title,
        name:row.name||"",
        poster_path:row.poster_path||"",
        backdrop_path:row.backdrop_path||"",
        release_date:row.release_date||"",
        first_air_date:row.first_air_date||"",
        type:row.type||"film",
        vote_average:Number(row.vote_average||0),
        genre_ids:Array.isArray(row.genre_ids)?row.genre_ids:[],
        originCountries:Array.isArray(row.origin_countries)?row.origin_countries:[],
        watched:!!row.watched
      }));
      save(ARCHIVE_KEY,films);
      renderArchive();
      return user;
    }
    if(films.length)await archiveSyncUpsertMany(films,user);
    return user;
  }catch(e){
    console.error("ARCHIVE SYNC FAILED",e);
    return null;
  }
})();

function archiveSyncRow(f,user){
  return{
    tmdb_id:Number(f.tmdbId),
    title:titleOf(f),
    name:f.name||null,
    poster_path:f.poster_path||null,
    backdrop_path:f.backdrop_path||null,
    release_date:f.release_date||null,
    first_air_date:f.first_air_date||null,
    type:f.type||"film",
    vote_average:Number(f.vote_average||0),
    genre_ids:f.genre_ids||[],
    origin_countries:f.originCountries||[],
    watched:!!f.watched,
    added_by:user.id,
    updated_at:new Date().toISOString()
  };
}

async function archiveSyncUser(){
  await archiveSyncReady;
  const{data:{user},error}=await supabaseClient.auth.getUser();
  if(error){
    console.error("ARCHIVE AUTH FAILED",error);
    return null;
  }
  return user||null;
}

async function archiveSyncUpsertMany(list,user){
  if(!user||!list?.length)return false;
  const{data,error}=await supabaseClient.from("archive").upsert(
    list.map(f=>archiveSyncRow(f,user)),
    {onConflict:"tmdb_id"}
  ).select();
  if(error){
    console.error("ARCHIVE SAVE FAILED",error);
    return false;
  }
  console.log("ARCHIVE SAVED",data);
  return true;
}

async function archiveSyncUpsert(f){
  const user=await archiveSyncUser();
  if(!user||!f)return false;
  const{data,error}=await supabaseClient.from("archive").upsert(
    archiveSyncRow(f,user),
    {onConflict:"tmdb_id"}
  ).select().single();
  if(error){
    console.error("ARCHIVE SAVE FAILED",error);
    return false;
  }
  console.log("ARCHIVE SAVED",data);
  return true;
}

async function archiveSyncRemove(id){
  const user=await archiveSyncUser();
  if(!user)return false;
  const{error}=await supabaseClient.from("archive").delete().eq("tmdb_id",Number(id));
  if(error){
    console.error("ARCHIVE DELETE FAILED",error);
    return false;
  }
  return true;
}

async function archiveSyncWatch(id,watched){
  const user=await archiveSyncUser();
  if(!user)return false;
  const{error}=await supabaseClient.from("archive").update({
    watched:!!watched,
    updated_at:new Date().toISOString()
  }).eq("tmdb_id",Number(id));
  if(error){
    console.error("ARCHIVE WATCH UPDATE FAILED",error);
    return false;
  }
  return true;
}

/* Archive/search persistence hooks */
archiveTrack?.addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]");
  if(!b)return;
  const id=Number(b.dataset.id);
  if(b.dataset.action==="remove")await archiveSyncRemove(id);
  else if(b.dataset.action==="watch"){
    const f=films.find(x=>Number(x.tmdbId)===id);
    if(f)await archiveSyncWatch(id,f.watched);
  }
},{capture:true});

searchResults?.addEventListener("click",async e=>{
  const b=e.target.closest("[data-action='add']");
  if(!b)return;
  const row=b.closest(".search-result");
  const item=window.__searchResults?.find(x=>Number(x.id)===Number(row?.dataset.id));
  if(!item)return;
  for(let i=0;i<20;i++){
    await new Promise(r=>setTimeout(r,i?150:50));
    const f=films.find(x=>Number(x.tmdbId)===Number(item.id));
    if(f){
      const ok=await archiveSyncUpsert(f);
      if(!ok){
        b.textContent="SAVE FAILED";
        b.classList.add("save-failed");
      }
      return;
    }
  }
  b.textContent="SAVE FAILED";
  b.classList.add("save-failed");
},{capture:true});

/* Movie Night -> shared Supabase archive */
document.querySelector("#movieNightAdd")?.addEventListener("click",async e=>{
  e.stopImmediatePropagation();
  if(!movieNight.result)return;
  const id=Number(movieNight.result.id);
  let savedFilm=films.find(x=>Number(x.tmdbId)===id);
  if(!savedFilm){
    addFilm(movieNight.result);
    savedFilm=films.find(x=>Number(x.tmdbId)===id);
  }
  if(!savedFilm){
    updateMovieNightButtons();
    return;
  }
  const ok=await archiveSyncUpsert(savedFilm);
  if(!ok){
    console.error("MOVIE NIGHT SUPABASE SAVE FAILED");
    films=films.filter(x=>Number(x.tmdbId)!==id);
    save(ARCHIVE_KEY,films);
    renderArchive();
    alert("COULD NOT SAVE TO ARCHIVE");
    return;
  }
  console.log("MOVIE NIGHT ARCHIVE SAVED",savedFilm);
  updateMovieNightButtons();
},{capture:true});

/* Profile/auth bridge */
(()=>{
  let session=null;

  async function getSession(){
    await supabaseReady;
    const{data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    return data.session||null;
  }

  async function ensureProfile(s){
    if(!s?.user?.id)return null;
    await supabaseReady;
    for(let attempt=0;attempt<4;attempt++){
      try{
        const{data,error}=await supabaseClient.from("profiles")
          .select("id,nickname")
          .eq("id",s.user.id)
          .maybeSingle();
        if(error)throw error;
        if(data?.nickname?.trim())return data;

        const nickname=String(
          s.user.user_metadata?.nickname||
          s.user.email?.split("@")[0]||
          "USER"
        ).trim();

        const{data:created,error:createError}=await supabaseClient.from("profiles")
          .upsert({id:s.user.id,nickname},{onConflict:"id"})
          .select("id,nickname")
          .single();
        if(createError)throw createError;
        return created;
      }catch(e){
        if(attempt===3){
          console.warn("PROFILE SYNC DELAYED",e.message);
          return null;
        }
        await new Promise(r=>setTimeout(r,300*(attempt+1)));
      }
    }
    return null;
  }

  async function syncHeader(){
    try{
      session=await getSession();
      await updateAuthButton(session);
      if(session)ensureProfile(session).catch(e=>console.warn("PROFILE SYNC DELAYED",e.message));
    }catch(e){
      console.error("AUTH SESSION SYNC FAILED",e);
    }
  }

  function installAuthFallback(){
    const form=document.querySelector("#authForm");
    if(!form)return;

    form.addEventListener("submit",async e=>{
      e.preventDefault();
      e.stopImmediatePropagation();

      const name=document.querySelector("#authName")?.value.trim()||"";
      const email=document.querySelector("#authEmail")?.value.trim()||"";
      const password=document.querySelector("#authPassword")?.value||"";
      const mode=document.querySelector(".auth-tab.active")?.dataset.auth||"login";

      if(!email||!password||(mode==="register"&&!name)){
        authError("PLEASE FILL IN ALL FIELDS");
        return;
      }

      try{
        await supabaseReady;
        if(mode==="register"){
          const{data,error}=await supabaseClient.auth.signUp({
            email,
            password,
            options:{data:{nickname:name}}
          });
          if(error)throw error;

          if(data.session){
            await ensureProfile(data.session);
            closeAuth();
            await updateAuthButton(data.session);
          }else{
            closeAuth();
            alert("ACCOUNT CREATED.");
          }
        }else{
          const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});
          if(error)throw error;
          session=data.session||null;
          closeAuth();
          await updateAuthButton(session);
        }
      }catch(error){
        console.error("AUTH LOGIN FAILED",error);
        authError(error.message||"AUTHENTICATION FAILED");
      }
    },true);
  }

  async function initAuthBridge(){
    try{
      await supabaseReady;
      installAuthFallback();
      await syncHeader();
      supabaseClient.auth.onAuthStateChange(async(_event,newSession)=>{
        session=newSession||null;
        await updateAuthButton(session);
      });
    }catch(error){
      console.error("SUPABASE AUTH BRIDGE FAILED",error);
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initAuthBridge);
  else initAuthBridge();
})();

/* Ratings layout guard — presentation only, existing visual rules remain unchanged */
(()=>{
  const forceRatingsColumns=()=>{
    const list=document.querySelector("#ratingsList");
    if(!list)return;
    list.querySelector(".ratings-dynamic-head")?.remove();
    list.querySelectorAll(".rating-card").forEach(card=>{
      const scores=card.querySelector(".rating-scores");
      if(scores){
        scores.style.display="grid";
        scores.style.gridTemplateColumns="repeat(auto-fit,minmax(72px,1fr))";
        scores.style.gap="18px";
        scores.style.visibility="visible";
        scores.style.opacity="1";
      }
    });
  };

  const start=()=>{
    const list=document.querySelector("#ratingsList");
    if(list){
      const observer=new MutationObserver(()=>requestAnimationFrame(forceRatingsColumns));
      observer.observe(list,{childList:true,subtree:true});
    }
    window.addEventListener("load",forceRatingsColumns);
    setTimeout(forceRatingsColumns,500);
  };

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
  else start();
})();

/* Load the dedicated ratings renderer after the shared runtime is ready. */
(()=>{
  const script=document.createElement("script");
  script.src="supabase-ratings.js?v=20260919-clean";
  script.async=false;
  document.body.appendChild(script);
})();
