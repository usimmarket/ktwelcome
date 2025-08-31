// form_patch_final_plus_i18n.js
(function(){
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const norm = (t) => (t || "").replace(/\u200B/g,'').replace(/\s+/g,'').trim().toLowerCase();

  const REMOVE_PHRASE_KR = norm("성함과 사인은 직접작성필수");
  const REPLACE_SOURCE_KR = norm("가입자명/예금주명/카드주명은 자필 작성(출력 후)");

  const NOTES = {
    KR: "※대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.",
    US: "※ Please use UPPERCASE, check spacing, and watch for typos.",
    VN: "※ Vui lòng viết HOA, kiểm tra khoảng cách và tránh lỗi chính tả.",
    TH: "※ โปรดใช้ตัวพิมพ์ใหญ่ ตรวจสอบการเว้นวรรค และระวังการพิมพ์ผิด",
    KH: "※ សូមប្រើអក្សរធំ ពិនិត្យការរំលងវាក្យ និងប្រយ័ត្នកំហុសវាយ"
  };

  function isFormContainer(el){ return !!el.querySelector('input,select,textarea,button'); }

  function currentLang(){
    const htmlLang = (document.documentElement.getAttribute('lang')||'').trim().toUpperCase();
    if (['KR','US','VN','TH','KH','KO','EN','VI','TH','KM'].includes(htmlLang)){
      if (htmlLang==='KO') return 'KR';
      if (htmlLang==='EN') return 'US';
      if (htmlLang==='VI') return 'VN';
      if (htmlLang==='KM') return 'KH';
      return htmlLang;
    }
    const activeBtn = document.querySelector('[data-lang].active, .lang.active, .lang-switch .active');
    if (activeBtn){
      const v = (activeBtn.dataset.lang || activeBtn.textContent || '').trim().toUpperCase();
      if (['KR','US','VN','TH','KH'].includes(v)) return v;
    }
    const anyBtn = document.querySelector('[data-lang], .lang, .lang-switch [aria-current="true"]');
    if (anyBtn){
      const v = (anyBtn.dataset.lang || anyBtn.textContent || '').trim().toUpperCase();
      if (['KR','US','VN','TH','KH'].includes(v)) return v;
    }
    return 'KR';
  }

  function noteText(){
    const lang = currentLang();
    return NOTES[lang] || NOTES['KR'];
  }

  function enableInputs(){
    const sels = [
      '#subscriber_name','[name="subscriber_name"]','[name*="subscriber"][name*="name"]',
      '#account_holder','[name="account_holder"]','#holder_bank','[name="holder_bank"]',
      '[name*="account"][name*="holder"]','[name*="예금주"]','[id*="예금주"]',
      '#holder_card','[name="holder_card"]','#card_holder','[name="card_holder"]',
      '[name*="card"][name*="holder"]','[name*="카드주"]','[id*="카드주"]'
    ];
    const seen = new Set();
    sels.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        if (el.tagName!=='INPUT' && el.tagName!=='TEXTAREA') return;
        el.removeAttribute('readonly'); el.removeAttribute('disabled');
        if (el.placeholder) el.placeholder='';
        ensureNoteUnder(el);
        seen.add(el);
      });
    });
  }

  function findFieldContainer(el){
    if (!el) return null;
    let p = el.parentElement;
    for (let i=0; i<5 && p; i++){
      if (p.matches && (p.matches('.field, .form-field, .form-group, label, .row, .col') || p.tagName==='LABEL')) return p;
      p = p.parentElement;
    }
    return el.parentElement || null;
  }

  function ensureNoteUnder(el){
    const host = findFieldContainer(el) || el;
    if (!host) return;
    let note = host.querySelector('[data-auto-note="caps-space-typo"]');
    if (!note){
      note = document.createElement('small');
      note.setAttribute('data-auto-note','caps-space-typo');
      note.style.display='block';
      note.style.marginTop='4px';
      if (el.nextSibling) el.parentElement.insertBefore(note, el.nextSibling);
      else host.appendChild(note);
    }
    note.textContent = noteText();
  }

  function updateExistingNotes(){
    document.querySelectorAll('[data-auto-note="caps-space-typo"]').forEach(n => n.textContent = noteText());
  }

  function removeStrictKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = norm(node.textContent);
      if (t && t.includes(REMOVE_PHRASE_KR)) { node.style.display='none'; node.dataset.removedNote='1'; }
    });
  }

  function replaceSpecificKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = norm(node.textContent);
      if (t && t.includes(REPLACE_SOURCE_KR)) {
        node.textContent = noteText();
        node.dataset.replacedNote='1';
      }
    });
  }

  function hydrate(){
    enableInputs();
    removeStrictKRNote();
    replaceSpecificKRNote();
    updateExistingNotes();
  }

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