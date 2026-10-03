-- Historial de períodos Premium: una fila por suscripción (Stripe), por
-- compra encadenada en la tienda (RevenueCat) o por regalo manual del panel.
-- La llena api/cron-reconcile-plans.js a diario a partir de las fuentes
-- reales (Stripe / RevenueCat), así que se puede reconstruir en cualquier
-- momento; los regalos manuales también los escribe admin.js set_plan.
create table if not exists public.premium_periods (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('stripe','apple','google','promo','manual')),
  -- Stripe: id de la suscripción · tienda: user:producto:fecha original · manual: user_id
  external_id text not null,
  product text,
  status text not null,
  had_trial boolean not null default false,
  started_at timestamptz not null,
  ended_at timestamptz,               -- null = sigue activo
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists idx_premium_periods_user on public.premium_periods (user_id);
create index if not exists idx_premium_periods_started on public.premium_periods (started_at desc);

alter table public.premium_periods enable row level security;

create policy "service role only" on public.premium_periods
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
