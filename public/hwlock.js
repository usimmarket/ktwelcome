
/* hwlock.js (safe v2)
   - No overrides (setPH, setLang untouched)
   - No event interception (passive listeners only)
   - Works with KR/US/VN/TH/KH language toggles
   - Keeps #subscriber_name & #holder_bank readonly with translated placeholder
   - Removes the legacy KR note everywhere
*/
(function(){
  var MSGS = {
    ko: "※ 성함 과 사인은 필히 자필로 작성해주셔야합니다.",
    en: "※ Your name and signature must be handwritten.",
    vi: "※ Họ tên và chữ ký phải viết tay.",
    th: "※ กรุณากรอกชื่อและลายเซ็นด้วยลายมือ",
    km: "※ ឈ្មោះ និងហត្ថលេខា ត្រូវសរសេរដោយដៃ។",
    zh: "※ 姓名和签名必须手写。",
    ru: "※ Имя и подпись должны быть написаны от руки."
  };
  var MAP = { kr:'ko', ko:'ko', us:'en', en:'en', vn:'vi', vi:'vi', th:'th', kh:'km', km:'km', zh:'zh', cn:'zh', ru:'ru' };

  function currentLang(){
    try{
      var hl=(document.documentElement.getAttribute('lang')||'').trim().toLowerCase();
      if (MAP[hl]) return MAP[hl];
      var chip = document.querySelector('.chip.active, .lang .active, .language .active');
      if (chip){
        var t=(chip.textContent||'').trim().toLowerCase();
        if (MAP[t]) return MAP[t];
      }
      var r = document.querySelector('input[type="radio"][name*="lang"]:checked, input[type="radio"][name*="language"]:checked');
      if (r){
        var v=(r.value||'').trim().toLowerCase();
        if (MAP[v]) return MAP[v];
      }
    }catch(_){}
    return 'ko';
  }

  function ensureStyle(){
    if (document.getElementById('hwlock-style')) return;
    var st=document.createElement('style');
    st.id='hwlock-style';
    st.textContent='.hw-lock::placeholder{color:#dc2626;opacity:1}';
    document.head.appendChild(st);
  }

  function removeLegacyNote(){
    try{
      var kill = "※대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.".replace(/\s+/g,'');
      var nodes=document.querySelectorAll('small,.help,.hint,.note,.text-xs,p,div');
      for(var i=0;i<nodes.length;i++){
        var t=(nodes[i].innerText||'').replace(/\s+/g,'');
        if (t===kill){ nodes[i].remove(); }
      }
    }catch(_){}
  }

  function apply(){
    try{
      var lang=currentLang();
      var msg = MSGS[lang] || MSGS.ko;
      var ids=['subscriber_name','holder_bank'];
      for (var i=0;i<ids.length;i++){
        var el=document.getElementById(ids[i]);
        if (!el) continue;
        el.readOnly = true;
        try{ el.classList.add('hw-lock'); }catch(_){}
        el.placeholder = msg;
      }
      removeLegacyNote();
    }catch(_){}
  }

  function start(){
    ensureStyle();
    // First apply at DOM ready and window load
    apply();
    // Passive, non-blocking re-apply on user interactions (no capture)
    ['click','change','input'].forEach(function(evt){
      document.addEventListener(evt, function(){ setTimeout(apply, 0); }, {passive:true});
    });
    // Lightweight periodic apply (every 1.5s)
    setInterval(apply, 1500);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
