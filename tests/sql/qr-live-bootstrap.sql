-- Minimal independent PostgreSQL environment; no production records or keys.
create role anon;
create role authenticated;
create role service_role;
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.companies(id uuid primary key default gen_random_uuid(),timezone text default 'Europe/Berlin');
create table public.employees(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies,
 first_name text,last_name text,personnel_no text,start_date date,status text default 'active',access_status text default 'NONE');
create table public.time_qr_terminals(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies,
 name text,location_note text,token_hash bytea unique,is_active boolean default true);
