// ========== PATCHED generate.js ==========
// 기능: V체크는 알파벳 V, apply_date는 날짜 자동 치환 및 별칭 대응
//       은행/카드 겹침 방지(미전송 시 추론), 요금제 코드 → 풀네임 치환

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

// ── 요금제 코드 → 풀네임 ─────────────────────────────────────────────
const PLAN_NAMES = {
  wel5: "5G 웰컴5 (통화200분/25GB+5Mbps)",
  wel3: "5G 웰컴3 (통화200분/3GB+5Mbps)",
  wel1: "5G 웰컴1 (통화200분/1GB+3Mbps)",
};
const PLAN_FULLNAME = PLAN_NAMES; // 내부 참조 alias

// 은행/카드 필드의 '정확한 키'를 명시(프리픽스가 없더라도 안전하게 분리)
const BANK_KEYS = [
  "bank_name",
  "bank_account",
  "bank_holder",      // 있는 경우만 사용됨(없어도 무해)
  "bank_branch"       // 있는 경우만 사용됨
];

const CARD_KEYS = [
  "card_company",
  "card_number",
  "card_exp_year",
  "card_exp_month",
  "card_holder",
  "card_owner",       // 별칭
  "card_name"         // 별칭
];

// ── 공용 유틸 ───────────────────────────────────────────────────────
const here = (...p) => path.resolve(__dirname, ...p);
const readBin = (p) => fs.readFileSync(p);
const readText = (p) => fs.readFileSync(p, "utf8");

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

// ... Remaining code continues (omitted here for brevity)