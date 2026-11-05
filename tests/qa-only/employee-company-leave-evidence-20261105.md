# QA: leave account and personnel evidence, 2026-11-05

Scope: isolated Supabase QA project ifgemrtvnmyqaidlxgxb, branch codex/employee-company-access-production. No production data was changed. The production leave-account and personnel-evidence base migrations were applied to QA, including private storage and access policies. Seven production and QA function definitions were compared and matched.

Synthetic employee logged in against QA and switched between companies A and B. The portal displayed the corresponding leave balances (25 and 32 days) and company-specific evidence requests. QA SQL tests rejected an employee ID belonging to the other company and denied access after revocation.

The evidence upload is NOT verified: while the evidence list reloads, previously displayed controls can still be clicked but the handler ignores the action. A proposed loading-state correction requires review and a successful browser upload test before release. Review/approval by a manager is also not yet tested end to end.

The temporary multi-company QA functions were restored or their grants revoked after the test; the production-equivalent leave-account and evidence migrations remain in QA. The synthetic login was banned, both profiles disabled and its sessions deleted. Do not enable the production multi-company feature until the remaining tests and security review pass.
