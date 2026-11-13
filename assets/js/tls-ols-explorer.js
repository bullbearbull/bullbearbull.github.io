/*!
 * TLS vs OLS Regression Explorer for bullbearbull.github.io
 * - 100% client-side. No network requests, no cookies, no eval, no innerHTML, no inline styles.
 * - Theme-aware (Chirpy data-bs-theme + prefers-color-scheme) and bilingual (EN / KO).
 */
(function (root) {
  'use strict';

  var N = 40;
  var X_MIN = 0.5;
  var X_MAX = 6.5;
  var TRUE_B = 1.0;

  var I18N = {
    en: {
      locale: 'en-US',
      paramsTitle: 'Parameters',
      regen: 'New sample',
      reset: 'Reset',
      slopeLabel: 'True slope a',
      sigXLabel: 'X noise (σx)',
      sigYLabel: 'Y noise (σy)',
      scaleLabel: 'TLS X scale factor (k)',
      scaleHint: 'Larger k pushes TLS toward OLS (y ~ x); smaller k pushes it toward reverse OLS (x ~ y).',
      chkOlsRes: 'Show OLS vertical residuals (red dashed)',
      chkTlsRes: 'Show TLS 90° orthogonal projections (blue)',
      chkRevOls: 'Show reverse OLS (x ~ y inverted, amber dashed)',
      metricsTitle: 'Live Estimates',
      mOls: 'OLS slope / intercept',
      mTls: 'TLS slope / intercept',
      mOlsLoss: 'OLS SSE (Vert / Orth)',
      mTlsLoss: 'TLS SSE (Vert / Orth)',
      mSvd: 'Centered [x̃, ỹ] singular values (σ₁, σ₂)',
      chartTitle: 'Equal-Aspect Regression Comparison',
      chartAria: 'Scatter plot comparing true line, OLS, TLS, and reverse OLS with equal aspect ratio',
      lgTrue: 'True',
      lgOls: 'OLS (vertical)',
      lgTls: 'TLS (orthogonal)',
      lgRev: 'OLS (x~y inv.)',
      langToggleAria: 'Switch language',
      langKo: '한글',
      langEn: 'ENG'
    },
    ko: {
      locale: 'ko-KR',
      paramsTitle: '시뮬레이션 설정',
      regen: '새 표본',
      reset: '초기화',
      slopeLabel: '참 기울기 (a)',
      sigXLabel: 'X 측정 노이즈 (σx)',
      sigYLabel: 'Y 측정 노이즈 (σy)',
      scaleLabel: 'TLS 입력 X 스케일 배율 (k)',
      scaleHint: 'k가 커지면 TLS가 OLS(y~x)로, 작아지면 역방향 OLS(x~y)로 수렴합니다.',
      chkOlsRes: 'OLS 수직 잔차 표시 (빨강 점선)',
      chkTlsRes: 'TLS 90° 직교 투영 표시 (파랑 실선)',
      chkRevOls: '역방향 OLS (x ~ y 역변환) 표시 (주황 점선)',
      metricsTitle: '실시간 추정 결과',
      mOls: 'OLS 기울기 / 절편',
      mTls: 'TLS 기울기 / 절편',
      mOlsLoss: 'OLS 손실 (수직 / 직교)',
      mTlsLoss: 'TLS 손실 (수직 / 직교)',
      mSvd: '중심화 행렬 [x̃, ỹ] 특이값 (σ₁, σ₂)',
      chartTitle: 'Equal-Aspect 기하학적 회귀 비교',
      chartAria: '참 직선과 OLS, TLS, 역방향 OLS 적합선 및 잔차를 1:1 비율로 비교한 산점도',
      lgTrue: '참 직선',
      lgOls: 'OLS (수직)',
      lgTls: 'TLS (직교)',
      lgRev: 'OLS (x~y 역변환)',
      langToggleAria: '언어 전환',
      langKo: '한글',
      langEn: 'ENG'
    }
  };

  var LANG = 'en';
  var L = I18N.en;
  var LANG_KEY = 'bbb.tlsSim.lang';

  function setLang(lang) {
    LANG = lang === 'ko' ? 'ko' : 'en';
    L = I18N[LANG];
    return LANG;
  }

  function getLang() {
    return LANG;
  }

  function applyPageLang(lang) {
    if (typeof document === 'undefined') return;
    var nodes = document.querySelectorAll('[data-tls-lang]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-tls-lang') === lang) nodes[i].removeAttribute('hidden');
      else nodes[i].setAttribute('hidden', '');
    }
  }

  function resolveInitialLang() {
    try {
      var q = /(?:^|[?&])lang=(ko|en)(?:&|$)/i.exec(location.search || '');
      if (q) return q[1].toLowerCase();
    } catch (e) { /* ignore */ }
    try {
      var sv = localStorage.getItem(LANG_KEY);
      if (sv === 'ko' || sv === 'en') return sv;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  // ───────────────────────── Core math (pure, testable) ─────────────────────────
  function mean(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function fitOls(x, y) {
    var mx = mean(x);
    var my = mean(y);
    var sxx = 0;
    var sxy = 0;
    for (var i = 0; i < x.length; i++) {
      var dx = x[i] - mx;
      var dy = y[i] - my;
      sxx += dx * dx;
      sxy += dx * dy;
    }
    var slope = sxx > 1e-12 ? sxy / sxx : 0;
    return { slope: slope, intercept: my - slope * mx };
  }

  function fitTlsScaled(x, y, k) {
    var mxOrig = mean(x);
    var mx = mxOrig * k;
    var my = mean(y);
    var sxx = 0;
    var syy = 0;
    var sxy = 0;
    for (var i = 0; i < x.length; i++) {
      var dx = x[i] * k - mx;
      var dy = y[i] - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
    var diff = syy - sxx;
    var disc = Math.sqrt(diff * diff + 4 * sxy * sxy);
    var slopeScaled = Math.abs(sxy) < 1e-12 ? (sxx >= syy ? 0 : 1e6) : (diff + disc) / (2 * sxy);
    var slope = slopeScaled * k;
    var intercept = my - slope * mxOrig;
    var eig1 = 0.5 * ((sxx + syy) + disc);
    var eig2 = Math.max(0, 0.5 * ((sxx + syy) - disc));
    return { slope: slope, intercept: intercept, s1: Math.sqrt(eig1), s2: Math.sqrt(eig2) };
  }

  function invertFit(fit) {
    if (Math.abs(fit.slope) < 1e-12) return { slope: 1e6, intercept: 0 };
    return { slope: 1 / fit.slope, intercept: -fit.intercept / fit.slope };
  }

  function losses(x, y, fit) {
    var vsse = 0;
    var osse = 0;
    var denom = fit.slope * fit.slope + 1;
    for (var i = 0; i < x.length; i++) {
      var r = fit.slope * x[i] + fit.intercept - y[i];
      vsse += r * r;
      osse += (r * r) / denom;
    }
    return { vsse: vsse, osse: osse };
  }

  function createRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randn(nextRand) {
    var u = 0;
    var v = 0;
    while (u === 0) u = nextRand();
    while (v === 0) v = nextRand();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  var Core = {
    fitOls: fitOls,
    fitTlsScaled: fitTlsScaled,
    invertFit: invertFit,
    losses: losses,
    I18N: I18N,
    setLang: setLang,
    getLang: getLang
  };
  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (typeof document === 'undefined') return;

  // ───────────────────────── UI Helpers ─────────────────────────
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] === true) el.setAttribute(k, '');
        else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, String(attrs[k]));
      }
    }
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function isDarkTheme() {
    var rootAttr = document.documentElement.getAttribute('data-bs-theme');
    if (rootAttr === 'dark') return true;
    if (rootAttr === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ───────────────────────── App ─────────────────────────
  function App(rootEl) {
    this.root = rootEl;
    this.state = { trueA: 1.5, sigX: 1.0, sigY: 1.0, logScale: 0.0, showOlsRes: true, showTlsRes: true, showRevOls: false };
    this.baseX = [];
    this.noiseX = [];
    this.noiseY = [];
    this.raf = 0;
    this.init();
  }

  App.prototype.init = function () {
    var self = this;
    setLang(resolveInitialLang());
    this.generateSample(createRng(42));
    this.build();
    this.render();

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { self.schedule(); }).observe(this.canvasWrap);
    } else {
      window.addEventListener('resize', function () { self.schedule(); });
    }
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { self.schedule(); }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-bs-theme', 'data-mode', 'class']
      });
    }
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', function () { self.schedule(); });
    }
  };

  App.prototype.generateSample = function (rngFn) {
    var nextRand = rngFn || Math.random;
    this.baseX = [];
    this.noiseX = [];
    this.noiseY = [];
    for (var i = 0; i < N; i++) {
      this.baseX.push(X_MIN + (X_MAX - X_MIN) * (i / (N - 1)));
      this.noiseX.push(randn(nextRand));
      this.noiseY.push(randn(nextRand));
    }
  };

  App.prototype.schedule = function () {
    var self = this;
    if (this.raf) return;
    this.raf = requestAnimationFrame(function () {
      self.raf = 0;
      self.render();
    });
  };

  App.prototype.toggleLang = function () {
    var next = LANG === 'ko' ? 'en' : 'ko';
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    this.build();
    this.render();
  };

  App.prototype.resetDefaults = function () {
    this.state.trueA = 1.5;
    this.state.sigX = 1.0;
    this.state.sigY = 1.0;
    this.state.logScale = 0.0;
    this.state.showOlsRes = true;
    this.state.showTlsRes = true;
    this.state.showRevOls = false;
    this.generateSample(createRng(42));
    this.syncControls();
    this.render();
  };

  App.prototype.syncControls = function () {
    this.ctrlSlope.value = String(this.state.trueA);
    this.ctrlSigX.value = String(this.state.sigX);
    this.ctrlSigY.value = String(this.state.sigY);
    this.ctrlScale.value = String(this.state.logScale);
    this.chkOlsRes.checked = this.state.showOlsRes;
    this.chkTlsRes.checked = this.state.showTlsRes;
    this.chkRevOls.checked = this.state.showRevOls;
  };

  App.prototype.build = function () {
    var self = this;
    var r = this.root;
    clear(r);
    r.classList.add('tls-app');
    r.setAttribute('lang', LANG);
    applyPageLang(LANG);

    var isKo = LANG === 'ko';
    var langBar = h('div', { class: 'tls-lang-bar' }, [
      h('button', {
        type: 'button',
        role: 'switch',
        class: 'tls-lang-toggle ' + (isKo ? 'is-ko' : 'is-en'),
        'aria-checked': isKo ? 'true' : 'false',
        'aria-label': L.langToggleAria,
        title: L.langToggleAria,
        onclick: function () { self.toggleLang(); }
      }, [
        h('span', { class: 'tls-lang-knob', 'aria-hidden': 'true' }),
        h('span', { class: 'tls-lang-opt tls-lang-ko', text: L.langKo }),
        h('span', { class: 'tls-lang-opt tls-lang-en', text: L.langEn })
      ])
    ]);

    this.valSlope = h('span', { class: 'tls-mono' });
    this.valSigX = h('span', { class: 'tls-mono' });
    this.valSigY = h('span', { class: 'tls-mono' });
    this.valScale = h('span', { class: 'tls-mono' });

    this.ctrlSlope = h('input', { class: 'tls-range', type: 'range', min: '0.4', max: '2.5', step: '0.1', 'aria-label': L.slopeLabel });
    this.ctrlSigX = h('input', { class: 'tls-range', type: 'range', min: '0.0', max: '2.0', step: '0.05', 'aria-label': L.sigXLabel });
    this.ctrlSigY = h('input', { class: 'tls-range', type: 'range', min: '0.0', max: '2.0', step: '0.05', 'aria-label': L.sigYLabel });
    this.ctrlScale = h('input', { class: 'tls-range', type: 'range', min: '-1.3', max: '1.3', step: '0.05', 'aria-label': L.scaleLabel });

    this.ctrlSlope.addEventListener('input', function () { self.state.trueA = Number(self.ctrlSlope.value); self.render(); });
    this.ctrlSigX.addEventListener('input', function () { self.state.sigX = Number(self.ctrlSigX.value); self.render(); });
    this.ctrlSigY.addEventListener('input', function () { self.state.sigY = Number(self.ctrlSigY.value); self.render(); });
    this.ctrlScale.addEventListener('input', function () { self.state.logScale = Number(self.ctrlScale.value); self.render(); });

    this.chkOlsRes = h('input', { type: 'checkbox' });
    this.chkTlsRes = h('input', { type: 'checkbox' });
    this.chkRevOls = h('input', { type: 'checkbox' });
    this.chkOlsRes.addEventListener('change', function () { self.state.showOlsRes = self.chkOlsRes.checked; self.render(); });
    this.chkTlsRes.addEventListener('change', function () { self.state.showTlsRes = self.chkTlsRes.checked; self.render(); });
    this.chkRevOls.addEventListener('change', function () { self.state.showRevOls = self.chkRevOls.checked; self.render(); });

    this.outOls = h('div', { class: 'tls-metric-val tls-mono', text: '-' });
    this.outTls = h('div', { class: 'tls-metric-val tls-mono', text: '-' });
    this.outOlsLoss = h('div', { class: 'tls-metric-val tls-mono', text: '-' });
    this.outTlsLoss = h('div', { class: 'tls-metric-val tls-mono', text: '-' });
    this.outSvd = h('div', { class: 'tls-metric-val tls-mono', text: '-' });

    var controlsCard = h('section', { class: 'tls-card tls-controls' }, [
      h('div', { class: 'tls-head' }, [
        h('h3', { class: 'tls-title', text: L.paramsTitle }),
        h('div', { class: 'tls-actions' }, [
          h('button', { type: 'button', class: 'tls-btn tls-btn-primary', text: L.regen, onclick: function () { self.generateSample(); self.render(); } }),
          h('button', { type: 'button', class: 'tls-btn', text: L.reset, onclick: function () { self.resetDefaults(); } })
        ])
      ]),
      h('div', null, [
        h('div', { class: 'tls-ctrl-row' }, [h('span', { text: L.slopeLabel }), this.valSlope]),
        this.ctrlSlope
      ]),
      h('div', null, [
        h('div', { class: 'tls-ctrl-row' }, [h('span', { text: L.sigXLabel }), this.valSigX]),
        this.ctrlSigX
      ]),
      h('div', null, [
        h('div', { class: 'tls-ctrl-row' }, [h('span', { text: L.sigYLabel }), this.valSigY]),
        this.ctrlSigY
      ]),
      h('div', null, [
        h('div', { class: 'tls-ctrl-row' }, [h('span', { text: L.scaleLabel }), this.valScale]),
        this.ctrlScale,
        h('p', { class: 'tls-hint', text: L.scaleHint })
      ]),
      h('div', { class: 'tls-divider' }, [
        h('label', { class: 'tls-check' }, [this.chkOlsRes, h('span', { text: L.chkOlsRes })]),
        h('label', { class: 'tls-check' }, [this.chkTlsRes, h('span', { text: L.chkTlsRes })]),
        h('label', { class: 'tls-check' }, [this.chkRevOls, h('span', { text: L.chkRevOls })])
      ])
    ]);

    this.canvas = h('canvas', { class: 'tls-canvas', role: 'img', 'aria-label': L.chartAria });
    this.canvasWrap = h('div', { class: 'tls-canvas-wrap' }, [this.canvas]);

    var plotCard = h('section', { class: 'tls-card tls-plot-card' }, [
      h('div', { class: 'tls-head' }, [
        h('h3', { class: 'tls-title', text: L.chartTitle }),
        h('div', { class: 'tls-legend' }, [
          h('span', { class: 'tls-legend-item' }, [h('span', { class: 'tls-swatch tls-sw-true' }), L.lgTrue]),
          h('span', { class: 'tls-legend-item' }, [h('span', { class: 'tls-swatch tls-sw-ols' }), L.lgOls]),
          h('span', { class: 'tls-legend-item' }, [h('span', { class: 'tls-swatch tls-sw-tls' }), L.lgTls]),
          h('span', { class: 'tls-legend-item' }, [h('span', { class: 'tls-swatch tls-sw-rev' }), L.lgRev])
        ])
      ]),
      this.canvasWrap,
      h('div', { class: 'tls-divider' }, [
        h('h4', { class: 'tls-subtitle', text: L.metricsTitle }),
        h('div', { class: 'tls-metrics' }, [
          h('div', { class: 'tls-metric' }, [h('div', { class: 'tls-metric-label', text: L.mOls }), this.outOls]),
          h('div', { class: 'tls-metric' }, [h('div', { class: 'tls-metric-label', text: L.mTls }), this.outTls]),
          h('div', { class: 'tls-metric' }, [h('div', { class: 'tls-metric-label', text: L.mOlsLoss }), this.outOlsLoss]),
          h('div', { class: 'tls-metric' }, [h('div', { class: 'tls-metric-label', text: L.mTlsLoss }), this.outTlsLoss]),
          h('div', { class: 'tls-metric tls-metric-wide' }, [h('div', { class: 'tls-metric-label', text: L.mSvd }), this.outSvd])
        ])
      ])
    ]);

    r.appendChild(langBar);
    r.appendChild(h('div', { class: 'tls-layout' }, [controlsCard, plotCard]));
    this.syncControls();
  };

  App.prototype.render = function () {
    var st = this.state;
    var trueA = st.trueA;
    var sigX = st.sigX;
    var sigY = st.sigY;
    var k = Math.pow(10, st.logScale);

    this.valSlope.textContent = trueA.toFixed(2);
    this.valSigX.textContent = sigX.toFixed(2);
    this.valSigY.textContent = sigY.toFixed(2);
    this.valScale.textContent = k.toFixed(2) + 'x';

    var x = [];
    var y = [];
    for (var i = 0; i < N; i++) {
      x.push(this.baseX[i] + sigX * this.noiseX[i]);
      y.push(trueA * this.baseX[i] + TRUE_B + sigY * this.noiseY[i]);
    }

    var ols = fitOls(x, y);
    var revOls = invertFit(fitOls(y, x));
    var tls = fitTlsScaled(x, y, k);
    var olsL = losses(x, y, ols);
    var tlsL = losses(x, y, tls);

    this.outOls.textContent = ols.slope.toFixed(3) + 'x + ' + ols.intercept.toFixed(2);
    this.outTls.textContent = tls.slope.toFixed(3) + 'x + ' + tls.intercept.toFixed(2);
    this.outOlsLoss.textContent = olsL.vsse.toFixed(1) + ' / ' + olsL.osse.toFixed(1);
    this.outTlsLoss.textContent = tlsL.vsse.toFixed(1) + ' / ' + tlsL.osse.toFixed(1);
    this.outSvd.textContent = 'σ₁=' + tls.s1.toFixed(2) + ', σ₂=' + tls.s2.toFixed(2) + ' (σ₂²=' + (tls.s2 * tls.s2).toFixed(1) + ')';

    var canvas = this.canvas;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var W = rect.width;
    var H = rect.height;
    var dark = isDarkTheme();

    var bgPlot = dark ? '#131722' : '#fafafa';
    var gridColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    var tickColor = dark ? '#94a3b8' : '#475569';
    var borderColor = dark ? '#334155' : '#cbd5e1';
    var trueColor = dark ? '#94a3b8' : '#334155';
    var olsColor = dark ? '#f87171' : '#d64045';
    var tlsColor = dark ? '#38bdf8' : '#0077b6';
    var revColor = dark ? '#fbbf24' : '#e09f3e';
    var dotColor = dark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgPlot;
    ctx.fillRect(0, 0, W, H);

    var padL = 34;
    var padR = 14;
    var padT = 14;
    var padB = 28;
    var span = 14;
    var xMin = -3;
    var xMax = xMin + span;
    var yMin = -1;
    var yMax = yMin + span;
    var side = Math.max(40, Math.min(W - padL - padR, H - padT - padB));
    var ox = padL + Math.max(0, (W - padL - padR - side) / 2);
    var oy = padT + Math.max(0, (H - padT - padB - side) / 2);
    var tx = function (vx) { return ox + ((vx - xMin) / span) * side; };
    var ty = function (vy) { return oy + side - ((vy - yMin) / span) * side; };

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '11.5px sans-serif';
    ctx.fillStyle = tickColor;
    for (var g = -2; g <= 12; g += 2) {
      if (g >= xMin && g <= xMax) {
        var px = tx(g);
        ctx.beginPath();
        ctx.moveTo(px, oy);
        ctx.lineTo(px, oy + side);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(String(g), px, oy + side + 16);
      }
      if (g >= yMin && g <= yMax) {
        var py = ty(g);
        ctx.beginPath();
        ctx.moveTo(ox, py);
        ctx.lineTo(ox + side, py);
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(String(g), ox - 8, py + 4);
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, side, side);
    ctx.clip();

    function drawLine(slope, intercept, color, width, dash) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      ctx.moveTo(tx(xMin - 2), ty(slope * (xMin - 2) + intercept));
      ctx.lineTo(tx(xMax + 2), ty(slope * (xMax + 2) + intercept));
      ctx.stroke();
      ctx.restore();
    }

    var denomTls = tls.slope * tls.slope + 1;
    for (i = 0; i < N; i++) {
      var xi = x[i];
      var yi = y[i];
      if (st.showOlsRes) {
        ctx.save();
        ctx.strokeStyle = dark ? 'rgba(248,113,113,0.45)' : 'rgba(214,64,69,0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(tx(xi), ty(yi));
        ctx.lineTo(tx(xi), ty(ols.slope * xi + ols.intercept));
        ctx.stroke();
        ctx.restore();
      }
      if (st.showTlsRes) {
        var d = (tls.slope * xi - yi + tls.intercept) / denomTls;
        var xp = xi - tls.slope * d;
        var yp = yi + d;
        ctx.strokeStyle = dark ? 'rgba(56,189,248,0.65)' : 'rgba(0,119,182,0.65)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(tx(xi), ty(yi));
        ctx.lineTo(tx(xp), ty(yp));
        ctx.stroke();
      }
    }

    drawLine(trueA, TRUE_B, trueColor, 1.8, [3, 4]);
    if (st.showRevOls) drawLine(revOls.slope, revOls.intercept, revColor, 2.2, [6, 4]);
    drawLine(ols.slope, ols.intercept, olsColor, 2.5);
    drawLine(tls.slope, tls.intercept, tlsColor, 2.8);

    for (i = 0; i < N; i++) {
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(tx(x[i]), ty(y[i]), 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, side, side);
  };

  function boot() {
    var el = document.getElementById('tls-ols-app');
    if (el && !el._tls) el._tls = new App(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  root.TlsOlsExplorer = Core;
})(typeof window !== 'undefined' ? window : this);
