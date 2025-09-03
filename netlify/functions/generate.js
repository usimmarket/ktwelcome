// CommonJS (package.json에 "type" 없음)
// pdf-lib + fontkit (한글/✓ 표기 확실)
// 좌표계: 매핑 JSON은 좌상단 원점(pt), pdf-lib 출력은 하단 원점(pt) → y 변환 필요

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

// ====== (1) 요금제 풀네임 매핑표 ======
const PLAN_NAMES = {
  // 예시 — 실제 사용하는 코드/명칭으로 채워주세요
  wel5: "5G 웰컴5 (통화200분/25GB+5Mbps)",
  wel3: "5G 웰컴3 (통화200분/3GB+5Mbps)",
  wel1: "5G 웰컴1 (통화200분/1GB+3Mbps)",
  // ...
};

// ====== (2) 유틸 ======
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
  // optKey 예: "join_type:new"
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
    form[k] = `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())}`;
  }
}

// 값 읽기(요금제 코드 → 풀네임 치환 포함)
function readFieldText(fieldDef, form) {
  const src = Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source;
  if (!src) return "";
  let t = form?.[src];
  if (t == null) return "";
  t = String(t);

  // 프론트가 plan_name_full을 주는 경우 우선
  if (form?.plan_name_full && (src === "plan" || src === "plan_code")) return String(form.plan_name_full);

  // 코드일 경우 서버에서 치환
  if (src === "plan" || src === "plan_code") {
    t = PLAN_NAMES[t] ?? t;
  }
  return t;
}

// ====== (3) 메인 핸들러 ======
exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

    // 정적 리소스 로드 (toml의 included_files에 반드시 포함)
    const templatePdf = readBin(here("template.pdf"));
    const malgunTtf  = readBin(here("malgun.ttf"));
    const mapping    = JSON.parse(readBin(here("KT_mapping_legacy_names.json"), "utf-8"));

    // 요청 파싱
    let form = {};
    let mode = (event.queryStringParameters && event.queryStringParameters.mode) || "print"; // print | save
    if (event.httpMethod === "POST" && event.body) {
      try { form = JSON.parse(event.body); } catch {}
    }
    ensureApplyDate(form);

    // PDF 준비
    const pdf = await PDFDocument.load(templatePdf);
    pdf.registerFontkit(fontkit);

    // 폰트: 한글/✓ 표시 확실 + 용량 절감 위해 subset:true
    const malgun = await pdf.embedFont(malgunTtf, { subset: true });
    // 숫자/영문만 필요한 곳에 쓰고 싶다면 헬베티카도 준비(선택)
    const helv = await pdf.embedFont(StandardFonts.Helvetica);

    const drawTextAt = (page, x, y, text, size = 10, useKoreanFont = true) => {
      const h = page.getHeight();
      const yy = h - y - size; // 상단원점 → 하단원점
      page.drawText(text, {
        x,
        y: yy,
        size,
        font: useKoreanFont ? malgun : helv,
        color: rgb(0, 0, 0),
      });
    };

    // ✓ 체크 전용(가독성을 위해 size 최소 11 보장)
    const drawCheck = (page, x, y, size = 11) => {
      const s = Math.max(Number(size) || 11, 11);
      const h = page.getHeight();
      const yy = h - y - s;
      page.drawText("✓", { x, y: yy, size: s, font: malgun, color: rgb(0, 0, 0) });
    };

    // ===== 출력 =====
    // 1) 텍스트 필드
    if (mapping.fields) {
      for (const [key, def] of Object.entries(mapping.fields)) {
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        const txt = readFieldText(def, form);
        if (!txt) continue;
        drawTextAt(page, Number(def.x), Number(def.y), txt, Number(def.size || 10), true);
      }
    }

    // 2) 체크박스(✓)
    if (mapping.vmap) {
      for (const [optKey, def] of Object.entries(mapping.vmap)) {
        if (!vmapHit(optKey, form)) continue;
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        drawCheck(page, Number(def.x), Number(def.y), Number(def.size || 11));
      }
    }

    // 3) 고정 라벨 (예: 국제전화차단/로밍차단) — 폴백 "적용"은 절대 사용하지 않음
    if (mapping.fixed_flags && mapping.fixed_flags.intl_roaming_block) {
      for (const def of mapping.fixed_flags.intl_roaming_block) {
        const label = def.label || "국제전화차단/로밍차단"; // '적용' 금지
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        drawTextAt(page, Number(def.x), Number(def.y), label, Number(def.size || 10), true);
      }
    }

    const pdfBytes = await pdf.save({ useObjectStreams: true }); // 용량 최적화
    const inline = mode !== "save";
    return okPdf(pdfBytes, inline ? "preview.pdf" : "output.pdf", inline);
  } catch (err) {
    return fail500(err && err.message ? err.message : String(err));
  }
};
