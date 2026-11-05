# Multi-company employee QA — incomplete

This branch is an isolated test prototype. Do not merge, deploy to production, or enable the multi-employee invitation RPC.

The test database is not a production clone. In particular the production swap response has an additional `private.sf_require_active_employee_access()` call that the QA copy initially lacked; the disabled-profile finding was reproduced and fixed in QA only. It is not evidence that the production endpoint is vulnerable.

Implemented in QA database: multi-employee invitation prototype (EXECUTE revoked for authenticated), employee profile options, scoped profile, QR history, time account, absence requests, employee lists, guarded swap/offer actions and time submission. The QA legacy swap response was additionally protected. Tests use fictitious users and transactions that roll back.

Still required: integrate selected company into employee boot and UI; convert and verify all remaining employee endpoints and direct table access; protect legacy endpoints against bypass and correctly enforce active access; account for QR terminal-specific company resolution; handle existing accounts; reconcile the QA database to the current production schema without executing production jobs; run complete role and cross-company browser/API tests. No end-to-end email test has been authorized for execution until those checks pass. The prototype does not grant the real test account another company.
