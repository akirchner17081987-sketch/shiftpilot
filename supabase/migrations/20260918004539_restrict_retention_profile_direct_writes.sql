-- Keep application-level retention-profile writes behind the reviewed,
-- SECURITY DEFINER stage/confirm functions. Database migrations remain the
-- separately authenticated and recorded operator path for exceptional changes.

revoke insert, update, delete
  on table private.privacy_retention_profiles
  from service_role;

grant select
  on table private.privacy_retention_profiles
  to service_role;

comment on table private.privacy_retention_profiles is
  'Versioned customer-approved retention rules. Direct service-role writes are blocked; normal changes use the protected stage/confirm RPCs. Only one approved profile per company.';
