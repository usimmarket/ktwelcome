const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = __dirname;
const PATHS = {
  mapping:  path.join(ROOT, "KT_mapping_legacy_names.json"),
  font:     path.join(ROOT, "malgun.ttf"),
  template: path.join(ROOT, "template.pdf")
};

function loadOrNull(p){ try{ return fs.readFileSync(p);}catch{ return null; } }

function mergePayload(event){
  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch {}
  const query = event.queryStringParameters || {};
  return { ...(body || {}), ...(query || {}) };
}

function today(fmt="yyyy.MM.dd"){
  const d=new Date(); const z=n=>String(n).padStart(2,"0");
  return fmt.replace(/yyyy/g,d.getFullYear()).replace(/MM/g,z(d.getMonth()+1)).replace(/dd/g,z(d.getDate()));
}

exports.handler = async (event) => {
  try {
    const payload = mergePayload(event);
    const mode = payload.mode === "print" ? "print" : "download";

    if (!payload.apply_date) payload.apply_date = today();

    const templateBytes = loadOrNull(PATHS.template);
    const mappingBytes  = loadOrNull(PATHS.mapping);
    let mapping = {};
    if (mappingBytes) { try { mapping = JSON.parse(mappingBytes.toString("utf-8")); } catch {} }

    const pdfDoc = templateBytes ? await PDFDocument.load(templateBytes) : await PDFDocument.create();
    if (!templateBytes) pdfDoc.addPage([595.28, 841.89]); // A4

    let primary = null;
    const malgun = loadOrNull(PATHS.font);
    if (malgun) { try { primary = await pdfDoc.embedFont(malgun); } catch {} }
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();
    const page1 = pages[0];

    const draw = (page, text, x, y, size=10) => {
      page.drawText(String(text ?? ""), { x, y, size, font: primary || helv, color: rgb(0,0,0) });
    };

    if (mapping && mapping.fields) {
      for (const [key, cfg] of Object.entries(mapping.fields)) {
        const p = pages[Math.max(0, Math.min((cfg.page||1)-1, pages.length-1))];
        const value =
          (cfg.const != null ? cfg.const :
           cfg.format && cfg.format.startsWith("date:") ? today(cfg.format.split(":")[1]) :
           payload[cfg.source || key] ?? "");
        draw(p, value, cfg.x||50, cfg.y||50, cfg.size||10);
      }
    } else {
      draw(page1, "PDF generated (fallback).", 50, 800, 12);
      let y = 780;
      const keys = Object.keys(payload||{});
      keys.slice(0, 20).forEach(k => { draw(page1, `${k}: ${payload[k]}`, 50, y, 10); y -= 14; });
    }

    const out = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": (mode === "print" ? "inline" : "attachment") + "; filename=application.pdf"
      },
      body: Buffer.from(out).toString("base64"),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, body: "Function error: " + (e?.message || String(e)) };
  }
};