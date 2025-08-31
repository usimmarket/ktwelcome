// name_enabler.js
(function(){
  function enable() {
    const el = document.querySelector('#subscriber_name, [name="subscriber_name"]');
    if (!el) return;
    el.removeAttribute('readonly');
    el.removeAttribute('disabled');
    el.placeholder = '';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable);
  } else {
    enable();
  }
})();
