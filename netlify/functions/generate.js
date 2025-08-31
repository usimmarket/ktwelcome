// netlify/functions/generate.js
// PDF generator with checkbox options + multi-placement + date/const handling
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

function parseBody(event) {
  try {
    if (event.httpMethod === 'POST') {
      if (event.headers['content-type'] && event.headers['content-type'].includes('application/json')) {
        return JSON.parse(event.body || '{}');
      }
      // url-encoded
      const params = new URLSearchParams(event.body || '');
      return Object.fromEntries(params.entries());
    }
  } catch (e) {}
  return {};
}

function valOf(data, key, fallback=null) {
  if (!key) return fallback;
  const v = data[key];
  return v === undefined || v === null ? fallback : v;
}

function getValueForField(data, key, cfg) {
  // const, date, or from source
  if (cfg.const !== undefined) return String(cfg.const);
  if (cfg.format && cfg.format.startsWith('date:')) {
    const fmt = cfg.format.slice('date:'.length);
    const now = new Date();
    const z = n => String(n).padStart(2, '0');
    const yyyy = now.getFullYear();
    const MM = z(now.getMonth()+1);
    const dd = z(now.getDate());
    return fmt.replace('yyyy', yyyy).replace('MM', MM).replace('dd', dd);
  }
  // if source set, prefer first one; otherwise use key itself
  const sourceKey = Array.isArray(cfg.source) && cfg.source.length ? cfg.source[0] : key;
  return valOf(data, sourceKey, '');
}

function normalize(val) {
  if (val == null) return null;
  if (Array.isArray(val)) return val.map(v => String(v).trim());
  const s = String(val).trim();
  // allow CSV like "KR,EN"
  if (s.includes(',')) return s.split(',').map(x => x.trim());
  return s;
}

exports.handler = async (event) => {
  try {
    const query = event.queryStringParameters || {};
    const mode = (query.mode || '').toLowerCase(); // "print" or "save"
    const debug = (query.debug || '') === '1';
    const qsData = {...query};
    delete qsData.mode; delete qsData.debug;

    const bodyData = parseBody(event);
    const data = { ...qsData, ...bodyData };

    // Load assets
    const here = __dirname;
    const templatePath = path.join(here, 'template.pdf');
    const fontPath = path.join(here, 'malgun.ttf');
    const mapPath = path.join(here, 'KT_mapping_legacy_names.json');

    const [templateBytes, fontBytes, mapText] = [
      fs.readFileSync(templatePath),
      fs.readFileSync(fontPath),
      fs.readFileSync(mapPath, 'utf8'),
    ];

    const mapping = JSON.parse(mapText);
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    // helpers
    function drawText(pageNo, text, x, y, size=10) {
      const page = pdfDoc.getPage(pageNo-1);
      page.drawText(String(text ?? ''), { x, y, size, font, color: rgb(0,0,0) });
    }
    function drawCheck(pageNo, x, y, size=12) {
      const page = pdfDoc.getPage(pageNo-1);
      page.drawText('✔', { x, y, size, font, color: rgb(0,0,0) });
    }
    function drawDebug(pageNo, x, y, label) {
      if (!debug) return;
      const page = pdfDoc.getPage(pageNo-1);
      // cross hair
      page.drawLine({ start: {x:x-6, y}, end: {x:x+6, y}, thickness: 0.8, color: rgb(1,0,0) });
      page.drawLine({ start: {x, y:y-6}, end: {x, y:y+6}, thickness: 0.8, color: rgb(1,0,0) });
      // label
      page.drawText(label, { x: x+8, y: y+6, size: 8, font, color: rgb(1,0,0) });
    }

    // Aliases for checkbox sources
    const checkboxSourceAlias = {
      gender_cb: 'gender',
      prevcarrier_cb: 'prevcarrier',
    };

    // Iterate mapping
    const fields = mapping.fields || {};
    for (const [key, cfg] of Object.entries(fields)) {
      if (cfg && cfg.options) {
        // Checkbox/option style
        const sourceKey = checkboxSourceAlias[key] || key;
        let val = normalize(valOf(data, sourceKey, null));
        if (val == null) continue;

        const arr = Array.isArray(val) ? val : [val];
        for (let raw of arr) {
          const v = String(raw).trim();
          // try exact match first, then case-insensitive keys
          let optCfg = cfg.options[v] || cfg.options[v.toUpperCase()] || cfg.options[v.toLowerCase()];
          if (!optCfg) continue;
          drawCheck(optCfg.page || cfg.page || 1, optCfg.x, optCfg.y, optCfg.size || 12);
          drawDebug(optCfg.page || cfg.page || 1, optCfg.x, optCfg.y, `${key}:${v}`);
        }
        continue;
      }

      // Normal text field (supports multi-placement via separate keys *_p{page} with "source":[base])
      const text = getValueForField(data, key, cfg);
      // Skip empty unless const/date
      if (!text && !(cfg.const || (cfg.format && cfg.format.startsWith('date:')))) continue;

      drawText(cfg.page || 1, text, cfg.x, cfg.y, cfg.size || 10);
      drawDebug(cfg.page || 1, cfg.x, cfg.y, `${key}`);
    }

    const pdfBytes = await pdfDoc.save();

    if (mode === 'print' || mode === 'save') {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/pdf',
          ...(mode === 'save' ? {'Content-Disposition': 'attachment; filename="kt_form.pdf"'} : {}),
        },
        body: Buffer.from(pdfBytes).toString('base64'),
        isBase64Encoded: true,
      };
    }
    // default: ok JSON
    return { statusCode: 200, body: JSON.stringify({ status: 'ok' }) };
  } catch (err) {
    return { statusCode: 500, body: `Function error: ${err.message}` };
  }
};
