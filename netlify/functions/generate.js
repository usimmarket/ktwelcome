// ========== PATCHED generate.js ==========
// 전체 구조 및 패치 내용은 이전 응답 참고
// 기능: V체크는 알파벳 V, apply_date는 날짜 자동 치환 및 별칭 대응

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const PLAN_NAMES = {
  wel5: "5G 웰컴5 (통화200분/25GB+5Mbps)",
  wel7: "5G 웰컴7 (통화무제한/무제한+5Mbps)"
};

const DATE_ALIASES = new Set([
  "apply_date","applyDate","신청일","申請日",
  "ngay_dang_ky","ngày đăng ký","วันที่สมัคร","ថ្ងៃដាក់ពាក្យ",
  "date","apply-date"
]);

const here = (...p) => path.resolve(__dirname, ...p);
const readBin = (p) => fs.readFileSync(p);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function okPdf(bodyBytes, filename, inline = true) {
  return {
    statusCode: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="\${filename}"`,
    },
    body: Buffer.from(bodyBytes).toString("base64"),
    isBase64Encoded: true,
  };
}

function fail500(msg) {
  return {
    statusCode: 500,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    body: `Function error: \${msg}`,
  };
}

function vmapHit(optKey, form) {
  const [k, v] = String(optKey).split(":");
  if (!k) return false;
  const val = form?.[k];
  if (val == null) return false;
  if (Array.isArray(val)) return val.map(String).includes(String(v));
  return String(val) === String(v);
}

function ensureApplyDate(form) {
  if (!form) return;
  const k = "apply_date";
  if (!form[k] || String(form[k]).trim() === "") {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    form[k] = [d.getFullYear(), z(d.getMonth() + 1), z(d.getDate())].join(".");
  }

// ── Payment method normalization (bank/card) ───────────────────────────
function clearByPrefix(form, prefix) {
  for (const k of Object.keys(form || {})) {
    if (k.startsWith(prefix)) form[k] = "";
  }
}
function normalizePaymentMethod(form) {
  if (!form) return;
  const method = String(form.method || "").toLowerCase();
  if (method === "bank") {
    clearByPrefix(form, "card_");   // bank만 출력, card_* 초기화
  } else if (method === "card") {
    clearByPrefix(form, "bank_");   // card만 출력, bank_* 초기화
  }
}
}

function readFieldText(fieldDef, form, keyNameFromMap) {
  let src = Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source;

  if (!src && keyNameFromMap) {
    const k = String(keyNameFromMap).toLowerCase();
    if (k.includes("apply_date") || k.includes("신청") || k.includes("date")) src = "apply_date";
  }

  if (src && DATE_ALIASES.has(src)) src = "apply_date";
  if (!src) return "";
  const method = String(form.method || "").toLowerCase();
  const keyName = String((Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source) || keyNameFromMap || "");
  if (/^bank_/.test(keyName) && method && method !== "bank") return "";
  if (/^card_/.test(keyName) && method && method !== "card") return "";

  if (/(^|_)card_(holder|owner|name)$/.test(keyName)) {
    const v = (form.card_holder ?? form.card_owner ?? form.card_name ?? "");
    if (v !== undefined && v !== null) return String(v);
  }


  let t = form?.[src];
  if (t == null) {
    if (src === "apply_date") { ensureApplyDate(form); 
  normalizePaymentMethod(form);
t = form.apply_date || ""; }
    else return "";
  }

  t = String(t);
  if (form?.plan_name_full && (src === "plan" || src === "plan_code")) return String(form.plan_name_full);
  if (src === "plan" || src === "plan_code") t = PLAN_NAMES[t] ?? t;

  return t;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

    const templatePdf = readBin(here("template.pdf"));
    const malgunTtf  = readBin(here("malgun.ttf"));
    const mapping    = JSON.parse(readBin(here("KT_mapping_legacy_names.json"), "utf-8"));

    let form = {};
    let mode = (event.queryStringParameters && event.queryStringParameters.mode) || "print";
    if (event.httpMethod === "POST" && event.body) {
      try { form = JSON.parse(event.body); } catch {}
    }
    ensureApplyDate(form);

    const pdf = await PDFDocument.load(templatePdf);
    pdf.registerFontkit(fontkit);

    const malgun = await pdf.embedFont(malgunTtf, { subset: true });
    const helv = await pdf.embedFont(StandardFonts.Helvetica);

    const drawTextAt = (page, x, y, text, size = 10, useKoreanFont = true) => {
      const h = page.getHeight();
      const yy = h - y - size;
      page.drawText(text, {
        x,
        y: yy,
        size,
        font: useKoreanFont ? malgun : helv,
        color: rgb(0, 0, 0),
      });
    };

    const drawCheck = (page, x, y, size = 12) => {
      const s = Math.max(Number(size) || 12, 12);
      const h = page.getHeight();
      const yy = h - y - s;
      page.drawText("V", { x, y: yy, size: s, font: helv, color: rgb(0, 0, 0) });
    };

    if (mapping.fields) {
      for (const [key, def] of Object.entries(mapping.fields)) {
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        const txt = readFieldText(def, form, key);
        if (!txt) continue;
        drawTextAt(page, Number(def.x), Number(def.y), txt, Number(def.size || 10), true);
      }
    }

    if (mapping.vmap) {
      for (const [optKey, def] of Object.entries(mapping.vmap)) {
        if (!vmapHit(optKey, form)) continue;
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        drawCheck(page, Number(def.x), Number(def.y), Number(def.size || 11));
      }
    }

    if (mapping.fixed_flags && mapping.fixed_flags.intl_roaming_block) {
      for (const def of mapping.fixed_flags.intl_roaming_block) {
        let label = def.label || "국제전화차단/로밍차단";
        if (DATE_ALIASES.has(label) || /apply[_ ]?date|신청|date/i.test(label)) {
          ensureApplyDate(form);
          label = form.apply_date || "";
        }
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        drawTextAt(page, Number(def.x), Number(def.y), label, Number(def.size || 10), true);
      }
    }

    const pdfBytes = await pdf.save({ useObjectStreams: true });
    const inline = mode !== "save";
    return okPdf(pdfBytes, inline ? "preview.pdf" : "output.pdf", inline);
  } catch (err) {
    return fail500(err && err.message ? err.message : String(err));
  }
};
