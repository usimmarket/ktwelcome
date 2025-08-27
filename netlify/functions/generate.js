// ===== imports & constants =====
const nodePath = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const qs = require('qs');

const TEMPLATE_PDF_PATH = nodePath.join(__dirname, 'template.pdf');
const FONT_PATH         = nodePath.join(__dirname, 'malgun.ttf');
const MAP_PATH          = nodePath.join(__dirname, 'KT_mapping_legacy_names.json');

const RAW_MAPPING = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

const PLANS = {
  wel5: { title: '5G 웰컴5 (통화200분/25GB+5Mbps)', total: '177,000', monthly: '59,000', disc: '20,250', bill: '38,750' },
  wel3: { title: '5G 웰컴3 (통화200분/3GB+5Mbps)', total: '147,000', monthly: '49,000', disc: '15,550', bill: '33,450' },
  wel1: { title: '5G 웰컴1 (통화200분/1GB+3Mbps)', total: '117,000', monthly: '39,000', disc: '13,050', bill: '25,950' },
};

// ===== ① 그룹 동기화 유틸 (동일 의미의 여러 키를 모두 채움) =====
const KEY_GROUPS = [
  ['plan', 'plan_name', '요금제'],

  ['base_monthly_fee', '월 이용료'],
  ['total_discount', '요금할인'],
  ['final_monthly_fee', '월 청구금액'],
  ['apply_date', '신청일'],
  ['svc_summary', '서비스요약'],

  ['cust_name', '가입자명'],
  ['address', 'cust_addr', '주소'],
  ['birth', 'cust_dob', '생년월일'],
  ['gender', 'cust_gender', '성별'],
  ['sim_serial', '유심 일련번호', '유심일련번호'],
  ['pref_langs', '문자안내 선호언어', '문자안내_선호언어'],

  ['bank_name', '은행'],
  ['bank_account', '계좌번호'],
  ['card_company', '카드사'],
  ['card_number', '카드번호'],
  ['card_exp_year', '유효기간(년)'],
  ['card_exp_month', '유효기간(월)'],

  ['cust_phone', '가입자 번호'],
  ['hope_number', '희망번호'],
];

// groups의 첫 번째 “대표키”를 기준으로 값 하나를 고르고,
// 그 값을 같은 그룹의 모든 키에 복사
function unifyByGroups(obj) {
  const out = { ...obj };
  const firstNonEmpty = (keys) => {
    for (const k of keys) {
      const v = out[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return undefined;
  };
  for (const g of KEY_GROUPS) {
    const val = firstNonEmpty(g);
    if (val !== undefined) g.forEach(k => (out[k] = val));
  }
  return out;
}

// ===== ② 본 처리 =====
exports.handler = async (event) => {
  try {
    const isForm = (event.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
    const dataRaw = isForm ? qs.parse(event.body || '') : (event.body ? JSON.parse(event.body) : {});
    // 1차 정규화
    let values = unifyByGroups(dataRaw);

    // set 헬퍼 (빈 값/공백은 무시)
    const set = (k, v) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') values[k] = String(v);
    };

    // 요금제 파생값 (양쪽 키 모두 채우도록 plan, plan_name 동시 세팅)
    const planKey = values.plan || values.plan_name || values['요금제'];
    const planInfo = PLANS[planKey] || null;
    if (planInfo) {
      set('plan', planInfo.title);
      set('plan_name', planInfo.title);
      set('total_discount', planInfo.total);
      set('base_monthly_fee', planInfo.monthly);
      set('plan_disc', planInfo.disc);
      set('final_monthly_fee', planInfo.bill);
    }
    // 요금제 파생값도 그룹 동기화
    values = unifyByGroups(values);

    // 신청일/요약 (미입력 시 기본값)
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const y = String(kst.getFullYear());
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const d = String(kst.getDate()).padStart(2, '0');
    if (!values.apply_date && !values['신청일']) {
      set('apply_date', `${y}.${m}.${d}`);
    }
    if (!values.svc_summary && !values['서비스요약']) {
      set('svc_summary', '국제전화차단/로밍차단');
    }
    values = unifyByGroups(values);

    // 디버그 보기: /generate?debug=1 또는 mode=debug 로 요청하면 JSON으로 값 확인
    const qsDebug = (event.queryStringParameters && event.queryStringParameters.debug === '1');
    if (values.mode === 'debug' || qsDebug) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(values, null, 2),
      };
    }

    // 파일 확인
    if (!fs.existsSync(TEMPLATE_PDF_PATH)) throw new Error('template.pdf not found');
    if (!fs.existsSync(FONT_PATH))         throw new Error('malgun.ttf not found');

    // PDF 로드 & 폰트 등록
    const pdfBytes  = fs.readFileSync(TEMPLATE_PDF_PATH);
    const fontBytes = fs.readFileSync(FONT_PATH);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    // 매핑 평탄화
    const pages = pdfDoc.getPages();
    const mapping = [];
    Object.entries(RAW_MAPPING).forEach(([name, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(m => mapping.push({ name, ...m }));
    });

    // 값 그리기
    for (const m of mapping) {
      const pageIdx = (m.page || 1) - 1;
      const page = pages[pageIdx];
      if (!page) continue;

      const { width, height } = page.getSize();
      const x = width  * (Number(m.xPct) / 100);
      const yPos = height * (Number(m.yPct) / 100);
      const size = Number(m.size || 10);
      const align = m.align || 'left';

      let text = '';
      if (m.mode === 'fixed-text') {
        text = String(m.fixedText || '');
      } else if (m.mode === 'check') {
        // 체크는 다중언어/다중값 호환: 배열/콤마 모두 허용
        const raw = values[m.name];
        const hay = Array.isArray(raw) ? raw.map(String) : String(raw || '').split(',');
        const yes = String(m.cond || '').trim();
        text = hay.map(s => s.trim()).includes(yes) ? '✔' : '';
      } else {
        text = values[m.name] != null ? String(values[m.name]) : '';
      }
      if (!text) continue;

      let drawX = x;
      const textWidth = font.widthOfTextAtSize(text, size);
      if (align === 'center') drawX = x - textWidth / 2;
      if (align === 'right')  drawX = x - textWidth;

      page.drawText(text, { x: drawX, y: yPos, size, font });
    }

    // 출력
    const out  = await pdfDoc.save();
const qsMode = (event.queryStringParameters && event.queryStringParameters.mode) || '';
const modeHint = (values.mode || data.mode || qsMode || '').toLowerCase();
const disp = (modeHint === 'inline' || modeHint === 'print') ? 'inline' : 'attachment';

return {
  statusCode: 200,
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${disp}; filename="KT_WELCOME.pdf"`,
  },
  body: Buffer.from(out).toString('base64'),
  isBase64Encoded: true,
};
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String((err && err.stack) || err) }),
    };
  }
};
