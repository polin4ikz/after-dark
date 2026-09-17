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
  `;
  document.head.appendChild(style);

  const originalAlert=window.alert;
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
})();