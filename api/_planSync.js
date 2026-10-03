// KODESH — Lógica compartida para derivar el plan de un usuario a partir de
// Stripe (web) y RevenueCat (iOS). La usan webhook.js, confirm.js y
// cron-reconcile-plans.js para que las tres vías escriban exactamente lo mismo.

export const RC_ENTITLEMENT = 'KODESH Pro';

// Desde la API de Stripe 2025-03-31 ("basil"), current_period_end ya no está
// en la suscripción sino en cada item. Leer solo sub.current_period_end
// devolvía undefined y se guardaba null → el Premium nunca "caducaba".
export function stripePeriodEnd(sub) {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export function isActiveStripeStatus(status) {
  return status === 'active' || status === 'trialing';
}

// Veredicto de Stripe para un usuario:
//   { found: false }                       → nunca tuvo suscripción en Stripe
//   { found: true, active, status, ... }   → la suscripción más relevante
export function stripeVerdict(subs) {
  const list = (subs || []).filter(Boolean);
  if (list.length === 0) return { found: false };
  const active = list.find(s => isActiveStripeStatus(s.status));
  const sub = active || [...list].sort((a, b) => (b.created || 0) - (a.created || 0))[0];
  return {
    found: true,
    active: isActiveStripeStatus(sub.status),
    status: sub.status,
    subscriptionId: sub.id,
    periodEnd: stripePeriodEnd(sub),
  };
}

// Veredicto de RevenueCat a partir de GET /v1/subscribers/{id}.
export function rcVerdict(rcData, now = new Date()) {
  const ent = rcData?.subscriber?.entitlements?.[RC_ENTITLEMENT];
  if (!ent) return { found: false };
  const active = !ent.expires_date || new Date(ent.expires_date) > now;
  const isTrial = ent.period_type === 'trial' || ent.period_type === 'intro';
  return {
    found: true,
    active,
    status: active ? (isTrial ? 'trialing' : 'active') : 'expired',
    periodEnd: ent.expires_date || null,
  };
}

// Combina ambas fuentes. Devuelve:
//   { action: 'keep_manual' }   → ni Stripe ni RevenueCat saben de este usuario:
//                                 Premium otorgado a mano desde el panel. No se toca.
//   { action: 'set', patch }    → estado que debe tener la fila en user_plans.
export function decidePlan(stripe, rc) {
  if (!stripe.found && !rc.found) return { action: 'keep_manual' };

  const actives = [stripe, rc].filter(v => v.found && v.active);
  if (actives.length > 0) {
    // Si paga por las dos vías, gana la que caduca más tarde.
    const best = actives.sort((a, b) =>
      new Date(b.periodEnd || '9999-12-31') - new Date(a.periodEnd || '9999-12-31'))[0];
    return {
      action: 'set',
      patch: {
        plan: 'premium',
        subscription_status: best.status === 'trialing' ? 'trialing' : 'active',
        current_period_end: best.periodEnd,
      },
    };
  }

  // Tuvo suscripción pero ninguna sigue activa → baja a free.
  const last = stripe.found ? stripe : rc;
  return {
    action: 'set',
    patch: {
      plan: 'free',
      subscription_status: last.status || 'canceled',
      current_period_end: last.periodEnd || null,
    },
  };
}
