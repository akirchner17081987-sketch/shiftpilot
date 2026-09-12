-- DATEV LODAS: produktive Quellen fuer Urlaub, Nacht- und Sonntagszuschlaege.
alter table public.datev_lodas_rules drop constraint if exists datev_lodas_rule_source_chk;
alter table public.datev_lodas_rules drop constraint if exists datev_lodas_rule_key_chk;

alter table public.datev_lodas_rules
  add constraint datev_lodas_rule_source_chk
    check (source_type = any (array[
      'WORK_TOTAL'::text,
      'SHIFT_CODE'::text,
      'ABSENCE_TYPE'::text,
      'ABSENCE_DAYS'::text,
      'NIGHT_WINDOW'::text,
      'SUNDAY_WINDOW'::text
    ])),
  add constraint datev_lodas_rule_key_chk
    check (
      (source_type='WORK_TOTAL' and coalesce(source_key,'')='')
      or (
        source_type in ('SHIFT_CODE','ABSENCE_TYPE','ABSENCE_DAYS','NIGHT_WINDOW','SUNDAY_WINDOW')
        and length(trim(coalesce(source_key,''))) between 1 and 80
      )
    );

comment on constraint datev_lodas_rule_source_chk on public.datev_lodas_rules
  is 'SchichtFunk DATEV sources including payroll day/night/Sunday calculations.';
