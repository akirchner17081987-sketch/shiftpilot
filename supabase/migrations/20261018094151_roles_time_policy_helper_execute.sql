-- Row policies run as the caller; this helper returns only the caller's own capability.
GRANT EXECUTE ON FUNCTION private.sf_can_manage_time(uuid) TO authenticated;
