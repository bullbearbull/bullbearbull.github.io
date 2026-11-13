import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const explorer = require('../assets/js/tls-ols-explorer.js');

test('I18N en and ko keys match completely', () => {
  const enKeys = Object.keys(explorer.I18N.en).sort();
  const koKeys = Object.keys(explorer.I18N.ko).sort();
  assert.deepEqual(enKeys, koKeys);
});

test('TLS is symmetric under x<->y swap while OLS differs', () => {
  const x = [0.2, 1.1, 1.9, 2.7, 3.8, 4.4, 5.2, 6.0];
  const y = [1.4, 2.1, 4.2, 3.6, 6.8, 6.1, 8.7, 9.5];

  const olsYX = explorer.fitOls(x, y);
  const olsXYInv = explorer.invertFit(explorer.fitOls(y, x));
  assert.ok(Math.abs(olsYX.slope - olsXYInv.slope) > 0.05);

  const tlsYX = explorer.fitTlsScaled(x, y, 1.0);
  const tlsXYInv = explorer.invertFit(explorer.fitTlsScaled(y, x, 1.0));
  assert.ok(Math.abs(tlsYX.slope - tlsXYInv.slope) < 1e-12);
  assert.ok(Math.abs(tlsYX.intercept - tlsXYInv.intercept) < 1e-12);
});

test('TLS minimizes orthogonal SSE and OLS minimizes vertical SSE', () => {
  const x = [0.5, 1.4, 2.1, 3.0, 3.9, 4.8, 5.5, 6.4];
  const y = [1.9, 2.8, 4.6, 4.9, 7.1, 7.6, 9.4, 10.1];

  const ols = explorer.fitOls(x, y);
  const tls = explorer.fitTlsScaled(x, y, 1.0);
  const olsLoss = explorer.losses(x, y, ols);
  const tlsLoss = explorer.losses(x, y, tls);

  assert.ok(olsLoss.vsse <= tlsLoss.vsse + 1e-12);
  assert.ok(tlsLoss.osse <= olsLoss.osse + 1e-12);
});

test('Scaled TLS converges to reverse OLS as k->0 and forward OLS as k->inf', () => {
  const x = [0.5, 1.4, 2.1, 3.0, 3.9, 4.8, 5.5, 6.4];
  const y = [1.9, 2.8, 4.6, 4.9, 7.1, 7.6, 9.4, 10.1];

  const ols = explorer.fitOls(x, y);
  const revOls = explorer.invertFit(explorer.fitOls(y, x));
  const tlsSmallK = explorer.fitTlsScaled(x, y, 1e-4);
  const tlsLargeK = explorer.fitTlsScaled(x, y, 1e4);

  assert.ok(Math.abs(tlsSmallK.slope - revOls.slope) < 1e-4);
  assert.ok(Math.abs(tlsLargeK.slope - ols.slope) < 1e-4);
});
