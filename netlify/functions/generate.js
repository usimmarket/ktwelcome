const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ROOT = __dirname;
const mappingPath  = path.join(ROOT, "KT_mapping_legacy_names.json");
const fontPath     = path.join(ROOT, "malgun.ttf");
const templatePath = path.join(ROOT, "template.pdf");

function loadOrNull(p) { try { return fs.readFileSync(p); } catch { return null; } }
function mergePayload(event){
  let body={}; try{ if(event.body) body=JSON.parse(event.body);}catch{}
  const query=event.queryStringParameters||{};
  return { ...(body||{}), ...(query||{}) };
}

// Remove problematic symbols (e.g., emoji, dingbats) that many fonts don't cover
function stripSymbols(str){
  if (str == null) return "";
  return String(str)
    // Emoji & pictographs
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    // Misc symbols, dingbats, arrows
    .replace(/[\u2190-\u21FF\u2600-\u27BF]/g, "");
}

exports.handler = async (event) => {
  try {
    const mode = (event.queryStringParameters && event.queryStringParameters.mode) || "download";
    const payload = mergePayload(event);

    const templateBytes = loadOrNull(templatePath);
    if (!templateBytes) return { statusCode: 500, body: "template.pdf not found in function bundle" };

    let mapping={}; const mb=loadOrNull(mappingPath);
    if(mb){ try{ mapping=JSON.parse(mb.toString("utf-8")); }catch{} }

    const pdf = await PDFDocument.load(templateBytes);

    // Try to embed Malgun first (for Hangul/Unicode). Fall back to Helvetica.
    let primaryFont = null;
    const malgunBytes = loadOrNull(fontPath);
    if (malgunBytes) {
      try { primaryFont = await pdf.embedFont(malgunBytes); } catch {}
    }
    const helv = await pdf.embedFont(StandardFonts.Helvetica);

    const pages = pdf.getPages();
    async function drawSafe(page, text, x, y, size=9){
      const t1 = stripSymbols(text);
      try {
        page.drawText(String(t1 ?? ""), { x, y, size, font: primaryFont || helv, color: rgb(0,0,0) });
      } catch (e) {
        // Final fallback: reduce to WinAnsi-safe by removing non-0x00-0xFF
        const t2 = String(t1 ?? "").replace(/[^\u0000-\u00FF]/g, "?");
        page.drawText(t2, { x, y, size, font: helv, color: rgb(0,0,0) });
      }
    }

    if (mapping && mapping.fields) {
      for (const [key, cfg] of Object.entries(mapping.fields)) {
        const pageIndex = Math.max(0, Math.min((cfg.page || 1) - 1, pages.length - 1));
        const page = pages[pageIndex];
        const val = payload[cfg.source || key] ?? payload[key] ?? "";
        await drawSafe(page, val, cfg.x, cfg.y, cfg.size || 9);
      }
    } else {
      const p = pages[0];
      let y = p.getHeight() - 60;
      const lines = [
        "Mapping file not found. Fallback rendering.",
        "Fields (first 20):",
        ...Object.keys(payload || {}).slice(0,20).map(k => `${k}: ${payload[k]}`)
      ];
      for (const line of lines){
        await drawSafe(p, line, 50, y, 10);
        y -= 14;
      }
    }

    const out = await pdf.save();
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
  } catch (e) {
    return { statusCode: 500, body: "Function error: " + (e?.message||String(e)) };
  }
};