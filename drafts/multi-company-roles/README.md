# Draft: one invitation with company-specific roles

**Do not deploy or apply.** This is an unfinished, disabled development checkpoint. The archive contains candidate files, local PostgreSQL mock fixtures and Playwright mock tests. It is not a production migration.

Locally verified with synthetic data: one signup linked employee role in company A and administrator in B; MFA/manager permissions, unselected companies and a revoked target were checked; both UI role-switch directions passed mocked browser tests. The candidate was not tested with the real QA authentication service, mail delivery, existing accounts, full portal actions or real administrative MFA.

The attempt to run the candidate schema change in the actual QA project was declined; the tool returned no reason. No QA or production schema change for this candidate was applied. A careful security review and a complete end-to-end QA run remain required. The current acceptance flow does not yet handle invitations to an existing account, and revocation/renewal semantics for groups require review.

To inspect locally: extract the archive into a separate directory. It is deliberately kept outside active app and migration paths.
