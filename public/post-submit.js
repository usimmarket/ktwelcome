(function(){
  function collectFormValues(form) {
    const data = {};
    const formEl = form || document.getElementById('form') || document.querySelector('form');
    if (!formEl) return data;
    formEl.querySelectorAll('input, select, textarea').forEach(el => {
      const key = el.name || el.id;
      if (!key) return;
      if (el.type === 'radio') {
        if (el.checked) data[key] = el.value;
      } else if (el.type === 'checkbox') {
        if (!data[key]) data[key] = [];
        if (el.checked) data[key].push(el.value);
      } else {
        data[key] = el.value;
      }
    });
    return data;
  }

  async function postPdf(mode, data) {
    const res = await fetch('/.netlify/functions/generate?mode=' + (mode || 'download'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {})
    });
    if (!res.ok) {
      const t = await res.text();
      alert('PDF 생성 오류: ' + t);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (mode === 'print') {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url; a.download = 'application.pdf'; a.click();
    }
  }

  const formEl = document.getElementById('form') || document.querySelector('form');
  if (formEl) {
    formEl.addEventListener('submit', function(e){
      e.preventDefault();
      const submitter = e.submitter || document.activeElement;
      let mode = 'download';
      try {
        if (submitter && submitter.formAction) {
          const u = new URL(submitter.formAction, location.origin);
          mode = u.searchParams.get('mode') || 'download';
        }
      } catch (_){}
      const payload = collectFormValues(formEl);
      postPdf(mode, payload);
    });
  }
})();
