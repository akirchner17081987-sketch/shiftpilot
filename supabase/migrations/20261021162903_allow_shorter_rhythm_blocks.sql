-- In every company, shorter rhythm blocks are permitted at draft application.
-- The automatic planners still construct their prescribed complete blocks.
-- Preserve maxima, recovery, role/tenant checks, snapshots and manual-override audit.
do $migration$
declare source_ text; old_ text := $old$  -- Every used ALLE/FREI work block must be complete inside this month (approved absences excluded).
  FOR day_ IN SELECT DISTINCT(starts_at AT TIME ZONE tz_)::date FROM public.shift_assignments WHERE id=ANY(ids_) AND company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
   AND starts_at>=month_::timestamp AT TIME ZONE tz_ AND starts_at<last_::timestamp AT TIME ZONE tz_ AND shift_code NOT IN('OT1','OT2','OT3') LOOP
   rhythm_:=private.sf_month_rhythm(e_,day_);
   SELECT array_agg(value) INTO pattern_ FROM jsonb_array_elements_text(coalesce(rhythm_->'pattern','[]'::jsonb));
   IF rhythm_->>'mode'='required' AND rhythm_->>'expected'='ALLE' AND 'FREI'=ANY(pattern_) AND NOT EXISTS(SELECT 1 FROM unnest(pattern_) x WHERE trim(x) NOT IN('ALLE','FREI')) THEN
    index_:=(rhythm_->>'index')::int;pattern_n_:=cardinality(pattern_);before_:=0;after_:=0;
    WHILE before_<pattern_n_-1 AND trim(pattern_[((index_-before_-1+pattern_n_)%pattern_n_)+1])='ALLE' LOOP before_:=before_+1; END LOOP;
    WHILE after_<pattern_n_-1 AND trim(pattern_[((index_+after_+1)%pattern_n_)+1])='ALLE' LOOP after_:=after_+1; END LOOP;
    FOR d_ IN SELECT g::date FROM generate_series(greatest(month_,day_-before_),least(last_-1,day_+after_),interval '1 day') g LOOP
     IF NOT EXISTS(SELECT 1 FROM public.absences WHERE company_id=company_ AND employee_id=e_.id AND status IN('Genehmigt','Erfasst') AND full_day AND start_date<=d_ AND end_date>=d_)
      AND NOT EXISTS(SELECT 1 FROM public.shift_assignments WHERE company_id=company_ AND employee_id=e_.id AND status<>'CANCELLED'
       AND (starts_at AT TIME ZONE tz_)::date=d_ AND shift_code NOT IN('OT1','OT2','OT3')) THEN RAISE EXCEPTION 'Ein Arbeitsblock ist unvollständig.'; END IF;
    END LOOP;
   END IF;
  END LOOP;$old$;
begin
 source_:=pg_get_functiondef('private.sf_apply_month_optimization(uuid,date,text,uuid[],jsonb,boolean)'::regprocedure);
 if strpos(source_,old_)=0 then raise exception 'Expected block-completeness guard was not found; no planning checks changed.'; end if;
 execute replace(source_,old_,'  -- Block length is a planning preference; a shorter block is valid.');
end $migration$;
