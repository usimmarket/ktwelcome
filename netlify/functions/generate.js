const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = __dirname;

const mappingPath  = path.join(ROOT, "KT_mapping_legacy_names.json");
const fontPath     = path.join(ROOT, "malgun.ttf");
const templatePath = path.join(ROOT, "template.pdf");

function loadOrNull(p) {
  try { return fs.readFileSync(p); } catch (_) { return null; }
}

function mergePayload(event) {
  let body = {};
  try { if (event.body) body = JSON.parse(event.body); } catch (_) {}
  const queryObj = event.queryStringParameters || {};
  return { ...(body || {}), ...(queryObj || {}) };
}

exports.handler = async (event, context) => {
  try {
    const mode = (event.queryStringParameters && event.queryStringParameters.mode) || "download";
    const payload = mergePayload(event);

    const templateBytes = loadOrNull(templatePath);
    if (!templateBytes) {
      return { statusCode: 500, body: "template.pdf not found in function bundle" };
    }

    let mappingJSON = {};
    const mappingBytes = loadOrNull(mappingPath);
    if (mappingBytes) {
      try { mappingJSON = JSON.parse(mappingBytes.toString("utf-8")); } catch (_) {}
    }

    const pdfDoc = await PDFDocument.load(templateBytes);
    const fontBytes = loadOrNull(fontPath);
    let customFont = null;
    if (fontBytes) {
      try { customFont = await pdfDoc.embedFont(fontBytes); } catch (_) {}
    }
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    function drawText(page, text, x, y, size=9) {
      const font = customFont || fallbackFont;
      page.drawText(String(text ?? ""), { x, y, size, font, color: rgb(0,0,0) });
    }

    const pages = pdfDoc.getPages();
    if (mappingJSON && mappingJSON.fields) {
      Object.entries(mappingJSON.fields).forEach(([uiKey, cfg]) => {
        const pageIndex = Math.max(0, Math.min((cfg.page ?? 1) - 1, pages.length - 1));
        const page = pages[pageIndex];
        const value =
          payload[cfg.source || uiKey] ??
          payload[uiKey] ??
          "";
        drawText(page, value, cfg.x, cfg.y, cfg.size || 9);
      });
    } else {
      const page = pages[0];
      let y = page.getHeight() - 60;
      const info = [
        "⚠ KT_mapping_legacy_names.json not found. Using fallback renderer.",
        "Fields received (first 20):",
        ...Object.keys(payload || {}).slice(0, 20).map(k => `• ${k}: ${payload[k]}`)
      ];
      info.forEach(line => { drawText(page, line, 50, y, 10); y -= 14; });
    }

    const out = await pdfDoc.save();
    const disposition = mode === "print" ? "inline" : "attachment";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename=application.pdf`,
        "Cache-Control": "no-store"
      },
      body: Buffer.from(out).toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    return { statusCode: 500, body: `Function error: ${err && err.message ? err.message : String(err)}` };
  }
};