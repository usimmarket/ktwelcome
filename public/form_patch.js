// form_patch.js
(function(){
  const STORAGE_KEY = "ktwelcome_form_values_v2";
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const isInput = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

  function enableInputs(){
    const candidates = [
      '#subscriber_name','[name="subscriber_name"]','[name*=subscriber][name*=name]',
      '#account_holder','[name="account_holder"]','[name*=account][name*=holder]',
      '[name*="예금"]','[id*="예금"]'
    ];
    const seen = new Set();
    for (const sel of candidates){
      $$(sel).forEach(el => {
        if (!isInput(el) || seen.has(el)) return;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
        if (el.placeholder && /작성|hand|write/i.test(el.placeholder)) el.placeholder='';
        seen.add(el);
      });
    }
  }

  function removeNotes(){
    $$('[data-role="handwrite-note"], [data-role="no-typing-note"]').forEach(el => el.remove());
    const phrases = [
      "성함과 사인은 직접 작성 필수",
      "가입자명/예금주명/카드주명은 자필 작성",
      "handwritten", "sign by hand", "write by hand", "must be handwritten"
    ].map(s=>s.toLowerCase());
    $$('p,small,span,div,li').forEach(el => {
      const t = (el.textContent||"").trim().toLowerCase();
      if (!t) return;
      const isKR = (t.includes("가입자명") || t.includes("예금주명") || t.includes("카드주명"));
      const isGeneric = phrases.some(p => t.includes(p));
      if ((isKR || isGeneric) && t.length < 120) el.remove();
    });
  }

  function loadStore(){ try { return JSON.parse(localStorage.getItem("ktwelcome_form_values_v2")||"{}"); } catch(e){ return {}; } }
  function saveStore(obj){ try { localStorage.setItem("ktwelcome_form_values_v2", JSON.stringify(obj)); } catch(e){} }

  function collectValues(){
    const store = loadStore();
    $$('input,select,textarea').forEach(el => {
      const key = el.name || el.id; if (!key) return;
      if (el.type === 'checkbox') store[key] = !!el.checked;
      else if (el.type === 'radio'){ if (el.checked) store[key] = el.value; }
      else store[key] = el.value;
    });
    saveStore(store);
  }

  function applyValues(){
    const store = loadStore();
    $$('input,select,textarea').forEach(el => {
      const key = el.name || el.id; if (!key || !(key in store)) return;
      if (el.type === 'checkbox') el.checked = !!store[key];
      else if (el.type === 'radio') el.checked = (store[key] === el.value);
      else el.value = store[key];
    });
  }

  function attachInputListeners(){
    $$('input,select,textarea').forEach(el => {
      el.removeEventListener('input', collectValues);
      el.addEventListener('input', collectValues);
      el.removeEventListener('change', collectValues);
      el.addEventListener('change', collectValues);
    });
  }

  const hydrate = () => { enableInputs(); removeNotes(); applyValues(); attachInputListeners(); };

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', hydrate); }
  else { hydrate(); }

  const mo = new MutationObserver(() => {
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  $$('[data-lang], .lang, .lang-switch, button, a').forEach(btn => {
    const label = (btn.dataset.lang || btn.textContent || "").trim().toUpperCase();
    if (["KR","US","VN","TH","KH"].includes(label)){
      btn.addEventListener('click', () => { collectValues(); setTimeout(hydrate, 60); }, { capture:true });
    }
  });

  window.addEventListener('beforeunload', collectValues);
})();