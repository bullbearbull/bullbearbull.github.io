/*!
 * Bond Cash-Flow Simulator for bullbearbull.github.io
 * - 100% client-side. No network requests, no cookies, no eval, no innerHTML, no inline styles.
 * - The last state is kept only in this browser's localStorage.
 *
 * Conventions (Fabozzi, Hull, CFA):
 *   y = annual yield (decimal), m = compounding periods per year (m = 0 → continuous)
 *   DF(t)      = (1 + y/m)^(−m·t)                 (continuous: e^(−y·t))
 *   P          = Σ CF_i · DF(t_i)
 *   Macaulay D = Σ t_i · CF_i · DF(t_i) / P        [years]
 *   Modified D = Macaulay D / (1 + y/m) = −(1/P)·dP/dy   (continuous: = Macaulay D)
 *   Convexity  = (1/P)·d²P/dy² = Σ CF_i·DF(t_i)·t_i·(t_i + 1/m) / ((1 + y/m)²·P)   [years²]
 *                (continuous: Σ CF_i·DF(t_i)·t_i² / P)
 *   DV01       = Modified D · P · 0.0001   (price change for a 1bp yield move, same unit as the cash flows)
 *   ΔP/P ≈ −ModD·Δy + ½·Convexity·Δy²
 */
(function (root) {
  'use strict';

  // ───────────────────────── Core math (pure, testable) ─────────────────────────
  var LIMITS = { y: [-5, 50], t: [0.01, 100], a: [0.01, 1e9], maxFlows: 600, minGap: 0.001, maxEncoded: 40000 };
  var FREQS = [1, 2, 4, 12, 0];

  // ───────────────────────── UI strings (single place) ─────────────────────────
  // To add a language, add I18N.xx with exactly the same keys (tools/i18n_keys.js checks parity) and allow it in setLang.
  // Values are plain text only (rendered with textContent / setAttribute). `{0}`, `{1}`… are positional placeholders.
  var I18N = {
    en: {
      locale: 'en-US',
      freq: { 1: 'Annual (1×/yr)', 2: 'Semiannual (2×/yr)', 4: 'Quarterly (4×/yr)', 12: 'Monthly (12×/yr)', 0: 'Continuous' },
      perYear: '{0}×/yr',
      yearUnit: 'y', monthUnit: 'm', years: '{0} yr',
      chartTitle: 'Cash Flows', chartAria: 'Cash flow chart: drag a point to change its payment time and amount',
      legendCF: 'Nominal cash flow', legendPV: 'Present value (PV)', legendDur: 'Macaulay Duration',
      ytm: 'Yield to Maturity (YTM, % p.a.)', comp: 'Compounding',
      share: 'Copy share link', reset: 'Reset',
      hint1: 'Drag a point to change its time (horizontal) and amount (vertical). Push against the edge to extend the axis. Use ',
      hint2: ' on the time axis to insert a payment; select a point and press ', hint3: ' or Delete to remove it.',
      axisAmount: 'Amount',
      metricsAria: 'Bond metrics',
      mPrice: 'Price (PV)', mMac: 'Macaulay Duration', mMod: 'Modified Duration', mDv01: 'DV01', mConv: 'Convexity',
      subPrice: '{0}% of nominal total {1}', subMac: 'PV-weighted average time to payment',
      subModCont: 'Equals Macaulay under continuous compounding', subMod: '= Macaulay ÷ (1 + y/{0})', subModPct: '≈ {0}% price move per 100 bp',
      subDv01: 'Price gain for a 1 bp yield drop', subConv: 'yr² · ΔP/P ≈ −D*·Δy + ½·C·Δy²',
      pyTitle: 'Price–Yield Curve and Duration Tangent', pyAria: 'Price–yield curve with the duration tangent line',
      lnActualPrice: 'Actual price', lnTangent: 'Duration tangent', lnDurConv: 'Duration + convexity',
      apTitle: 'Approximation vs Actual Price Change', apAria: 'Duration and convexity approximations compared with the actual price change',
      lnActual: 'Actual', lnDur: '−D*·Δy', lnConv: '−D*·Δy + ½C·Δy²',
      apHead: ['Yield shift', 'Actual', 'Duration', 'Error', 'Dur. + Conv.', 'Error'],
      wtTitle: 'PV Contribution by Time — Macaulay Duration Is the Balance Point', wtAria: 'Present value contribution by payment time and the duration balance point',
      wtNote: 'Each bar is the share of the price contributed by one cash flow’s present value. Placed as weights on a seesaw, they balance at the Macaulay Duration.',
      wtLabel: 'Balance point = Macaulay Duration {0}',
      yieldLabel: 'y = {0}%, P = {1}',
      quick: 'Fill as a level-coupon bond', qMat: 'Maturity (years)', qFace: 'Face value', qRate: 'Coupon rate (% p.a.)', qFreq: 'Coupon frequency', qApply: 'Apply',
      quickNote: 'Replaces the cash flows with level coupons counted back from maturity plus the principal at maturity. A short first period still pays a full coupon.',
      tableTitle: 'Edit Cash Flows', tableHead: ['#', 'Time (years)', 'Amount', 'Discount factor', 'PV', 'PV weight', ''],
      count: '{0} / {1} flows', addEnd: '+ Add payment after maturity',
      tableNote: 'All amounts share one currency unit (e.g., per 100 of face value). The state is saved automatically in this browser’s localStorage only and is never sent to a server by this tool. The site itself uses Google Analytics for visit statistics.',
      timeAria: 'Time of payment {0} (years)', amountAria: 'Amount of payment {0}', delAria: 'Delete payment {0}',
      knobAria: 'Payment {0} (time {1})', knobValue: '{0}, amount {1}', addAria: 'Add a payment at {0}', delTitle: 'Delete this payment', delBtn: 'Delete this payment',
      summary: '{0} flows · maturity {1} · nominal total {2} · select a point for details.',
      roNum: '#', roTime: 'Time', roAmount: 'Amount', roDf: 'Discount factor', roPv: 'PV', roWeight: 'PV weight',
      stLoadedUrl: 'Loaded the cash flows from the share link.', stBadUrl: 'The share link was invalid and has been ignored.',
      stLoadedStore: 'Restored your last state from this browser.', stNoStorage: 'Couldn’t save: this browser blocks localStorage.',
      stReset: 'Reset to the default: a single zero-coupon payment.', stCopied: 'Share link copied.',
      stMax: 'Up to {0} cash flows are allowed.', stDup: 'There is already a payment at that time.', stMaxT: 'Maturity is limited to {0} years.',
      stMin: 'At least one cash flow is required.', stDeleted: 'Cash flow deleted.', stCoupon: 'Replaced with {0} level-coupon cash flows.',
      errYield: 'YTM must be a number between {0} and {1}%. The previous value ({2}%) is still used.',
      errQuick: 'Use maturity 0.01–100 years, a face value above 0, and a coupon rate of 0–100%.',
      errQuickMax: 'That would exceed {0} payments. Shorten the maturity or pay less often.', errQuickSmall: 'The coupon amount is too small (minimum {0}).',
      errTime: 'Time must be a number between {0} and {1} years.', errAmount: 'Amount must be a number between {0} and {1}.',
      errGap: 'Another payment is at the same time (minimum spacing {0} years).',
      langToggleAria: 'Switch language', langKo: '한글', langEn: 'ENG'
    },
    ko: {
      locale: 'ko-KR',
      freq: { 1: '연 1회', 2: '연 2회 (반기)', 4: '연 4회 (분기)', 12: '연 12회 (월)', 0: '연속복리' },
      perYear: '연 {0}회',
      yearUnit: '년', monthUnit: '개월', years: '{0}년',
      chartTitle: '현금흐름', chartAria: '현금흐름 차트: 점을 끌어 지급 시점과 금액을 바꿉니다',
      legendCF: '명목 현금흐름', legendPV: '현재가치(PV)', legendDur: '맥컬리 듀레이션',
      ytm: '만기수익률 (YTM, 연 %)', comp: '복리 주기',
      share: '공유 링크 복사', reset: '초기화',
      hint1: '점을 끌면 지급 시점(가로)과 금액(세로)이 바뀝니다. 그래프 가장자리까지 밀면 축이 늘어납니다. 시간축의 ',
      hint2: '로 지급을 끼워 넣고, 점을 고른 뒤 ', hint3: ' 또는 Delete 키로 지웁니다.',
      axisAmount: '금액',
      metricsAria: '채권 지표',
      mPrice: '가격 (현재가치)', mMac: '맥컬리 듀레이션', mMod: '수정듀레이션', mDv01: 'DV01', mConv: '볼록성',
      subPrice: '명목 합계 {1}의 {0}%', subMac: 'PV 가중 평균 회수기간',
      subModCont: '연속복리에서는 맥컬리 듀레이션과 같음', subMod: '= 맥컬리 ÷ (1 + y/{0})', subModPct: '수익률 1%p 변동 시 가격 약 {0}% 변동',
      subDv01: '수익률 1bp 하락 시 가격 상승폭', subConv: '년² · ΔP/P ≈ −D*·Δy + ½·C·Δy²',
      pyTitle: '가격-수익률 곡선과 듀레이션 접선', pyAria: '가격-수익률 곡선과 듀레이션 접선 차트',
      lnActualPrice: '실제 가격', lnTangent: '듀레이션 접선', lnDurConv: '듀레이션 + 볼록성',
      apTitle: '근사치와 실제 가격 변화 비교', apAria: '듀레이션·볼록성 근사치와 실제 가격 변화를 비교한 차트',
      lnActual: '실제', lnDur: '−D*·Δy', lnConv: '−D*·Δy + ½C·Δy²',
      apHead: ['수익률 변화', '실제', '듀레이션', '오차', '듀레이션+볼록성', '오차'],
      wtTitle: '시점별 현재가치 기여도 — 맥컬리 듀레이션은 무게중심', wtAria: '지급 시점별 현재가치 기여도와 듀레이션 무게중심 차트',
      wtNote: '막대는 각 현금흐름의 현재가치가 가격에서 차지하는 비중입니다. 막대를 시소 위의 추로 보면, 균형을 이루는 받침점이 맥컬리 듀레이션입니다.',
      wtLabel: '무게중심 = 맥컬리 듀레이션 {0}',
      yieldLabel: 'y = {0}%, P = {1}',
      quick: '이표채로 한 번에 채우기', qMat: '만기 (년)', qFace: '액면금액', qRate: '표면이자율 (연 %)', qFreq: '이자 지급 횟수', qApply: '적용',
      quickNote: '만기에서 거꾸로 같은 간격의 이자와 만기 원금 상환으로 현금흐름을 바꿉니다. 첫 기간이 짧아도 이자는 같은 금액으로 둡니다.',
      tableTitle: '현금흐름 직접 입력', tableHead: ['#', '시점 (년)', '금액', '할인계수', 'PV', 'PV 비중', ''],
      count: '{0} / {1}개', addEnd: '+ 만기 뒤에 지급 추가',
      tableNote: '모든 금액은 같은 통화 단위입니다(예: 액면 100 기준). 상태는 바뀔 때마다 이 브라우저의 localStorage에만 자동 저장되며, 이 도구는 이를 서버로 보내지 않습니다. 사이트 방문 통계에는 Google Analytics를 사용합니다.',
      timeAria: '{0}번째 지급 시점(년)', amountAria: '{0}번째 지급 금액', delAria: '{0}번째 지급 삭제',
      knobAria: '{0}번째 지급 (시점 {1})', knobValue: '{0}, 금액 {1}', addAria: '{0} 시점에 지급 추가', delTitle: '이 지급 삭제', delBtn: '이 지급 삭제',
      summary: '현금흐름 {0}개 · 만기 {1} · 명목 합계 {2} · 점을 고르면 상세 정보가 표시돼요.',
      roNum: '#', roTime: '시점', roAmount: '금액', roDf: '할인계수', roPv: 'PV', roWeight: 'PV 비중',
      stLoadedUrl: '공유 링크의 현금흐름을 불러왔어요.', stBadUrl: '공유 링크가 올바르지 않아 무시했어요.',
      stLoadedStore: '이 브라우저에 저장된 마지막 상태를 불러왔어요.', stNoStorage: '저장하지 못했어요. 이 브라우저가 localStorage를 막고 있어요.',
      stReset: '기본값(무이표채 1개)으로 초기화했어요.', stCopied: '공유 링크를 복사했어요.',
      stMax: '현금흐름은 최대 {0}개까지 넣을 수 있어요.', stDup: '같은 시점에 이미 지급이 있어요.', stMaxT: '만기는 최대 {0}년까지예요.',
      stMin: '현금흐름은 최소 1개가 있어야 해요.', stDeleted: '현금흐름을 지웠어요.', stCoupon: '이표채 현금흐름 {0}개로 바꿨어요.',
      errYield: '입력값을 확인해 주세요. 만기수익률 허용 범위는 {0}~{1}%입니다. 지금은 이전 값({2}%)을 유지합니다.',
      errQuick: '만기 0.01~100년, 0보다 큰 액면금액, 표면이자율 0~100%만 입력할 수 있어요.',
      errQuickMax: '지급 횟수가 {0}개를 넘어요. 만기를 짧게 하거나 연간 지급 횟수를 줄여 주세요.', errQuickSmall: '이자 금액이 너무 작아요(최소 {0}).',
      errTime: '입력값을 확인해 주세요. 시점 허용 범위는 {0}~{1}년입니다.', errAmount: '입력값을 확인해 주세요. 금액 허용 범위는 {0}~{1}입니다.',
      errGap: '다른 지급과 시점이 겹쳐요(최소 간격 {0}년).',
      langToggleAria: '언어 전환', langKo: '한글', langEn: 'ENG'
    }
  };
  var LANG = 'en', L = I18N.en, LANG_KEY = 'bbb.bondSim.lang';
  function setLang(lang) { LANG = lang === 'ko' ? 'ko' : 'en'; L = I18N[LANG]; return LANG; }
  function getLang() { return LANG; }
  /** Show/hide static page copy marked with data-bd-lang (EN visible by default without JS). */
  function applyPageLang(lang) {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('[data-bd-lang]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-bd-lang') === lang) nodes[i].removeAttribute('hidden'); else nodes[i].setAttribute('hidden', '');
    }
  }
  /** ?lang=ko|en overrides (not saved); otherwise the saved choice; default English. */
  function resolveInitialLang() {
    try { var q = /(?:^|[?&])lang=(ko|en)(?:&|$)/i.exec(location.search || ''); if (q) return q[1].toLowerCase(); } catch (e) { /* ignore */ }
    try { var sv = localStorage.getItem(LANG_KEY); if (sv === 'ko' || sv === 'en') return sv; } catch (e) { /* ignore */ }
    return 'en';
  }
  function fmtS(str) { var a = arguments; return String(str).replace(/\{(\d)\}/g, function (_, k) { return String(a[Number(k) + 1]); }); }
  var MONTH = 1 / 12;

  function discount(yPct, m, t) {
    var y = yPct / 100;
    return m === 0 ? Math.exp(-y * t) : Math.pow(1 + y / m, -m * t);
  }
  function price(flows, yPct, m) {
    var p = 0;
    for (var i = 0; i < flows.length; i++) p += flows[i].a * discount(yPct, m, flows[i].t);
    return p;
  }
  /** Price, durations, convexity, DV01 and per-flow PV contributions. flows: [{t, a}] sorted by t. */
  function analyze(flows, yPct, m) {
    var y = yPct / 100, g = m === 0 ? 1 : 1 + y / m, P = 0, S1 = 0, S2 = 0, total = 0, pv = [], dfs = [], i;
    for (i = 0; i < flows.length; i++) {
      var t = flows[i].t, d = discount(yPct, m, t), v = flows[i].a * d;
      dfs.push(d); pv.push(v); P += v; total += flows[i].a;
      S1 += t * v; S2 += (m === 0 ? t * t : t * (t + 1 / m)) * v;
    }
    var mac = S1 / P, mod = mac / g;
    return { price: P, total: total, mac: mac, mod: mod, conv: S2 / (P * g * g), dv01: mod * P * 1e-4,
      df: dfs, pv: pv, weights: pv.map(function (v) { return v / P; }) };
  }
  /** Relative price change for a parallel yield shift (bp): actual vs duration vs duration+convexity. */
  function approx(flows, yPct, m, res, dyBp) {
    var dy = dyBp / 1e4, dur = -res.mod * dy;
    return { dy: dyBp, actual: price(flows, yPct + dyBp / 100, m) / res.price - 1, dur: dur, durConv: dur + 0.5 * res.conv * dy * dy };
  }
  /** Level-coupon bond: coupons every 1/freq years counted back from maturity T (short first period if needed). */
  function couponFlows(T, face, ratePct, freq) {
    var c = face * ratePct / 100 / freq, out = [];
    if (ratePct > 0) {
      for (var j = 0; ; j++) {
        var t = Math.round((T - j / freq) * 1e9) / 1e9;
        if (t < LIMITS.t[0] - 1e-12) break;
        if (out.length >= LIMITS.maxFlows) return null;
        out.unshift({ t: t, a: c });
      }
      out[out.length - 1].a = face + c;
    } else out.push({ t: T, a: face });
    return out;
  }
  function snapT(t) { return Math.round(t * 12) / 12; }

  // ───────────────────────── Validation & persistence ─────────────────────────
  function num(v, lo, hi) {
    if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!isFinite(n) || n < lo || n > hi) return null;
    return n;
  }
  function round(x, d) { var k = Math.pow(10, d); return Math.round(x * k) / k; }
  function sig(x, d) { return Number(x.toPrecision(d)); }
  /** Sorted copy; returns null if any two cash flows are closer than LIMITS.minGap years. */
  function sortFlows(flows) {
    var f = flows.map(function (x) { return { t: x.t, a: x.a }; }).sort(function (p, q) { return p.t - q.t; });
    for (var i = 1; i < f.length; i++) if (f[i].t - f[i - 1].t < LIMITS.minGap - 1e-12) return null;
    return f;
  }
  /** Validate an untrusted state object (localStorage / URL). Strict types; any bad field rejects the whole state. */
  function sanitizeState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 1) return null;
    if (typeof s.y !== 'number' || num(s.y, LIMITS.y[0], LIMITS.y[1]) === null) return null;
    if (FREQS.indexOf(s.m) < 0) return null;
    if (!Array.isArray(s.f) || s.f.length < 1 || s.f.length > LIMITS.maxFlows) return null;
    var flows = [];
    for (var i = 0; i < s.f.length; i++) {
      var e = s.f[i];
      if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'number' || typeof e[1] !== 'number') return null;
      var t = num(e[0], LIMITS.t[0], LIMITS.t[1]), a = num(e[1], LIMITS.a[0], LIMITS.a[1]);
      if (t === null || a === null) return null;
      flows.push({ t: t, a: a });
    }
    flows = sortFlows(flows);
    if (!flows) return null;
    return { v: 1, y: s.y, m: s.m, flows: flows };
  }
  function toPlain(st) {
    return { v: 1, y: st.y, m: st.m, f: st.flows.map(function (x) { return [sig(x.t, 12), sig(x.a, 12)]; }) };
  }
  function defaultState() { return { v: 1, y: 4, m: 2, flows: [{ t: 5, a: 100 }] }; }
  function encodeState(st) {
    var json = JSON.stringify(toPlain(st));
    var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    try {
      if (typeof str !== 'string' || str.length > LIMITS.maxEncoded || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
      var b = str.replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
      return sanitizeState(JSON.parse(json));
    } catch (e) { return null; }
  }

  function fmt(n, digits) {
    if (!isFinite(n)) return '–';
    var d = digits === undefined ? 2 : digits, v = Math.abs(n) < 1e-12 ? 0 : n;
    return v.toLocaleString(L.locale, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function fmtFixed(n, d) {
    if (!isFinite(n)) return '–';
    var v = Math.abs(n) < 1e-12 ? 0 : n;
    return v.toLocaleString(L.locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  }
  function fmtPct(x, d) { return (x > 0 ? '+' : '') + fmtFixed(x * 100, d === undefined ? 2 : d) + '%'; }
  function fmtT(t) {
    var mo = Math.round(t * 12);
    if (Math.abs(t * 12 - mo) < 1e-6) { var y = Math.floor(mo / 12), r = mo % 12; return (y ? y + L.yearUnit : '') + (r ? (y ? ' ' : '') + r + L.monthUnit : (y ? '' : '0' + L.yearUnit)); }
    return fmt(t, 3) + L.yearUnit;
  }

  var Core = { LIMITS: LIMITS, FREQS: FREQS, discount: discount, price: price, analyze: analyze, approx: approx,
    couponFlows: couponFlows, I18N: I18N, setLang: setLang, getLang: getLang, snapT: snapT, sortFlows: sortFlows, sanitizeState: sanitizeState, toPlain: toPlain,
    defaultState: defaultState, encodeState: encodeState, decodeState: decodeState, fmt: fmt, fmtT: fmtT };
  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (typeof document === 'undefined') return;

  // ───────────────────────── UI ─────────────────────────
  var STORE_KEY = 'bbb.bondSim.v1';
  var NS = 'http://www.w3.org/2000/svg';
  var uidSeq = 0;

  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    }
    (children || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, String(attrs[k]));
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function noSelect(e) { e.preventDefault(); }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function niceStep(range, count) {
    var raw = range / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(lo, hi, count) {
    if (!(hi > lo)) return [lo];
    var st = niceStep(hi - lo, count), out = [];
    for (var v = Math.ceil(lo / st - 1e-9) * st; v <= hi + st * 1e-9 && out.length < 50; v += st) out.push(Math.round(v / st) * st);
    return out;
  }
  var compactFmt = {};
  function fmtAxis(v) {
    if (Math.abs(v) < 1e4 || typeof Intl === 'undefined') return fmt(v, 4);
    var c = compactFmt[L.locale] || (compactFmt[L.locale] = new Intl.NumberFormat(L.locale, { notation: 'compact', maximumFractionDigits: 2 }));
    return c.format(v);
  }
  function pts(arr) { return arr.map(function (p) { return round(p[0], 2) + ',' + round(p[1], 2); }).join(' '); }
  function amountStep(domain) { return 5 * Math.pow(10, Math.floor(Math.log10(Math.max(domain, 1e-6))) - 3); }

  function App(rootEl) {
    this.root = rootEl;
    this.uid = 'bd' + (++uidSeq);
    this.state = null;
    this.sel = null;      // selected flow index
    this.drag = null;     // active drag
    this.view = null;     // displayed axis maxima {x, y}
    this.raf = 0;
    this.saveTimer = null;
    this.init();
  }

  App.prototype.init = function () {
    var self = this, st = null, fromUrl = false, badUrl = false;
    setLang(resolveInitialLang());
    var m = /(?:^|[#&])s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (m) { st = decodeState(m[1]); fromUrl = !!st; badUrl = !st; }
    if (!st) {
      try { st = sanitizeState(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); } catch (e) { st = null; }
      if (st) this.loadedFromStore = true;
    }
    this.state = st || defaultState();
    this.view = this.targetView();
    this.build();
    this.tableDirty = true;
    this.render();
    if (fromUrl) this.status(L.stLoadedUrl);
    else if (badUrl) this.status(L.stBadUrl);
    else if (st) this.status(L.stLoadedStore);
    if (typeof ResizeObserver === 'function') new ResizeObserver(function () { self.schedule(); }).observe(this.root);
    else window.addEventListener('resize', function () { self.schedule(); });
  };

  App.prototype.targetView = function () {
    var f = this.state.flows, maxA = 0, last = f[f.length - 1].t;
    f.forEach(function (x) { if (x.a > maxA) maxA = x.a; });
    return { x: Math.max(last * 1.12, last + 0.5), y: maxA * 1.2 };
  };

  // ── Layout ──
  App.prototype.build = function () {
    var self = this, r = this.root;
    clear(r);
    r.classList.add('bd-app');

    // Yield inputs (only two, kept next to the chart)
    this.yInput = h('input', { id: this.uid + '-y', class: 'bd-input', type: 'number', inputmode: 'decimal', step: '0.01',
      min: LIMITS.y[0], max: LIMITS.y[1], 'aria-describedby': this.uid + '-err' });
    this.yInput.addEventListener('input', function () { self.onYield(false); });
    this.yInput.addEventListener('change', function () { self.onYield(true); });
    this.mSelect = h('select', { id: this.uid + '-m', class: 'bd-input' }, FREQS.map(function (q) { return h('option', { value: q, text: L.freq[q] }); }));
    this.mSelect.addEventListener('change', function () { var q = Number(self.mSelect.value); if (FREQS.indexOf(q) >= 0) { self.state.m = q; self.changed(); } });
    this.err = h('p', { id: this.uid + '-err', class: 'bd-error', role: 'alert' });

    this.svg = s('svg', { class: 'bd-svg', role: 'group', 'aria-label': L.chartAria });
    this.svg.addEventListener('pointermove', function (e) { self.onPointerMove(e); });
    this.svg.addEventListener('pointerup', function (e) { self.endDrag(e); });
    this.svg.addEventListener('pointercancel', function (e) { self.endDrag(e); });
    this.svg.addEventListener('lostpointercapture', function (e) { self.endDrag(e); });
    this.svg.addEventListener('dblclick', function (e) { self.onDblClick(e); });
    this.svg.addEventListener('keydown', function (e) { self.onKey(e); });
    // SVG children do not reliably honour CSS touch-action, so stop the page from scrolling while a point is held.
    this.svg.addEventListener('touchstart', function (e) { if (e.target && e.target.closest && e.target.closest('.bd-knob')) e.preventDefault(); }, { passive: false });
    this.svg.addEventListener('touchmove', function (e) { if (self.drag && e.cancelable) e.preventDefault(); }, { passive: false });

    this.readout = h('div', { class: 'bd-readout', 'aria-live': 'polite' });
    this.statusEl = h('span', { class: 'bd-status', 'aria-live': 'polite' });

    var chartCard = h('section', { class: 'bd-card bd-chart-card' }, [
      h('div', { class: 'bd-chart-head' }, [
        h('h3', { class: 'bd-title', text: L.chartTitle }),
        h('div', { class: 'bd-legend' }, [
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-sw bd-sw-cf' }), L.legendCF]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-sw bd-sw-pv' }), L.legendPV]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-sw bd-sw-dur' }), L.legendDur])
        ])
      ]),
      h('div', { class: 'bd-controls' }, [
        h('label', { class: 'bd-field', for: this.uid + '-y' }, [L.ytm, this.yInput]),
        h('label', { class: 'bd-field', for: this.uid + '-m' }, [L.comp, this.mSelect]),
        h('div', { class: 'bd-row bd-actions' }, [
          h('button', { type: 'button', class: 'bd-btn', text: L.share, onclick: function () { self.share(); } }),
          h('button', { type: 'button', class: 'bd-btn bd-btn-danger', text: L.reset, onclick: function () { self.reset(); } })
        ])
      ]),
      this.err,
      h('div', { class: 'bd-svg-wrap' }, [this.svg]),
      this.readout,
      h('p', { class: 'bd-note' }, [L.hint1, h('b', { text: '+' }), L.hint2, h('b', { text: '×' }), L.hint3]),
      this.statusEl
    ]);

    // Metrics strip
    this.metricEls = {};
    var tiles = [['price', L.mPrice], ['mac', L.mMac], ['mod', L.mMod], ['dv01', L.mDv01], ['conv', L.mConv]];
    var strip = h('section', { class: 'bd-metrics', 'aria-label': L.metricsAria }, tiles.map(function (tl) {
      var v = h('b', { class: 'bd-metric-val' }), sub = h('small', { class: 'bd-metric-sub' });
      self.metricEls[tl[0]] = { v: v, sub: sub };
      return h('div', { class: 'bd-metric bd-metric-' + tl[0] }, [h('span', { class: 'bd-metric-label', text: tl[1] }), v, sub]);
    }));

    // Visualisations
    this.pySvg = s('svg', { class: 'bd-mini', role: 'img', 'aria-label': L.pyAria });
    this.apSvg = s('svg', { class: 'bd-mini', role: 'img', 'aria-label': L.apAria });
    this.wtSvg = s('svg', { class: 'bd-mini bd-mini-wide', role: 'img', 'aria-label': L.wtAria });
    this.apBody = h('tbody');
    var viz = h('div', { class: 'bd-viz' }, [
      h('section', { class: 'bd-card' }, [
        h('h3', { class: 'bd-title', text: L.pyTitle }),
        h('div', { class: 'bd-legend' }, [
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-actual' }), L.lnActualPrice]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-dur' }), L.lnTangent]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-conv' }), L.lnDurConv])
        ]),
        this.pySvg
      ]),
      h('section', { class: 'bd-card' }, [
        h('h3', { class: 'bd-title', text: L.apTitle }),
        h('div', { class: 'bd-legend' }, [
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-actual' }), L.lnActual]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-dur' }), L.lnDur]),
          h('span', { class: 'bd-legend-item' }, [h('span', { class: 'bd-ln bd-ln-conv' }), L.lnConv])
        ]),
        this.apSvg,
        h('div', { class: 'bd-table-wrap' }, [h('table', { class: 'bd-table bd-ap-table' }, [
          h('thead', null, [h('tr', null, L.apHead.map(function (t) { return h('th', { scope: 'col', class: 'bd-num', text: t }); }))]),
          this.apBody])])
      ]),
      h('section', { class: 'bd-card bd-viz-wide' }, [
        h('h3', { class: 'bd-title', text: L.wtTitle }),
        this.wtSvg,
        h('p', { class: 'bd-note', text: L.wtNote })
      ])
    ]);

    // Numeric table
    this.tbody = h('tbody');
    this.countEl = h('span', { class: 'bd-muted' });
    this.cpT = h('input', { class: 'bd-input', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': L.qMat });
    this.cpFace = h('input', { class: 'bd-input', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': L.qFace });
    this.cpRate = h('input', { class: 'bd-input', type: 'number', step: 'any', inputmode: 'decimal', value: '4', 'aria-label': L.qRate });
    this.cpFreq = h('select', { class: 'bd-input', 'aria-label': L.qFreq }, [1, 2, 4, 12].map(function (q) { return h('option', { value: q, text: fmtS(L.perYear, q) }); }));
    this.cpFreq.value = '2';
    this.cpErr = h('p', { class: 'bd-error', role: 'alert' });
    this.cpDetails = h('details', { class: 'bd-quick' }, [
      h('summary', { text: L.quick }),
      h('div', { class: 'bd-quick-grid' }, [
        h('label', { class: 'bd-field' }, [L.qMat, this.cpT]),
        h('label', { class: 'bd-field' }, [L.qFace, this.cpFace]),
        h('label', { class: 'bd-field' }, [L.qRate, this.cpRate]),
        h('label', { class: 'bd-field' }, [L.qFreq, this.cpFreq]),
        h('button', { type: 'button', class: 'bd-btn bd-btn-primary', text: L.qApply, onclick: function () { self.applyCoupon(); } })
      ]),
      this.cpErr,
      h('p', { class: 'bd-note', text: L.quickNote })
    ]);
    this.cpDetails.addEventListener('toggle', function () {
      if (!self.cpDetails.open) return;
      var f = self.state.flows; self.cpT.value = String(sig(f[f.length - 1].t, 6)); self.cpFace.value = String(sig(f[f.length - 1].a, 8));
    });
    this.tableErr = h('p', { class: 'bd-error', role: 'alert' });
    var tableCard = h('section', { class: 'bd-card' }, [
      h('div', { class: 'bd-chart-head' }, [h('h3', { class: 'bd-title', text: L.tableTitle }), this.countEl]),
      h('div', { class: 'bd-table-wrap bd-flow-wrap' }, [h('table', { class: 'bd-table bd-flow-table' }, [
        h('thead', null, [h('tr', null, L.tableHead.map(function (c, k) { return h('th', { scope: 'col', class: k >= 3 && k <= 5 ? 'bd-num' : '', text: c }); }))]),
        this.tbody])]),
      this.tableErr,
      h('div', { class: 'bd-row' }, [
        this.addEndBtn = h('button', { type: 'button', class: 'bd-btn bd-add-end', text: L.addEnd, onclick: function () { self.addAfterLast(); } })
      ]),
      this.cpDetails,
      h('p', { class: 'bd-note', text: L.tableNote })
    ]);

    r.setAttribute('lang', LANG);
    applyPageLang(LANG);
    r.appendChild(this.buildLangToggle());
    r.appendChild(h('div', { class: 'bd-layout' }, [chartCard, strip, viz, tableCard]));
  };

  // ── Language (same pill toggle, keys and rules as the options simulator) ──
  App.prototype.setLanguage = function (lang) {
    setLang(lang);
    try { localStorage.setItem(LANG_KEY, LANG); } catch (e) { /* ignore */ }
    this.build();
    this.tableDirty = true;
    this.render();
    var t = this.root.querySelector('.bd-lang-toggle');
    if (t) t.focus({ preventScroll: true });
  };
  App.prototype.buildLangToggle = function () {
    var self = this, isKo = LANG === 'ko';
    var btn = h('button', { type: 'button', class: 'bd-lang-toggle' + (isKo ? ' is-ko' : ' is-en'), role: 'switch',
      'aria-checked': isKo ? 'true' : 'false', 'aria-label': L.langToggleAria, title: L.langToggleAria }, [
      h('span', { class: 'bd-lang-knob', 'aria-hidden': 'true' }),
      h('span', { class: 'bd-lang-opt bd-lang-ko', lang: 'ko', text: L.langKo }),
      h('span', { class: 'bd-lang-opt bd-lang-en', lang: 'en', text: L.langEn })
    ]);
    var go = function (lang) { if (lang !== LANG) self.setLanguage(lang); };
    btn.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('bd-lang-ko')) go('ko');
      else if (t && t.classList && t.classList.contains('bd-lang-en')) go('en');
      else go(LANG === 'ko' ? 'en' : 'ko');
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(LANG === 'ko' ? 'en' : 'ko'); }
      else if (e.key === 'ArrowLeft' || e.key === 'Home') { e.preventDefault(); go('ko'); }
      else if (e.key === 'ArrowRight' || e.key === 'End') { e.preventDefault(); go('en'); }
    });
    return h('div', { class: 'bd-lang-bar' }, [btn]);
  };

  // ── State changes ──
  App.prototype.status = function (msg) {
    var el = this.statusEl; el.textContent = msg;
    clearTimeout(this._st); this._st = setTimeout(function () { el.textContent = ''; }, 5000);
  };
  App.prototype.changed = function (structural, keepView) {
    var self = this;
    if (structural) this.tableDirty = true;
    if (location.hash && /(?:^|[#&])s=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    if (!keepView) this.animateView();
    this.schedule();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () { self.save(); }, 300);
  };
  App.prototype.save = function () {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(toPlain(this.state))); }
    catch (e) { this.status(L.stNoStorage); }
  };
  App.prototype.reset = function () {
    clearTimeout(this.saveTimer);
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    this.state = defaultState(); this.sel = null; this.drag = null;
    this.err.textContent = ''; this.tableErr.textContent = ''; this.yInput.removeAttribute('aria-invalid');
    this.view = this.targetView(); this.tableDirty = true; this.schedule();
    this.status(L.stReset);
  };
  App.prototype.share = function () {
    var url = location.href.split('#')[0] + '#s=' + encodeState(this.state), self = this;
    var done = function () { self.status(L.stCopied); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { self.status(url); });
    else this.status(url);
  };
  App.prototype.onYield = function (commit) {
    var v = num(this.yInput.value, LIMITS.y[0], LIMITS.y[1]);
    if (v === null) {
      if (commit) {
        this.yInput.setAttribute('aria-invalid', 'true');
        this.err.textContent = fmtS(L.errYield, LIMITS.y[0], LIMITS.y[1], fmt(this.state.y, 4));
      }
      return;
    }
    this.yInput.removeAttribute('aria-invalid'); this.err.textContent = '';
    if (v !== this.state.y) { this.state.y = v; this.changed(false, true); }
  };
  App.prototype.setFlows = function (flows, selT) {
    var f = sortFlows(flows);
    if (!f) return false;
    this.state.flows = f;
    if (selT !== undefined) { this.sel = null; for (var i = 0; i < f.length; i++) if (f[i].t === selT) this.sel = i; }
    this.changed(true);
    return true;
  };
  App.prototype.newAmount = function (idx) {
    // Coupon-like default: neighbour coupon if any, else 5% of the largest flow.
    var f = this.state.flows, maxA = 0, i;
    f.forEach(function (x) { if (x.a > maxA) maxA = x.a; });
    for (i = Math.min(idx, f.length - 1); i >= 0; i--) if (f[i].a < maxA * 0.5) return f[i].a;
    for (i = 0; i < f.length; i++) if (f[i].a < maxA * 0.5) return f[i].a;
    return sig(Math.max(LIMITS.a[0], maxA * 0.05), 4);
  };
  App.prototype.addAt = function (t, a) {
    var f = this.state.flows;
    if (f.length >= LIMITS.maxFlows) { this.status(fmtS(L.stMax, LIMITS.maxFlows)); return false; }
    t = clamp(t, LIMITS.t[0], LIMITS.t[1]);
    var idx = 0; while (idx < f.length && f[idx].t < t) idx++;
    a = a === undefined ? this.newAmount(idx) : clamp(a, LIMITS.a[0], LIMITS.a[1]);
    var ok = this.setFlows(f.concat([{ t: t, a: a }]), t);
    if (!ok) this.status(L.stDup);
    return ok;
  };
  App.prototype.addAfterLast = function () {
    var f = this.state.flows, last = f[f.length - 1], step = f.length > 1 ? Math.max(MONTH, f[f.length - 1].t - f[f.length - 2].t) : 1;
    if (last.t + step > LIMITS.t[1]) { this.status(fmtS(L.stMaxT, LIMITS.t[1])); return; }
    this.addAt(round(last.t + step, 9));
  };
  App.prototype.remove = function (i) {
    var f = this.state.flows;
    if (f.length <= 1) { this.status(L.stMin); return; }
    f.splice(i, 1); this.sel = null; this.changed(true);
    this.status(L.stDeleted);
  };
  App.prototype.applyCoupon = function () {
    var T = num(this.cpT.value, LIMITS.t[0], LIMITS.t[1]), F = num(this.cpFace.value, LIMITS.a[0], LIMITS.a[1] / 2),
      R = num(this.cpRate.value, 0, 100), q = Number(this.cpFreq.value);
    if (T === null || F === null || R === null || [1, 2, 4, 12].indexOf(q) < 0) { this.cpErr.textContent = L.errQuick; return; }
    var f = couponFlows(T, F, R, q);
    if (!f) { this.cpErr.textContent = fmtS(L.errQuickMax, LIMITS.maxFlows); return; }
    if (f.some(function (x) { return x.a < LIMITS.a[0]; })) { this.cpErr.textContent = fmtS(L.errQuickSmall, LIMITS.a[0]); return; }
    this.cpErr.textContent = '';
    this.sel = null; this.setFlows(f);
    this.status(fmtS(L.stCoupon, f.length));
  };
  App.prototype.onEdit = function (i, key, inp) {
    var lim = LIMITS[key], v = num(inp.value, lim[0], lim[1]), f = this.state.flows;
    if (v === null) {
      inp.setAttribute('aria-invalid', 'true');
      this.tableErr.textContent = key === 't' ? fmtS(L.errTime, lim[0], lim[1]) : fmtS(L.errAmount, lim[0], fmt(lim[1]));
      return;
    }
    var next = f.map(function (x) { return { t: x.t, a: x.a }; });
    next[i][key] = v;
    if (!sortFlows(next)) { inp.setAttribute('aria-invalid', 'true'); this.tableErr.textContent = fmtS(L.errGap, LIMITS.minGap); return; }
    inp.removeAttribute('aria-invalid'); this.tableErr.textContent = '';
    var orderChanged = key === 't' && sortFlows(next).some(function (x, j) { return x.t !== next[j].t; });
    this.setFlows(next, next[i].t);
    if (!orderChanged) this.tableDirty = false;
  };

  // ── Drag (Pointer Events: mouse, pen, touch) ──
  App.prototype.startDrag = function (i, e) {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    this.sel = i;
    this.drag = { i: i, id: e.pointerId, cx: e.clientX, cy: e.clientY, moved: false, x0: e.clientX, y0: e.clientY };
    try { this.svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.root.classList.add('is-dragging');
    if (window.getSelection) { var sl = window.getSelection(); if (sl && sl.removeAllRanges) sl.removeAllRanges(); }
    document.addEventListener('selectstart', noSelect, true);
    this.schedule();
  };
  App.prototype.onPointerMove = function (e) {
    var d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    e.preventDefault();
    d.cx = e.clientX; d.cy = e.clientY;
    if (!d.moved && Math.abs(d.cx - d.x0) + Math.abs(d.cy - d.y0) < 3) return;
    d.moved = true;
    this.dragStep();
  };
  /** Map the pointer to (t, a). Near/over an edge the axis grows a little each frame so the point keeps moving outwards. */
  App.prototype.dragStep = function () {
    var d = this.drag, G = this.geom;
    if (!d || !G) return;
    var f = this.state.flows, i = d.i, rect = this.svg.getBoundingClientRect();
    var fx = (d.cx - rect.left - G.l) / G.pw, fy = 1 - (d.cy - rect.top - G.t) / G.ph, grow = false;
    var isLast = i === f.length - 1;
    if (isLast && fx > 0.96 && this.view.x < LIMITS.t[1] * 1.12) {
      this.view.x = Math.min(LIMITS.t[1] * 1.12, this.view.x * (1 + 0.004 + 0.03 * clamp((fx - 0.96) / 0.2, 0, 1))); grow = true;
    }
    if (fy > 0.96 && this.view.y < LIMITS.a[1] * 1.2) {
      this.view.y = Math.min(LIMITS.a[1] * 1.2, this.view.y * (1 + 0.006 + 0.04 * clamp((fy - 0.96) / 0.2, 0, 1))); grow = true;
    }
    var lo = i > 0 ? f[i - 1].t + MONTH : MONTH, hi = isLast ? LIMITS.t[1] : f[i + 1].t - MONTH;
    var t = snapT(clamp(fx, 0, 1) * this.view.x);
    if (hi < lo) t = f[i].t; // neighbours too close for monthly snapping: keep time, move amount only
    else t = clamp(t, Math.min(lo, f[i].t), Math.max(hi, f[i].t));
    if (i > 0 && t - f[i - 1].t < LIMITS.minGap) t = f[i].t;
    if (!isLast && f[i + 1].t - t < LIMITS.minGap) t = f[i].t;
    var stp = amountStep(this.view.y), a = Math.round(clamp(fy, 0, 1) * this.view.y / stp) * stp;
    f[i].t = round(t, 9);
    f[i].a = sig(clamp(a, LIMITS.a[0], LIMITS.a[1]), 10);
    this.schedule();
    var self = this;
    if (grow && !this.growPending) { this.growPending = true; requestAnimationFrame(function () { self.growPending = false; if (self.drag) self.dragStep(); }); }
  };
  App.prototype.endDrag = function (e) {
    var d = this.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    this.drag = null;
    this.root.classList.remove('is-dragging');
    document.removeEventListener('selectstart', noSelect, true);
    try { this.svg.releasePointerCapture(d.id); } catch (err) { /* ignore */ }
    this.focusIdx = d.i;
    if (d.moved) this.changed(false); else this.schedule();
  };
  App.prototype.animateView = function () {
    var self = this;
    if (this.drag) return;
    this.viewAnim = true;
    var step = function () {
      if (self.drag) { self.viewAnim = false; return; }
      var tg = self.targetView(), v = self.view, done = true;
      ['x', 'y'].forEach(function (k) {
        var dlt = tg[k] - v[k];
        if (Math.abs(dlt) > tg[k] * 0.002) { v[k] += dlt * 0.22; done = false; } else v[k] = tg[k];
      });
      self.schedule();
      if (!done) requestAnimationFrame(step); else self.viewAnim = false;
    };
    requestAnimationFrame(step);
  };
  App.prototype.onDblClick = function (e) {
    var G = this.geom;
    if (!G || this.drag || !(e.target && e.target.classList && e.target.classList.contains('bd-plot-bg'))) return;
    var rect = this.svg.getBoundingClientRect();
    var t = snapT(clamp((e.clientX - rect.left - G.l) / G.pw, 0, 1) * this.view.x);
    var a = clamp((1 - (e.clientY - rect.top - G.t) / G.ph) * this.view.y, LIMITS.a[0], LIMITS.a[1]);
    if (t < MONTH) t = MONTH;
    this.addAt(t, sig(a, 4));
  };
  App.prototype.onKey = function (e) {
    var g = e.target && e.target.closest ? e.target.closest('.bd-knob') : null;
    if (!g) return;
    var i = Number(g.getAttribute('data-i')), f = this.state.flows;
    if (!(i >= 0 && i < f.length)) return;
    var stp = amountStep(this.view.y) * (e.shiftKey ? 10 : 1), x = f[i];
    var lo = i > 0 ? f[i - 1].t + LIMITS.minGap : LIMITS.t[0], hi = i < f.length - 1 ? f[i + 1].t - LIMITS.minGap : LIMITS.t[1];
    var used = true;
    if (e.key === 'ArrowLeft') x.t = round(clamp(x.t - MONTH, lo, hi), 9);
    else if (e.key === 'ArrowRight') x.t = round(clamp(x.t + MONTH, lo, hi), 9);
    else if (e.key === 'ArrowUp') x.a = sig(clamp(x.a + stp, LIMITS.a[0], LIMITS.a[1]), 10);
    else if (e.key === 'ArrowDown') x.a = sig(clamp(x.a - stp, LIMITS.a[0], LIMITS.a[1]), 10);
    else if (e.key === 'Delete' || e.key === 'Backspace') { this.remove(i); this.focusIdx = Math.max(0, i - 1); }
    else used = false;
    if (!used) return;
    e.preventDefault();
    this.sel = Math.min(i, this.state.flows.length - 1); if (this.focusIdx == null) this.focusIdx = this.sel;
    this.changed(false);
  };

  // ── Rendering ──
  App.prototype.schedule = function () {
    var self = this;
    if (this.raf) return;
    this.raf = requestAnimationFrame(function () { self.raf = 0; self.render(); });
  };
  App.prototype.render = function () {
    var st = this.state;
    this.res = analyze(st.flows, st.y, st.m);
    if (document.activeElement !== this.yInput) this.yInput.value = String(st.y);
    this.mSelect.value = String(st.m);
    this.renderMain();
    this.renderReadout();
    this.renderMetrics();
    this.renderPriceYield();
    this.renderApprox();
    this.renderWeights();
    if (this.tableDirty) { this.buildTable(); this.tableDirty = false; }
    this.updateTable(this.drag && this.state.flows.length > 60 ? this.drag.i : null);
    if (this.focusIdx != null) {
      var k = this.svg.querySelector('.bd-knob[data-i="' + this.focusIdx + '"]');
      if (k) k.focus({ preventScroll: true });
      this.focusIdx = null;
    }
  };

  App.prototype.defs = function (svg) {
    var u = this.uid, d = s('defs', null, svg);
    var g1 = s('linearGradient', { id: u + '-bar', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    s('stop', { offset: '0', class: 'bd-stop-bar-a' }, g1); s('stop', { offset: '1', class: 'bd-stop-bar-b' }, g1);
    var g2 = s('linearGradient', { id: u + '-last', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    s('stop', { offset: '0', class: 'bd-stop-last-a' }, g2); s('stop', { offset: '1', class: 'bd-stop-last-b' }, g2);
    var g3 = s('linearGradient', { id: u + '-area', x1: 0, y1: 0, x2: 0, y2: 1 }, d);
    s('stop', { offset: '0', class: 'bd-stop-area-a' }, g3); s('stop', { offset: '1', class: 'bd-stop-area-b' }, g3);
    var g4 = s('radialGradient', { id: u + '-knob', cx: '35%', cy: '30%', r: '70%' }, d);
    s('stop', { offset: '0', class: 'bd-stop-knob-a' }, g4); s('stop', { offset: '1', class: 'bd-stop-knob-b' }, g4);
    var fl = s('filter', { id: u + '-shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, d);
    s('feDropShadow', { dx: 0, dy: 1.5, stdDeviation: 1.6, class: 'bd-shadow' }, fl);
  };
  App.prototype.size = function (svg, defH) {
    var w = Math.max(240, Math.round(svg.parentNode.clientWidth || svg.getBoundingClientRect().width || 600));
    var hgt = Math.round(svg.getBoundingClientRect().height) || defH;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt); svg.setAttribute('width', w); svg.setAttribute('height', hgt);
    return { w: w, h: hgt };
  };

  App.prototype.renderMain = function () {
    var svg = this.svg, self = this, st = this.state, f = st.flows, res = this.res, u = this.uid;
    // The chart is rebuilt every frame; remember which knob had keyboard focus so it can be restored.
    var ae = document.activeElement;
    if (this.focusIdx == null && ae && ae !== svg && svg.contains(ae) && ae.classList.contains('bd-knob')) this.focusIdx = Number(ae.getAttribute('data-i'));
    clear(svg);
    var sz = this.size(svg, 360), W = sz.w, H = sz.h, narrow = W < 520;
    var G = { l: narrow ? 46 : 58, r: narrow ? 14 : 22, t: 22, b: 34 };
    G.pw = W - G.l - G.r; G.ph = H - G.t - G.b; this.geom = G;
    var xm = this.view.x, ym = this.view.y, base = G.t + G.ph;
    var X = function (t) { return G.l + t / xm * G.pw; }, Y = function (a) { return base - a / ym * G.ph; };
    this.defs(svg);
    s('rect', { class: 'bd-plot-bg', x: G.l, y: G.t, width: G.pw, height: G.ph, rx: 6 }, svg);
    var gy = s('g', { class: 'bd-grid' }, svg);
    ticks(0, ym, narrow ? 4 : 5).forEach(function (v) {
      if (v > ym) return;
      s('line', { x1: G.l, x2: G.l + G.pw, y1: Y(v), y2: Y(v) }, gy);
      s('text', { class: 'bd-tick', x: G.l - 8, y: Y(v) + 4, 'text-anchor': 'end', text: fmtAxis(v) }, gy);
    });
    ticks(0, xm, Math.max(3, Math.floor(G.pw / 80))).forEach(function (v) {
      if (v > xm) return;
      s('line', { class: 'bd-grid-x', x1: X(v), x2: X(v), y1: G.t, y2: base }, gy);
      s('text', { class: 'bd-tick', x: X(v), y: base + 18, 'text-anchor': 'middle', text: fmt(v, 2) + (v ? L.yearUnit : '') }, gy);
    });
    s('line', { class: 'bd-axis', x1: G.l, x2: G.l + G.pw, y1: base, y2: base }, svg);
    s('text', { class: 'bd-axis-title', x: G.l - (narrow ? 40 : 52), y: G.t - 8, text: L.axisAmount }, svg);

    // bar width from the tightest spacing
    var minGap = X(f[0].t) - G.l;
    for (var i = 1; i < f.length; i++) minGap = Math.min(minGap, X(f[i].t) - X(f[i - 1].t));
    var bw = clamp(minGap * 0.55, 2, narrow ? 22 : 30), dep = bw >= 10 ? Math.min(9, bw * 0.32) : 0;

    // area + line
    var line = f.map(function (x) { return [X(x.t), Y(x.a)]; });
    s('polygon', { class: 'bd-area', fill: 'url(#' + u + '-area)', points: pts([[line[0][0], base]].concat(line, [[line[line.length - 1][0], base]])) }, svg);

    var bars = s('g', { class: 'bd-bars' }, svg);
    f.forEach(function (x, j) {
      var cx = X(x.t), x0 = cx - bw / 2, x1 = cx + bw / 2, y = Y(x.a), yp = Y(res.pv[j]), last = j === f.length - 1;
      var g = s('g', { class: 'bd-bar' + (last ? ' is-last' : '') + (j === self.sel ? ' is-active' : '') }, bars);
      if (dep) {
        s('polygon', { class: 'bd-bar-side', points: pts([[x1, y], [x1 + dep, y - dep * 0.7], [x1 + dep, base - dep * 0.7], [x1, base]]) }, g);
        s('polygon', { class: 'bd-bar-top', points: pts([[x0, y], [x0 + dep, y - dep * 0.7], [x1 + dep, y - dep * 0.7], [x1, y]]) }, g);
      }
      s('rect', { class: 'bd-bar-front', x: round(x0, 2), y: round(y, 2), width: round(bw, 2), height: round(Math.max(0, base - y), 2), fill: 'url(#' + u + (last ? '-last' : '-bar') + ')' }, g);
      s('rect', { class: 'bd-bar-pv', x: round(x0 + bw * 0.18, 2), y: round(yp, 2), width: round(bw * 0.64, 2), height: round(Math.max(0, base - yp), 2) }, g);
    });
    s('polyline', { class: 'bd-line', points: pts(line) }, svg);

    // Macaulay duration marker
    if (res.mac <= xm) {
      var dx = X(res.mac), gd = s('g', { class: 'bd-dur' }, svg);
      s('line', { x1: dx, x2: dx, y1: G.t + 14, y2: base }, gd);
      s('polygon', { points: pts([[dx, base - 1], [dx - 6, base + 9], [dx + 6, base + 9]]) }, gd);
      s('text', { x: clamp(dx, G.l + 40, G.l + G.pw - 40), y: G.t + 10, 'text-anchor': 'middle', text: 'D = ' + fmtS(L.years, fmt(res.mac, 2)) }, gd);
    }

    // "+" insert buttons between payments (and between 0 and the first payment)
    if (!this.drag && f.length < LIMITS.maxFlows) {
      var ga = s('g', { class: 'bd-adds' }, svg);
      f.forEach(function (x, j) {
        var l = j ? f[j - 1].t : 0, r = x.t, tm = snapT((l + r) / 2);
        if (!(tm - l >= LIMITS.minGap && r - tm >= LIMITS.minGap)) tm = round((l + r) / 2, 9);
        if (!(tm - l >= LIMITS.minGap && r - tm >= LIMITS.minGap) || X(r) - X(l) < 30) return;
        var b = s('g', { class: 'bd-add', tabindex: 0, role: 'button', 'aria-label': fmtS(L.addAria, fmtT(tm)), transform: 'translate(' + round(X(tm), 2) + ',' + base + ')' }, ga);
        s('title', { text: fmtS(L.addAria, fmtT(tm)) }, b);
        s('circle', { class: 'bd-add-hit', r: 13 }, b);
        s('circle', { class: 'bd-add-c', r: 8.5 }, b);
        s('path', { class: 'bd-add-p', d: 'M-4 0H4M0 -4V4' }, b);
        var add = function (e) { e.preventDefault(); e.stopPropagation(); self.addAt(tm); };
        b.addEventListener('click', add);
        b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') add(e); });
      });
    }

    // knobs
    var gk = s('g', { class: 'bd-knobs' }, svg), many = f.length > 150;
    f.forEach(function (x, j) {
      var g = s('g', { class: 'bd-knob' + (j === self.sel ? ' is-active' : ''), 'data-i': j, tabindex: 0, role: 'slider',
        'aria-label': fmtS(L.knobAria, j + 1, fmtT(x.t)), 'aria-valuemin': LIMITS.a[0], 'aria-valuemax': LIMITS.a[1],
        'aria-valuenow': x.a, 'aria-valuetext': fmtS(L.knobValue, fmtT(x.t), fmt(x.a, 4)),
        transform: 'translate(' + round(X(x.t), 2) + ',' + round(Y(x.a), 2) + ')' }, gk);
      s('circle', { class: 'bd-knob-hit', r: many ? 8 : 16 }, g);
      s('circle', { class: 'bd-knob-ring', r: many ? 4.5 : 7.5, fill: 'url(#' + u + '-knob)', filter: many ? null : 'url(#' + u + '-shadow)' }, g);
      if (!many) s('circle', { class: 'bd-knob-core', r: 2.6 }, g);
      g.addEventListener('pointerdown', function (e) { self.startDrag(j, e); });
      g.addEventListener('focus', function () { if (self.sel !== j && !self.drag) { self.sel = j; self.schedule(); } });
    });

    // selected: delete badge + tooltip
    var si = this.drag ? this.drag.i : this.sel;
    if (si != null && si < f.length) {
      var p = f[si], px = X(p.t), py = Y(p.a);
      if (!this.drag && f.length > 1) {
        var db = s('g', { class: 'bd-del', tabindex: 0, role: 'button', 'aria-label': fmtS(L.delAria, si + 1), transform: 'translate(' + round(px + 15, 2) + ',' + round(py - 15, 2) + ')' }, svg);
        s('title', { text: L.delTitle }, db);
        s('circle', { class: 'bd-del-hit', r: 12 }, db);
        s('circle', { class: 'bd-del-c', r: 8 }, db);
        s('path', { class: 'bd-del-p', d: 'M-3 -3L3 3M3 -3L-3 3' }, db);
        var del = function (e) { e.preventDefault(); e.stopPropagation(); self.remove(si); };
        db.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        db.addEventListener('click', del);
        db.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') del(e); });
      }
      if (this.drag) {
        var txt = fmtT(p.t) + ' · ' + fmt(p.a, 4), tw = txt.length * 7 + 18;
        var tx = clamp(px - tw / 2, G.l, G.l + G.pw - tw), ty = py - 44 < G.t - 18 ? py + 16 : py - 44;
        var tip = s('g', { class: 'bd-tip', transform: 'translate(' + round(tx, 2) + ',' + round(ty, 2) + ')' }, svg);
        s('rect', { width: tw, height: 24, rx: 6 }, tip);
        s('text', { x: tw / 2, y: 16, 'text-anchor': 'middle', text: txt }, tip);
      }
    }
  };

  App.prototype.renderReadout = function () {
    var r = this.readout, f = this.state.flows, res = this.res, i = this.drag ? this.drag.i : this.sel, self = this;
    clear(r);
    if (i == null || i >= f.length) {
      r.appendChild(h('span', { class: 'bd-muted', text: fmtS(L.summary, f.length, fmtT(f[f.length - 1].t), fmt(res.total, 4)) }));
      return;
    }
    var x = f[i];
    [[L.roNum, String(i + 1)], [L.roTime, fmtT(x.t)], [L.roAmount, fmt(x.a, 4)], [L.roDf, fmtFixed(res.df[i], 6)], [L.roPv, fmt(res.pv[i], 4)], [L.roWeight, fmtFixed(res.weights[i] * 100, 2) + '%']].forEach(function (kv) {
      r.appendChild(h('span', { class: 'bd-readout-item' }, [kv[0] + ' ', h('b', { text: kv[1] })]));
    });
    if (f.length > 1) r.appendChild(h('button', { type: 'button', class: 'bd-btn bd-btn-danger bd-btn-sm', text: L.delBtn, onclick: function () { self.remove(i); } }));
  };

  App.prototype.renderMetrics = function () {
    var m = this.metricEls, res = this.res, st = this.state, gtxt = st.m === 0 ? L.subModCont : fmtS(L.subMod, st.m);
    m.price.v.textContent = fmt(res.price, 4);
    m.price.sub.textContent = fmtS(L.subPrice, fmtFixed(res.price / res.total * 100, 2), fmt(res.total, 4));
    m.mac.v.textContent = fmtS(L.years, fmtFixed(res.mac, 4));
    m.mac.sub.textContent = L.subMac;
    m.mod.v.textContent = fmtFixed(res.mod, 4);
    m.mod.sub.textContent = gtxt + ' · ' + fmtS(L.subModPct, fmtFixed(res.mod, 2));
    m.dv01.v.textContent = fmt(res.dv01, 6);
    m.dv01.sub.textContent = L.subDv01;
    m.conv.v.textContent = fmtFixed(res.conv, 4);
    m.conv.sub.textContent = L.subConv;
  };

  function axesMini(svg, W, H, G, xs, ys, xfmt, yfmt) {
    var X = function (v) { return G.l + (v - xs[0]) / (xs[1] - xs[0]) * G.pw; }, Y = function (v) { return G.t + G.ph - (v - ys[0]) / (ys[1] - ys[0]) * G.ph; };
    var gg = s('g', { class: 'bd-grid' }, svg);
    ticks(ys[0], ys[1], 4).forEach(function (v) {
      if (v < ys[0] || v > ys[1]) return;
      s('line', { x1: G.l, x2: G.l + G.pw, y1: Y(v), y2: Y(v) }, gg);
      s('text', { class: 'bd-tick', x: G.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: yfmt(v) }, gg);
    });
    ticks(xs[0], xs[1], Math.max(3, Math.floor(G.pw / 70))).forEach(function (v) {
      if (v < xs[0] || v > xs[1]) return;
      s('line', { class: 'bd-grid-x', x1: X(v), x2: X(v), y1: G.t, y2: G.t + G.ph }, gg);
      s('text', { class: 'bd-tick', x: X(v), y: G.t + G.ph + 16, 'text-anchor': 'middle', text: xfmt(v) }, gg);
    });
    return { X: X, Y: Y };
  }
  function rangeOf(arrs, padFrac) {
    var lo = Infinity, hi = -Infinity;
    arrs.forEach(function (a) { a.forEach(function (v) { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }); });
    var pad = (hi - lo) * padFrac || Math.abs(hi) * 0.05 || 1;
    return [lo - pad, hi + pad];
  }

  App.prototype.renderPriceYield = function () {
    var svg = this.pySvg, st = this.state, f = st.flows, res = this.res;
    clear(svg);
    var sz = this.size(svg, 230), G = { l: 54, r: 12, t: 12, b: 28 };
    G.pw = sz.w - G.l - G.r; G.ph = sz.h - G.t - G.b;
    var y0 = st.y, lo = y0 - 3, hi = y0 + 3, n = 90, xsA = [], act = [], dur = [], dc = [];
    for (var k = 0; k <= n; k++) {
      var yy = lo + (hi - lo) * k / n, dy = (yy - y0) / 100;
      xsA.push(yy); act.push(price(f, yy, st.m)); dur.push(res.price * (1 - res.mod * dy)); dc.push(res.price * (1 - res.mod * dy + 0.5 * res.conv * dy * dy));
    }
    var yr = rangeOf([act, dur], 0.06);
    var A = axesMini(svg, sz.w, sz.h, G, [lo, hi], yr, function (v) { return fmt(v, 2) + '%'; }, fmtAxis);
    var mk = function (arr, cls) { s('polyline', { class: cls, points: pts(arr.map(function (v, j) { return [A.X(xsA[j]), A.Y(clamp(v, yr[0] - (yr[1] - yr[0]), yr[1] + (yr[1] - yr[0])))]; })) }, svg); };
    var cp = s('clipPath', { id: this.uid + '-pyclip' }, svg); s('rect', { x: G.l, y: G.t, width: G.pw, height: G.ph }, cp);
    var g = s('g', { 'clip-path': 'url(#' + this.uid + '-pyclip)' }, svg);
    var mk2 = function (arr, cls) { s('polyline', { class: cls, points: pts(arr.map(function (v, j) { return [A.X(xsA[j]), A.Y(v)]; })) }, g); };
    void mk;
    mk2(dc, 'bd-ln-conv-path'); mk2(dur, 'bd-ln-dur-path'); mk2(act, 'bd-ln-actual-path');
    s('line', { class: 'bd-guide', x1: A.X(y0), x2: A.X(y0), y1: G.t, y2: G.t + G.ph }, svg);
    s('circle', { class: 'bd-pt', cx: A.X(y0), cy: A.Y(res.price), r: 4.5 }, svg);
    s('text', { class: 'bd-annot', x: clamp(A.X(y0) + 8, G.l, G.l + G.pw - 120), y: G.t + 14, text: fmtS(L.yieldLabel, fmt(y0, 2), fmt(res.price, 2)) }, svg);
  };

  App.prototype.renderApprox = function () {
    var svg = this.apSvg, st = this.state, f = st.flows, res = this.res;
    clear(svg);
    var sz = this.size(svg, 230), G = { l: 54, r: 12, t: 12, b: 28 };
    G.pw = sz.w - G.l - G.r; G.ph = sz.h - G.t - G.b;
    var xsA = [], act = [], dur = [], dc = [];
    for (var b = -300; b <= 300; b += 10) { var q = approx(f, st.y, st.m, res, b); xsA.push(b); act.push(q.actual * 100); dur.push(q.dur * 100); dc.push(q.durConv * 100); }
    var yr = rangeOf([act, dur, dc], 0.06);
    var A = axesMini(svg, sz.w, sz.h, G, [-300, 300], yr, function (v) { return (v > 0 ? '+' : '') + v + 'bp'; }, function (v) { return fmt(v, 1) + '%'; });
    s('line', { class: 'bd-axis', x1: G.l, x2: G.l + G.pw, y1: A.Y(0), y2: A.Y(0) }, svg);
    var mk = function (arr, cls) { s('polyline', { class: cls, points: pts(arr.map(function (v, j) { return [A.X(xsA[j]), A.Y(v)]; })) }, svg); };
    mk(dc, 'bd-ln-conv-path'); mk(dur, 'bd-ln-dur-path'); mk(act, 'bd-ln-actual-path');
    var tb = this.apBody; clear(tb);
    [-200, -100, 100, 200].forEach(function (bp) {
      var q = approx(f, st.y, st.m, res, bp);
      tb.appendChild(h('tr', null, [
        h('th', { scope: 'row', class: 'bd-num', text: (bp > 0 ? '+' : '') + bp + 'bp' }),
        h('td', { class: 'bd-num', text: fmtPct(q.actual, 3) }),
        h('td', { class: 'bd-num', text: fmtPct(q.dur, 3) }),
        h('td', { class: 'bd-num bd-muted', text: fmtPct(q.dur - q.actual, 3) }),
        h('td', { class: 'bd-num', text: fmtPct(q.durConv, 3) }),
        h('td', { class: 'bd-num bd-muted', text: fmtPct(q.durConv - q.actual, 3) })
      ]));
    });
  };

  App.prototype.renderWeights = function () {
    var svg = this.wtSvg, st = this.state, f = st.flows, res = this.res;
    clear(svg);
    var sz = this.size(svg, 210), G = { l: 54, r: 16, t: 26, b: 34 };
    G.pw = sz.w - G.l - G.r; G.ph = sz.h - G.t - G.b;
    var xm = Math.max(f[f.length - 1].t * 1.06, f[f.length - 1].t + 0.25), wm = 0;
    res.weights.forEach(function (w) { if (w > wm) wm = w; });
    var A = axesMini(svg, sz.w, sz.h, G, [0, xm], [0, wm * 100 * 1.15], function (v) { return fmt(v, 2) + (v ? L.yearUnit : ''); }, function (v) { return fmt(v, 1) + '%'; });
    var minGap = A.X(f[0].t) - G.l;
    for (var i = 1; i < f.length; i++) minGap = Math.min(minGap, A.X(f[i].t) - A.X(f[i - 1].t));
    var bw = clamp(minGap * 0.6, 1.5, 26), base = G.t + G.ph, gb = s('g', { class: 'bd-wbars' }, svg);
    f.forEach(function (x, j) {
      var y = A.Y(res.weights[j] * 100);
      s('rect', { class: 'bd-wbar' + (j === f.length - 1 ? ' is-last' : ''), x: round(A.X(x.t) - bw / 2, 2), y: round(y, 2), width: round(bw, 2), height: round(base - y, 2), rx: Math.min(3, bw / 3) }, gb);
    });
    // seesaw beam + fulcrum at Macaulay duration
    var dx = A.X(res.mac);
    s('line', { class: 'bd-beam', x1: A.X(f[0].t) - bw / 2, x2: A.X(f[f.length - 1].t) + bw / 2, y1: base, y2: base }, svg);
    var gd = s('g', { class: 'bd-fulcrum' }, svg);
    s('polygon', { points: pts([[dx, base + 1], [dx - 10, base + 16], [dx + 10, base + 16]]) }, gd);
    s('line', { class: 'bd-dur-line', x1: dx, x2: dx, y1: G.t - 6, y2: base }, gd);
    s('text', { x: clamp(dx, G.l + 70, G.l + G.pw - 70), y: G.t - 10, 'text-anchor': 'middle', text: fmtS(L.wtLabel, fmtS(L.years, fmt(res.mac, 3))) }, gd);
  };

  App.prototype.buildTable = function () {
    var self = this, tb = this.tbody, f = this.state.flows;
    clear(tb); this.rows = [];
    f.forEach(function (x, i) {
      var ti = h('input', { class: 'bd-input bd-input-sm', type: 'number', step: 'any', inputmode: 'decimal', min: LIMITS.t[0], max: LIMITS.t[1], 'aria-label': fmtS(L.timeAria, i + 1) });
      var ai = h('input', { class: 'bd-input bd-input-sm', type: 'number', step: 'any', inputmode: 'decimal', min: LIMITS.a[0], max: LIMITS.a[1], 'aria-label': fmtS(L.amountAria, i + 1) });
      ti.addEventListener('change', function () { self.onEdit(i, 't', ti); });
      ai.addEventListener('change', function () { self.onEdit(i, 'a', ai); });
      var df = h('td', { class: 'bd-num' }), pv = h('td', { class: 'bd-num' }), wt = h('td', { class: 'bd-num' });
      var tr = h('tr', null, [h('td', { class: 'bd-muted', text: String(i + 1) }), h('td', null, [ti]), h('td', null, [ai]), df, pv, wt,
        h('td', null, [h('button', { type: 'button', class: 'bd-x', 'aria-label': fmtS(L.delAria, i + 1), text: '×', disabled: f.length <= 1, onclick: function () { self.remove(i); } })])]);
      tr.addEventListener('focusin', function () { if (self.sel !== i) { self.sel = i; self.schedule(); } });
      tb.appendChild(tr);
      self.rows.push({ tr: tr, ti: ti, ai: ai, df: df, pv: pv, wt: wt, tv: null, av: null });
    });
    this.addEndBtn.disabled = f.length >= LIMITS.maxFlows;
  };
  App.prototype.updateTable = function (only) {
    var f = this.state.flows, res = this.res, sel = this.drag ? this.drag.i : this.sel, ae = document.activeElement;
    this.countEl.textContent = fmtS(L.count, f.length, LIMITS.maxFlows);
    (this.rows || []).forEach(function (r, i) {
      var x = f[i]; if (!x || (only != null && i !== only)) return;
      var tv = String(sig(x.t, 8)), av = String(sig(x.a, 10));
      if (r.tv !== tv && ae !== r.ti) { r.ti.value = tv; r.tv = tv; }
      if (r.av !== av && ae !== r.ai) { r.ai.value = av; r.av = av; }
      r.df.textContent = fmtFixed(res.df[i], 6); r.pv.textContent = fmt(res.pv[i], 4); r.wt.textContent = fmtFixed(res.weights[i] * 100, 2) + '%';
      r.tr.classList.toggle('is-active', i === sel);
    });
  };

  function boot() {
    var el = document.getElementById('bond-simulator-app');
    if (el && !el._bd) el._bd = new App(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  root.BondSimulator = Core;
})(typeof window !== 'undefined' ? window : this);
