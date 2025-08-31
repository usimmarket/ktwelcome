// form_patch_final.js
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const norm = (t) => (t || "").replace(/\u200B/g, '').replace(/\s+/g, '').trim().toLowerCase();
  const REMOVE_PHRASE = norm("성함과 사인은 직접작성필수");
  const REPLACE_SOURCE = norm("가입자명/예금주명/카드주명은 자필 작성(출력 후)");
  const REPLACE_TEXT = "대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.";

  function isFormContainer(el){ return !!el.querySelector('input,select,textarea,button'); }

  function enableInputs(){
    const sels = [
      '#subscriber_name','[name="subscriber_name"]','[name*="subscriber"][name*="name"]',
      '#account_holder','[name="account_holder"]','#holder_bank','[name="holder_bank"]',
      '[name*="account"][name*="holder"]','[name*="예금주"]','[id*="예금주"]'
    ];
    const seen = new Set();
    sels.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        el.removeAttribute('readonly'); el.removeAttribute('disabled');
        if (el.placeholder) el.placeholder='';
        seen.add(el);
      });
    });
  }

  function removeStrictNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = norm(node.textContent);
      if (t && t.includes(REMOVE_PHRASE)) { node.style.display='none'; node.dataset.removedNote='1'; }
    });
  }

  function replaceSpecificNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = norm(node.textContent);
      if (t && t.includes(REPLACE_SOURCE)) { node.textContent = REPLACE_TEXT; node.dataset.replacedNote='1'; }
    });
  }

  function hydrate(){ enableInputs(); removeStrictNote(); replaceSpecificNote(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  const mo = new MutationObserver(() => {
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  document.querySelectorAll('[data-lang], .lang, .lang-switch, nav a, button, a').forEach(el => {
    const label = (el.dataset && el.dataset.lang) ? String(el.dataset.lang).toUpperCase() : (el.textContent||'').trim().toUpperCase();
    if (['KR','US','VN','TH','KH'].includes(label)){
      el.addEventListener('click', () => { setTimeout(hydrate, 60); }, { capture:true });
    }
  });
})();