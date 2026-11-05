# QA retest: company access and evidence, 2026-11-05

Isolated QA database and temporary runtime only; production was not changed. The synthetic employee logged in and switched to company B. A synthetic PNG was reserved, uploaded to private personnel-documents storage and submitted successfully; the portal showed “Zur Prüfung”. API and storage returned HTTP 200.

A deliberately delayed list request was used against company A: file selection and submission were disabled while loading, then restored; an open request stayed open after the refresh. The management UI mock test also passed for the existing employee-profile checkbox and rollback on server rejection.

User clarified the intended product: one invitation grants a choice of one or more companies with a separate role per company, including employee, team lead and administrator. The current prepared feature only links existing or verified-email matching employee profiles; it does not provide per-company roles in the invitation. The existing company switchers enumerate administrative memberships and employee profiles separately, so mixed roles must be supported and end-to-end tested. Do not release the existing feature as fulfilling the clarified request.

Still open: a secure single-invitation multi-company role flow, role-aware switching, manager review through the user interface and release/security testing. QA data and authentication used exclusively synthetic accounts.

The QA personnel_admin_role helper initially lacked the production MFA requirement. It was aligned to the exact production definition. Within rolled-back QA transactions, MFA AAL1 and a foreign-company manager were denied; an AAL2 owner approved the uploaded evidence and the request reached approved. This validates the database operation, not the manager browser UI. A separate rolled-back transaction confirmed that revoking and re-enabling company B changes the employee's available-company list. The synthetic account and sessions were disabled after the tests.
