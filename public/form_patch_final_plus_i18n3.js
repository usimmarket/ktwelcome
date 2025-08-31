// form_patch_final_plus_i18n3.js
(function(){
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const STORAGE_KEY = "ktw_lang_override_v2";

  const NOTES = {
    KR: "※대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.",
    US: "※ Please use UPPERCASE, check spacing, and watch for typos.",
    VN: "※ Vui lòng viết HOA, kiểm tra khoảng cách và tránh lỗi chính tả.",
    TH: "※ โปรดใช้ตัวพิมพ์ใหญ่ ตรวจสอบการเว้นวรรค และระวังการพิมพ์ผิด",
    KH: "※ សូមប្រើអក្សរធំ ពិនិត្យការរំលងវាក្យ និងប្រយ័ត្នកំហុសវាយ"
  };

  function setOverride(code){
    try { localStorage.setItem(STORAGE_KEY, code); } catch(e){}
    const map = {KR:'ko', US:'en', VN:'vi', TH:'th', KH:'km'};
    document.documentElement.setAttribute('lang', (map[code]||code).toLowerCase());
  }
  function getOverride(){ try { return localStorage.getItem(STORAGE_KEY) || null; } catch(e){ return null; } }

  function currentLang(){
    const ov = getOverride();
    if (ov && NOTES[ov]) return ov;
    const active = document.querySelector('.chips .chip.active[data-lang]');
    if (active) {
      const v = active.getAttribute('data-lang').toUpperCase();
      if (NOTES[v]) return v;
    }
    const htmlLang = (document.documentElement.getAttribute('lang')||'').toLowerCase();
    const inv = {ko:'KR', en:'US', vi:'VN', th:'TH', km:'KH'};
    if (inv[htmlLang]) return inv[htmlLang];
    return 'KR';
  }

  function noteText(){ return NOTES[currentLang()] || NOTES.KR; }

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

  function enableInputsAndNotes(){
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

  function isFormContainer(node){ return !!node.querySelector('input,select,textarea,button'); }
  const KR_REMOVE = "성함과 사인은 직접작성필수".replace(/\s+/g,'');
  const KR_REPLACE = "가입자명/예금주명/카드주명은 자필 작성(출력 후)".replace(/\s+/g,'');

  function removeStrictKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = (node.textContent||'').replace(/\s+/g,'');
      if (t && t.includes(KR_REMOVE)) node.style.display='none';
    });
  }
  function replaceSpecificKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = (node.textContent||'').replace(/\s+/g,'');
      if (t && t.includes(KR_REPLACE)) node.textContent = noteText();
    });
  }

  function updateExistingNotes(){
    document.querySelectorAll('[data-auto-note="caps-space-typo"]').forEach(n => n.textContent = noteText());
  }

  function hydrate(){
    enableInputsAndNotes();
    removeStrictKRNote();
    replaceSpecificKRNote();
    updateExistingNotes();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  // Delegated click for .chips .chip[data-lang]
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chips .chip[data-lang]');
    if (!btn) return;
    const v = (btn.getAttribute('data-lang')||'').toUpperCase();
    if (!NOTES[v]) return;
    setOverride(v);
    document.querySelectorAll('.chips .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setTimeout(hydrate, 50);
  }, true);

  // MutationObserver to sync with .chip.active
  const mo = new MutationObserver(() => {
    const active = document.querySelector('.chips .chip.active[data-lang]');
    if (active){
      const v = (active.getAttribute('data-lang')||'').toUpperCase();
      if (NOTES[v] && v !== getOverride()){ setOverride(v); }
    }
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });
})();