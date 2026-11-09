---
layout: page
title: Options Payoff Calculator (Expiration P&L Simulator)
description: "Free options payoff calculator: combine calls, puts, and stock to compare expiration P&L, break-even points, and max profit and loss across 25 strategy templates."
permalink: /tools/options-payoff/
image:
  path: /assets/img/tools/options-payoff-og.png
  alt: Options payoff simulator screenshot
---

Overlay up to three option strategies, such as covered calls, spreads, straddles, and iron condors, and compare their **payoff at expiration**. Click “+ Add strategy”, then add legs or load a standard template. The chart, break-even points, and max profit and loss update instantly, and the tool names the strategy when its structure matches a standard one.

{% include options-payoff.html %}

### How to use
1. In **Market inputs**, enter the spot price, implied volatility, days to expiry, risk-free rate, and contract multiplier. With auto-pricing on, premiums are filled with Black-Scholes theoretical values (no dividends).
2. In **Strategy builder**, click “+ Add strategy” and add call, put, or underlying legs. You can also load a standard template from the small dropdown inside each strategy.
3. Hover over or tap the chart to compare P&L at any expiration price.

### How it is calculated
- P&L = intrinsic value at expiration − premium for long options, premium − intrinsic value for short options, and (expiration price − entry price) for the underlying. Every value is multiplied by quantity and contract multiplier.
- Max profit, max loss, and break-even points are computed exactly at the kinks (strikes and entry prices). All legs share one expiration. Commissions, taxes, margin, dividends, early exercise, and time value before expiration are not modeled.

> For education and reference only. Results can differ from real market prices, and nothing here is investment advice. Your settings are stored only in your browser’s localStorage and are never sent to a server.
{: .prompt-warning }
