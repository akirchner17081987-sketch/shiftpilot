# Multi-company employee QA — incomplete

This branch is an isolated test prototype. Do not merge, deploy to production, or enable the multi-employee invitation RPC.

The test database is not a production clone. In particular the production swap response has an additional `private.sf_require_active_employee_access()` call that the QA copy initially lacked; the disabled-profile finding was reproduced and fixed in QA only. It is not evidence that the production endpoint is vulnerable.

Implemented in QA database: multi-employee invitation prototype (EXECUTE revoked for authenticated), employee profile options, scoped profile, QR history, time account, absence requests, employee lists, guarded swap/offer actions and time submission. The QA legacy swap response was additionally protected. Tests use fictitious users and transactions that roll back.

A multi-profile employee boot and switcher, upcoming shifts, time summaries and a test-only absence workflow are integrated in the isolated QA preview. The user confirmed the switch between the two test companies; browser action tests use mocked data.

Still required: integrate selected company throughout the full employee portal; convert and verify all remaining employee endpoints and direct table access; protect legacy endpoints against bypass and correctly enforce active access; account for QR terminal-specific company resolution; handle existing accounts; reconcile the QA database to the current production schema without executing production jobs; run complete role and cross-company browser/API tests. An actual multi-company invitation was sent to the authorized Gmail alias; the user confirmed both emails worked, and the QA database confirmed the invitation was claimed, the email verified, and both employee profiles linked. The existing Hotmail test account was separately linked to both test companies.
