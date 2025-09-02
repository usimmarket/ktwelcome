const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

exports.handler = async (event) => {
  try {
    const data = event.httpMethod === 'POST'
      ? JSON.parse(event.body || '{}')
      : Object.fromEntries(new URLSearchParams(event.queryStringParameters || {}));

    const templateBytes = fs.readFileSync(path.join(__dirname, 'template.pdf'));
    const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'KT_mapping_legacy_names.json'), 'utf-8'));
    const malgun = fs.readFileSync(path.join(__dirname, 'malgun.ttf'));

    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(malgun, { subset: true });

    const drawTextTL = (page, txt, xTL, yTL, size) => {
      const { height } = page.getSize();
      const yBL = height - Number(yTL);
      page.drawText(String(txt), {
        x: Number(xTL),
        y: yBL,
        size: Number(size) || 10,
        font,
        color: rgb(0, 0, 0)
      });
    };

    const nowStr = new Date().toISOString().slice(0,10).replace(/-/g, '.');
    const fixedValue = (key) => key === 'apply_date' ? nowStr : '적용';
    const checkMark = '✓';

    const pages = pdfDoc.getPages();

    // 텍스트 & 고정값
    for (const [k, v] of Object.entries(mapping.fields || {})) {
      const pIdx = (v.page || 1) - 1;
      if (!pages[pIdx]) continue;
      const key = (v.source && v.source[0]) || k;
      const val = v.type === 'fixed' ? fixedValue(key) : (data[key] ?? '');
      if (!val) continue;
      drawTextTL(pages[pIdx], val, v.x, v.y, v.size || 10);
    }

    // 체크박스(V)
    for (const [opt, v] of Object.entries(mapping.vmap || {})) {
      const [optKey, optVal] = opt.split(':');
      const has = data[optKey];
      const shouldDraw = (has && String(has).toUpperCase() === String(optVal).toUpperCase());
      if (!shouldDraw) continue;
      const pIdx = (v.page || 1) - 1;
      if (!pages[pIdx]) continue;
      drawTextTL(pages[pIdx], checkMark, v.x, v.y, v.size || 11);
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
