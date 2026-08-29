import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiSalesPlan, mergeAiSalesConversationRequirements, validateAiSalesRequest } from '../ai-sales.js';

const requirements = { tent_width_cm: 120, tent_depth_cm: 120, plant_count: 4, substrate: 'coco', height_cm: 198, seeds_in_budget: false, budget_eur: 900 };
const inventory = [
  ['ASJDS120R4.00', 282.33], ['ILED.066', 240], ['XXT.110-150', 27.94], ['XXT.200', 16.68],
  ['AMAC.84-19L', 2.3], ['SATA.041-100', 29.96], ['FATA.018-5A', 25.55], ['FATA.018-5B', 25.55],
  ['MSG.003PH', 7.99], ['MSG.002EC', 15],
].map(([sku, precio_con_iva]) => ({ sku, precio_con_iva, stock: 10 }));

test('complete case produces one complete, under-budget configuration', () => {
  const result = buildAiSalesPlan(requirements, inventory);
  assert.equal(result.status, 'ready_for_revalidation');
  assert.equal(result.selected_items.length, 10);
  assert.ok(result.total_eur <= 900);
});

test('missing height blocks selection with a structured clarification question', () => {
  const parsed = validateAiSalesRequest({ requirements: { seeds_in_budget: false } });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.questions.map((q) => q.field), ['height_cm']);
});

test('insufficient budget blocks the basket', () => {
  const result = buildAiSalesPlan({ ...requirements, budget_eur: 100 }, inventory);
  assert.equal(result.status, 'blocked');
  assert.equal(result.selected_items.length, 0);
  assert.ok(result.discarded.some((item) => item.reason === 'budget_exceeded'));
});

test('an exhausted product blocks the component without a fallback', () => {
  const stock = inventory.map((product) => product.sku === 'ILED.066' ? { ...product, stock: 0 } : product);
  const result = buildAiSalesPlan(requirements, stock);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.missing_components, ['lighting']);
  assert.ok(result.discarded.some((item) => item.candidate === 'ILED.066' && item.reason === 'unavailable_or_insufficient_stock'));
});

test('a missing compatible candidate blocks the complete basket', () => {
  const withoutExtractor = inventory.filter((product) => product.sku !== 'XXT.110-150');
  const result = buildAiSalesPlan(requirements, withoutExtractor);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.missing_components, ['extraction']);
});

test('available height below the tent requirement blocks the basket', () => {
  const result = buildAiSalesPlan({ ...requirements, height_cm: 190 }, inventory);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.missing_components, ['tent']);
  assert.ok(result.discarded.some((item) => item.reason === 'insufficient_available_height'));
});

test('conversation updates are validated before becoming requirements state', () => {
  const height = mergeAiSalesConversationRequirements({ budget_eur: 900 }, { height_cm: 198 });
  assert.equal(height.ok, true);
  assert.equal(height.requirements.height_cm, 198);
  const unsafe = mergeAiSalesConversationRequirements({}, { ignore_rules: true });
  assert.equal(unsafe.ok, false);
});
