-- Cover the actor references when an auth user is removed or updated.
create index company_profiles_updated_by_idx on public.company_profiles(updated_by);
create index company_locations_updated_by_idx on public.company_locations(updated_by);
