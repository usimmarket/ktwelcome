/* hwlock.js - v1 20250910_051431
   Locks two fields for handwritten name only, without touching translation/layout. */
(function(){
  var MSG = "※ 성함 과 사인은 필히 자필로 작성해주셔야합니다.";
  function once(){
    try {
      var s = document.getElementById('subscriber_name');
      var b = document.getElementById('holder_bank');
      if (s){ s.readOnly = true; s.classList.add('hw-lock'); if (!s.placeholder) s.placeholder = MSG; }
      if (b){ b.readOnly = true; b.classList.add('hw-lock'); if (!b.placeholder) b.placeholder = MSG; }
      var kill="※대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.";
      document.querySelectorAll('small,.help,.hint,.note,.text-xs').forEach(function(el){
        var t=(el.innerText||'').replace(/\s+/g,'');
        if(t===kill.replace(/\s+/g,'')) el.remove();
      });
    } catch(e){}
  }
  var origSetPH = window.setPH;
  if (typeof origSetPH === 'function') {
    window.setPH = function(id, val){ 
      if (id === 'subscriber_name' || id === 'holder_bank') { val = MSG; }
      return origSetPH.apply(this, arguments.length===2 ? [id, val] : arguments);
    };
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', once); }
  else { once(); }
})();
