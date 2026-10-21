/* =========================================================
   SUPABASE RUNTIME
   Shared archive sync + auth/profile bridge + ratings layout fix.
   Keeps Supabase-specific runtime concerns in one place.
========================================================= */

window.archiveSyncStatus="loading";

async function archiveSyncLoadShared(user){
  if(!user)return null;
  window.archiveSyncStatus="loading";
  try{
    const{data,error}=await supabaseClient.from("archive").select("*").order("created_at",{ascending:false});
    if(error)throw error;
    films=(data||[]).map(row=>({
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
      watched:!!row.watched,
      inWatchlist:row.in_watchlist!==false
    }));

    window.archiveSyncStatus="loaded";
    renderArchive();
    return user;
  }catch(e){
    window.archiveSyncStatus="error";
    console.error("ARCHIVE LOAD FAILED",e);
    renderArchive();
    return null;
  }
}

const archiveSyncReady=(async()=>{
  try{
    await supabaseReady;
    const{data:{session},error:authError}=await supabaseClient.auth.getSession();
    if(authError)throw authError;
    if(!session?.user){window.archiveSyncStatus="signed-out";console.info("ARCHIVE SYNC: WAITING FOR AUTH");window.renderArchive?.();return null}
    return await archiveSyncLoadShared(session.user);
  }catch(e){
    window.archiveSyncStatus="error";
    console.error("ARCHIVE SYNC FAILED",e);
    window.renderArchive?.();
    return null;
  }
})();

window.archiveSyncReload=async function(s){
  if(!s?.user){window.archiveSyncStatus="signed-out";window.renderArchive?.();return false}
  window.archiveSyncStatus="loading";
  window.renderArchive?.();
  await supabaseReady;
  return !!(await archiveSyncLoadShared(s.user));
};

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
    in_watchlist:f.inWatchlist!==false&&!f.watched,
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
  if(!user)return null;
  const profile=await window.archiveSyncEnsureProfile?.({user});
  if(!profile){
    console.error("ARCHIVE SAVE BLOCKED: PROFILE IS NOT READY");
    return null;
  }
  return user;
}

async function archiveSyncUpsertMany(list,user){
  if(!user||!list?.length)return false;
  if(!await window.archiveSyncEnsureProfile?.({user}))return false;
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
  const{data,error}=await supabaseClient.from("archive").update({in_watchlist:false,updated_at:new Date().toISOString()}).eq("tmdb_id",Number(id)).select("tmdb_id").maybeSingle();
  if(error){
    console.error("ARCHIVE REMOVE FAILED",error);
    return false;
  }
  if(!data){
    console.warn("ARCHIVE DELETE DID NOT REMOVE A ROW",id);
    return false;
  }
  return true;
}

window.archiveSyncWatch=async function(id,watched){
  const user=await archiveSyncUser();
  if(!user)return false;
  const{data,error}=await supabaseClient.from("archive").update({
    watched:!!watched,
    in_watchlist:!watched,
    updated_at:new Date().toISOString()
  }).eq("tmdb_id",Number(id)).select("tmdb_id").maybeSingle();
  if(error){
    console.error("ARCHIVE WATCH UPDATE FAILED",error);
    return false;
  }
  if(!data){
    console.warn("ARCHIVE WATCH UPDATE DID NOT MATCH A ROW",id);
    return false;
  }
  return true;
}

/* Archive card actions are persisted by after-dark-final.js. Do not attach a second capture handler here: it can save a watch status when START only opens the detail modal, and can issue duplicate remove requests. */
searchResults?.addEventListener("click",async e=>{
  const b=e.target.closest("[data-action='add']");
  if(!b)return;
  const row=b.closest(".search-result");
  const item=window.__searchResults?.find(x=>Number(x.id)===Number(row?.dataset.id));
  if(!item)return;
  const wasAlreadyInArchive=films.some(x=>Number(x.tmdbId)===Number(item.id)&&x.inWatchlist!==false&&!x.watched);
  for(let i=0;i<20;i++){
    await new Promise(r=>setTimeout(r,i?150:50));
    const f=films.find(x=>Number(x.tmdbId)===Number(item.id));
    if(f){
      const ok=await archiveSyncUpsert(f);
      if(!ok){
        if(!wasAlreadyInArchive)window.removeArchiveFilmLocal?.(Number(item.id));
        else{
          const{data:{session}}=await supabaseClient.auth.getSession();
          if(session)await window.archiveSyncReload?.(session);
        }
        b.textContent="SAVE FAILED";
        b.classList.add("save-failed");
      }
      return;
    }
  }
  if(!wasAlreadyInArchive)window.removeArchiveFilmLocal?.(Number(item?.id));
  b.textContent="SAVE FAILED";
  b.classList.add("save-failed");
},{capture:true});

/* Movie Night -> shared Supabase archive */
document.querySelector("#movieNightAdd")?.addEventListener("click",async e=>{
  e.stopImmediatePropagation();
  if(!movieNight.result)return;
  const id=Number(movieNight.result.id);
  let savedFilm=films.find(x=>Number(x.tmdbId)===id);
  const wasAlreadyInArchive=!!savedFilm&&savedFilm.inWatchlist!==false&&!savedFilm.watched;
  if(!savedFilm||!wasAlreadyInArchive){
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
    if(!wasAlreadyInArchive){
      films=films.filter(x=>Number(x.tmdbId)!==id);
      renderArchive();
    }else{
      const{data:{session}}=await supabaseClient.auth.getSession();
      if(session)await window.archiveSyncReload?.(session);
    }
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

  window.archiveSyncEnsureProfile=ensureProfile;

  async function syncHeader(){
    try{
      session=await getSession();
      await updateAuthButton(session);
      if(session)ensureProfile(session).catch(e=>console.warn("PROFILE SYNC DELAYED",e.message));
    }catch(e){
      console.error("AUTH SESSION SYNC FAILED",e);
    }
  }

  async function initAuthBridge(){
    try{
      await supabaseReady;
      await syncHeader();
      supabaseClient.auth.onAuthStateChange((_event,newSession)=>{
        session=newSession||null;
        if(!session){films=[];window.archiveSyncStatus="signed-out";window.renderArchive?.();return}
        const activeSession=session;
        setTimeout(async()=>{
          try{
            const profile=await ensureProfile(activeSession);
            if(!profile){console.warn("PROFILE SYNC DELAYED: PROFILE NOT READY");return}
            await updateAuthButton(activeSession);
            await window.archiveSyncReload?.(activeSession);
          }catch(error){
            console.error("AUTH SESSION SYNC FAILED",error);
          }
        },0);
      });
    }catch(error){
      console.error("SUPABASE AUTH BRIDGE FAILED",error);
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initAuthBridge);
  else initAuthBridge();
})();

/* Load the dedicated ratings renderer and expose a readiness promise.
   RATE actions can safely wait for this module instead of racing its dynamic load. */
window.afterDarkRatingsReady=new Promise((resolve,reject)=>{
  if(typeof window.openSupabaseRating==="function"){resolve();return}
  const script=document.createElement("script");
  script.src="supabase-ratings.js?v=20261020-watchlist1";
  script.async=false;
  script.onload=()=>{if(typeof window.openSupabaseRating==="function")resolve();else reject(new Error("RATINGS MODULE LOADED WITHOUT OPEN FUNCTION"))};
  script.onerror=()=>reject(new Error("RATINGS MODULE FAILED TO LOAD"));
  (document.body||document.documentElement).appendChild(script);
});
