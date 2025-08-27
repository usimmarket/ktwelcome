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

// ===== alias normalizer (values를 반환) =====
function normalizeAliases(src) {
  const out = { ...src };

  const pick = (...keys) => {
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
    }
    return undefined;
  };

  // 한글/영문 라벨을 모두 표준키로 정규화
  const mapped = {
    // 요금제/요약
    plan_name:       pick('plan_name', 'plan', '요금제'),
    base_monthly_fee:pick('base_monthly_fee', '월 이용료'),
    total_discount:  pick('total_discount', '요금할인'),
    final_monthly_fee:pick('final_monthly_fee', '월 청구금액'),
    apply_date:      pick('apply_date', '신청일'),
    svc_summary:     pick('svc_summary', '서비스요약'),

    // 고객정보
    cust_name:       pick('cust_name', '가입자명'),
    address:         pick('address', '주소'),
    birth:           pick('birth', '생년월일'),
    gender:          pick('gender', '성별'),
    sim_serial:      pick('sim_serial', '유심 일련번호', '유심일련번호'),
    pref_langs:      pick('pref_langs', '문자안내 선호언어', '문자안내_선호언어'),

    // 자동이체(은행/카드)
    bank_name:       pick('bank_name', '은행'),
    bank_account:    pick('bank_account', '계좌번호'),
    card_company:    pick('card_company', '카드사'),
    card_number:     pick('card_number', '카드번호'),
    card_exp_year:   pick('card_exp_year', '유효기간(년)'),
    card_exp_month:  pick('card_exp_month', '유효기간(월)'),

    // 번호/희망번호
    cust_phone:      pick('cust_phone', '가입자 번호'),
    hope_number:     pick('hope_number', '희망번호'),
  };

  for (const [k, v] of Object.entries(mapped)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// ===== main handler =====
exports.handler = async (event) => {
  try {
    const isForm = (event.headers['content-type'] || '').includes('application/x-www-form-urlencoded');
    const data = isForm ? qs.parse(event.body || '') : (event.body ? JSON.parse(event.body) : {});

    // 중요: data를 정규화해서 values로 사용
    let values = normalizeAliases(data);

    // set은 values에 기록
    const set = (k, v) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') values[k] = String(v);
    };

    // 요금제 파생값 채우기
    const plan = PLANS[values.plan] || null;
    if (plan) {
      set('plan_name', plan.title);
      set('total_discount', plan.total);
      set('base_monthly_fee', plan.monthly);
      set('plan_disc', plan.disc);
      set('final_monthly_fee', plan.bill);
    }

    // 신청일, 부가서비스 요약
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const y = String(kst.getFullYear());
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const d = String(kst.getDate()).padStart(2, '0');
    set('apply_date', `${y}.${m}.${d}`);
    set('svc_summary', values.svc_summary || '국제전화차단/로밍차단');

    // 파일 확인
    if (!fs.existsSync(TEMPLATE_PDF_PATH)) throw new Error('template.pdf not found');
    if (!fs.existsSync(FONT_PATH))         throw new Error('malgun.ttf not found');

    // PDF 로드 & 폰트 등록
    const pdfBytes = fs.readFileSync(TEMPLATE_PDF_PATH);
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
        const hay = String(values[m.name] || '');
        const yes = String(m.cond || '');
        text = hay.split(',').map(s => s.trim()).includes(yes) ? '✔' : '';
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
    const out = await pdfDoc.save();
    const mode = ((values.mode || data.mode) === 'inline') ? 'inline' : 'attachment';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${mode}; filename="KT_WELCOME.pdf"`,
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
