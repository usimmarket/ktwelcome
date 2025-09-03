// CommonJS (package.json에 "type" 없음)
// PDF 생성: pdf-lib + fontkit (한글 포함)
// 좌표계: mapping-studio 기준(왼쪽-상단 원점), pdf-lib로 변환시 y = pageHeight - y - size

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

// --- 유틸 ---
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

function okJson(obj) {
  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function fail500(msg) {
  return {
    statusCode: 500,
    headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" },
    body: `Function error: ${msg}`,
  };
}

// vmap 키 형태 "group:value"를 비교 (예: "join_type:new")
function vmapHit(optKey, form) {
  const [k, v] = String(optKey).split(":");
  if (!k) return false;
  const val = form?.[k];
  if (val == null) return false;
  // form 값이 단일 문자열 혹은 배열일 수 있음
  if (Array.isArray(val)) return val.includes(v);
  return String(val) === String(v);
}

// 텍스트 값 취득: source 배열의 첫 번째 키에서 읽되, 없으면 빈 문자열
function readFieldText(fieldDef, form) {
  const src = Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source;
  if (!src) return "";
  let t = form?.[src];
  if (t == null) return "";
  t = String(t);
  // 요금제 명칭 보존 (예: wel5 → 전체 명칭)
  // form 쪽이 축약코드면, form.plan_name_full 같은 필드가 있으면 우선 사용
  if (src === "plan" && form?.plan_name_full) t = String(form.plan_name_full);
  return t;
}

// 날짜 자동 (apply_date가 비어있으면 오늘 날짜 YYYY.MM.DD)
function ensureApplyDate(form) {
  if (!form) return;
  const k = "apply_date";
  if (!form[k] || String(form[k]).trim() === "") {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    form[k] = `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())}`;
  }
}

// --- 메인 핸들러 ---
exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

    // 템플릿/폰트/매핑 로드 (Netlify 번들 포함)
    const templatePdf = readBin(here("template.pdf"));
    const malgunTtf  = readBin(here("malgun.ttf"));
    const mapping    = JSON.parse(readBin(here("KT_mapping_legacy_names.json"), "utf-8"));

    // 요청 파싱 (GET 테스트용 허용, 실제는 POST 권장)
    let form = {};
    let mode = (event.queryStringParameters && event.queryStringParameters.mode) || "print"; // print | save
    if (event.httpMethod === "POST" && event.body) {
      try { form = JSON.parse(event.body); } catch {}
    }
    // 안전장치: apply_date 자동 채움, 국제전화/로밍 문구 고정 등
    ensureApplyDate(form);

    // PDF 구성
    const pdf = await PDFDocument.load(templatePdf);
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(malgunTtf, { subset: false });

    const drawTextAt = (page, x, y, text, size = 10) => {
      const h = page.getHeight();
      const yy = h - y - size; // 상단원점 → pdf-lib 하단원점 변환
      page.drawText(text, { x, y: yy, size, font, color: rgb(0, 0, 0) });
    };

    // 1) 일반 텍스트 필드
    if (mapping.fields) {
      Object.entries(mapping.fields).forEach(([key, def]) => {
        const p = Number(def.page || def.p || 1);
        const page = pdf.getPage(p - 1);
        const txt = readFieldText(def, form);
        if (!txt) return;
        drawTextAt(page, Number(def.x), Number(def.y), txt, Number(def.size || 10));
      });
    }

    // 2) 체크박스 vmap (✓ 표시)
    if (mapping.vmap) {
      Object.entries(mapping.vmap).forEach(([optKey, def]) => {
        if (!vmapHit(optKey, form)) return;
        const p = Number(def.page || def.p || 1);
        const page = pdf.getPage(p - 1);
        drawTextAt(page, Number(def.x), Number(def.y), "✓", Number(def.size || 11));
      });
    }

    // 3) 고정 라벨 (예: 국제전화차단/로밍차단)
    if (mapping.fixed_flags && mapping.fixed_flags.intl_roaming_block) {
      mapping.fixed_flags.intl_roaming_block.forEach((def) => {
        const label = def.label || "국제전화차단/로밍차단"; // '적용' 금지
        const p = Number(def.page || def.p || 1);
        const page = pdf.getPage(p - 1);
        drawTextAt(page, Number(def.x), Number(def.y), label, Number(def.size || 10));
      });
    }

    const pdfBytes = await pdf.save();

    // mode 처리
    const isInline = mode !== "save";
    return okPdf(pdfBytes, isInline ? "preview.pdf" : "output.pdf", isInline);
  } catch (err) {
    return fail500(err && err.message ? err.message : String(err));
  }
};
