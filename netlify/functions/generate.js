const nodePath = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const qs = require('qs');
const fontkit = require('@pdf-lib/fontkit');

const TEMPLATE_PDF_PATH = nodePath.join(__dirname, 'template.pdf');
const FONT_PATH         = nodePath.join(__dirname, 'malgun.ttf');
const MAP_PATH          = nodePath.join(__dirname, 'KT_mapping_legacy_names.json');

const PLANS = {
  wel5: { title: '5G 웰컴5 (통화200분/25GB+5Mbps)', total: '177,000', monthly: '59,000', disc: '20,250', bill: '38,750' },
  wel3: { title: '5G 웰컴3 (통화200분/3GB+5Mbps)', total: '147,000', monthly: '49,000', disc: '15,550', bill: '33,450' },
  wel1: { title: '5G 웰컴1 (통화200분/1GB+3Mbps)', total: '117,000', monthly: '39,000', disc: '13,050', bill: '25,950' },
};

exports.handler = async (event) => {
  try {
    const isForm = (event.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
    const data = isForm ? qs.parse(event.body || '') : (event.body ? JSON.parse(event.body) : {});

    const plan = PLANS[data.plan] || null;
    const set = (k, v) => { if (v !== undefined && v !== null) data[k] = String(v); };
    if (plan) {
      set('plan_name', plan.title);
      set('total_discount', plan.total);
      set('base_monthly_fee', plan.monthly);
      set('plan_disc', plan.disc);
      set('final_monthly_fee', plan.bill);
    }

    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const y = String(kst.getFullYear());
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const d = String(kst.getDate()).padStart(2, '0');
    set('apply_date', `${y}.${m}.${d}`);
    
    set('svc_summary', '국제전화차단/로밍차단');

    if (!fs.existsSync(TEMPLATE_PDF_PATH)) throw new Error('template.pdf not found in netlify/functions folder.');
    if (!fs.existsSync(FONT_PATH)) throw new Error('malgun.ttf not found in netlify/functions folder.');

    const pdfBytes = fs.readFileSync(TEMPLATE_PDF_PATH);
    const fontBytes = fs.readFileSync(FONT_PATH);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    const pages = pdfDoc.getPages();
    const mapping = [];
    Object.entries(RAW_MAPPING).forEach(([name, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(m => mapping.push({ name, ...m }));
    });

    for (const m of mapping) {
      const pageIdx = (m.page || 1) - 1;
      const page = pages[pageIdx];
      if (!page) continue;
      const { width, height } = page.getSize();
      const x = width * (Number(m.xPct) / 100);
      const y = height * (Number(m.yPct) / 100);
      const size = Number(m.size || 10);
      const align = m.align || 'left';

      let text = '';
      if (m.mode === 'fixed-text') {
        text = String(m.fixedText || '');
      } else if (m.mode === 'check') {
        const hay = String(data[m.name] || '');
        const yes = String(m.cond || '');
        text = hay.split(',').map(s => s.trim()).includes(yes) ? '✔' : '';
      } else {
        text = data[m.name] != null ? String(data[m.name]) : '';
      }
      if (!text) continue;

      let drawX = x;
      const textWidth = font.widthOfTextAtSize(text, size);
      if (align === 'center') drawX = x - textWidth / 2;
      if (align === 'right') drawX = x - textWidth;

      page.drawText(text, { x: drawX, y, size, font });
    }

    const out = await pdfDoc.save();
    const mode = (data.mode || 'download') === 'inline' ? 'inline' : 'attachment';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${mode}; filename="KT_WELCOME.pdf"`,
      },
      body: Buffer.from(out).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err && err.stack || err) }),
    };
  }
};
