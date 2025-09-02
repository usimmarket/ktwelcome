const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

function parseInput(event) {
  try {
    if (event.httpMethod === 'POST') return JSON.parse(event.body || '{}');
  } catch {}
  return Object.fromEntries(new URLSearchParams(event.queryStringParameters || {}));
}
function todayDot() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}.${m}.${day}`;
}
function detectImageSize(mapping) {
  if (mapping && mapping.meta && mapping.meta.image_size) {
    return { w: Number(mapping.meta.image_size.w)||793, h: Number(mapping.meta.image_size.h)||1122 };
  }
  return { w: 793, h: 1122 };
}
function placementsFromMapping(mapping) {
  const flat = {};
  const push = (key, p) => {
    if (!flat[key]) flat[key] = [];
    flat[key].push(p);
  };
  if (mapping.fields) {
    for (const [k,v] of Object.entries(mapping.fields)) {
      const base = (v.source && v.source[0]) || k.replace(/_p\d+(_\d+)?$/,'');
      push(base, { x: Number(v.x), y: Number(v.y), size: Number(v.size)||10, page: Number(v.page)||1, type: v.type==='fixed'?'fixed':'text' });
    }
  }
  for (const [k,v] of Object.entries(mapping)) {
    if (['meta','fields','vmap','fixed_flags'].includes(k)) continue;
    if (Array.isArray(v)) {
      for (const p of v) {
        push(k, { x: Number(p.x), y: Number(p.y), size: Number(p.size)||10, page: Number(p.page)||1, type: p.type==='fixed'?'fixed':'text' });
      }
    }
  }
  const vmap = mapping.vmap || {};
  const fixedFlags = mapping.fixed_flags || {};
  return { placements: flat, vmap, fixedFlags };
}
function computeScale(imageSize, pageSize) {
  const sx = pageSize.width / imageSize.w;
  const sy = pageSize.height / imageSize.h;
  return { sx, sy, font: sx };
}
function toPdfPointTopLeft(p, pageSize, scale) {
  const x = p.x * scale.sx;
  const yTop = p.y * scale.sy;
  const y = pageSize.height - yTop;
  const size = (p.size||10) * (scale.font || scale.sx);
  return { x, y, size, page: p.page||1 };
}
function drawCheckmark(page, x, y, size) {
  const thick = Math.max(1, size * 0.12);
  const w = size * 0.9, h = size * 0.9;
  const x0 = x - w * 0.45, y0 = y - h * 0.25;
  page.drawLine({ start: {x:x0, y:y0}, end: {x:x0 + w*0.35, y:y0 - h*0.35}, thickness: thick, color: rgb(0,0,0) });
  page.drawLine({ start: {x:x0 + w*0.35, y:y0 - h*0.35}, end: {x:x0 + w, y:y0 + h*0.35}, thickness: thick, color: rgb(0,0,0) });
}

exports.handler = async (event) => {
  try {
    const data = parseInput(event);
    const templateBytes = fs.readFileSync(path.join(__dirname, 'template.pdf'));
    const mappingText = fs.readFileSync(path.join(__dirname, 'KT_mapping_legacy_names.json'), 'utf8');
    const mapping = JSON.parse(mappingText);
    const malgun = fs.readFileSync(path.join(__dirname, 'malgun.ttf'));

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(malgun, { subset: true });
    const pages = pdfDoc.getPages();

    const imageSize = detectImageSize(mapping);
    const { placements, vmap, fixedFlags } = placementsFromMapping(mapping);

    // Draw text/fixed placements
    for (const [key, arr] of Object.entries(placements)) {
      const value = key === 'apply_date' ? todayDot() : (data[key] ?? '');
      for (const p of arr) {
        const page = pages[(p.page||1)-1];
        if (!page) continue;
        const scale = computeScale(imageSize, page.getSize());
        const pt = toPdfPointTopLeft(p, page.getSize(), scale);
        const text = (p.type === 'fixed')
          ? (key === 'apply_date' ? todayDot() : '적용')
          : String(value || '');
        if (!text) continue;
        page.drawText(text, { x: pt.x, y: pt.y, size: pt.size, font, color: rgb(0,0,0) });
      }
    }

    // Draw checkmarks based on vmap and data values
    for (const [opt, pos] of Object.entries(vmap || {})) {
      const [k, needRaw] = String(opt).split(':');
      const need = String(needRaw||'').toUpperCase();
      const got = String(data[k]||'').toUpperCase();
      if (!need || !got || got !== need) continue;
      const p = { x:Number(pos.x), y:Number(pos.y), size:Number(pos.size)||11, page:Number(pos.page)||1 };
      const page = pages[p.page-1];
      if (!page) continue;
      const scale = computeScale(imageSize, page.getSize());
      const pt = toPdfPointTopLeft(p, page.getSize(), scale);
      drawCheckmark(page, pt.x, pt.y, pt.size);
    }

    // Fixed flags with custom labels
    // Each entry should be { x, y, size, page, label }
    for (const [flagKey, list] of Object.entries(fixedFlags || {})) {
      for (const p0 of (list||[])) {
        const p = { x:Number(p0.x), y:Number(p0.y), size:Number(p0.size)||10, page:Number(p0.page)||1 };
        const label = (p0.label && String(p0.label)) || '적용';
        const page = pages[p.page-1];
        if (!page) continue;
        const scale = computeScale(imageSize, page.getSize());
        const pt = toPdfPointTopLeft(p, page.getSize(), scale);
        page.drawText(label, { x: pt.x, y: pt.y, size: pt.size, font, color: rgb(0,0,0) });
      }
    }

    const out = await pdfDoc.save({ useObjectStreams: false });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/pdf' },
      body: Buffer.from(out).toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: `PDF 생성 오류: ${err.message}` };
  }
};
