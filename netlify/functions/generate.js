// ========== PATCHED generate.js ==========
// 전체 구조 및 패치 내용은 이전 응답 참고
// 기능: V체크는 알파벳 V, apply_date는 날짜 자동 치환 및 별칭 대응

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

const PLAN_NAMES = {
  wel5: "5G 웰컴5 (통화200분/25GB+5Mbps)",
  wel3: "5G 웰컴3 (통화200분/3GB+5Mbps)",
  wel1: "5G 웰컴1 (통화200분/1GB+3Mbps)"
};
const PLAN_FULLNAME = PLAN_NAMES;
// ── Payment method normalization (bank/card) ───────────────────────────
function clearByPrefix(form, prefix) {
  for (const k of Object.keys(form || {})) {
    if (k.startsWith(prefix)) form[k] = "";
  }
}
function normalizePaymentMethod(form) {
  if (!form) return;
  let method = String(form.method || "").toLowerCase();

  // (A) 사용자가 method를 안 보낸 케이스 추론
  if (!method) {
    const hasCard = Object.keys(form).some(k => k.startsWith("card_") && String(form[k] || "").trim() !== "");
    const hasBank = Object.keys(form).some(k => k.startsWith("bank_") && String(form[k] || "").trim() !== "");
    if (hasCard && !hasBank) method = "card";
    else if (hasBank && !hasCard) method = "bank";
  }

  // (B) 상호 배타 무효화
  if (method === "bank") {
    clearByPrefix(form, "card_");   // 은행 선택 → card_* 전부 무효
  } else if (method === "card") {
    clearByPrefix(form, "bank_");   // 카드 선택 → bank_* 전부 무효
  }

  form.method = method || form.method; // 추론했으면 저장
}

}

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
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    },
    body: Buffer.from(bodyBytes).toString("base64"),
    isBase64Encoded: true,
  };
}

function fail500(msg) {
  return {
    statusCode: 500,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    body: `Function error: ${msg}`,
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
    clearByPrefix(form, "card_");   // 은행 선택 시 card_* 값 전부 무효화
  } else if (method === "card") {
    clearByPrefix(form, "bank_");   // 카드 선택 시 bank_* 값 전부 무효화
  }
}


function ensureApplyDate(form) {
normalizePaymentMethod(form);  
  
  if (!form) return;
  const k = "apply_date";
  if (!form[k] || String(form[k]).trim() === "") {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    form[k] = [d.getFullYear(), z(d.getMonth() + 1), z(d.getDate())].join(".");
  }
}

// ▼▼▼ 이 함수로 '통째로' 교체하세요 ▼▼▼
function readFieldText(fieldDef, form, keyNameFromMap) {
  // source 키(또는 매핑 키) 결정
  let src = Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source;

  // 신청일 별칭 처리
  if (!src && /apply[_-]?date|신청일|申請日|date/i.test(keyNameFromMap || "")) {
    src = "apply_date";
  }

  // ── 은행/카드 출력 게이트 ──────────────────────────────
  const method = String(form.method || "").toLowerCase();   // "bank" | "card" | ""
  const keyName = String(src || keyNameFromMap || "");
  if (/^bank_/.test(keyName) && method && method !== "bank") return ""; // 카드 선택 시 bank_* 차단
  if (/^card_/.test(keyName) && method && method !== "card") return ""; // 은행 선택 시 card_* 차단

  // 신청일 자동
  if (src === "apply_date") {
    if (!form.apply_date || String(form.apply_date).trim() === "") {
      const d = new Date();
      const z = (n) => String(n).padStart(2, "0");
      form.apply_date = `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())}`;
    }
    return form.apply_date || "";
  }

  // 값 읽기
  let t = src ? form?.[src] : form?.[keyNameFromMap];
  if (t == null) t = "";

  // 요금제 풀네임 치환(PLAN_FULLNAME이 이미 파일 상단에 있음)
  if (src === "plan" || src === "plan_code" || keyNameFromMap === "plan") {
    const code = String(t).trim().toLowerCase();
    return (typeof PLAN_FULLNAME !== "undefined" && PLAN_FULLNAME[code]) ? PLAN_FULLNAME[code] : String(t);
  }

  // 카드주명 별칭 처리 (card_holder / card_owner / card_name 중 하나만 사용)
  if (/(^|_)card_(holder|owner|name)$/.test(keyName)) {
    const v = (form.card_holder ?? form.card_owner ?? form.card_name ?? "");
    return v != null ? String(v) : "";
  }

  return String(t);
}
// ▲▲▲ 여기까지 그대로 붙여 넣기 ▲▲▲


exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

    const templatePdf = readBin(here("template.pdf"));
    const malgunTtf  = readBin(here("malgun.ttf"));
    const mapping    = JSON.parse(readBin(here("KT_mapping_legacy_names.json"), "utf-8"));

    let form = {};
    let mode = (event.queryStringParameters && event.queryStringParameters.mode) || "print";
    if (event.httpMethod === "POST" && event.body) {
      try { form = JSON.parse(event.body);

// ── MVNO 잔상 제거(키 변형 모두 지원) ─────────────────────────────
(function normalizePrevCarrierAndMvno(form) {
  // prevcarrier / prev_carrier / prevCarrier 모두 허용
  const prev =
    (form.prevcarrier ?? form.prev_carrier ?? form.prevCarrier ?? "").toString().toUpperCase();

  // MVNO가 아닐 때는 MVNO 통신사명 후보키를 전부 비워서 절대 출력되지 않게 함
  if (prev !== "MVNO") {
    const mvnoNameKeys = [
      "mvno_name", "mvno", "mvnoCarrier", "mvno_name_kr",
      "carrier_name", "carrierName", "prevcarrier_name"
    ];
    for (const k of mvnoNameKeys) {
      if (k in form) form[k] = "";
    }
  }
})(form);
 } catch {}
    }
    ensureApplyDate(form);
    normalizePaymentMethod(form);

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
