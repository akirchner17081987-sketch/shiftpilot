-- Read-only regression cases for the existing planning-retention predicate.
do $test$
declare ok boolean;
begin
  with cases(status,created_at,completed_at,updated_at,expected) as (
    values
      ('SUCCEEDED',now()-interval '60 days',now()-interval '60 days',now()-interval '60 days',false),
      ('RUNNING',now()-interval '60 days',null,now()-interval '60 days',false),
      ('APPLIED',now()-interval '31 days',now()-interval '31 days',now()-interval '31 days',true),
      ('APPLIED',now()-interval '60 days',now()-interval '60 days',now()-interval '1 day',false),
      ('CANCELLED',now()-interval '31 days',now()-interval '31 days',now()-interval '31 days',true),
      ('FAILED',now()-interval '31 days',now()-interval '31 days',now()-interval '31 days',true),
      ('FAILED',now()-interval '29 days',now()-interval '29 days',now()-interval '29 days',false)
  )
  select bool_and(
    (status in ('FAILED','CANCELLED','APPLIED')
      and greatest(created_at,completed_at,updated_at)<now()-interval '30 days')=expected
  ) into ok from cases;
  if ok is distinct from true then raise exception 'Planning retention regression failed'; end if;
end $test$;
