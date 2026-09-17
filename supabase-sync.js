const archiveSyncReady=(async()=>{
  try{
    await supabaseReady;
    const{data:{user},error:authError}=await supabaseClient.auth.getUser();
    if(authError)throw authError;
    if(!user){
      console.warn("ARCHIVE SYNC: NO AUTH USER");
      return null
    }
    const{data,error}=await supabaseClient.from("archive").select("*").order("created_at",{ascending:false});
    if(error)throw error;
    if(data?.length){
      films=data.map(row=>({
        tmdbId:row.tmdb_id,title:row.title,name:row.name||"",
        poster_path:row.poster_path||"",backdrop_path:row.backdrop_path||"",
        release_date:row.release_date||"",first_air_date:row.first_air_date||"",
        type:row.type||"film",vote_average:Number(row.vote_average||0),
        genre_ids:Array.isArray(row.genre_ids)?row.genre_ids:[],
        originCountries:Array.isArray(row.origin_countries)?row.origin_countries:[],
        watched:!!row.watched
      }));
      save(ARCHIVE_KEY,films);
      renderArchive();
      return user
    }
    if(films.length)await archiveSyncUpsertMany(films,user);
    return user
  }catch(e){
    console.error("ARCHIVE SYNC FAILED",e);
    return null
  }
})();

function archiveSyncRow(f,user){
  return{
    tmdb_id:Number(f.tmdbId),title:titleOf(f),name:f.name||null,
    poster_path:f.poster_path||null,backdrop_path:f.backdrop_path||null,
    release_date:f.release_date||null,first_air_date:f.first_air_date||null,
    type:f.type||"film",vote_average:Number(f.vote_average||0),
    genre_ids:f.genre_ids||[],origin_countries:f.originCountries||[],
    watched:!!f.watched,added_by:user.id,updated_at:new Date().toISOString()
  }
}

async function archiveSyncUser(){
  await archiveSyncReady;
  const{data:{user},error}=await supabaseClient.auth.getUser();
  if(error){
    console.error("ARCHIVE AUTH FAILED",error);
    return null
  }
  return user||null
}

async function archiveSyncUpsertMany(list,user){
  if(!user||!list?.length)return false;
  const{data,error}=await supabaseClient.from("archive").upsert(
    list.map(f=>archiveSyncRow(f,user)),
    {onConflict:"tmdb_id"}
  ).select();
  if(error){
    console.error("ARCHIVE SAVE FAILED",error);
    return false
  }
  console.log("ARCHIVE SAVED",data);
  return true
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
    return false
  }
  console.log("ARCHIVE SAVED",data);
  return true
}

async function archiveSyncRemove(id){
  const user=await archiveSyncUser();
  if(!user)return false;
  const{error}=await supabaseClient.from("archive").delete().eq("tmdb_id",Number(id));
  if(error){
    console.error("ARCHIVE DELETE FAILED",error);
    return false
  }
  return true
}

async function archiveSyncWatch(id,watched){
  const user=await archiveSyncUser();
  if(!user)return false;
  const{error}=await supabaseClient.from("archive").update({
    watched:!!watched,updated_at:new Date().toISOString()
  }).eq("tmdb_id",Number(id));
  if(error){
    console.error("ARCHIVE WATCH UPDATE FAILED",error);
    return false
  }
  return true
}

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
  const row=b.closest(".search-result"),item=window.__searchResults?.find(x=>Number(x.id)===Number(row?.dataset.id));
  if(!item)return;
  for(let i=0;i<20;i++){
    await new Promise(r=>setTimeout(r,i?150:50));
    const f=films.find(x=>Number(x.tmdbId)===Number(item.id));
    if(f){
      const ok=await archiveSyncUpsert(f);
      if(!ok){
        b.textContent="SAVE FAILED";
        b.classList.add("save-failed")
      }
      return
    }
  }
  b.textContent="SAVE FAILED";
  b.classList.add("save-failed")
},{capture:true});