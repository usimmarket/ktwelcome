// form_patch_final_plus_i18n2.js
(function(){
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const norm = (t) => (t || "").replace(/\u200B/g,'').replace(/\s+/g,'').trim();
  const upper = (t) => norm(t).toUpperCase();

  const REMOVE_PHRASE_KR = "성함과 사인은 직접작성필수".replace(/\s+/g,'');
  const REPLACE_SOURCE_KR = "가입자명/예금주명/카드주명은 자필 작성(출력 후)".replace(/\s+/g,'');

  const NOTES = {
    KR: "※대문자로작성/띄워쓰기 확인/오타 유의 해주시길바랍니다.",
    US: "※ Please use UPPERCASE, check spacing, and watch for typos.",
    VN: "※ Vui lòng viết HOA, kiểm tra khoảng cách và tránh lỗi chính tả.",
    TH: "※ โปรดใช้ตัวพิมพ์ใหญ่ ตรวจสอบการเว้นวรรค และระวังการพิมพ์ผิด",
    KH: "※ សូមប្រើអក្សរធំ ពិនិត្យការរំលងវាក្យ និងប្រយ័ត្នកំហុសវាយ"
  };

  const LANG_ALIASES = {
    KR: ["KR","KO","KOR","KOREAN","한국어","국문","한글"],
    US: ["US","EN","ENG","EN-US","ENGLISH","영문","English"],
    VN: ["VN","VI","VIE","VI-VN","TIENGVIET","TIẾNGVIỆT","베트남어"],
    TH: ["TH","THA","TH-TH","THAI","ไทย","태국어"],
    KH: ["KH","KM","KHM","KH-KH","KHMER","ខ្មែរ","크메르어","캄보디아어"]
  };

  const STORAGE_KEY = "ktw_lang_override_v1";

  function mapAlias(val){
    const U = upper(val).replace(/[^A-Z\u0E00-\u0E7F\u1780-\u17FF]/g,'');
    for (const [code, arr] of Object.entries(LANG_ALIASES)){
      if (arr.some(a => U.includes(upper(a).replace(/\W/g,'')))) return code;
    }
    if (["KR","US","VN","TH","KH"].includes(U)) return U;
    return null;
  }

  function getOverride(){ try { return localStorage.getItem(STORAGE_KEY) || null; } catch(e){ return null; } }
  function setOverride(code){ try { localStorage.setItem(STORAGE_KEY, code); } catch(e){} }

  function detectLang(){
    const ov = getOverride();
    if (ov && NOTES[ov]) return ov;

    const htmlLang = document.documentElement.getAttribute('lang') || "";
    const m1 = mapAlias(htmlLang);
    if (m1) return m1;

    const body = document.body;
    const dl = (body && (body.getAttribute('data-lang') || body.className || "") ) || "";
    const m2 = mapAlias(dl);
    if (m2) return m2;

    const cands = document.querySelectorAll('[data-lang].active, .lang.active, .lang-switch .active, [aria-current="true"], [aria-pressed="true"]');
    for (const el of cands){
      const v = el.getAttribute('data-lang') || el.textContent || "";
      const m = mapAlias(v);
      if (m) return m;
    }

    const buttons = document.querySelectorAll('[data-lang], .lang, .lang-switch button, .lang-switch a, nav a, button, a');
    for (const el of buttons){
      const v = el.getAttribute('data-lang') || el.textContent || "";
      const m = mapAlias(v);
      if (m) return m;
    }

    return "KR";
  }

  function noteText(){ const code = detectLang(); return NOTES[code] || NOTES.KR; }

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

  function removeStrictKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = upper(node.textContent).replace(/\s+/g,'');
      if (t && t.includes(upper(REMOVE_PHRASE_KR))) node.style.display='none';
    });
  }

  function replaceSpecificKRNote(){
    document.querySelectorAll('p,small,span,div,li').forEach(node => {
      if (isFormContainer(node)) return;
      const t = upper(node.textContent).replace(/\s+/g,'');
      if (t && t.includes(upper(REPLACE_SOURCE_KR))) node.textContent = noteText();
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

  document.querySelectorAll('[data-lang], .lang, .lang-switch button, .lang-switch a, nav a, button, a').forEach(el => {
    el.addEventListener('click', (ev) => {
      const raw = el.getAttribute('data-lang') || el.textContent || "";
      const mapped = mapAlias(raw);
      if (mapped){ setOverride(mapped); setTimeout(hydrate, 80); }
    }, { capture:true });
  });

  const mo = new MutationObserver(() => {
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

})();