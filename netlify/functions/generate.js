const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

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
    const mode   = payload.mode === "print" ? "print" : "download";
    const debug  = payload.debug === "1" || payload.debug === 1 || payload.debug === true;

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
    if (!fontBytes) return { statusCode: 500, body: "malgun.ttf not found" };
    const malgun = await pdfDoc.embedFont(fontBytes, { subset: true });

    const pages = pdfDoc.getPages();
    const drawText = (page, text, x, y, size=10) => {
      page.drawText(String(text ?? ""), { x, y, size, font: malgun, color: rgb(0,0,0) });
    };
    const cross = (page, x, y, label) => {
      page.drawLine({ start: {x:x-6, y}, end: {x:x+6, y}, thickness: 0.5, color: rgb(1,0,0) });
      page.drawLine({ start: {x, y:y-6}, end: {x, y:y+6}, thickness: 0.5, color: rgb(1,0,0) });
      drawText(page, label || "", x+8, y+2, 8);
    };

    function valueFrom(cfg, key) {
      if (!cfg) return "";
      if (cfg.const != null) return cfg.const;
      if (cfg.format && cfg.format.startsWith("date:")) {
        const f = cfg.format.split(":")[1] || "yyyy.MM.dd";
        return today(f);
      }
      const src = cfg.source || key;
      if (Array.isArray(src)) {
        for (const k of src) if (payload[k] != null && payload[k] !== "") return payload[k];
        return "";
      }
      return payload[src] ?? "";
    }

    if (mapping && mapping.fields) {
      for (const [key, cfg] of Object.entries(mapping.fields)) {
        const pageIndex = Math.max(0, Math.min((cfg.page||1)-1, pages.length-1));
        const page = pages[pageIndex];
        const x = cfg.x || 50, y = cfg.y || 50, size = cfg.size || 10;
        const val = valueFrom(cfg, key);

        if (debug) cross(page, x, y, key);
        drawText(page, val, x, y, size);
      }
    } else {
      const p = pages[0];
      drawText(p, "Mapping file not found.", 50, 800, 12);
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