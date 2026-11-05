-- QA ONLY: columns already present in production and used by the current profile function.
alter table public.shift_templates add column if not exists requires_planning_team boolean not null default false;
alter table public.shift_templates add column if not exists rhythm_alias text;
