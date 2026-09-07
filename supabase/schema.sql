create table if not exists public.training_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  records jsonb not null default '[]'::jsonb,
  model jsonb,
  model_versions jsonb not null default '[]'::jsonb,
  needs_retraining boolean not null default false,
  last_import_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.prediction_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prediction jsonb not null,
  inputs jsonb not null,
  actual_hba1c numeric,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.training_workspaces to authenticated;
grant select, insert, update, delete on public.prediction_history to authenticated;

alter table public.training_workspaces enable row level security;
alter table public.prediction_history enable row level security;

create policy "professionals manage their workspace"
  on public.training_workspaces
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "professionals manage their prediction history"
  on public.prediction_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Accounts are invite-only. Create the 2–3 professional users from the
-- Supabase dashboard or an administrator-controlled server workflow.
