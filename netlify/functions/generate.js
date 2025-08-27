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

// 요금제 테이블
const PLANS = {
  wel5: { title: '5G 웰컴5 (통화200분/25GB+5Mbps)', total: '177,000', monthly: '59,000', disc: '20,250', bill: '38,750' },
  wel3: { title: '5G 웰컴3 (통화200분/3GB+5Mbps)', total: '147,000', monthly: '49,000', disc: '15,550', bill: '33,450' },
  wel1: { title: '5G 웰컴1 (통화200분/1GB+3Mbps)', total: '117,000', monthly: '39,000', disc: '13,050', bill: '25,950' },
};

// ===== alias normalizer (입력값을 표준키로 정규화) =====
function normalizeAliases(src) {
  const out = { ...src };

  const toStr = (v) => {
    if (v === undefined || v === null) return undefined;
    if (Array.isArray(v)) v = v.join(',');       // 체크박스 배열 → "a,b"
    v = String(v);
    return v.trim() === '' ? undefined : v;
  };

  const pick = (...keys) => {
    for (const k of keys) {
      const v = toStr(src[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  // 요금제/요약
  out.plan              = pick('plan', '요금제'); // ★ plan 키 자체도 표준화(요금제 파생값에 필요)
  out.plan_name         = pick('plan_name', '요금제');
  out.base_monthly_fee  = pick('base_monthly_fee', '월 이용료');
  out.total_discount    = pick('total_discount', '요금할인');
  out.final_monthly_fee = pick('final_monthly_fee', '월 청구금액');
  out.apply_date        = pick('apply_date', '신청일');
  out.svc_summary       = pick('svc_summary', '서비스요약');

  // 고객정보
  out.cust_name    = pick('cust_name', '가입자명');
  out.address      = pick('address', '주소');
  out.birth        = pick('birth', '생년월일');
  out.gender       = pick('gender', '성별');
  out.sim_serial   = pick('sim_serial', '유심 일련번호', '유심일련번호');
  out.pref_langs   = pick('pref_langs', '문자안내 선호언어', '문자안내_선호언어');

  // 자동이체(은행/카드)
  out.bank_name     = pick('bank_name', '은행');
  out.bank_account  = pick('bank_account', '계좌번호');
  out.card_company  = pick('card_company', '카드사');
  out.card_number   = pick('card_number', '카드번호');
  out.card_exp_year = pick('card_exp_year', '유효기간(년)');
  out.card_exp_month= pick('card_exp_month', '유효기간(월)');

  // 번호/희망번호
  out.cust_phone   = pick('cust_phone', '가입자 번호');
  out.hope_number  = pick('hope_number', '희망번호');

  // 기타
  out.mode         = pick('mode'); // inline or download
  return out;
}

// ===== main handler =====
exports.handler = async (event) => {
  try {
    // 1) 요청 파싱 (form-urlencoded 또는 JSON)
    const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
    const isForm = ct.includes('application/x-www-form-urlencoded');
    const data = isForm ? qs.parse(event.body || '') : (event.body ? JSON.parse(event.body) : {});

    // 2) 값 정규화 (한글/영문 name 섞여도 표준키로 변환)
    let values = normalizeAliases(data);

    // 3) 요금제 파생값 채우기
    const planInfo = PLANS[values.plan];
    const set = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') values[k] = String(v); };
    if (planInfo) {
      set('plan_name',         planInfo.title);
      set('total_discount',    planInfo.total);
      set('base_monthly_fee',  planInfo.monthly);
      set('plan_disc',         planInfo.disc);
      set('final_monthly_fee', planInfo.bill);
    }

    // 4) 신청일 & 기본 서비스 요약
    const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const y = String(kst.getFullYear());
    const m = String(kst.getMonth() + 1).padStart(2, '0');
    const d = String(kst.getDate()).padStart(2, '0');
    set('apply_date', `${y}.${m}.${d}`);
    set('svc_summary', values.svc_summary || '국제전화차단/로밍차단');

    // 5) 필수 파일 확인
    if (!fs.existsSync(TEMPLATE_PDF_PATH)) throw new Error('template.pdf not found');
    if (!fs.existsSync(FONT_PATH))         throw new Error('malgun.ttf not found');

    // 6) PDF 로드 & 폰트 등록
    const pdfBytes  = fs.readFileSync(TEMPLATE_PDF_PATH);
    const fontBytes = fs.readFileSync(FONT_PATH);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.registerFontkit(fontkit);
    const font = await pdfDoc.embedFont(fontBytes, { subset: true });

    // 7) 매핑 평탄화
    const pages = pdfDoc.getPages();
    const mapping = [];
    Object.entries(RAW_MAPPING).forEach(([name, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(m => mapping.push({ name, ...m }));
    });

    // 8) PDF에 값 그리기
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

    // 9) 출력 (inline = 미리보기/인쇄, 그 외 = 다운로드)
    const out = await pdfDoc.save();
    const mode = String(values.mode || data.mode || '').toLowerCase() === 'inline' ? 'inline' : 'attachment';

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
