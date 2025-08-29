const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit"); // for embedding TTF

const ROOT = __dirname;
const mappingPath  = path.join(ROOT, "KT_mapping_legacy_names.json");
const fontPath     = path.join(ROOT, "malgun.ttf");
const templatePath = path.join(ROOT, "template.pdf");

function loadOrNull(p){ try{ return fs.readFileSync(p);}catch{ return null; } }

function mergePayload(event){
  let body={}; try{ if(event.body) body = JSON.parse(event.body);}catch{}
  const query = event.queryStringParameters || {};
  return { ...(body||{}), ...(query||{}) };
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
    if (!payload.intl_block) payload.intl_block = "적용";
    if (!payload.roaming_block) payload.roaming_block = "적용";

    const templateBytes = loadOrNull(templatePath);
    const mappingBytes  = loadOrNull(mappingPath);
    let mapping = {};
    if (mappingBytes) { try { mapping = JSON.parse(mappingBytes.toString("utf-8")); } catch {} }

    const pdfDoc = templateBytes ? await PDFDocument.load(templateBytes) : await PDFDocument.create();
    if (!templateBytes) pdfDoc.addPage([595.28, 841.89]);
    pdfDoc.registerFontkit(fontkit);

    const fontBytes = loadOrNull(fontPath);
    if (!fontBytes) {
      return { statusCode: 500, body: "malgun.ttf not found in function bundle" };
    }
    const malgun = await pdfDoc.embedFont(fontBytes, { subset: true });

    const pages = pdfDoc.getPages();
    const draw = (page, text, x, y, size=10) => {
      page.drawText(String(text ?? ""), { x, y, size, font: malgun, color: rgb(0,0,0) });
    };

    if (mapping && mapping.fields) {
      for (const [key, cfg] of Object.entries(mapping.fields)) {
        const idx = Math.max(0, Math.min((cfg.page||1)-1, pages.length-1));
        const p = pages[idx];
        const val =
          (cfg.const != null ? cfg.const :
           cfg.format && cfg.format.startsWith("date:") ? today(cfg.format.split(":")[1]) :
           payload[cfg.source || key] ?? "");
        draw(p, val, cfg.x||50, cfg.y||50, cfg.size||10);
      }
    } else {
      const p = pages[0];
      draw(p, "PDF generated (fallback).", 50, 800, 12);
      let y = 780;
      Object.keys(payload||{}).slice(0,20).forEach(k => { draw(p, `${k}: ${payload[k]}`, 50, y, 10); y -= 14; });
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
    return { statusCode: 500, body: "Function error: " + (e?.message||String(e)) };
  }
};