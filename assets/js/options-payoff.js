/*!
 * Options Payoff Simulator (payoff at expiration) for bullbearbull.github.io
 * - 100% client-side. No network requests, no cookies, no eval, no innerHTML.
 * - Settings are kept only in this browser's localStorage.
 */
(function (root) {
  'use strict';

  // ───────────────────────── Core math (pure, testable) ─────────────────────────
  var LIMITS = {
    S: [0.01, 1e7], iv: [1, 300], days: [1, 3650], r: [-5, 20], mult: [1, 1e6],
    qty: [1, 1000], strike: [0.01, 1e7], premium: [0, 1e7], entry: [0.01, 1e7],
    maxLegs: 8, maxSlots: 3
  };

  // erf via the Numerical Recipes erfc Chebyshev fit (fractional error < 1.2e-7).
  function erf(x) {
    var s = x < 0 ? -1 : 1; x = Math.abs(x);
    var t = 1 / (1 + 0.5 * x);
    var y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
      t * (-0.82215223 + t * 0.17087277)))))))));
    return s * (1 - y);
  }
  function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

  /** Black-Scholes (no dividends). S,K>0, sigma (decimal), T (years), r (decimal). */
  function bsPrice(type, S, K, sigma, T, r) {
    if (!(S > 0) || !(K > 0) || !(sigma > 0) || !(T > 0)) return NaN;
    var v = sigma * Math.sqrt(T);
    var d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / v;
    var d2 = d1 - v;
    var df = Math.exp(-r * T);
    return type === 'call' ? S * normCdf(d1) - K * df * normCdf(d2)
                           : K * df * normCdf(-d2) - S * normCdf(-d1);
  }
  function round2(x) { return Math.round(x * 100) / 100; }

  /** P&L of one leg at expiry price x, per 1 unit of multiplier. */
  function legPnl(leg, x) {
    var d = leg.side * leg.qty;
    if (leg.type === 'stock') return d * (x - leg.entry);
    if (leg.type === 'call') return d * (Math.max(0, x - leg.strike) - leg.premium);
    if (leg.type === 'put') return d * (Math.max(0, leg.strike - x) - leg.premium);
    return 0;
  }
  function pnl(legs, x) { var s = 0; for (var i = 0; i < legs.length; i++) s += legPnl(legs[i], x); return s; }

  /** Exact metrics of a piecewise-linear expiry payoff on [0, ∞). */
  function metrics(legs) {
    var set = { 0: true }, i;
    for (i = 0; i < legs.length; i++) {
      var l = legs[i];
      if (l.type === 'call' || l.type === 'put') set[l.strike] = true;
      else if (l.type === 'stock') set[l.entry] = true;
    }
    var knots = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var slopeRight = 0, net = 0;
    for (i = 0; i < legs.length; i++) {
      if (legs[i].type === 'call' || legs[i].type === 'stock') slopeRight += legs[i].side * legs[i].qty;
      if (legs[i].type === 'call' || legs[i].type === 'put') net += -legs[i].side * legs[i].qty * legs[i].premium;
    }
    var vals = knots.map(function (k) { return pnl(legs, k); });
    var maxProfit = slopeRight > 0 ? Infinity : Math.max.apply(null, vals);
    var maxLoss = slopeRight < 0 ? -Infinity : Math.min.apply(null, vals);
    var eps = 1e-9, beps = [];
    var pts = knots.concat([knots[knots.length - 1] + 1e9]);
    function push(r) { for (var j = 0; j < beps.length; j++) if (Math.abs(beps[j] - r) < 1e-6) return; beps.push(r); }
    for (i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], ya = pnl(legs, a), yb = pnl(legs, b);
      if (Math.abs(ya) < eps && Math.abs(yb) < eps) continue; // flat zero segment
      if (Math.abs(ya) < eps) push(a);
      else if (ya * yb < 0) push(a - ya * (b - a) / (yb - ya));
      else if (Math.abs(yb) < eps && i < pts.length - 2) push(b);
    }
    beps.sort(function (a, b) { return a - b; });
    return { net: net, maxProfit: maxProfit, maxLoss: maxLoss, beps: beps, slopeRight: slopeRight, knots: knots };
  }

  // ───────────────────────── Text (all user-facing strings; English UI) ─────────────────────────
  // To add a language later, add I18N.xx with the same keys and point T at it.
  var I18N = { en: {
    "ui": {
      "unlimited": "Unlimited",
      "negUnlimited": "-Unlimited",
      "none": "None",
      "chartTitle": "Payoff at expiration",
      "chartAria": "Payoff at expiration chart",
      "emptyTitle": "Add a strategy to compare",
      "emptyBody": "Click “+ Add strategy” under Strategy builder and add legs to draw the payoff at expiration. You can overlay up to 3 strategies.",
      "summaryTitle": "Strategy comparison",
      "thead": [
        "Strategy",
        "Legs",
        "Initial cash flow",
        "Max profit",
        "Max loss",
        "Break-even"
      ],
      "summaryNote": "Amounts = per-unit option P&L × quantity × contract multiplier. Initial cash flow counts option premiums only: + received, − paid.",
      "tableEmpty": "No strategies to compare yet.",
      "marketTitle": "Market inputs",
      "fieldS": "Spot price S₀",
      "fieldIv": "Implied volatility",
      "fieldDays": "Days to expiry",
      "unitDays": "days",
      "fieldR": "Risk-free rate",
      "fieldMult": "Contract multiplier",
      "autoPrice": "Price premiums with Black-Scholes (uncheck to enter them manually)",
      "templateAria": "Standard strategy template",
      "templatePlaceholder": "Load a standard strategy template (optional)",
      "addCall": "+ Call",
      "addPut": "+ Put",
      "addStock": "+ Underlying",
      "editorTitle": "Strategy builder",
      "addSlot": "+ Add strategy",
      "save": "Save",
      "share": "Copy share link",
      "reset": "Reset",
      "storageNote": "Settings save automatically on every change and stay only in this browser’s localStorage. Nothing is sent to a server, and no cookies are used.",
      "stLoadedUrl": "Loaded the settings from the share link.",
      "stLoadedLocal": "Restored your last settings from this browser.",
      "stSaved": "Saved in this browser.",
      "stSaveFail": "Couldn’t save: this browser is blocking localStorage.",
      "stReset": "Cleared the saved settings and started over.",
      "stShared": "Share link copied.",
      "errMarket": "Please check the value: allowed range is {0} to {1}{2}. The previous value is used for now.",
      "errLeg": "Please check the value: allowed range is {0} to {1}{2}.",
      "wholeNumber": " (whole number)",
      "errMaxLegs": "Up to {0} legs per strategy.",
      "tabShowAria": "Show strategy {0} on the chart",
      "tabDeleteAria": "Delete strategy {0}",
      "expiryNote": "All legs share the same expiration (European style, payoff at expiration).",
      "legsEmpty": "Add call, put, or underlying legs with the buttons below, or load a standard strategy template.",
      "typeCall": "Call",
      "typePut": "Put",
      "typeStock": "Underlying",
      "sideBuy": "Buy",
      "sideSell": "Sell",
      "sideShort": "Short",
      "legTypeAria": "Leg {0} type",
      "legSideAria": "Leg {0} side",
      "legFieldAria": "Leg {0} {1}",
      "legDeleteAria": "Delete leg {0}",
      "qty": "Qty",
      "entry": "Entry price",
      "strike": "Strike",
      "premium": "Premium",
      "autoTitle": "Auto-priced (uncheck Black-Scholes pricing to edit)",
      "compStock": "{0} underlying",
      "compLong": "Long",
      "compShort": "Short",
      "compOpt": "{0} {1} {2}",
      "readoutHint": "Hover over or tap the chart to compare P&L at any expiration price. Dots mark break-even points.",
      "readoutAt": "At expiration price {0} ({1}%)",
      "koLabel": "Korean: "
    },
    "groups": {
      "basic": "Basics",
      "stock": "Stock + options",
      "vertical": "Vertical spreads",
      "volatility": "Volatility",
      "range": "Range-bound (butterflies & condors)",
      "synthetic": "Synthetics & ratios"
    },
    "naming": {
      "empty": {
        "name": "Empty strategy",
        "ko": "빈 전략",
        "desc": "Add legs or load a standard strategy template."
      },
      "offset": {
        "name": "No net position (offsetting)",
        "ko": "포지션 없음(상쇄됨)",
        "desc": "The long and short legs cancel out, so there is no net position. Only the premium difference remains at expiration."
      },
      "custom": {
        "name": "Custom strategy",
        "ko": "사용자 정의 전략",
        "desc": "This combination doesn’t match a standard strategy in the catalog. Check the metrics and the chart."
      },
      "reverseName": "Reverse of {0}",
      "reverseKo": "{0}의 반대 포지션",
      "reverseDesc": "Every buy and sell in “{0}” is flipped, so the payoff is mirrored top to bottom.",
      "brokenDesc": "A butterfly with unequal wing widths (broken wing). Unlike the equidistant version, the two outer zones settle at different P&L levels, so on the wider-wing side you can lose (or make) more than the net premium. See the computed max profit and loss below.",
      "ratioSpreadName": "{0} Ratio Spread {1}:{2} (OIC: Short Ratio {0} Spread)",
      "ratioBackName": "{0} Ratio Backspread {1}:{2} (OIC: Long Ratio {0} Spread)",
      "ratioSpreadKo": "{0} 레이쇼 스프레드 ({1}:{2})",
      "ratioBackKo": "{0} 레이쇼 백스프레드 ({1}:{2})",
      "typeEn": {
        "call": "Call",
        "put": "Put"
      },
      "typeKo": {
        "call": "콜",
        "put": "풋"
      },
      "ratioDesc": {
        "callSpread": "Buy {0} lower-strike call(s) and sell {1} higher-strike calls. Max profit near the short strike; losses are unlimited in a sharp rally.",
        "putSpread": "Buy {0} higher-strike put(s) and sell {1} lower-strike puts. Max profit near the short strike; losses grow sharply in a crash.",
        "callBack": "Sell {0} lower-strike call(s) and buy {1} higher-strike calls. Gains in a sharp rally; the largest loss is near the long strike.",
        "putBack": "Sell {0} higher-strike put(s) and buy {1} lower-strike puts. Gains in a crash; the largest loss is near the long strike."
      },
      "stats": "At current inputs, at expiration: max profit {0}, max loss {1}{2}.",
      "flowDebit": "net debit {0}",
      "flowCredit": "net credit {0}",
      "flowZero": "zero net premium",
      "dcDebit": " (Debit)",
      "dcCredit": " (Credit)",
      "dcZero": " (Zero Cost)",
      "warnSameStrike": "Price check: the {1}s at strike {0} have different premiums.",
      "warnCallOrder": "Price check: at strikes {0} / {1}, the higher-strike call costs more than the lower-strike call.",
      "warnPutOrder": "Price check: at strikes {0} / {1}, the lower-strike put costs more than the higher-strike put.",
      "warnWidth": "Price check: the {0} premium difference at strikes {1} / {2} ({3}) is larger than the strike difference ({4}).",
      "warnConvex": "Price check: {0} prices at strikes {1} / {2} / {3} are not convex, so a butterfly would lock in a riskless profit.",
      "typeLower": {
        "call": "call",
        "put": "put"
      }
    },
    "broken": {
      "long_call_butterfly": {
        "name": "Broken-Wing Long Call Butterfly (Asymmetric)",
        "ko": "브로큰 윙 롱 콜 버터플라이 (비대칭)"
      },
      "short_call_butterfly": {
        "name": "Broken-Wing Short Call Butterfly (Asymmetric)",
        "ko": "브로큰 윙 숏 콜 버터플라이 (비대칭)"
      },
      "long_put_butterfly": {
        "name": "Broken-Wing Long Put Butterfly (Asymmetric)",
        "ko": "브로큰 윙 롱 풋 버터플라이 (비대칭)"
      },
      "short_put_butterfly": {
        "name": "Broken-Wing Short Put Butterfly (Asymmetric)",
        "ko": "브로큰 윙 숏 풋 버터플라이 (비대칭)"
      },
      "iron_butterfly": {
        "name": "Broken-Wing Short Iron Butterfly (Asymmetric)",
        "ko": "브로큰 윙 숏 아이언 버터플라이 (비대칭)"
      },
      "long_iron_butterfly": {
        "name": "Broken-Wing Long Iron Butterfly (Asymmetric)",
        "ko": "브로큰 윙 롱 아이언 버터플라이 (비대칭)"
      }
    },
    "strategies": {
      "long_call": {
        "name": "Long Call",
        "ko": "롱 콜 (콜옵션 매수)",
        "desc": "Buy a call. The maximum loss is the premium paid, and profit grows as the underlying rises. Break-even = strike + premium."
      },
      "short_call": {
        "name": "Naked Call (Short Call)",
        "ko": "숏 콜 (네이키드 콜 매도)",
        "desc": "Sell a call without holding the underlying. The maximum profit is the premium received; losses are unlimited if the underlying rallies. Break-even = strike + premium."
      },
      "long_put": {
        "name": "Long Put",
        "ko": "롱 풋 (풋옵션 매수)",
        "desc": "Buy a put. The maximum loss is the premium; the maximum profit is strike − premium if the underlying falls to zero. Break-even = strike − premium."
      },
      "short_put": {
        "name": "Naked Put (Short Put)",
        "ko": "숏 풋 (네이키드 풋 매도)",
        "desc": "Sell a put. The maximum profit is the premium; the maximum loss is strike − premium. Break-even = strike − premium."
      },
      "cash_secured_put": {
        "name": "Cash-Secured Put",
        "ko": "현금 담보 풋 매도",
        "desc": "Sell a put while setting aside the cash needed if assigned (strike × quantity × multiplier). The expiration payoff equals a short put; only the collateral differs."
      },
      "long_stock": {
        "name": "Long Stock",
        "ko": "기초자산 매수",
        "desc": "Buy the stock or future. A linear payoff: +1 for every 1 the price rises, −1 for every 1 it falls."
      },
      "covered_call": {
        "name": "Covered Call (Buy/Write)",
        "ko": "커버드 콜",
        "desc": "Hold the stock and sell a call. Upside is capped at the strike in exchange for a premium cushion. At expiration the payoff matches a short put at the same strike (put-call parity)."
      },
      "protective_put": {
        "name": "Protective Put (Married Put)",
        "ko": "프로텍티브 풋",
        "desc": "Hold the stock and buy a put. The downside is limited to entry − strike + premium, like insurance. The payoff matches a long call at the same strike."
      },
      "collar": {
        "name": "Collar (Protective Collar)",
        "ko": "칼라",
        "desc": "Long stock + buy an OTM put + sell an OTM call. P&L is bounded between the two strikes; if the call premium pays for the put, it is a zero-cost collar. Shaped like a bull vertical spread."
      },
      "covered_put": {
        "name": "Covered Put",
        "ko": "커버드 풋",
        "desc": "Short the stock and sell a put. Downside gains are capped at the strike, and losses are unlimited if the stock rallies. The payoff matches a short call at the same strike."
      },
      "bull_call_spread": {
        "name": "Bull Call Spread",
        "ko": "강세 콜 스프레드",
        "desc": "Buy a lower-strike call and sell a higher-strike call. Max profit = strike width − net debit; max loss = net debit."
      },
      "bear_call_spread": {
        "name": "Bear Call Spread",
        "ko": "약세 콜 스프레드",
        "desc": "Sell a lower-strike call and buy a higher-strike call. Max profit = net credit; max loss = strike width − net credit."
      },
      "bull_put_spread": {
        "name": "Bull Put Spread",
        "ko": "강세 풋 스프레드",
        "desc": "Buy a lower-strike put and sell a higher-strike put. Max profit = net credit; max loss = strike width − net credit."
      },
      "bear_put_spread": {
        "name": "Bear Put Spread",
        "ko": "약세 풋 스프레드",
        "desc": "Sell a lower-strike put and buy a higher-strike put. Max profit = strike width − net debit; max loss = net debit."
      },
      "long_straddle": {
        "name": "Long Straddle",
        "ko": "롱 스트래들",
        "desc": "Buy a call and a put at the same strike. Profits from a large move in either direction. Max loss = both premiums; break-evens = strike ± total premium."
      },
      "short_straddle": {
        "name": "Short Straddle",
        "ko": "숏 스트래들",
        "desc": "Sell a call and a put at the same strike. Max profit (both premiums) if expiration is near the strike; upside loss is unlimited and downside loss is large."
      },
      "long_strangle": {
        "name": "Long Strangle",
        "ko": "롱 스트랭글",
        "desc": "Buy an OTM put (lower strike) and an OTM call (higher strike). Cheaper than a straddle, but it needs a bigger move to profit."
      },
      "short_strangle": {
        "name": "Short Strangle",
        "ko": "숏 스트랭글",
        "desc": "Sell an OTM put and an OTM call. Keep both premiums if expiration lands between the strikes; both tails carry large risk."
      },
      "long_call_butterfly": {
        "name": "Long Call Butterfly",
        "ko": "롱 콜 버터플라이",
        "desc": "Buy 1 call at K1, sell 2 at K2, and buy 1 at K3, with equally spaced strikes. Profit peaks near the middle strike; P&L is flat outside the wings."
      },
      "iron_butterfly": {
        "name": "Short Iron Butterfly",
        "ko": "숏 아이언 버터플라이",
        "desc": "A short straddle with equidistant long put and call wings (often just called an iron butterfly). Profit peaks near the middle strike; losses are capped at the wings."
      },
      "iron_condor": {
        "name": "Iron Condor (Short Iron Condor)",
        "ko": "아이언 콘도르",
        "desc": "Bull put spread + bear call spread. Max profit (net credit) between the two middle strikes; max loss = wider wing − net credit."
      },
      "synthetic_long": {
        "name": "Synthetic Long Stock",
        "ko": "합성 선물 매수",
        "desc": "Buy a call and sell a put at the same strike. By put-call parity the payoff has a slope of 1, like owning the underlying."
      },
      "risk_reversal": {
        "name": "Risk Reversal (Bullish: Short Put + Long Call)",
        "ko": "리스크 리버설 (강세: 풋 매도 + 콜 매수)",
        "desc": "Sell an OTM put to pay for an OTM call. Flat between the strikes, unlimited upside, and growing losses below the put strike."
      },
      "call_ratio_spread": {
        "name": "Call Ratio Spread 1:2 (OIC: Short Ratio Call Spread)",
        "ko": "콜 레이쇼 스프레드 (1:2)",
        "desc": "Buy 1 lower-strike call and sell 2 higher-strike calls. Max profit near the higher strike; losses are unlimited in a sharp rally."
      },
      "put_backspread": {
        "name": "Put Ratio Backspread 1:2 (OIC: Long Ratio Put Spread)",
        "ko": "풋 레이쇼 백스프레드 (1:2)",
        "desc": "Sell 1 higher-strike put and buy 2 lower-strike puts. Large profit in a crash, max loss near the lower strike, and a fixed result (net credit or debit) on the upside."
      },
      "short_stock": {
        "name": "Short Stock",
        "ko": "기초자산 공매도",
        "desc": "Short the stock or future. Profits as the price falls; losses are unlimited as it rises."
      },
      "protective_call": {
        "name": "Protective Call (OIC: Synthetic Long Put)",
        "ko": "프로텍티브 콜 (합성 롱 풋)",
        "desc": "Short stock plus a long call that caps the upside risk. The payoff matches a long put at the same strike."
      },
      "short_collar": {
        "name": "Collar on Short Stock (Short Stock + Long Call + Short Put)",
        "ko": "칼라 (공매도 헤지: 공매도 + 콜 매수 + 풋 매도)",
        "desc": "Short stock hedged with a long call (caps upside risk) and a short put (pays for it). P&L is bounded between the two strikes."
      },
      "conversion": {
        "name": "Conversion",
        "ko": "컨버전",
        "desc": "Long stock + long put + short call at the same strike. The expiration result is fixed regardless of price. Financing cost (interest) is not modeled, so the fixed amount can look like a free profit."
      },
      "reversal": {
        "name": "Reversal (Reverse Conversion)",
        "ko": "리버설 (리버스 컨버전)",
        "desc": "Short stock + long call + short put at the same strike. The expiration result is fixed regardless of price. Financing cost (interest) is not modeled."
      },
      "ratio_write": {
        "name": "Ratio Write (1 Stock : 2 Short Calls)",
        "ko": "레이쇼 라이트 (주식 1 + 콜 2 매도)",
        "desc": "Sell 2 calls per unit of stock. Half is covered and half is naked, so losses are unlimited in a sharp rally."
      },
      "covered_ratio": {
        "name": "Covered Ratio Spread",
        "ko": "커버드 레이쇼 스프레드",
        "desc": "Long stock + sell 2 lower-strike calls + buy 1 higher-strike call (OIC). Best result near the short-call strike; above it the profit erodes and then levels off."
      },
      "stock_repair": {
        "name": "Stock Repair",
        "ko": "스톡 리페어",
        "desc": "Long stock + buy 1 call + sell 2 higher-strike calls (OIC). Lowers the break-even at little or no cost, but gives up gains above the higher strike."
      },
      "synthetic_short": {
        "name": "Synthetic Short Stock",
        "ko": "합성 선물 매도",
        "desc": "Sell a call and buy a put at the same strike. By put-call parity the payoff has a slope of −1, like shorting the underlying."
      },
      "risk_reversal_bear": {
        "name": "Risk Reversal (Bearish: Long Put + Short Call)",
        "ko": "리스크 리버설 (약세: 풋 매수 + 콜 매도)",
        "desc": "Sell an OTM call to pay for an OTM put. Flat between the strikes, gains below, and unlimited losses above."
      },
      "strap": {
        "name": "Long Strap",
        "ko": "롱 스트랩 (콜 2 + 풋 1)",
        "desc": "Buy 2 calls and 1 put at the same strike (Hull). A straddle tilted toward the upside."
      },
      "short_strap": {
        "name": "Short Strap",
        "ko": "숏 스트랩 (콜 2 + 풋 1 매도)",
        "desc": "Sell 2 calls and 1 put at the same strike. Profits near the strike; losses are unlimited in a rally."
      },
      "strip": {
        "name": "Long Strip",
        "ko": "롱 스트립 (콜 1 + 풋 2)",
        "desc": "Buy 1 call and 2 puts at the same strike (Hull). A straddle tilted toward the downside."
      },
      "short_strip": {
        "name": "Short Strip",
        "ko": "숏 스트립 (콜 1 + 풋 2 매도)",
        "desc": "Sell 1 call and 2 puts at the same strike. Profits near the strike; losses grow on either side."
      },
      "long_guts": {
        "name": "Long Guts",
        "ko": "롱 거츠",
        "desc": "Buy an ITM call (lower strike) and an ITM put (higher strike), an OIC strangle variation. Same shape as a strangle, with higher premiums."
      },
      "short_guts": {
        "name": "Short Guts",
        "ko": "숏 거츠",
        "desc": "Sell an ITM call and an ITM put. Best result between the strikes; large moves in either direction lose."
      },
      "short_call_butterfly": {
        "name": "Short Call Butterfly",
        "ko": "숏 콜 버터플라이",
        "desc": "Sell 1 call at K1, buy 2 at K2, and sell 1 at K3, with equally spaced strikes. The largest loss is near the middle strike; P&L is flat outside the wings."
      },
      "long_put_butterfly": {
        "name": "Long Put Butterfly",
        "ko": "롱 풋 버터플라이",
        "desc": "Buy 1 put at K1, sell 2 at K2, and buy 1 at K3, with equally spaced strikes. Profit peaks near the middle strike."
      },
      "short_put_butterfly": {
        "name": "Short Put Butterfly",
        "ko": "숏 풋 버터플라이",
        "desc": "Sell 1 put at K1, buy 2 at K2, and sell 1 at K3, with equally spaced strikes. The largest loss is near the middle strike."
      },
      "long_iron_butterfly": {
        "name": "Long Iron Butterfly",
        "ko": "롱 아이언 버터플라이",
        "desc": "A long straddle with equidistant short put and call wings (OIC). Profits from a large move, capped at the wings."
      },
      "long_iron_condor": {
        "name": "Long Iron Condor",
        "ko": "롱 아이언 콘도르",
        "desc": "Bear put spread + bull call spread. Max profit beyond the outer strikes; the net debit is lost in the middle zone."
      },
      "long_call_condor": {
        "name": "Long Call Condor",
        "ko": "롱 콜 콘도르",
        "desc": "Buy, sell, sell, and buy calls at four strikes (OIC). Max profit between the two middle strikes."
      },
      "short_call_condor": {
        "name": "Short Call Condor",
        "ko": "숏 콜 콘도르",
        "desc": "Sell, buy, buy, and sell calls at four strikes. Max profit beyond the outer strikes."
      },
      "long_put_condor": {
        "name": "Long Put Condor",
        "ko": "롱 풋 콘도르",
        "desc": "Buy, sell, sell, and buy puts at four strikes. Max profit between the two middle strikes."
      },
      "short_put_condor": {
        "name": "Short Put Condor",
        "ko": "숏 풋 콘도르",
        "desc": "Sell, buy, buy, and sell puts at four strikes. Max profit beyond the outer strikes."
      },
      "long_box": {
        "name": "Long Box",
        "ko": "롱 박스",
        "desc": "Bull call spread + bear put spread on the same two strikes. The expiration value is fixed at the strike width (Hull). Financing cost (interest) is not modeled."
      },
      "short_box": {
        "name": "Short Box",
        "ko": "숏 박스",
        "desc": "Bear call spread + bull put spread on the same two strikes. You receive cash now and pay the strike width at expiration. Financing cost (interest) is not modeled."
      },
      "long_call_ladder": {
        "name": "Long Call Ladder (Buy 1, Sell 2 Higher Calls)",
        "ko": "롱 콜 래더 (콜 1 매수 + 상위 콜 2개 매도)",
        "desc": "A bull call spread plus one more short call at a higher strike. Best in the middle zone; losses are unlimited in a sharp rally."
      },
      "short_call_ladder": {
        "name": "Short Call Ladder (Sell 1, Buy 2 Higher Calls)",
        "ko": "숏 콜 래더 (콜 1 매도 + 상위 콜 2개 매수)",
        "desc": "A bear call spread plus one more long call at a higher strike. Gains in a sharp rally."
      },
      "long_put_ladder": {
        "name": "Long Put Ladder (Buy 1, Sell 2 Lower Puts)",
        "ko": "롱 풋 래더 (풋 1 매수 + 하위 풋 2개 매도)",
        "desc": "A bear put spread plus one more short put at a lower strike. Best in the middle zone; losses grow in a crash."
      },
      "short_put_ladder": {
        "name": "Short Put Ladder (Sell 1, Buy 2 Lower Puts)",
        "ko": "숏 풋 래더 (풋 1 매도 + 하위 풋 2개 매수)",
        "desc": "A bull put spread plus one more long put at a lower strike. Gains in a crash."
      },
      "seagull_bull": {
        "name": "Seagull (Bullish: Short Put + Bull Call Spread)",
        "ko": "시걸 (강세: 풋 매도 + 강세 콜 스프레드)",
        "desc": "Sell a lower-strike put to fund a bull call spread. Upside is capped at the top strike; losses grow below the put strike."
      },
      "seagull_bear": {
        "name": "Seagull (Bearish: Short Call + Bear Put Spread)",
        "ko": "시걸 (약세: 콜 매도 + 약세 풋 스프레드)",
        "desc": "Sell a higher-strike call to fund a bear put spread. Downside gains are capped at the low strike; losses are unlimited above the call strike."
      }
    }
  } };
  var T = I18N.en;
  /** Fill {0}, {1}, … placeholders. */
  function tpl(str, args) { return String(str).replace(/\{(\d+)\}/g, function (_, i) { return args && args[i] !== undefined ? String(args[i]) : ''; }); }
  function applyText(p) { var t = T.strategies[p.id]; p.name = t.name; p.en = t.name; p.ko = t.ko; p.desc = t.desc; }

  // ───────────────────────── Strategy catalogue ─────────────────────────
  // legs: [type, side, qty, strikeRank] where strikeRank indexes distinct option strikes (ascending).
  // gen: offsets (in % of S) used to build each strike rank for a preset.
  var PRESETS = [
    { id: 'long_call', group: 'basic', legs: [['call', 1, 1, 0]], gen: [0] },
    { id: 'short_call', group: 'basic', legs: [['call', -1, 1, 0]], gen: [0] },
    { id: 'long_put', group: 'basic', legs: [['put', 1, 1, 0]], gen: [0] },
    { id: 'short_put', group: 'basic', legs: [['put', -1, 1, 0]], gen: [0] },
    { id: 'cash_secured_put', group: 'basic', legs: [['put', -1, 1, 0]], gen: [-5] },
    { id: 'long_stock', group: 'basic', stock: 1, legs: [], gen: [] },

    { id: 'covered_call', group: 'stock', stock: 1, legs: [['call', -1, 1, 0]], gen: [5] },
    { id: 'protective_put', group: 'stock', stock: 1, legs: [['put', 1, 1, 0]], gen: [-5] },
    { id: 'collar', group: 'stock', stock: 1, legs: [['put', 1, 1, 0], ['call', -1, 1, 1]], gen: [-5, 5] },
    { id: 'covered_put', group: 'stock', stock: -1, legs: [['put', -1, 1, 0]], gen: [-5] },

    { id: 'bull_call_spread', group: 'vertical', dc: true, legs: [['call', 1, 1, 0], ['call', -1, 1, 1]], gen: [-5, 5] },
    { id: 'bear_call_spread', group: 'vertical', dc: true, legs: [['call', -1, 1, 0], ['call', 1, 1, 1]], gen: [-5, 5] },
    { id: 'bull_put_spread', group: 'vertical', dc: true, legs: [['put', 1, 1, 0], ['put', -1, 1, 1]], gen: [-5, 5] },
    { id: 'bear_put_spread', group: 'vertical', dc: true, legs: [['put', -1, 1, 0], ['put', 1, 1, 1]], gen: [-5, 5] },

    { id: 'long_straddle', group: 'volatility', legs: [['call', 1, 1, 0], ['put', 1, 1, 0]], gen: [0] },
    { id: 'short_straddle', group: 'volatility', legs: [['call', -1, 1, 0], ['put', -1, 1, 0]], gen: [0] },
    { id: 'long_strangle', group: 'volatility', legs: [['put', 1, 1, 0], ['call', 1, 1, 1]], gen: [-5, 5] },
    { id: 'short_strangle', group: 'volatility', legs: [['put', -1, 1, 0], ['call', -1, 1, 1]], gen: [-5, 5] },

    { id: 'long_call_butterfly', group: 'range', eq: true, legs: [['call', 1, 1, 0], ['call', -1, 2, 1], ['call', 1, 1, 2]], gen: [-5, 0, 5] },
    { id: 'iron_butterfly', group: 'range', eq: true, legs: [['put', 1, 1, 0], ['put', -1, 1, 1], ['call', -1, 1, 1], ['call', 1, 1, 2]], gen: [-5, 0, 5] },
    { id: 'iron_condor', group: 'range', legs: [['put', 1, 1, 0], ['put', -1, 1, 1], ['call', -1, 1, 2], ['call', 1, 1, 3]], gen: [-10, -5, 5, 10] },

    { id: 'synthetic_long', group: 'synthetic', legs: [['call', 1, 1, 0], ['put', -1, 1, 0]], gen: [0] },
    { id: 'risk_reversal', group: 'synthetic', legs: [['put', -1, 1, 0], ['call', 1, 1, 1]], gen: [-5, 5] },
    { id: 'call_ratio_spread', group: 'synthetic', legs: [['call', 1, 1, 0], ['call', -1, 2, 1]], gen: [0, 5] },
    { id: 'put_backspread', group: 'synthetic', legs: [['put', 1, 2, 0], ['put', -1, 1, 1]], gen: [-5, 0] }
  ];
  PRESETS.forEach(applyText);
  var PRESET_BY_ID = {};
  PRESETS.forEach(function (p) { PRESET_BY_ID[p.id] = p; });


  /** Strike tick that scales with price: 1-2-2.5-5 × 10^n of ~1% of S. */
  function strikeTick(S) {
    var raw = S * 0.01, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    var nice = m < 1.5 ? 1 : m < 2.25 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10;
    return nice * p;
  }
  function roundTo(x, t) { return Math.round(Math.round(x / t) * t * 1e8) / 1e8; }

  function presetStrikes(preset, S) {
    var t = strikeTick(S), ks = [];
    if (preset.eq) { // butterflies: keep the wings exactly equidistant after rounding
      var c = Math.max(2 * t, roundTo(S, t)), w = Math.max(t, roundTo(S * 0.05, t));
      if (w >= c) w = roundTo(c / 2, t) || t;
      return [roundTo(c - w, t), c, roundTo(c + w, t)];
    }
    preset.gen.forEach(function (pct, i) {
      var k = roundTo(S * (1 + pct / 100), t);
      if (i > 0 && k <= ks[i - 1]) k = roundTo(ks[i - 1] + t, t); // keep ranks distinct
      ks.push(Math.max(t, k));
    });
    return ks;
  }

  function buildPresetLegs(id, mk) {
    var p = PRESET_BY_ID[id]; if (!p) return [];
    var ks = presetStrikes(p, mk.S), legs = [];
    if (p.stock) legs.push({ type: 'stock', side: p.stock > 0 ? 1 : -1, qty: Math.abs(p.stock), strike: 0, premium: 0, entry: mk.S });
    p.legs.forEach(function (d) {
      legs.push({ type: d[0], side: d[1], qty: d[2], strike: ks[d[3]], premium: 0, entry: mk.S });
    });
    reprice(legs, mk);
    return legs;
  }

  function reprice(legs, mk) {
    legs.forEach(function (l) {
      if (l.type === 'call' || l.type === 'put') {
        var v = bsPrice(l.type, mk.S, l.strike, mk.iv / 100, mk.days / 365, mk.r / 100);
        l.premium = isFinite(v) ? Math.max(0, round2(v)) : 0;
      } else if (l.type === 'stock') l.entry = mk.S;
    });
  }

  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }

  /** Two strikes closer than this are treated as the same strike (relative 1e-5, e.g. 100 vs 100.0001). */
  function strikeTol(k) { return Math.max(1e-9, Math.abs(k) * 1e-5); }

  /** Net structure: stock qty, distinct option strikes (clustered within strikeTol), net qty per (type, strike). */
  function structure(legs) {
    var stock = 0, opts = [];
    legs.forEach(function (l) {
      var q = l.side * l.qty;
      if (l.type === 'stock') stock += q;
      else if (l.type === 'call' || l.type === 'put') opts.push({ type: l.type, strike: Number(l.strike), q: q });
    });
    opts.sort(function (a, b) { return a.strike - b.strike; });
    var reps = [];
    opts.forEach(function (o) {
      var r = reps.length ? reps[reps.length - 1] : null;
      if (r === null || Math.abs(o.strike - r) > strikeTol(r)) reps.push(o.strike); else o.strike = r;
    });
    var net = {};
    opts.forEach(function (o) { var k = o.type + '@' + o.strike; net[k] = (net[k] || 0) + o.q; });
    var items = Object.keys(net).filter(function (k) { return net[k] !== 0; }).map(function (k) {
      var p = k.split('@'); return { type: p[0], strike: Number(p[1]), q: net[k] };
    });
    var ks = [];
    items.forEach(function (it) { if (ks.indexOf(it.strike) < 0) ks.push(it.strike); });
    ks.sort(function (a, b) { return a - b; });
    var g = Math.abs(stock);
    items.forEach(function (it) { g = gcd(g, Math.abs(it.q)); });
    return { stock: stock, items: items, ks: ks, g: g };
  }

  /** Structural signature: net qty per (type,strike), ranks of distinct option strikes, qty / gcd. */
  function signature(legs) {
    var st = structure(legs);
    if (!st.g) return 'empty';
    var parts = st.items.map(function (it) { return it.type + ':' + st.ks.indexOf(it.strike) + ':' + (it.q / st.g); }).sort();
    return 's' + (st.stock / st.g) + '|' + parts.join(',');
  }
  function negateSig(sig) {
    if (sig === 'empty') return sig;
    var a = sig.split('|'), st = -Number(a[0].slice(1));
    var parts = a[1] ? a[1].split(',').map(function (p) { var x = p.split(':'); return x[0] + ':' + x[1] + ':' + (-Number(x[2])); }).sort() : [];
    return 's' + st + '|' + parts.join(',');
  }
  /** Common multiple of a position: gcd of net quantities per (type, strike). Presets have scale 1. */
  function scaleOf(legs) {
    var st = structure(legs);
    return st.g || 1;
  }
  function equidistant(ks) {
    if (ks.length !== 3) return true;
    return Math.abs((ks[1] - ks[0]) - (ks[2] - ks[1])) <= strikeTol(ks[2]) * 2;
  }

  // Structures recognised by name only (not offered as templates). Same leg notation as PRESETS.
  // eq: wings must be equidistant (OIC), otherwise the broken-wing name is used.
  var EXTRA = [
    { id: 'short_stock', stock: -1, legs: [] },
    { id: 'protective_call', stock: -1, legs: [['call', 1, 1, 0]] },
    { id: 'short_collar', stock: -1, legs: [['put', -1, 1, 0], ['call', 1, 1, 1]] },
    { id: 'conversion', stock: 1, legs: [['put', 1, 1, 0], ['call', -1, 1, 0]] },
    { id: 'reversal', stock: -1, legs: [['put', -1, 1, 0], ['call', 1, 1, 0]] },
    { id: 'ratio_write', stock: 1, legs: [['call', -1, 2, 0]] },
    { id: 'covered_ratio', stock: 1, legs: [['call', -1, 2, 0], ['call', 1, 1, 1]] },
    { id: 'stock_repair', stock: 1, legs: [['call', 1, 1, 0], ['call', -1, 2, 1]] },
    { id: 'synthetic_short', legs: [['call', -1, 1, 0], ['put', 1, 1, 0]] },
    { id: 'risk_reversal_bear', legs: [['put', 1, 1, 0], ['call', -1, 1, 1]] },
    { id: 'strap', legs: [['call', 1, 2, 0], ['put', 1, 1, 0]] },
    { id: 'short_strap', legs: [['call', -1, 2, 0], ['put', -1, 1, 0]] },
    { id: 'strip', legs: [['call', 1, 1, 0], ['put', 1, 2, 0]] },
    { id: 'short_strip', legs: [['call', -1, 1, 0], ['put', -1, 2, 0]] },
    { id: 'long_guts', legs: [['call', 1, 1, 0], ['put', 1, 1, 1]] },
    { id: 'short_guts', legs: [['call', -1, 1, 0], ['put', -1, 1, 1]] },
    { id: 'short_call_butterfly', eq: true, legs: [['call', -1, 1, 0], ['call', 1, 2, 1], ['call', -1, 1, 2]] },
    { id: 'long_put_butterfly', eq: true, legs: [['put', 1, 1, 0], ['put', -1, 2, 1], ['put', 1, 1, 2]] },
    { id: 'short_put_butterfly', eq: true, legs: [['put', -1, 1, 0], ['put', 1, 2, 1], ['put', -1, 1, 2]] },
    { id: 'long_iron_butterfly', eq: true, legs: [['put', -1, 1, 0], ['put', 1, 1, 1], ['call', 1, 1, 1], ['call', -1, 1, 2]] },
    { id: 'long_iron_condor', legs: [['put', -1, 1, 0], ['put', 1, 1, 1], ['call', 1, 1, 2], ['call', -1, 1, 3]] },
    { id: 'long_call_condor', legs: [['call', 1, 1, 0], ['call', -1, 1, 1], ['call', -1, 1, 2], ['call', 1, 1, 3]] },
    { id: 'short_call_condor', legs: [['call', -1, 1, 0], ['call', 1, 1, 1], ['call', 1, 1, 2], ['call', -1, 1, 3]] },
    { id: 'long_put_condor', legs: [['put', 1, 1, 0], ['put', -1, 1, 1], ['put', -1, 1, 2], ['put', 1, 1, 3]] },
    { id: 'short_put_condor', legs: [['put', -1, 1, 0], ['put', 1, 1, 1], ['put', 1, 1, 2], ['put', -1, 1, 3]] },
    { id: 'long_box', legs: [['call', 1, 1, 0], ['call', -1, 1, 1], ['put', -1, 1, 0], ['put', 1, 1, 1]] },
    { id: 'short_box', legs: [['call', -1, 1, 0], ['call', 1, 1, 1], ['put', 1, 1, 0], ['put', -1, 1, 1]] },
    { id: 'long_call_ladder', legs: [['call', 1, 1, 0], ['call', -1, 1, 1], ['call', -1, 1, 2]] },
    { id: 'short_call_ladder', legs: [['call', -1, 1, 0], ['call', 1, 1, 1], ['call', 1, 1, 2]] },
    { id: 'long_put_ladder', legs: [['put', -1, 1, 0], ['put', -1, 1, 1], ['put', 1, 1, 2]] },
    { id: 'short_put_ladder', legs: [['put', 1, 1, 0], ['put', 1, 1, 1], ['put', -1, 1, 2]] },
    { id: 'seagull_bull', legs: [['put', -1, 1, 0], ['call', 1, 1, 1], ['call', -1, 1, 2]] },
    { id: 'seagull_bear', legs: [['put', -1, 1, 0], ['put', 1, 1, 1], ['call', -1, 1, 2]] }
  ];
  EXTRA.forEach(applyText);

  function sigOfDef(p) {
    var legs = [];
    if (p.stock) legs.push({ type: 'stock', side: p.stock, qty: 1 });
    p.legs.forEach(function (d) { legs.push({ type: d[0], side: d[1], qty: d[2], strike: d[3] + 1 }); });
    return signature(legs);
  }
  var PRESET_SIG = {}, KNOWN = [];
  PRESETS.forEach(function (p) { PRESET_SIG[p.id] = sigOfDef(p); if (p.id !== 'cash_secured_put') KNOWN.push({ def: p, sig: PRESET_SIG[p.id], preset: true }); });
  EXTRA.forEach(function (p) { KNOWN.push({ def: p, sig: sigOfDef(p), preset: false }); });

  /** Two same-type legs at different strikes, opposite sides, unequal size → generic n:m ratio name. */
  function ratioName(st) {
    if (st.stock || st.items.length !== 2 || st.ks.length !== 2 || st.items[0].type !== st.items[1].type) return null;
    var lo = st.items[0].strike < st.items[1].strike ? st.items[0] : st.items[1], hi = lo === st.items[0] ? st.items[1] : st.items[0];
    if (lo.q * hi.q >= 0 || Math.abs(lo.q) === Math.abs(hi.q)) return null;
    var g = st.g, type = lo.type, call = type === 'call';
    var near = call ? lo : hi, far = call ? hi : lo; // near = closer to the money for a ratio spread (lower call / higher put)
    var n = Math.abs(near.q) / g, m = Math.abs(far.q) / g;
    if (m <= n) return null;
    var N = T.naming, E = N.typeEn[type], K = N.typeKo[type];
    if (near.q > 0) return { id: type + '_ratio_spread', name: tpl(N.ratioSpreadName, [E, n, m]), ko: tpl(N.ratioSpreadKo, [K, n, m]),
      desc: tpl(N.ratioDesc[call ? 'callSpread' : 'putSpread'], [n, m]) };
    return { id: type + '_backspread', name: tpl(N.ratioBackName, [E, n, m]), ko: tpl(N.ratioBackKo, [K, n, m]),
      desc: tpl(N.ratioDesc[call ? 'callBack' : 'putBack'], [n, m]) };
  }

  function named(kind, id, t, extra) {
    var o = { kind: kind, id: id, name: t.name, en: t.name, ko: t.ko, desc: t.desc };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }

  /**
   * Classify a position. kind: preset | known | broken | ratio | reverse | offset | empty | custom.
   * Same-expiry European legs are assumed (the model has no expiry per leg).
   * Result: { kind, id, name (English, main), en (= name), ko (Korean name, shown small), desc }.
   */
  function classify(legs, hintId) {
    var N = T.naming;
    if (!legs || !legs.length) return named('empty', '', N.empty);
    var st = structure(legs), sig = signature(legs);
    if (sig === 'empty') return named('offset', '', N.offset);
    var eqOk = equidistant(st.ks);
    function wrap(def, preset) {
      if (def.eq && !eqOk) { var b = T.broken[def.id]; return named('broken', 'broken_' + def.id, { name: b.name, ko: b.ko, desc: N.brokenDesc }, { base: def }); }
      return named(preset ? 'preset' : 'known', def.id, def, { dc: !!def.dc, preset: preset ? def : null });
    }
    if (hintId && PRESET_SIG[hintId] === sig) return wrap(PRESET_BY_ID[hintId], true);
    var i;
    for (i = 0; i < KNOWN.length; i++) if (KNOWN[i].sig === sig) return wrap(KNOWN[i].def, KNOWN[i].preset);
    var r = ratioName(st);
    if (r) return named('ratio', r.id, r);
    var neg = negateSig(sig);
    for (i = 0; i < KNOWN.length; i++) if (KNOWN[i].sig === neg) {
      var d = KNOWN[i].def;
      return named('reverse', 'reverse_' + d.id, { name: tpl(N.reverseName, [d.name]), ko: tpl(N.reverseKo, [d.ko]), desc: tpl(N.reverseDesc, [d.name]) });
    }
    return named('custom', '', N.custom);
  }

  /** Returns the template (preset) object matching legs (preferring hint), or null. Broken wings are not templates. */
  function identify(legs, hintId) {
    var c = classify(legs, hintId);
    return c.kind === 'preset' ? c.preset : null;
  }

  /** No-arbitrage sanity checks on entered premiums (same expiry). Returns warning strings. */
  function priceWarnings(legs) {
    var out = [], eps = 0.0101, N = T.naming; // premiums are rounded to 0.01
    ['call', 'put'].forEach(function (type) {
      var by = [], t = N.typeLower[type];
      legs.forEach(function (l) {
        if (l.type !== type) return;
        for (var j = 0; j < by.length; j++) if (Math.abs(by[j].k - l.strike) <= strikeTol(by[j].k)) {
          if (Math.abs(by[j].p - l.premium) > eps) out.push(tpl(N.warnSameStrike, [fmt(l.strike), t]));
          return;
        }
        by.push({ k: Number(l.strike), p: Number(l.premium) });
      });
      by.sort(function (a, b) { return a.k - b.k; });
      for (var i = 0; i + 1 < by.length; i++) {
        var a = by[i], b = by[i + 1], w = b.k - a.k, d = type === 'call' ? a.p - b.p : b.p - a.p;
        if (d < -eps) out.push(tpl(type === 'call' ? N.warnCallOrder : N.warnPutOrder, [fmt(a.k), fmt(b.k)]));
        else if (d > w + eps) out.push(tpl(N.warnWidth, [t, fmt(a.k), fmt(b.k), fmt(d), fmt(w)]));
        if (i + 2 < by.length) {
          var c = by[i + 2], s1 = (a.p - b.p) * (c.k - b.k), s2 = (b.p - c.p) * (b.k - a.k);
          if (s1 - s2 < -eps * (c.k - a.k)) out.push(tpl(N.warnConvex, [t, fmt(a.k), fmt(b.k), fmt(c.k)]));
        }
      }
    });
    return out;
  }

  /** Name + description with computed figures (× multiplier) and price warnings. */
  function describe(legs, hintId, mult) {
    var N = T.naming, c = classify(legs, hintId), M = mult || 1;
    var res = { kind: c.kind, id: c.id, name: c.name, en: c.name, ko: c.ko, desc: c.desc, stats: '', warnings: [],
      known: ['preset', 'known', 'broken', 'ratio', 'reverse'].indexOf(c.kind) >= 0 };
    if (c.kind === 'empty') return res;
    var m = metrics(legs), net = m.net * M, zero = Math.abs(net) < 1e-9, hasOpt = legs.some(function (l) { return l.type !== 'stock'; });
    var flow = !hasOpt ? '' : zero ? N.flowZero : net < 0 ? tpl(N.flowDebit, [fmt(-net)]) : tpl(N.flowCredit, [fmt(net)]);
    if (c.dc && hasOpt) res.name = res.en = c.name + (zero ? N.dcZero : net < 0 ? N.dcDebit : N.dcCredit);
    if (c.kind !== 'offset') res.stats = tpl(N.stats, [fmtSigned(m.maxProfit * M), fmtSigned(m.maxLoss * M), flow ? ', ' + flow : '']);
    else if (flow) res.stats = flow.charAt(0).toUpperCase() + flow.slice(1) + '.';
    res.warnings = priceWarnings(legs);
    return res;
  }

  // ───────────────────────── Validation & persistence ─────────────────────────
  function num(v, lo, hi, intOnly) {
    if (v === '' || v === null || v === undefined) return null;
    var n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!isFinite(n) || n < lo || n > hi) return null;
    if (intOnly && Math.floor(n) !== n) return null;
    return n;
  }
  function sanitizeLeg(l) {
    if (!l || typeof l !== 'object') return null;
    var type = ['stock', 'call', 'put'].indexOf(l.type) >= 0 ? l.type : null;
    var side = l.side === 1 || l.side === -1 ? l.side : null;
    var qty = num(l.qty, LIMITS.qty[0], LIMITS.qty[1], true);
    if (!type || !side || qty === null) return null;
    var out = { type: type, side: side, qty: qty, strike: 0, premium: 0, entry: 0 };
    if (type === 'stock') { out.entry = num(l.entry, LIMITS.entry[0], LIMITS.entry[1]); if (out.entry === null) return null; }
    else {
      out.strike = num(l.strike, LIMITS.strike[0], LIMITS.strike[1]);
      out.premium = num(l.premium, LIMITS.premium[0], LIMITS.premium[1]);
      if (out.strike === null || out.premium === null) return null;
    }
    return out;
  }
  /** Validate an untrusted state object (localStorage / URL). Returns clean state or null. */
  function sanitizeState(s) {
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    var mk = { S: num(s.S, LIMITS.S[0], LIMITS.S[1]), iv: num(s.iv, LIMITS.iv[0], LIMITS.iv[1]),
      days: num(s.days, LIMITS.days[0], LIMITS.days[1], true), r: num(s.r, LIMITS.r[0], LIMITS.r[1]),
      mult: num(s.mult, LIMITS.mult[0], LIMITS.mult[1]) };
    for (var k in mk) if (mk[k] === null) return null;
    if (!Array.isArray(s.slots) || s.slots.length > LIMITS.maxSlots) return null;
    var slots = [];
    for (var i = 0; i < s.slots.length; i++) {
      var sl = s.slots[i];
      if (!sl || !Array.isArray(sl.legs) || sl.legs.length > LIMITS.maxLegs) return null;
      var legs = sl.legs.map(sanitizeLeg);
      if (legs.some(function (x) { return x === null; })) return null;
      slots.push({ preset: PRESET_BY_ID[sl.preset] ? sl.preset : '', visible: sl.visible !== false, legs: legs });
    }
    var active = slots.length ? num(s.active, 0, slots.length - 1, true) : 0;
    return { v: 1, S: mk.S, iv: mk.iv, days: mk.days, r: mk.r, mult: mk.mult, auto: s.auto !== false,
      active: active === null ? 0 : active, slots: slots };
  }
  /** First visit: no strategies. The user adds strategies and (optionally) loads a template into each. */
  function defaultState() {
    return { v: 1, S: 100, iv: 25, days: 30, r: 3, mult: 1, auto: true, active: 0, slots: [] };
  }
  // Compact URL-safe encoding for share links (JSON → base64url). Decoded data is re-validated.
  function encodeState(st) {
    var json = JSON.stringify(st);
    var b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodeState(str) {
    try {
      if (typeof str !== 'string' || str.length > 8000 || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
      var b = str.replace(/-/g, '+').replace(/_/g, '/');
      var json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
      return sanitizeState(JSON.parse(json));
    } catch (e) { return null; }
  }

  function fmt(n, digits) {
    if (n === Infinity) return T.ui.unlimited;
    if (n === -Infinity) return T.ui.negUnlimited;
    if (!isFinite(n)) return '–';
    var d = digits === undefined ? 2 : digits;
    var v = Math.abs(n) < 1e-9 ? 0 : n;
    return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function fmtSigned(n) { return (n > 0 && isFinite(n) ? '+' : '') + fmt(n); }

  var Core = { LIMITS: LIMITS, PRESETS: PRESETS, bsPrice: bsPrice, normCdf: normCdf, legPnl: legPnl, pnl: pnl,
    metrics: metrics, buildPresetLegs: buildPresetLegs, reprice: reprice, presetStrikes: presetStrikes, strikeTick: strikeTick,
    signature: signature, identify: identify, classify: classify, describe: describe, priceWarnings: priceWarnings, strikeTol: strikeTol, scaleOf: scaleOf, sanitizeState: sanitizeState, defaultState: defaultState,
    encodeState: encodeState, decodeState: decodeState, fmt: fmt };
  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (typeof document === 'undefined') return;

  // ───────────────────────── UI ─────────────────────────
  var STORE_KEY = 'bbb.optionsPayoff.v1';
  var COLORS = ['#3b82f6', '#10b981', '#f59e0b'];
  var SLOT_NAMES = ['A', 'B', 'C'];

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
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }

  function App(rootEl) {
    this.root = rootEl;
    this.state = null;
    this.hoverX = null;
    this.saveTimer = null;
    this.storageOk = true;
    this.init();
  }

  App.prototype.init = function () {
    var self = this, st = null, fromUrl = false;
    var m = /(?:^|[#&])s=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (m) { st = decodeState(m[1]); fromUrl = !!st; }
    if (!st) {
      try { st = sanitizeState(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); }
      catch (e) { this.storageOk = false; st = null; }
    }
    this.state = st || defaultState();
    this.build();
    this.renderAll();
    if (fromUrl) this.status(T.ui.stLoadedUrl);
    else if (st) this.status(T.ui.stLoadedLocal);
    var redraw = function () { self.drawChart(); };
    window.addEventListener('resize', redraw);
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'data-mode', 'class'] });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', redraw);
    }
  };

  App.prototype.build = function () {
    var self = this, r = this.root;
    clear(r);
    r.classList.add('op-app');

    // Chart (primary)
    this.canvas = h('canvas', { class: 'op-canvas', role: 'img', 'aria-label': T.ui.chartAria });
    this.readout = h('div', { class: 'op-readout', 'aria-live': 'polite' });
    this.legend = h('div', { class: 'op-legend' });
    var chartBox = h('section', { class: 'op-card op-chart' }, [
      h('div', { class: 'op-chart-head' }, [h('h3', { class: 'op-title', text: T.ui.chartTitle }), this.legend]),
      h('div', { class: 'op-canvas-wrap' }, [this.canvas, this.emptyMsg = h('div', { class: 'op-empty' }, [
        h('strong', { text: T.ui.emptyTitle }),
        h('span', { text: T.ui.emptyBody })])]), this.readout
    ]);
    ['pointermove', 'pointerdown'].forEach(function (ev) {
      self.canvas.addEventListener(ev, function (e) { self.onHover(e); });
    });
    this.canvas.addEventListener('pointerleave', function (e) { if (e.pointerType && e.pointerType !== 'mouse') return; self.hoverX = null; self.drawChart(); self.renderReadout(); });

    // Summary table
    this.tbody = h('tbody');
    var table = h('table', { class: 'op-table' }, [
      h('thead', null, [h('tr', null, T.ui.thead.map(function (t) { return h('th', { scope: 'col', text: t }); }))]),
      this.tbody
    ]);
    var summary = h('section', { class: 'op-card op-summary' }, [
      h('h3', { class: 'op-title', text: T.ui.summaryTitle }), h('div', { class: 'op-table-wrap' }, [table]),
      h('p', { class: 'op-note', text: T.ui.summaryNote })
    ]);

    // Market inputs
    this.inputs = {};
    var mkField = function (key, label, step, unit) {
      var inp = h('input', { type: 'number', inputmode: 'decimal', step: step, min: LIMITS[key][0], max: LIMITS[key][1], class: 'op-input', id: 'op-' + key });
      inp.addEventListener('change', function () { self.onMarket(key, inp); });
      self.inputs[key] = inp;
      return h('label', { class: 'op-field', for: 'op-' + key }, [h('span', { text: label }), h('span', { class: 'op-inline' }, [inp, unit ? h('small', { text: unit }) : null])]);
    };
    this.autoBox = h('input', { type: 'checkbox', id: 'op-auto' });
    this.autoBox.addEventListener('change', function () { self.state.auto = self.autoBox.checked; if (self.state.auto) self.repriceAll(); self.changed(); });
    var market = h('section', { class: 'op-card op-market' }, [
      h('h3', { class: 'op-title', text: T.ui.marketTitle }),
      h('div', { class: 'op-grid' }, [
        mkField('S', T.ui.fieldS, 'any'), mkField('iv', T.ui.fieldIv, 'any', '%'), mkField('days', T.ui.fieldDays, '1', T.ui.unitDays),
        mkField('r', T.ui.fieldR, 'any', '%'), mkField('mult', T.ui.fieldMult, '1')
      ]),
      h('label', { class: 'op-check', for: 'op-auto' }, [this.autoBox, h('span', { text: T.ui.autoPrice })]),
      this.marketErr = h('p', { class: 'op-error', role: 'alert' })
    ]);

    // Strategy editor
    this.tabs = h('div', { class: 'op-tabs', role: 'tablist' });
    this.presetSel = h('select', { class: 'op-input op-select', 'aria-label': T.ui.templateAria });
    this.presetSel.appendChild(h('option', { value: '', text: T.ui.templatePlaceholder }));
    var groups = {};
    PRESETS.forEach(function (p) {
      if (!groups[p.group]) { groups[p.group] = h('optgroup', { label: T.groups[p.group] }); self.presetSel.appendChild(groups[p.group]); }
      groups[p.group].appendChild(h('option', { value: p.id, text: p.name }));
    });
    this.presetSel.addEventListener('change', function () {
      var id = self.presetSel.value; if (!id) return;
      var sl = self.slot(); if (!sl) return; sl.preset = id; sl.legs = buildPresetLegs(id, self.state); self.changed();
    });
    this.info = h('div', { class: 'op-info' });
    this.legsBox = h('div', { class: 'op-legs' });
    this.legErr = h('p', { class: 'op-error', role: 'alert' });
    this.addLegBtns = h('div', { class: 'op-row' }, [
      h('button', { type: 'button', class: 'op-btn', text: T.ui.addCall, onclick: function () { self.addLeg('call'); } }),
      h('button', { type: 'button', class: 'op-btn', text: T.ui.addPut, onclick: function () { self.addLeg('put'); } }),
      h('button', { type: 'button', class: 'op-btn', text: T.ui.addStock, onclick: function () { self.addLeg('stock'); } })
    ]);
    var editor = h('section', { class: 'op-card op-editor' }, [
      h('h3', { class: 'op-title', text: T.ui.editorTitle }), this.tabs,
      this.slotBody = h('div', { class: 'op-slot-body' }, [this.info, this.legsBox, this.legErr, this.addLegBtns,
        h('div', { class: 'op-template' }, [this.presetSel])])
    ]);

    // Save bar
    this.statusEl = h('span', { class: 'op-status', 'aria-live': 'polite' });
    var save = h('section', { class: 'op-card op-save' }, [
      h('div', { class: 'op-row' }, [
        h('button', { type: 'button', class: 'op-btn op-btn-primary', text: T.ui.save, onclick: function () { self.save(true); } }),
        h('button', { type: 'button', class: 'op-btn', text: T.ui.share, onclick: function () { self.share(); } }),
        h('button', { type: 'button', class: 'op-btn op-btn-danger', text: T.ui.reset, onclick: function () { self.reset(); } }),
        this.statusEl
      ]),
      h('p', { class: 'op-note', text: T.ui.storageNote })
    ]);

    r.appendChild(h('div', { class: 'op-layout' }, [
      h('div', { class: 'op-main' }, [chartBox, summary]),
      h('div', { class: 'op-side' }, [editor, market, save])
    ]));
  };

  App.prototype.slot = function () { return this.state.slots[this.state.active]; };

  App.prototype.status = function (msg) {
    var el = this.statusEl; el.textContent = msg;
    clearTimeout(this._st); this._st = setTimeout(function () { el.textContent = ''; }, 4000);
  };

  App.prototype.changed = function () {
    var self = this;
    this.renderAll();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () { self.save(false); }, 400);
  };

  App.prototype.save = function (manual) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); if (manual) this.status(T.ui.stSaved); }
    catch (e) { this.status(T.ui.stSaveFail); }
  };
  App.prototype.reset = function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    this.state = defaultState(); this.hoverX = null; this.renderAll(); this.status(T.ui.stReset);
  };
  App.prototype.share = function () {
    var url = location.href.split('#')[0] + '#s=' + encodeState(this.state), self = this;
    var done = function () { self.status(T.ui.stShared); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { self.status(url); });
    else this.status(url);
  };

  App.prototype.repriceAll = function () { var st = this.state; st.slots.forEach(function (s) { reprice(s.legs, st); }); };

  App.prototype.onMarket = function (key, inp) {
    var v = num(inp.value, LIMITS[key][0], LIMITS[key][1], key === 'days');
    if (v === null) {
      inp.setAttribute('aria-invalid', 'true');
      this.marketErr.textContent = tpl(T.ui.errMarket, [fmt(LIMITS[key][0]), fmt(LIMITS[key][1]), key === 'days' ? T.ui.wholeNumber : '']);
      return;
    }
    inp.removeAttribute('aria-invalid'); this.marketErr.textContent = '';
    var st = this.state;
    if (st[key] === v) return; // unchanged (e.g. duplicate change event)
    st[key] = v;
    if (key === 'S') {
      // Slots that still have a standard preset structure are rebuilt around the new price;
      // custom slots keep their strikes (and are repriced when auto pricing is on).
      st.slots.forEach(function (sl) {
        var p = identify(sl.legs, sl.preset);
        if (p && st.auto) { var q = scaleOf(sl.legs); sl.legs = buildPresetLegs(p.id, st); sl.preset = p.id;
          if (q > 1) sl.legs.forEach(function (l) { l.qty *= q; }); }
      });
    }
    if (st.auto && key !== 'mult') this.repriceAll();
    this.changed();
  };

  App.prototype.addLeg = function (type) {
    var sl = this.slot(); if (!sl) return;
    if (sl.legs.length >= LIMITS.maxLegs) { this.legErr.textContent = tpl(T.ui.errMaxLegs, [LIMITS.maxLegs]); return; }
    var K = roundTo(this.state.S, strikeTick(this.state.S));
    var leg = { type: type, side: 1, qty: 1, strike: type === 'stock' ? 0 : K, premium: 0, entry: this.state.S };
    reprice([leg], this.state);
    if (!this.state.auto && type === 'stock') leg.entry = this.state.S;
    sl.legs.push(leg); this.changed();
  };

  App.prototype.onLeg = function (leg, field, inp) {
    var L = { qty: [LIMITS.qty, true], strike: [LIMITS.strike], premium: [LIMITS.premium], entry: [LIMITS.entry] }[field];
    var v = num(inp.value, L[0][0], L[0][1], !!L[1]);
    if (v === null) {
      inp.setAttribute('aria-invalid', 'true');
      this.legErr.textContent = tpl(T.ui.errLeg, [fmt(L[0][0]), fmt(L[0][1]), L[1] ? T.ui.wholeNumber : '']);
      return;
    }
    this.legErr.textContent = '';
    if (leg[field] === v) return;
    leg[field] = v;
    if (field === 'strike' && this.state.auto) reprice([leg], this.state);
    this.changed();
  };

  App.prototype.renderAll = function () {
    var st = this.state, self = this, a = document.activeElement;
    var focusKey = a && this.root.contains(a) ? a.getAttribute('aria-label') : null;
    ['S', 'iv', 'days', 'r', 'mult'].forEach(function (k) { self.inputs[k].value = String(st[k]); self.inputs[k].removeAttribute('aria-invalid'); });
    this.marketErr.textContent = '';
    this.autoBox.checked = st.auto;
    this.renderTabs(); this.renderInfo(); this.renderLegs(); this.renderTable(); this.renderLegend();
    this.drawChart(); this.renderReadout();
    if (focusKey) { // keep keyboard focus on the rebuilt control
      var els = this.root.querySelectorAll('[aria-label]');
      for (var i = 0; i < els.length; i++) if (els[i].getAttribute('aria-label') === focusKey && els[i] !== a) { els[i].focus(); break; }
    }
  };

  App.prototype.nameOf = function (sl) { return describe(sl.legs, sl.preset, this.state.mult); };

  App.prototype.renderTabs = function () {
    var self = this, st = this.state; clear(this.tabs);
    st.slots.forEach(function (sl, i) {
      var vis = h('input', { type: 'checkbox', 'aria-label': tpl(T.ui.tabShowAria, [SLOT_NAMES[i]]) });
      vis.checked = sl.visible;
      vis.addEventListener('click', function (e) { e.stopPropagation(); });
      vis.addEventListener('change', function () { sl.visible = vis.checked; self.changed(); });
      var dot = h('span', { class: 'op-dot' }); dot.style.background = COLORS[i];
      var tab = h('div', { class: 'op-tab' + (i === st.active ? ' is-active' : ''), role: 'tab', tabindex: '0', 'aria-selected': i === st.active ? 'true' : 'false' },
        [vis, dot, h('span', { class: 'op-tab-label', title: self.nameOf(sl).name, text: SLOT_NAMES[i] + ' · ' + self.nameOf(sl).name })]);
      var pick = function () { st.active = i; self.changed(); };
      tab.addEventListener('click', pick);
      tab.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      {
        tab.appendChild(h('button', { type: 'button', class: 'op-x', 'aria-label': tpl(T.ui.tabDeleteAria, [SLOT_NAMES[i]]), text: '×', onclick: function (e) {
          e.stopPropagation(); st.slots.splice(i, 1); st.active = Math.min(st.active, st.slots.length - 1); self.changed(); } }));
      }
      self.tabs.appendChild(tab);
    });
    if (st.slots.length < LIMITS.maxSlots) {
      this.tabs.appendChild(h('button', { type: 'button', class: 'op-btn op-add-slot', text: T.ui.addSlot, onclick: function () {
        st.slots.push({ preset: '', visible: true, legs: [] }); st.active = st.slots.length - 1; self.changed(); } }));
    }
  };

  App.prototype.renderInfo = function () {
    var sl = this.slot();
    this.slotBody.hidden = !sl;
    if (!sl) return;
    var n = this.nameOf(sl), p = identify(sl.legs, sl.preset);
    this.presetSel.value = p ? p.id : '';
    clear(this.info);
    this.info.appendChild(h('div', { class: 'op-info-name' }, [h('strong', { text: n.name }), n.ko ? h('span', { class: 'op-info-ko', lang: 'ko', text: T.ui.koLabel + n.ko }) : null]));
    this.info.appendChild(h('p', { text: n.desc }));
    if (n.stats) this.info.appendChild(h('p', { class: 'op-info-stats', text: n.stats }));
    var self = this;
    n.warnings.forEach(function (w) { self.info.appendChild(h('p', { class: 'op-warn', role: 'status', text: '⚠ ' + w })); });
    this.info.appendChild(h('p', { class: 'op-note', text: T.ui.expiryNote }));
  };

  App.prototype.renderLegs = function () {
    var self = this, sl = this.slot(), st = this.state; clear(this.legsBox); this.legErr.textContent = '';
    if (!sl) return;
    if (!sl.legs.length) { this.legsBox.appendChild(h('p', { class: 'op-note', text: T.ui.legsEmpty })); return; }
    sl.legs.forEach(function (leg, idx) {
      var typeSel = h('select', { class: 'op-input', 'aria-label': tpl(T.ui.legTypeAria, [idx + 1]) },
        [['call', T.ui.typeCall], ['put', T.ui.typePut], ['stock', T.ui.typeStock]].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      typeSel.value = leg.type;
      typeSel.addEventListener('change', function () {
        leg.type = typeSel.value;
        if (leg.type !== 'stock' && !(leg.strike > 0)) leg.strike = roundTo(st.S, strikeTick(st.S));
        if (leg.type === 'stock' && !(leg.entry > 0)) leg.entry = st.S;
        if (st.auto) reprice([leg], st);
        self.changed();
      });
      var sideSel = h('select', { class: 'op-input op-side-' + (leg.side > 0 ? 'long' : 'short'), 'aria-label': tpl(T.ui.legSideAria, [idx + 1]) },
        [['1', T.ui.sideBuy], ['-1', leg.type === 'stock' ? T.ui.sideShort : T.ui.sideSell]].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
      sideSel.value = String(leg.side);
      sideSel.addEventListener('change', function () { leg.side = Number(sideSel.value) > 0 ? 1 : -1; self.changed(); });
      var numIn = function (field, label, step, ro) {
        var inp = h('input', { type: 'number', inputmode: 'decimal', step: step, class: 'op-input', 'aria-label': tpl(T.ui.legFieldAria, [idx + 1, label]) });
        inp.value = String(leg[field]);
        if (ro) { inp.readOnly = true; inp.title = T.ui.autoTitle; }
        inp.addEventListener('change', function () { self.onLeg(leg, field, inp); });
        return h('label', { class: 'op-mini' }, [h('span', { text: label }), inp]);
      };
      var fields = [numIn('qty', T.ui.qty, '1')];
      if (leg.type === 'stock') fields.push(numIn('entry', T.ui.entry, 'any', st.auto));
      else { fields.push(numIn('strike', T.ui.strike, String(strikeTick(st.S)))); fields.push(numIn('premium', T.ui.premium, 'any', st.auto)); }
      var del = h('button', { type: 'button', class: 'op-x', 'aria-label': tpl(T.ui.legDeleteAria, [idx + 1]), text: '×', onclick: function () { sl.legs.splice(idx, 1); self.changed(); } });
      self.legsBox.appendChild(h('div', { class: 'op-leg' }, [h('div', { class: 'op-leg-head' }, [typeSel, sideSel, del]), h('div', { class: 'op-leg-fields' }, fields)]));
    });
  };

  App.prototype.renderTable = function () {
    var self = this, st = this.state; clear(this.tbody);
    if (!st.slots.length) this.tbody.appendChild(h('tr', { class: 'op-empty-row' }, [h('td', { colspan: '6', class: 'op-muted', text: T.ui.tableEmpty })]));
    st.slots.forEach(function (sl, i) {
      var m = metrics(sl.legs), M = st.mult, n = self.nameOf(sl);
      var comp = sl.legs.map(function (l) {
        var q = l.qty > 1 ? ' ×' + l.qty : '';
        if (l.type === 'stock') return tpl(T.ui.compStock, [l.side > 0 ? T.ui.compLong : T.ui.compShort]) + q;
        return tpl(T.ui.compOpt, [l.side > 0 ? T.ui.sideBuy : T.ui.sideSell, fmt(l.strike), l.type === 'call' ? T.ui.typeCall.toLowerCase() : T.ui.typePut.toLowerCase()]) + q;
      }).join(' + ') || '—';
      var dot = h('span', { class: 'op-dot' }); dot.style.background = COLORS[i];
      var tr = h('tr', { class: i === st.active ? 'is-active' : '' }, [
        h('td', null, [dot, h('strong', { text: SLOT_NAMES[i] + ' ' + n.name })]),
        h('td', { class: 'op-muted', text: comp }),
        h('td', { class: 'op-num', text: fmtSigned(m.net * M) }),
        h('td', { class: 'op-num op-pos', text: fmtSigned(m.maxProfit * M) }),
        h('td', { class: 'op-num op-neg', text: fmtSigned(m.maxLoss * M) }),
        h('td', { class: 'op-num', text: m.beps.length ? m.beps.map(function (b) { return fmt(b); }).join(', ') : T.ui.none })
      ]);
      tr.addEventListener('click', function () { st.active = i; self.changed(); });
      self.tbody.appendChild(tr);
    });
  };

  App.prototype.renderLegend = function () {
    var self = this; clear(this.legend);
    this.state.slots.forEach(function (sl, i) {
      if (!sl.visible) return;
      var dot = h('span', { class: 'op-dot' }); dot.style.background = COLORS[i];
      self.legend.appendChild(h('span', { class: 'op-legend-item' }, [dot, SLOT_NAMES[i] + ' ' + self.nameOf(sl).name]));
    });
  };

  App.prototype.xRange = function () {
    var st = this.state, lo = st.S, hi = st.S;
    st.slots.forEach(function (sl) { sl.legs.forEach(function (l) { if (l.type !== 'stock') { lo = Math.min(lo, l.strike); hi = Math.max(hi, l.strike); } }); });
    var span = Math.max(hi - lo, st.S * 0.2);
    return [Math.max(0, lo - span * 0.6), hi + span * 0.6];
  };

  App.prototype.onHover = function (e) {
    var m = this.chartMeta; if (!m) return;
    var rect = this.canvas.getBoundingClientRect(), px = e.clientX - rect.left;
    this.hoverX = px < m.l || px > m.l + m.w ? null : m.x0 + (px - m.l) / m.w * (m.x1 - m.x0);
    this.drawChart(); this.renderReadout();
  };

  App.prototype.renderReadout = function () {
    var self = this, st = this.state; clear(this.readout);
    this.readout.hidden = !st.slots.some(function (sl) { return sl.visible && sl.legs.length; });
    if (this.hoverX === null) { this.readout.appendChild(h('span', { class: 'op-muted', text: T.ui.readoutHint })); return; }
    var x = this.hoverX, pct = (x / st.S - 1) * 100;
    this.readout.appendChild(h('strong', { text: tpl(T.ui.readoutAt, [fmt(x), (pct >= 0 ? '+' : '') + pct.toFixed(1)]) }));
    st.slots.forEach(function (sl, i) {
      if (!sl.visible || !sl.legs.length) return;
      var v = pnl(sl.legs, x) * st.mult, dot = h('span', { class: 'op-dot' }); dot.style.background = COLORS[i];
      self.readout.appendChild(h('span', { class: 'op-readout-item' }, [dot, SLOT_NAMES[i] + ' ', h('b', { class: v > 0 ? 'op-pos' : v < 0 ? 'op-neg' : '', text: fmtSigned(v) })]));
    });
  };

  function cssVar(el, name, fallback) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; }
  function niceStep(span, n) {
    var raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }

  App.prototype.drawChart = function () {
    var c = this.canvas, st = this.state, rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr);
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = rect.width, H = rect.height, P = { l: 56, r: 16, t: 18, b: 30 };
    var w = W - P.l - P.r, hh = H - P.t - P.b;
    var text = cssVar(this.root, '--op-muted', '#757575'), grid = cssVar(this.root, '--op-grid', 'rgba(128,128,128,.15)'),
        axis = cssVar(this.root, '--op-axis', 'rgba(128,128,128,.6)'), bg = cssVar(this.root, '--op-card-bg', '#fff');
    g.clearRect(0, 0, W, H);
    var xr = this.xRange(), x0 = xr[0], x1 = xr[1], N = 400, y0 = 0, y1 = 0, M = st.mult;
    var vis = st.slots.map(function (sl, i) { return { sl: sl, i: i }; }).filter(function (o) { return o.sl.visible && o.sl.legs.length; });
    this.emptyMsg.hidden = vis.length > 0;
    vis.forEach(function (o) {
      var ks = [x0, x1]; o.sl.legs.forEach(function (l) { if (l.type !== 'stock' && l.strike > x0 && l.strike < x1) ks.push(l.strike); });
      ks.forEach(function (x) { var v = pnl(o.sl.legs, x) * M; y0 = Math.min(y0, v); y1 = Math.max(y1, v); });
    });
    if (y1 - y0 < 1e-9) { y0 = -1; y1 = 1; }
    var pad = (y1 - y0) * 0.12; y0 -= pad; y1 += pad;
    var X = function (x) { return P.l + (x - x0) / (x1 - x0) * w; }, Y = function (v) { return P.t + (y1 - v) / (y1 - y0) * hh; };

    g.font = '12px ' + (getComputedStyle(this.root).fontFamily || 'sans-serif');
    g.lineWidth = 1; g.strokeStyle = grid; g.fillStyle = text;
    var ys = niceStep(y1 - y0, 5), v;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (v = Math.ceil(y0 / ys) * ys; v <= y1; v += ys) {
      g.beginPath(); g.moveTo(P.l, Y(v)); g.lineTo(W - P.r, Y(v)); g.stroke();
      g.fillText(fmt(v, 2), P.l - 6, Y(v));
    }
    var xs = niceStep(x1 - x0, Math.max(3, Math.floor(w / 80)));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (v = Math.ceil(x0 / xs) * xs; v <= x1; v += xs) {
      g.beginPath(); g.moveTo(X(v), P.t); g.lineTo(X(v), P.t + hh); g.stroke();
      g.fillText(fmt(v, 2), X(v), P.t + hh + 6);
    }
    g.strokeStyle = axis; g.lineWidth = 1.4; g.beginPath(); g.moveTo(P.l, Y(0)); g.lineTo(W - P.r, Y(0)); g.stroke();
    g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(X(st.S), P.t); g.lineTo(X(st.S), P.t + hh); g.stroke(); g.setLineDash([]);
    g.fillStyle = text; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText('S₀ ' + fmt(st.S), X(st.S) + 4, P.t + 2);

    var self = this;
    vis.sort(function (a, b) { return (a.i === st.active) - (b.i === st.active); }).forEach(function (o) {
      var col = COLORS[o.i], act = o.i === st.active;
      if (act) {
        g.save(); g.globalAlpha = 0.12; g.fillStyle = col; g.beginPath(); g.moveTo(X(x0), Y(0));
        for (var k = 0; k <= N; k++) { var xx = x0 + (x1 - x0) * k / N; g.lineTo(X(xx), Y(pnl(o.sl.legs, xx) * M)); }
        g.lineTo(X(x1), Y(0)); g.closePath(); g.fill(); g.restore();
      }
      g.strokeStyle = col; g.lineWidth = act ? 3 : 2; g.beginPath();
      for (var j = 0; j <= N; j++) { var x = x0 + (x1 - x0) * j / N, yv = Y(pnl(o.sl.legs, x) * M); if (j) g.lineTo(X(x), yv); else g.moveTo(X(x), yv); }
      g.stroke();
      metrics(o.sl.legs).beps.forEach(function (b) {
        if (b < x0 || b > x1) return;
        g.fillStyle = col; g.strokeStyle = bg; g.lineWidth = 2; g.beginPath(); g.arc(X(b), Y(0), act ? 5 : 4, 0, Math.PI * 2); g.fill(); g.stroke();
      });
    });
    if (this.hoverX !== null) {
      var hx = X(this.hoverX);
      g.strokeStyle = axis; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(hx, P.t); g.lineTo(hx, P.t + hh); g.stroke(); g.setLineDash([]);
      vis.forEach(function (o) {
        g.fillStyle = COLORS[o.i]; g.strokeStyle = bg; g.lineWidth = 2;
        g.beginPath(); g.arc(hx, Y(pnl(o.sl.legs, self.hoverX) * M), 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      });
    }
    this.chartMeta = { l: P.l, w: w, x0: x0, x1: x1 };
  };

  function boot() {
    var el = document.getElementById('options-payoff-app');
    if (el && !el._op) el._op = new App(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  root.OptionsPayoff = Core;
})(typeof window !== 'undefined' ? window : this);
