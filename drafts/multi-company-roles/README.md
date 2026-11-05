# Draft: one invitation with company-specific roles

**Not deployed.** This is an unfinished, disabled development checkpoint. The archive contains candidate files, local PostgreSQL fixtures and Playwright mock tests. It is deliberately outside active app and migration paths.

Verified with synthetic data in local PostgreSQL: one signup assigns employee A and administrator B, company and owner permissions, MFA checks, unselected companies, atomic failure after revocation, acceptance by an existing account with a verified matching email, wrong or unconfirmed email rejection, single-use tokens, grouped cancellation, and atomic renewal preserving roles. Mock browser tests cover role selection, renewal, role switching and refusal after access revocation, existing-account login, and acceptance.

The prior attempt to run the schema change in the actual Supabase QA project was declined; no reason was supplied. The candidate has not been applied to QA or production. A complete end-to-end test with real Supabase authentication, email delivery, administrator MFA, production-equivalent portal actions and a security review are still required. The feature flags are not enabled.

The local fixtures reproduce necessary behavior for testing and do not constitute full parity with Supabase or the production database. Tests are not proof of release readiness. Extract the archive to inspect the candidate and tests.
