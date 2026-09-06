revoke all on function private.german_easter_sunday(integer) from public, anon;
revoke all on function private.german_holiday_name(date,text) from public, anon;
grant execute on function private.german_easter_sunday(integer) to authenticated;
grant execute on function private.german_holiday_name(date,text) to authenticated;

-- Private time-account calculator is used only through authenticated public wrappers.
revoke all on function private.time_account_row_v1(uuid,date) from public, anon;
grant execute on function private.time_account_row_v1(uuid,date) to authenticated;;
