-- Pure input/date helpers used by the invoker OT scope check. They expose no table data and remain in the private schema.
GRANT EXECUTE ON FUNCTION private.sf_month_meta(text[],text), private.sf_public_holidays(integer,text), private.sf_easter_sunday(integer) TO authenticated,service_role;
