(function(){
  const script=document.currentScript;
  const base=(script?.src||"").replace(/\/embed\.js(?:\?.*)?$/,"");
  const version=encodeURIComponent(script?.dataset.version||"20260821-official3");
  const target=document.createElement("div");target.id="bigkinds-chatbot-root";document.body.appendChild(target);
  const css=document.createElement("link");css.rel="stylesheet";css.href=base+"/assets/chatbot.css";document.head.appendChild(css);
  const qnaParts=Array.from({length:21},(_,i)=>`data/qna-data-${String(i+1).padStart(2,"0")}.js`);
  ["data/config.js","data/official-faq.js","data/verified-policy.js","data/qna-import.js",...qnaParts,"data/knowledge-base.js","assets/chatbot.js"].reduce((p,path)=>p.then(()=>new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=base+"/"+path+"?v="+version;s.onload=resolve;s.onerror=reject;document.body.appendChild(s)})),Promise.resolve()).catch(()=>console.error("BIG KINDS chatbot load failed"));
})();
