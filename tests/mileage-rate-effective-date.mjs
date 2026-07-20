import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const calculatorBlock = html.match(
  /\/\/ ─── HMRC rate constants[\s\S]*?function milCalcReimbursement[\s\S]*?\n}(?=\n\n\/\*\*\n \* Recompute)/
)?.[0];

assert.ok(calculatorBlock, 'the mileage reimbursement calculator should be present');

const sandbox = {};
vm.runInNewContext(`${calculatorBlock}\nglobalThis.calc = milCalcReimbursement;`, sandbox);

const calc = sandbox.calc;
const calculate = (...args) => JSON.parse(JSON.stringify(calc(...args)));

assert.deepEqual(
  calculate(100, 0, '2026-07-19'),
  { amount: 45, rate: '45p/mi' },
  'journeys before the effective date keep the historic 45p rate'
);
assert.deepEqual(
  calculate(100, 0, '2026-07-20'),
  { amount: 55, rate: '55p/mi' },
  'journeys on the effective date use the new 55p rate'
);
assert.deepEqual(
  calculate(1000, 9500, '2026-07-20'),
  { amount: 400, rate: 'Mixed' },
  'new-rate journeys still use 25p for miles above the threshold'
);

console.log('Mileage rate effective-date checks passed.');
