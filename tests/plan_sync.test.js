// Tests de api/_planSync.js — la lógica que decide si un usuario sigue siendo
// Premium según Stripe y RevenueCat.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { stripePeriodEnd, stripeVerdict, rcVerdict, decidePlan, RC_ENTITLEMENT } from '../api/_planSync.js';

const NOW = new Date('2026-10-02T12:00:00Z');
const ts = iso => Math.floor(new Date(iso).getTime() / 1000);
const rc = (expires, period_type = 'normal') =>
  ({ subscriber: { entitlements: { [RC_ENTITLEMENT]: { expires_date: expires, period_type } } } });

describe('stripePeriodEnd', () => {
  test('lee el formato viejo (top-level)', () => {
    assert.equal(stripePeriodEnd({ current_period_end: ts('2026-11-01T00:00:00Z') }), '2026-11-01T00:00:00.000Z');
  });
  test('lee el formato nuevo de la API (items.data[0])', () => {
    const sub = { items: { data: [{ current_period_end: ts('2026-11-01T00:00:00Z') }] } };
    assert.equal(stripePeriodEnd(sub), '2026-11-01T00:00:00.000Z');
  });
  test('null si no hay fecha', () => assert.equal(stripePeriodEnd({}), null));
});

describe('decidePlan', () => {
  test('sin Stripe ni RevenueCat → Premium manual, no se toca', () => {
    assert.deepEqual(decidePlan({ found: false }, rcVerdict(null, NOW)), { action: 'keep_manual' });
    assert.deepEqual(decidePlan({ found: false }, rcVerdict({ subscriber: { entitlements: {} } }, NOW)), { action: 'keep_manual' });
  });

  test('Stripe cancelada → free', () => {
    const d = decidePlan(stripeVerdict([{ id: 'sub_1', status: 'canceled', created: 1 }]), rcVerdict(null, NOW));
    assert.equal(d.patch.plan, 'free');
    assert.equal(d.patch.subscription_status, 'canceled');
  });

  test('Stripe impagada (past_due / unpaid) → free', () => {
    for (const status of ['past_due', 'unpaid', 'incomplete_expired']) {
      const d = decidePlan(stripeVerdict([{ id: 's', status }]), rcVerdict(null, NOW));
      assert.equal(d.patch.plan, 'free', status);
    }
  });

  test('Stripe activa → premium con su fecha real', () => {
    const sub = { id: 's', status: 'active', items: { data: [{ current_period_end: ts('2026-11-01T00:00:00Z') }] } };
    const d = decidePlan(stripeVerdict([sub]), rcVerdict(null, NOW));
    assert.deepEqual(d.patch, { plan: 'premium', subscription_status: 'active', current_period_end: '2026-11-01T00:00:00.000Z' });
  });

  test('una suscripción vieja cancelada no tapa a una activa', () => {
    const subs = [{ id: 'old', status: 'canceled', created: 1 }, { id: 'new', status: 'trialing', created: 2 }];
    assert.equal(decidePlan(stripeVerdict(subs), rcVerdict(null, NOW)).patch.subscription_status, 'trialing');
  });

  test('RevenueCat caducado → free', () => {
    const d = decidePlan({ found: false }, rcVerdict(rc('2026-09-01T00:00:00Z'), NOW));
    assert.equal(d.patch.plan, 'free');
    assert.equal(d.patch.subscription_status, 'expired');
  });

  test('RevenueCat renovado → premium con la fecha nueva', () => {
    const d = decidePlan({ found: false }, rcVerdict(rc('2026-11-03T00:00:00Z'), NOW));
    assert.equal(d.patch.plan, 'premium');
    assert.equal(d.patch.current_period_end, '2026-11-03T00:00:00Z');
  });

  test('Stripe cancelada pero iOS activo → sigue premium', () => {
    const d = decidePlan(stripeVerdict([{ id: 's', status: 'canceled' }]), rcVerdict(rc('2026-11-03T00:00:00Z'), NOW));
    assert.equal(d.patch.plan, 'premium');
  });
});
