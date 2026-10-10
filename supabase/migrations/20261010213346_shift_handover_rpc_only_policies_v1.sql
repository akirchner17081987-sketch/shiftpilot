-- Public tables are deliberately RPC-only; explicit deny policies document that boundary.
do $$declare t text;begin foreach t in array array['shift_handovers','shift_handover_items','shift_handover_reports','shift_handover_events'] loop
 execute format('create policy handover_rpc_only on public.%I for all to authenticated using(false) with check(false)',t);
 end loop;end $$;
create index shift_handover_items_board_fk on public.shift_handover_items(board_id);
create index shift_handover_reports_board_fk on public.shift_handover_reports(board_id);
create index shift_handover_events_board_fk on public.shift_handover_events(board_id);

