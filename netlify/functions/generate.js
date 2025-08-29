const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = __dirname; // runtime bundle path (e.g., /var/task/netlify/functions)

// Safe path joins
const mappingPath  = path.join(ROOT, "KT_mapping_legacy_names.json");
const fontPath     = path.join(ROOT, "malgun.ttf");       // optional; falls back to StandardFonts
const templatePath = path.join(ROOT, "template.pdf");

/**
 * Load helper with graceful fallback. If a file is missing in production,
 * we don't crash the function; instead, we use defaults and return a 200 PDF
 * so the UI "인쇄/저장" just works.
 */
function loadOrNull(p) {
  try {
    return fs.readFileSync(p);
  } catch (e) {
    return null;
  }
}

exports.handler = async (event, context) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Parse payload
    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (_) {}

    // Load resources
    const templateBytes = loadOrNull(templatePath);
    if (!templateBytes) {
      return {
        statusCode: 500,
        body: "template.pdf not found in function bundle",
      };
    }

    // mapping (optional). Expected shape: { fields: { uiName: {x,y,size,page,source} } }
    let mappingJSON = {};
    const mappingBytes = loadOrNull(mappingPath);
    if (mappingBytes) {
      try { mappingJSON = JSON.parse(mappingBytes.toString("utf-8")); } catch (_) {}
    }

    // Prepare pdf
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fontBytes = loadOrNull(fontPath);
    let customFont = null;
    if (fontBytes) {
      try { customFont = await pdfDoc.embedFont(fontBytes); } catch (_) {}
    }
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Drawing helper
    function drawText(page, text, x, y, size=9) {
      const font = customFont || fallbackFont;
      page.drawText(String(text ?? ""), { x, y, size, font, color: rgb(0,0,0) });
    }

    // If mapping present, use it. Otherwise, just render a simple summary on page 1.
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
      // Minimal fallback rendering (no mapping file found)
      const page = pages[0];
      const info = [
        "⚠ KT_mapping_legacy_names.json not found. Using fallback renderer.",
        "Fields received:",
        ...Object.keys(payload || {}).slice(0, 20).map(k => `• ${k}: ${payload[k]}`)
      ];
      let y = page.getHeight() - 60;
      info.forEach(line => {
        drawText(page, line, 50, y, 10);
        y -= 14;
      });
    }

    const out = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=application.pdf"
      },
      body: Buffer.from(out).toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: `Function error: ${err && err.message ? err.message : String(err)}`
    };
  }
};