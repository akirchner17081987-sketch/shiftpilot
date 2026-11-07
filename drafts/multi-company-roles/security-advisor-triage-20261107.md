# Sicherheitsprüfung der Migration – 07.11.2026

Prüfstand: isolierter Testzweig whthodedymxplgmaooov nach QA-Migration 20261107033536. Produktionskatalog und Advisor wurden ausschließlich lesend zum Vergleich herangezogen. Keine Freigabe und keine Änderung der Produktion.

## Ergebnis und Grenzen

Der Advisor meldet 34 Tabellen ohne Policy und 40 durch angemeldete Benutzer ausführbare SECURITY-DEFINER-Funktionen. Die 40 Funktionssignaturen tauchen auch im aktuellen Produktions-Advisor auf. Beim Vergleich der Definitionen waren 38 unverändert und zwei verändert; dies sagt nichts darüber aus, ob ihre aufgerufenen Hilfsfunktionen unverändert sind. Die nachfolgende Einzelprüfung bewertet Katalogrechte und sichtbare Schutzaufrufe, nicht jede Verzweigung und jeden dynamischen Missbrauchsfall. Für alle Funktionen bleiben Negativtests und die Prüfung der aufgerufenen Helfer erforderlich.

Im Testzweig hatten bei allen 34 Tabellen weder anon noch authenticated ein direktes SELECT-, INSERT-, UPDATE- oder DELETE-Recht; es gab keine Policies. Tabellenbesitzer und privilegierte Funktionen können RLS umgehen, daher ist dies keine Aussage über indirekten Zugriff. 31 Tabellen stehen auch im Produktions-Advisor; drei sind nur auf dem Testzweig aufgefallen. Schema-USAGE für authenticated ist im privaten Schema vorhanden und darf nicht mit einem Tabellengrant verwechselt werden.

Von den 40 Funktionen setzen 39 einen leeren search_path. manager_log_datev_lodas_export verwendet public, pg_temp; anon und authenticated hatten im Test kein CREATE-Recht im public-Schema. Andere Rollen und indirekte Risiken sind damit nicht abschließend bewertet. Keine pauschalen Änderungen der Grants, damit bestehende Funktionsabläufe nicht unbeabsichtigt ausfallen.

## Tabellen – Einzelbewertung

Alle folgenden Einträge: RLS aktiviert, keine Policy, keine der vier genannten direkten Tabellenberechtigungen für anon oder authenticated im Test. Bewertung: direkter Zugriff für diese Rollen nach aktuellem Katalog blockiert; indirekte Zugriffe separat prüfen.

- `private.audit_archive_epochs`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.audit_archive_keys`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.audit_archive_parts`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.audit_archive_restore_context`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.audit_archive_transfers`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.audit_archives`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.auto_plan_completion_outbox`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.auto_plan_notification_preferences`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.autonomous_planning_runs`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.autonomous_planning_settings`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.disruption_replacements`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_erasure_context`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_erasure_index_sources`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_erasure_jobs`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_erasure_metrics`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_erasure_reference_index`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_leave_accounts`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_leave_charges`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_roster_generation`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.employee_roster_sync_context`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.location_geocode_rate_limit`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.multi_company_invitation_groups`: nur QA-Advisor; indirekte Zugriffe offen.
- `private.planning_word_votes`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.privacy_legal_holds`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.privacy_lifecycle_requests`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.privacy_redaction_runs`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.privacy_retention_profiles`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.qr_pin_credentials`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.qr_pin_settings`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `private.sf_audit_reset_backup_20261020`: nur QA-Advisor; indirekte Zugriffe offen.
- `private.sf_multi_claim_context`: nur QA-Advisor; indirekte Zugriffe offen.
- `public.time_qr_independent_breaks`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `public.time_qr_independent_events`: auch Produktions-Advisor; indirekte Zugriffe offen.
- `public.time_qr_independent_login_limits`: auch Produktions-Advisor; indirekte Zugriffe offen.

## Privilegierte Funktionen – Einzelbewertung

Die genannten Schutzaufrufe sind eine Sichtprüfung der Funktionsdefinition, kein Beleg dafür, dass sie in allen Pfaden wirksam sind. Jede Funktion bleibt bis zum zugehörigen Negativtest offen.

- `employee_clock_from_qr(p_token text, p_expected_action text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_has_time_only_login`, `sf_assert_qr_pilot_access`; offen: vollständiger Pfad- und Berechtigungstest.
- `employee_my_time_account_month(p_month date)` — Definition gegenüber Produktion geändert; sichtbare Helfer: `sf_employee_time_account_for_company`, `sf_single_active_employee_company`; offen: vollständiger Pfad- und Berechtigungstest.
- `employee_qr_break_from_qr(p_token text, p_expected_action text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_has_time_only_login`, `sf_assert_qr_pilot_access`; offen: vollständiger Pfad- und Berechtigungstest.
- `employee_qr_time_status(p_token text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_has_time_only_login`, `sf_assert_qr_pilot_access`; offen: vollständiger Pfad- und Berechtigungstest.
- `employee_respond_to_shift_change(p_change_id uuid, p_decision text, p_comment text)` — Definition gegenüber Produktion geändert; sichtbare Helfer: `sf_has_time_only_login`, `sf_employee_identity_for_company`; offen: vollständiger Pfad- und Berechtigungstest.
- `employee_submit_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_has_time_only_login`, `sf_employee_id`; offen: vollständiger Pfad- und Berechtigungstest.
- `get_push_public_key()` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_push_recipient_active`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_central_time_entries(p_company_id uuid, p_start_date date, p_end_date date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_close_time_month(p_company_id uuid, p_month date, p_note text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `personnel_admin_role`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_create_company_invite(p_company_id uuid, p_email text, p_role text, p_token_hash text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `can_manage_company_users`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_create_time_qr_terminal(p_company_id uuid, p_name text, p_location_note text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_delete_time_qr_terminal(p_terminal_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_get_time_qr_terminal_qr_path(p_terminal_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_import_month_matrix(p_company_id uuid, p_rows jsonb, p_apply boolean)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `personnel_admin_role`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_list_company_users(p_company_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `can_manage_company_users`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_list_time_entries(p_company_id uuid, p_start_date date, p_end_date date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_list_time_qr_pilot_candidates(p_company_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_list_time_qr_terminals(p_company_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_log_datev_lodas_export(p_company_id uuid, p_month date, p_row_count integer, p_content_sha256 text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_monthly_holidays(p_company_id uuid, p_month date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_monthly_time_accounts(p_company_id uuid, p_month date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`, `sf_is_manager`, `sf_absence_payload_for_role`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_qr_independent_report(p_company_id uuid, p_start_date date, p_end_date date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_reopen_time_month(p_company_id uuid, p_month date, p_note text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `personnel_admin_role`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_review_time_entry(p_assignment_id uuid, p_decision text, p_comment text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`, `sf_has_access_permission`, `sf_assert_aal2`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_revoke_company_invite(p_invite_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `can_manage_company_users`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_rotate_time_qr_terminal(p_terminal_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_save_time_entry(p_assignment_id uuid, p_actual_start timestamp with time zone, p_actual_end timestamp with time zone, p_break_minutes integer, p_note text, p_confirm boolean)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`, `sf_has_access_permission`, `sf_assert_aal2`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_set_time_account_opening(p_employee_id uuid, p_effective_date date, p_opening_balance_minutes integer, p_note text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_aal2`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_set_time_qr_terminal_active(p_terminal_id uuid, p_is_active boolean)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_set_time_qr_terminal_mode(p_terminal_id uuid, p_pilot_mode boolean)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_set_time_qr_terminal_pilot_employee(p_terminal_id uuid, p_employee_id uuid)` — Definition gegenüber Produktion unverändert; delegiert an Mehrfach-Terminalfunktion; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_set_time_qr_terminal_pilot_employees(p_terminal_id uuid, p_employee_ids uuid[])` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_company_admin_mfa`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_time_month_status(p_company_id uuid, p_month date)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_can_manage_time`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_time_report_bundle(p_company_id uuid, p_month date, p_employee_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_authorize_sensitive_report`, `sf_is_manager`, `sf_absence_payload_for_role`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_update_company_member(p_company_id uuid, p_user_id uuid, p_role text, p_status text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_aal2`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_update_time_account_settings(p_company_id uuid, p_account_start_date date, p_credited_absence_types text[])` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_aal2`; offen: vollständiger Pfad- und Berechtigungstest.
- `manager_update_time_account_settings_v2(p_company_id uuid, p_account_start_date date, p_credited_absence_types text[], p_federal_state text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_assert_aal2`, `sf_is_manager`; offen: vollständiger Pfad- und Berechtigungstest.
- `register_push_subscription(p_company_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_push_recipient_active`; offen: vollständiger Pfad- und Berechtigungstest.
- `send_push_test(p_company_id uuid)` — Definition gegenüber Produktion unverändert; sichtbare Helfer: `sf_push_recipient_active`; offen: vollständiger Pfad- und Berechtigungstest.
- `unregister_push_subscription(p_endpoint text)` — Definition gegenüber Produktion unverändert; auth.uid() und Benutzerzuordnung zu prüfen; offen: vollständiger Pfad- und Berechtigungstest.

## Kritischer Integrationspunkt: bisherige Einzelprofil-Aufrufe

Die Hilfsfunktion private.sf_employee_id() gibt im Test nur bei genau einem aktiven geeigneten Profil eine ID zurück; andernfalls NULL. In der aktuellen Produktionsdefinition wird dagegen bei mehreren passenden Profilen ein einzelnes ausgewählt. Die alte public.employee_submit_time_entry verwendet weiterhin den Einzelprofil-Helfer. Die Anwendung assets/supabase-time-tracking-v1.js wählt nur bei __sfEmployeeMultiCompanyReady === true die neue unternehmensbezogene Funktion; andernfalls wird die alte Funktion aufgerufen. Daraus folgt ein plausibler Funktionsausfall für Mehrprofil-Nutzer bei fehlendem oder veraltetem Frontend-Flag; das ist kein Nachweis eines fremden Datenzugriffs. Der unternehmensbezogene Aufruf wurde in den vorbereiteten SQL-Tests geprüft, nicht jeder Browser-/Cache-/Releasezustand. Vor Freigabe Frontend-Backend-Reihenfolge, Cache und beide tatsächlichen Pfade mit mehreren Profilen testen.

Die lokalen Tests `multi-company-legacy-identity.test.mjs` und `multi-company-integration.test.mjs` bestanden zusammen 13 Prüfungen. Sie bestätigen unter anderem die beabsichtigte Ablehnung einer mehrdeutigen alten Identität; sie ersetzen nicht den genannten vollständigen Browser- und Cachetest.

Die beiden geänderten Advisor-Funktionen: employee_my_time_account_month delegiert bei genau einer Unternehmensoption an die unternehmensbezogene Kontoberechnung; bei mehr als einer Option wird die Altfunktion verweigert. employee_respond_to_shift_change prüft die Benutzer-ID und die zu dem Unternehmen gehörende Mitarbeiteridentität. Diese Sichtprüfung ersetzt keine vollständige Untersuchung von apply_shift_change und allen Statuspfaden.

## Migrationsdatei und Rückfall

Der zusammengeführte Entwurf bleibt absichtlich nicht ausführbar: scripts/build-multi-company-review-draft.mjs. Eine produktionsgeeignete versionierte SQL-Datei ist noch nicht erstellt; dazu muss die Supabase CLI im geeigneten Arbeitsbereich verfügbar sein. Vorher müssen Schema-Differenzen, die 40 Funktionen samt indirekten Helfern, der reale IONOS-Stand, Frontend-Kompatibilität, parallele Schreibzugriffe und die Sicherheitshinweise geklärt werden. Anschließend dieselbe Datei auf einem frischen, isolierten Ausgangsstand testen und Ergebnis sowie Prüfsumme dokumentieren. Keine Ausführung in Produktion.

Die Wiederherstellungsprobe deckt nur ausgewählte fiktive Datensätze ab. Vollständige unabhängige Wiederherstellung einschließlich Schema, Auth und Storage und ein Rückfall nach angelegten Mehrfachprofilen sind weiterhin offen.

