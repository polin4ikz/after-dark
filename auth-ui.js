(()=>{
  const style=document.createElement("style");
  style.textContent=`
    .auth-feedback{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,7,9,.72);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .25s ease}
    .auth-feedback.active{opacity:1;pointer-events:auto}
    .auth-feedback-box{width:min(420px,calc(100vw - 40px));padding:34px 34px 30px;background:#f1ece5;color:#171214;box-shadow:0 24px 80px rgba(0,0,0,.35);position:relative}
    .auth-feedback-label{display:block;font:500 10px/1 "Geist Mono",monospace;letter-spacing:.14em;margin-bottom:28px;opacity:.55}
    .auth-feedback-title{margin:0 0 12px;font:400 34px/1 "Bricolage Grotesque",sans-serif;letter-spacing:-.04em;text-transform:uppercase}
    .auth-feedback-text{margin:0;max-width:330px;font:400 12px/1.65 "Geist Mono",monospace;text-transform:uppercase;opacity:.68}
    .auth-feedback-close{margin-top:28px;border:0;background:transparent;padding:0;font:500 10px/1 "Geist Mono",monospace;letter-spacing:.12em;cursor:pointer;color:inherit}
    .auth-feedback-close:hover{opacity:.55}
    .header-auth-wrap{position:relative;display:inline-flex;align-items:center}
    .header-auth-menu{position:absolute;top:calc(100% + 12px);right:0;width:190px;padding:18px;background:#f1ece5;color:#171214;box-shadow:0 18px 50px rgba(0,0,0,.28);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .2s ease,transform .2s ease;z-index:1000}
    .header-auth-menu.active{opacity:1;transform:translateY(0);pointer-events:auto}
    .header-auth-menu-label{display:block;margin-bottom:14px;font:500 9px/1 "Geist Mono",monospace;letter-spacing:.14em;opacity:.45}
    .header-auth-menu-name{display:block;margin-bottom:18px;font:500 13px/1.2 "Bricolage Grotesque",sans-serif;text-transform:uppercase}
    .header-auth-logout{border:0;border-top:1px solid rgba(23,18,20,.16);padding:14px 0 0;width:100%;background:transparent;text-align:left;font:500 9px/1 "Geist Mono",monospace;letter-spacing:.12em;color:inherit;cursor:pointer}
    .header-auth-logout:hover{opacity:.55}
    .movie-night-year-specific{margin-top:10px;display:flex;align-items:center;gap:10px}
    .movie-night-year-specific-label{font:500 9px/1 "Geist Mono",monospace;letter-spacing:.1em;opacity:.5;white-space:nowrap}
    .movie-night-year-specific-select{width:92px;min-width:92px;height:30px;padding:5px 24px 5px 9px;border:1px solid rgba(241,236,229,.35);border-radius:0;background:#171214;color:#f1ece5;font:500 10px/1 "Geist Mono",monospace;letter-spacing:.08em;outline:none;cursor:pointer}
    .movie-night-year-specific-select option{background:#171214;color:#f1ece5}
    .movie-night-empty-state{position:absolute!important;inset:0!important;z-index:999!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;padding:30px!important;color:#171214!important;background:#f1ece5!important;font:500 11px/1.6 "Geist Mono",monospace!important;letter-spacing:.12em!important;text-transform:uppercase!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}
    .movie-night-empty-state span{display:block!important;color:#171214!important;opacity:.7!important;visibility:visible!important}
    .movie-night-reveal.is-empty{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
  `;
  document.head.appendChild(style);

  window.alert=message=>{
    let modal=document.querySelector(".auth-feedback");
    if(!modal){
      modal=document.createElement("div");
      modal.className="auth-feedback";
      modal.innerHTML='<div class="auth-feedback-box"><span class="auth-feedback-label">PRIVATE ACCESS</span><h4 class="auth-feedback-title">DONE.</h4><p class="auth-feedback-text"></p><button class="auth-feedback-close" type="button">CLOSE ×</button></div>';
      document.body.appendChild(modal);
      const close=()=>modal.classList.remove("active");
      modal.querySelector(".auth-feedback-close").addEventListener("click",close);
      modal.addEventListener("click",e=>{if(e.target===modal)close()});
    }
    const text=String(message||"");
    const title=modal.querySelector(".auth-feedback-title");
    const body=modal.querySelector(".auth-feedback-text");
    if(/ACCOUNT CREATED/i.test(text)){title.textContent="ACCOUNT CREATED";body.textContent="YOUR PRIVATE ARCHIVE IS READY."}
    else if(/CHECK YOUR EMAIL/i.test(text)){title.textContent="ACCOUNT CREATED";body.textContent="YOUR PRIVATE ARCHIVE IS READY."}
    else if(/AUTHENTICATION FAILED/i.test(text)||/SUPABASE AUTH/i.test(text)){title.textContent="ACCESS ERROR";body.textContent=text}
    else{title.textContent="NOTICE";body.textContent=text}
    modal.classList.add("active");
  };

  function initProfileMenu(){
    const button=document.querySelector(".header-auth-button");
    const meta=document.querySelector(".header-meta");
    if(!button||!meta)return;
    const wrap=document.createElement("div");
    wrap.className="header-auth-wrap";
    button.parentNode.insertBefore(wrap,button);
    wrap.appendChild(button);
    const menu=document.createElement("div");
    menu.className="header-auth-menu";
    menu.innerHTML='<span class="header-auth-menu-label">PRIVATE ACCESS</span><strong class="header-auth-menu-name">ACCOUNT</strong><button class="header-auth-logout" type="button">LOG OUT ↗</button>';
    wrap.appendChild(menu);
    const logout=menu.querySelector(".header-auth-logout");
    const name=menu.querySelector(".header-auth-menu-name");
    button.replaceWith(button.cloneNode(true));
    const freshButton=wrap.querySelector(".header-auth-button");
    const closeMenu=()=>menu.classList.remove("active");
    freshButton.addEventListener("click",async()=>{
      try{
        await supabaseReady;
        const{data:{session}}=await supabaseClient.auth.getSession();
        if(!session){closeMenu();openAuth();return}
        name.textContent=(session.user.user_metadata?.nickname||session.user.email?.split("@")[0]||"ACCOUNT").toUpperCase();
        menu.classList.toggle("active");
      }catch(e){authError(e.message)}
    });
    logout.addEventListener("click",async()=>{
      try{
        await supabaseReady;
        closeMenu();
        const{error}=await supabaseClient.auth.signOut();
        if(error)throw error;
      }catch(e){authError(e.message)}
    });
    document.addEventListener("click",e=>{if(!wrap.contains(e.target))closeMenu()});
  }

  function keepSearchPosition(){
    const remember=()=>{
      const y=window.scrollY;
      requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:"instant"}));
      setTimeout(()=>window.scrollTo({top:y,left:0,behavior:"instant"}),80);
      setTimeout(()=>window.scrollTo({top:y,left:0,behavior:"instant"}),450);
    };
    document.querySelector("#searchInput")?.addEventListener("input",remember,true);
    document.querySelector("#searchButton")?.addEventListener("click",remember,true);
    document.querySelector("#searchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")remember()},true);
  }

  function fixSearchJump(){
    const results=document.querySelector("#searchResults");
    if(!results)return;
    results.addEventListener("click",event=>{
      if(!event.target.closest("[data-add-tmdb], [data-action='add'], .search-add-button, .search-result-add"))return;
      const y=window.scrollY;
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:"instant"})));
      setTimeout(()=>window.scrollTo({top:y,left:0,behavior:"instant"}),120);
    },true);
    document.addEventListener("pointerdown",event=>{
      if(!results.classList.contains("has-results")&&!results.children.length)return;
      if(event.target.closest("#searchInput,#searchButton,#searchResults"))return;
      results.innerHTML="";
      results.classList.remove("has-results");
    },true);
  }

  function addExactYears(){
    const yearGroup=document.querySelector("[data-year='2020']")?.parentElement;
    const baseButton=document.querySelector("[data-year='2020']");
    if(!yearGroup||!baseButton||yearGroup.querySelector(".movie-night-year-specific"))return;
    const wrap=document.createElement("div");
    wrap.className="movie-night-year-specific";
    const label=document.createElement("span");
    label.className="movie-night-year-specific-label";
    label.textContent="EXACT YEAR";
    const select=document.createElement("select");
    select.className="movie-night-year-specific-select";
    select.innerHTML='<option value="">SELECT</option><option value="2020+">2020+</option>';
    for(let year=2026;year>=1950;year--){
      const option=document.createElement("option");
      option.value=String(year);
      option.textContent=String(year);
      select.appendChild(option);
    }
    wrap.append(label,select);
    yearGroup.appendChild(wrap);
    select.addEventListener("change",()=>{
      const year=select.value;
      if(!year)return;
      if(year==="2020+"){
        baseButton.dataset.year="2020";
        baseButton.textContent="2020+";
      }else{
        baseButton.dataset.year=`${year}-${year}`;
        baseButton.textContent=year;
      }
      baseButton.click();
      document.querySelectorAll("[data-year]").forEach(b=>b.classList.remove("active"));
      baseButton.classList.add("active");
    });
  }

  function initMovieNightNoResults(){
    const reveal=document.querySelector("#movieNightReveal");
    const modalWindow=document.querySelector(".movie-night-modal-window");
    if(!reveal||!modalWindow)return;
    let emptyState=null;
    const clearEmpty=()=>{
      reveal.classList.remove("is-empty");
      emptyState?.remove();
      emptyState=null;
    };
    const showEmpty=()=>{
      if(emptyState)return;
      reveal.classList.add("is-empty");
      emptyState=document.createElement("div");
      emptyState.className="movie-night-empty-state";
      emptyState.innerHTML="<span>NO TITLES FOUND<br>TRY CHANGING THE PARAMETERS</span>";
      modalWindow.appendChild(emptyState);
    };
    const check=()=>{
      const text=(reveal.textContent||"").trim();
      const final=document.querySelector("#movieNightFinal");
      const finalVisible=final&&getComputedStyle(final).display!=="none"&&getComputedStyle(final).visibility!=="hidden";
      if(finalVisible){clearEmpty();return}
      if(reveal.classList.contains("active")&&text===""){showEmpty();return}
      if(!reveal.classList.contains("active")&&emptyState){clearEmpty()}
    };
    const observer=new MutationObserver(()=>setTimeout(check,80));
    observer.observe(reveal,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["class","style"]});
    const modalObserver=new MutationObserver(()=>setTimeout(check,80));
    modalObserver.observe(modalWindow,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]});
    setInterval(check,300);
  }

  const init=()=>{initProfileMenu();keepSearchPosition();fixSearchJump();addExactYears();initMovieNightNoResults()};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();