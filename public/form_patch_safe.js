// form_patch_safe.js
(function(){
  const STORAGE_KEY = "ktwelcome_form_values_v3";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const isInput = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');

  function enableTargets(){
    const selectors = [
      '#subscriber_name','[name="subscriber_name"]','[name*=subscriber][name*=name]',
      '#account_holder','[name="account_holder"]','[name*=account][name*=holder]',
    ];
    const seen = new Set();
    for (const s of selectors){
      $$(s).forEach(el => {
        if (!isInput(el) || seen.has(el)) return;
        el.removeAttribute('readonly');
        el.removeAttribute('disabled');
        if (el.placeholder) el.placeholder = '';
        seen.add(el);
      });
    }
  }

  function removeOnlyNotes(){
    const exactKR = [
      "성함과 사인은 직접 작성 필수",
      "가입자명/예금주명/카드주명은 자필 작성(출력 후)",
      "가입자명/예금주명/카드주명은 자필 작성"
    ];
    const genericEN = [
      "must be handwritten", "handwritten only", "sign by hand", "write by hand"
    ];
    const all = exactKR.concat(genericEN).map(t => t.toLowerCase());

    const nodes = $$('p,small,span,div,li');
    nodes.forEach(n => {
      if (n.querySelector('input,select,textarea')) return;  // do not remove containers with inputs
      const txt = (n.textContent || '').trim().toLowerCase();
      if (!txt) return;
      if (all.some(ph => txt === ph || txt.includes(ph))) {
        if (txt.length < 120) n.remove();
      }
    });
  }

  function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch(e){ return {}; } }
  function save(o){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch(e){} }

  function collect(){
    const o = load();
    $$('input,select,textarea').forEach(el => {
      const k = el.name || el.id; if (!k) return;
      if (el.type === 'checkbox') o[k] = !!el.checked;
      else if (el.type === 'radio'){ if (el.checked) o[k] = el.value; }
      else o[k] = el.value;
    });
    save(o);
  }

  function apply(){
    const o = load();
    $$('input,select,textarea').forEach(el => {
      const k = el.name || el.id; if (!k || !(k in o)) return;
      if (el.type === 'checkbox') el.checked = !!o[k];
      else if (el.type === 'radio') el.checked = (o[k] === el.value);
      else el.value = o[k];
    });
  }

  function attach(){
    $$('input,select,textarea').forEach(el => {
      el.removeEventListener('input', collect);
      el.addEventListener('input', collect);
      el.removeEventListener('change', collect);
      el.addEventListener('change', collect);
    });
  }

  const hydrate = () => { enableTargets(); removeOnlyNotes(); apply(); attach(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  const mo = new MutationObserver(() => {
    if (mo._t) cancelAnimationFrame(mo._t);
    mo._t = requestAnimationFrame(hydrate);
  });
  mo.observe(document.documentElement, { childList:true, subtree:true });

  $$('[data-lang], .lang, .lang-switch, button, a').forEach(btn => {
    const label = (btn.dataset.lang || btn.textContent || '').trim().toUpperCase();
    if (['KR','US','VN','TH','KH'].includes(label)){
      btn.addEventListener('click', () => { collect(); setTimeout(hydrate, 60); }, { capture:true });
    }
  });

  window.addEventListener('beforeunload', collect);
})();