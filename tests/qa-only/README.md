# Multi-company employee QA — incomplete

This branch is an isolated test prototype. Do not merge, deploy to production, or enable the multi-employee invitation RPC.

The test database is not a production clone. In particular the production swap response has an additional `private.sf_require_active_employee_access()` call that the QA copy initially lacked; the disabled-profile finding was reproduced and fixed in QA only. It is not evidence that the production endpoint is vulnerable.

Implemented in QA database: multi-employee invitation prototype (EXECUTE revoked for authenticated), employee profile options, scoped profile, QR history, time account, absence requests, employee lists, guarded swap/offer actions and time submission. The QA legacy swap response was additionally protected. Tests use fictitious users and transactions that roll back.

A multi-profile employee boot and switcher, upcoming shifts, time summaries and a test-only absence workflow are integrated in the isolated QA preview. The user confirmed the switch between the two test companies; browser action tests use mocked data.

Still required: integrate selected company throughout the full employee portal; convert and verify all remaining employee endpoints and direct table access; protect legacy endpoints against bypass and correctly enforce active access; account for QR terminal-specific company resolution; handle existing accounts; reconcile the QA database to the current production schema without executing production jobs; run complete role and cross-company browser/API tests. An actual multi-company invitation was sent to the authorized Gmail alias; the user confirmed both emails worked, and the QA database confirmed the invitation was claimed, the email verified, and both employee profiles linked. The existing Hotmail test account was separately linked to both test companies.


2026-11-05: QA management now allows an administrator to manage already-linked profiles and explicitly link an existing unlinked profile after verifying account email and authority in both companies. It does not create employee profiles. The QA employee profile has a link to this selector. QA-only tests cover rejected access to selected legacy actions and direct reads after revocation, with manager access retained. These tests are not comprehensive and are not evidence that production is protected. The QA multi-employee invite RPC remains disabled for authenticated users. The QA preview uses a limited portal, and this branch has diverged substantially from main: it must not be merged or promoted wholesale.


2026-11-05 follow-up: Pending multi-profile invitations now reserve their selected QA profiles; additional invitations and account linking cannot reuse them. MFA and selection were tested through the authenticated RPC inside a rolled-back transaction with temporary grants. This is not a live email/browser test. IONOS production has historically used `codex/ionos-migration`; verify the active deployment before release. Do not merge the QA branch wholesale. The exposed multi-invitation RPC remains revoked in QA while the complete portal and production authorization behavior remain unverified.
