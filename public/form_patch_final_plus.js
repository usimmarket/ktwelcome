// form_patch_final_plus.js
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const norm = (t) => (t || "").replace(/\u200B/g, '').replace(/\s+/g, '').trim().toLowerCase();

  const REMOVE_PHRASE = norm("성함과 사인은 직접작성필수");
  const REPLACE_SOURCE = norm("가입자명/예금주명/카드주명은 자필 작성(출력 후)");
  const NEW_MSG = "대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.";
  const NEW_NOTE_PREFIX = "※";

  function isFormContainer(el){ return !!el.querySelector('input,select,textarea,button'); }

  // Find a decent container under which to place the note (label/field wrapper)
  function findFieldContainer(el){
    if (!el) return null;
    // climb up to a field-like wrapper but stop before form or body
    let p = el.parentElement;
    for (let i=0; i<5 && p; i++){
      if (p.matches && (p.matches('.field, .form-field, .form-group, label, .row, .col') || p.tagName === 'LABEL')) return p;
      p = p.parentElement;
    }
    // fallback to direct parent
    return el.parentElement || null;
  }

  // Insert note under the input (once)
  function ensureNoteUnder(el){
    if (!el) return;
    const host = findFieldContainer(el) || el;
    if (!host) return;
    // check existing injected note
    if (host.querySelector('[data-auto-note="caps-space-typo"]')) return;
    const small = document.createElement('small');
    small.textContent = `${NEW_NOTE_PREFIX}${NEW_MSG}`;
    small.setAttribute('data-auto-note','caps-space-typo');
    small.style.display = 'block';
    small.style.marginTop = '4px';
    // Prefer insert after the input itself when possible
    if (el.nextSibling) {
      el.parentElement.insertBefore(small, el.nextSibling);
    } else {
      host.appendChild(small);
    }
  }

  function enableInputsAndNotes(){
    // Target selectors for all three names
    const targets = [
      // 가입자명
      '#subscriber_name','[name="subscriber_name"]','[name*="subscriber"][name*="name"]',
      // 예금주명
      '#account_holder','[name="account_holder"]','#holder_bank','[name="holder_bank"]',
      '[name*="account"][name*="holder"]','[name*="예금주"]','[id*="예금주"]',
      // 카드주명
      '#holder_card','[name="holder_card"]',
      '#card_holder','[name="card_holder"]',
      '[name*="card"][name*="holder"]','[name*="카드주"]','[id*="카드주"]'
    ];
    const seen = new Set();
    targets.forEach(sel => {
      $$(sel).forEach(el => {
        if (seen.has(el)) return;
        if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
        // enable typing
        el.removeAttribute('readonly'); el.removeAttribute('disabled');
        if (el.placeholder) el.placeholder = '';
        // inject note
        ensureNoteUnder(el);
        seen.add(el);
      });
    });
  }

  function removeStrictNote(){
    $$('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return; // never remove containers with controls
      const t = norm(node.textContent);
      if (t && t.includes(REMOVE_PHRASE)) {
        node.style.display = 'none';
        node.setAttribute('data-removed-note','1');
      }
    });
  }

  function replaceSpecificNote(){
    $$('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = norm(node.textContent);
      if (t && t.includes(REPLACE_SOURCE)) {
        node.textContent = `${NEW_NOTE_PREFIX}${NEW_MSG}`;
        node.setAttribute('data-replaced-note','1');
      }
    });
  }

  function hydrate(){
    enableInputsAndNotes();
    removeStrictNote();
    replaceSpecificNote();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  // Reapply on language switches / DOM changes
  const mo = new MutationObserver(() => {
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  $$('[data-lang], .lang, .lang-switch, nav a, button, a').forEach(el => {
    const label = (el.dataset && el.dataset.lang) ? String(el.dataset.lang).toUpperCase() : (el.textContent||'').trim().toUpperCase();
    if (['KR','US','VN','TH','KH'].includes(label)){
      el.addEventListener('click', () => { setTimeout(hydrate, 60); }, { capture:true });
    }
  });
})();