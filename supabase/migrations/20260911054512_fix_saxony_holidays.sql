-- Correct the Saxon Buß- und Bettag calculation for every calendar layout.
-- It is the Wednesday on or before 22 November (16–22 November), not the
-- Wednesday on or before 23 November.
create or replace function private.sf_public_holidays(p_year integer,p_state text)
returns table(holiday_date date,name text)
language sql
immutable
set search_path=''
as $$
  with e as (select private.sf_easter_sunday(p_year) d),
  fixed(d,n,states) as (
    values
      (make_date(p_year,1,1),'Neujahr'::text,array['*']::text[]),
      (make_date(p_year,5,1),'Tag der Arbeit',array['*']::text[]),
      (make_date(p_year,10,3),'Tag der Deutschen Einheit',array['*']::text[]),
      (make_date(p_year,12,25),'1. Weihnachtstag',array['*']::text[]),
      (make_date(p_year,12,26),'2. Weihnachtstag',array['*']::text[]),
      (make_date(p_year,1,6),'Heilige Drei Koenige',array['BW','BY','ST']::text[]),
      (make_date(p_year,3,8),'Internationaler Frauentag',array['BE','MV']::text[]),
      (make_date(p_year,8,15),'Mariae Himmelfahrt',array['SL']::text[]),
      (make_date(p_year,9,20),'Weltkindertag',array['TH']::text[]),
      (make_date(p_year,10,31),'Reformationsfest',array['BB','HB','HH','MV','NI','SN','ST','SH','TH']::text[]),
      (make_date(p_year,11,1),'Allerheiligen',array['BW','BY','NW','RP','SL']::text[])
  ), moving(d,n,states) as (
    select e.d-2,'Karfreitag',array['*']::text[] from e union all
    select e.d+1,'Ostermontag',array['*']::text[] from e union all
    select e.d+39,'Christi Himmelfahrt',array['*']::text[] from e union all
    select e.d+50,'Pfingstmontag',array['*']::text[] from e union all
    select e.d+60,'Fronleichnam',array['BW','BY','HE','NW','RP','SL']::text[] from e union all
    select make_date(p_year,11,22)-((extract(dow from make_date(p_year,11,22))::integer+4)%7),
           'Buß- und Bettag',array['SN']::text[]
  )
  select x.d,x.n from (
    select * from fixed union all select * from moving
  ) x
  where '*'=any(x.states)
     or regexp_replace(upper(coalesce(p_state,'DE')),'^DE-','')=any(x.states)
  order by x.d;
$$;

revoke all on function private.sf_public_holidays(integer,text) from public,anon,authenticated;

notify pgrst,'reload schema';
