// ========== generate.js (FINAL) ==========
// 유지: 요금제 코드→풀네임 치환, apply_date 자동, V 체크(Helvetica)
// 추가: 은행/카드 겹침 방지(추론·상호배타·게이트), 신규/번호이동 잔상 제거 + 게이트

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

// ── 은행/카드 키(접두어 없이 들어오는 키도 확실히 분리) ────────────────
const BANK_KEYS = [
  "bank_name",
  "bank_account",
  "bank_holder",
  "bank_branch",
];
const CARD_KEYS = [
  "card_company",
  "card_number",
  "card_exp_year",
  "card_exp_month",
  "card_holder",
  "card_owner",
  "card_name",
];

// ── 가입유형 전용 키(필요시 보강) ─────────────────────────────────────
const NEW_ONLY_KEYS  = [
  "hope_last4", "hope4", "wish4", "wish_last4", // 희망번호 4자리
];
const PORT_ONLY_KEYS = [
  "port_phone", "port_number",                  // 이동할 전화번호
  "prevcarrier", "prev_carrier", "prevCarrier", // 변경 전 통신사
  "carrier_name", "mvno_name", "mvno", "mvnoCarrier", // 통신사명
];

const isNewOnlyKey  = (k) => NEW_ONLY_KEYS.includes(k);
const isPortOnlyKey = (k) => PORT_ONLY_KEYS.includes(k);

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

// ── 체크박스 매핑 hit ────────────────────────────────────────────────
function vmapHit(optKey, form) {
  const [k, v] = String(optKey).split(":");
  if (!k) return false;
  const val = form?.[k];
  if (val == null) return false;
  if (Array.isArray(val)) return val.map(String).includes(String(v));
  return String(val) === String(v);
}

// ── 은행/카드 겹침 방지 ─────────────────────────────────────────────
function clearByPrefix(form, prefix) {
  for (const k of Object.keys(form || {})) {
    if (k.startsWith(prefix)) form[k] = "";
  }
}

function normalizePaymentMethod(form) {
  if (!form) return;
  let method = String(form.method || "").toLowerCase();

  // (A) method 미전송 시 값으로 추론
  if (!method) {
    const hasCard = Object.keys(form).some(
      (k) => k.startsWith("card_") && String(form[k] || "").trim() !== ""
    );
    const hasBank = Object.keys(form).some(
      (k) => k.startsWith("bank_") && String(form[k] || "").trim() !== ""
    );
    if (hasCard && !hasBank) method = "card";
    else if (hasBank && !hasCard) method = "bank";
  }

  // (B) 접두어 기준 상호배타
  if (method === "bank") {
    clearByPrefix(form, "card_");
  } else if (method === "card") {
    clearByPrefix(form, "bank_");
  }

  // (C) 명시 키 기반 상호배타 (접두어가 없을 때 대비)
  if (method === "bank") {
    for (const k of CARD_KEYS) if (k in form) form[k] = "";
  } else if (method === "card") {
    for (const k of BANK_KEYS) if (k in form) form[k] = "";
  }

  form.method = method || form.method; // 추론 결과 반영
}

// ── 가입유형 정규화: new/port 반대 그룹 값 삭제 ──────────────────────
function normalizeJoinType(form) {
  if (!form) return;
  const jt = String(form.join_type || form.joinType || "").toLowerCase();
  const clearKeys = (keys) => keys.forEach((k) => { if (k in form) form[k] = ""; });

  if (jt === "new") {
    clearKeys(PORT_ONLY_KEYS);
  } else if (jt === "port") {
    clearKeys(NEW_ONLY_KEYS);
  }
}

// ── 신청일 별칭 세트 ────────────────────────────────────────────────
const DATE_ALIASES = new Set([
  "apply_date",
  "applyDate",
  "신청일",
  "申請日",
  "ngay_dang_ky",
  "ngày đăng ký",
  "วันที่สมัคร",
  "ថ្ងៃដាក់ពាក្យ",
  "date",
  "apply-date",
]);

// ── 신청일 보장 ─────────────────────────────────────────────────────
function ensureApplyDate(form) {
  if (!form) return;
  const k = "apply_date";
  if (!form[k] || String(form[k]).trim() === "") {
    const d = new Date();
    const z = (n) => String(n).padStart(2, "0");
    form[k] = `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())}`;
  }
}

// ── 매핑된 텍스트 읽기(은행/카드 게이트 + 별칭 처리 + autopay_* 지원) ─────────
function readFieldText(fieldDef, form, keyNameFromMap) {
  // mapping.json 내 source 우선
  let src = Array.isArray(fieldDef.source) ? fieldDef.source[0] : fieldDef.source;
  const keyFromMap = String(keyNameFromMap || "");

  // 0) 신청일 별칭
  if (!src && /apply[_-]?date|신청일|申請日|date/i.test(keyFromMap)) {
    src = "apply_date";
  }

  // 1) 결제수단 정규화(반드시 앞에서 한 번 호출되어 있어야 함)
  //    -> ensureApplyDate(form) 다음에 normalizePaymentMethod(form)이 이미 호출되어 있어야 합니다.
  // ── 결제수단 판정(폼 값이 엉켜 있을 때도 안전하게) ─────────────────────
let method = String(form.method || "").toLowerCase().trim();  // "bank" | "card" | ""

// method가 비어있거나 애매하면 실제 값 존재 여부로 재판정
if (method !== "bank" && method !== "card") {
  const hasCard = CARD_KEYS.some(k => String(form[k] ?? "").trim() !== "");
  const hasBank = BANK_KEYS.some(k => String(form[k] ?? "").trim() !== "");
  if (hasCard && !hasBank) method = "card";
  else if (hasBank && !hasCard) method = "bank";
  else if (hasCard && hasBank) method = "card"; // 충돌 시 '카드' 우선
}

  // 2) autopay_* 별칭 처리
  //    - autopay_org    : 은행명 or 카드사
  //    - autopay_number : 계좌번호 or 카드번호
  //    - autopay_exp    : (카드일 때만) YY/MM 형태로 표시, 은행이면 공란
  const nameOrSrc = String(src || keyFromMap);

  if (nameOrSrc === "autopay_org") {
    if (method === "card") return String(form.card_company || "");
    // 은행/미선택은 은행명 우선 출력
    return String(form.bank_name || "");
  }

  if (nameOrSrc === "autopay_number") {
    if (method === "card") return String(form.card_number || "");
    return String(form.bank_account || "");
  }

  if (nameOrSrc === "autopay_exp") {
    if (method !== "card") return ""; // 은행이면 표시 안 함
    const yy = String(form.card_exp_year || "").trim();   // 예: "27"
    const mm = String(form.card_exp_month || "").trim();  // 예: "05"
    if (!yy && !mm) return "";
    const z = (n) => String(n).padStart(2, "0");
    return `${z(yy)} / ${z(mm)}`;
  }

  // 3) 은행/카드 출력 게이트 (bank_* / card_* 직접 좌표 찍었을 때는 상호 배타)
  //    - method 값과 다르면 공란으로 막습니다.
  if (/^bank_/.test(nameOrSrc) && method && method !== "bank") return "";
  if (/^card_/.test(nameOrSrc) && method && method !== "card") return "";

  // 4) 신청일 자동 채움
  if (nameOrSrc === "apply_date") {
    ensureApplyDate(form);
    return form.apply_date || "";
  }

  // 5) 일반 값 읽기
  let t = src ? form?.[src] : form?.[keyNameFromMap];
  if (t == null) t = "";

  // 6) 요금제 코드 → 풀네임
  if (nameOrSrc === "plan" || nameOrSrc === "plan_code" || keyFromMap === "plan") {
    const code = String(t).trim().toLowerCase();
    return (typeof PLAN_FULLNAME !== "undefined" && PLAN_FULLNAME[code]) ? PLAN_FULLNAME[code] : String(t);
  }

  // 7) 카드주명 별칭 통합(card_holder / card_owner / card_name)
  if (/(^|_)card_(holder|owner|name)$/.test(nameOrSrc)) {
    const v = (form.card_holder ?? form.card_owner ?? form.card_name ?? "");
    return v != null ? String(v) : "";
  }

  return String(t);
}


// ── Netlify 함수 엔트리 ─────────────────────────────────────────────
exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS")
      return { statusCode: 204, headers: CORS, body: "" };

    // 리소스 로드
    const templatePdf = readBin(here("template.pdf"));
    const malgunTtf = readBin(here("malgun.ttf"));
    const mapping = JSON.parse(readText(here("KT_mapping_legacy_names.json"))); // 문자열로 파싱

    // 폼 파싱
    let form = {};
    let mode =
      (event.queryStringParameters && event.queryStringParameters.mode) ||
      "print";

    if (event.httpMethod === "POST" && event.body) {
      try {
        form = JSON.parse(event.body);

        // MVNO 잔상 제거
        (function normalizePrevCarrierAndMvno(f) {
          const prev = (
            f.prevcarrier ??
            f.prev_carrier ??
            f.prevCarrier ??
            ""
          )
            .toString()
            .toUpperCase();

          if (prev !== "MVNO") {
            const mvnoNameKeys = [
              "mvno_name",
              "mvno",
              "mvnoCarrier",
              "mvno_name_kr",
              "carrier_name",
              "carrierName",
              "prevcarrier_name",
            ];
            for (const k of mvnoNameKeys) {
              if (k in f) f[k] = "";
            }
          }
        })(form);
      } catch {}
    }

    // 날짜/결제수단/가입유형 정규화
    ensureApplyDate(form);
    normalizePaymentMethod(form);
    normalizeJoinType(form);

    // PDF 준비
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

    // 텍스트 필드
    if (mapping.fields) {
      for (const [key, def] of Object.entries(mapping.fields)) {
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        const txt = readFieldText(def, form, key);
        if (!txt) continue;
        drawTextAt(page, Number(def.x), Number(def.y), txt, Number(def.size || 10), true);
      }
    }

    // 체크박스
    if (mapping.vmap) {
      for (const [optKey, def] of Object.entries(mapping.vmap)) {
        if (!vmapHit(optKey, form)) continue;
        const p = Number(def.page || 1);
        const page = pdf.getPage(p - 1);
        drawCheck(page, Number(def.x), Number(def.y), Number(def.size || 11));
      }
    }

    // 고정 라벨 (예: 국제전화차단/로밍차단 or 날짜 Alias)
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
