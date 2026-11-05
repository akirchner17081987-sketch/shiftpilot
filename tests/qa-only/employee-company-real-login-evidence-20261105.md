# Employee multi-company: real-login QA evidence

Date: 2026-11-05.

The production-preparation branch was run in an isolated temporary runtime with its public Supabase URL and key redirected to the employee QA project. The activation flag was enabled only inside that runtime. A fictitious account had two active company profiles and another fictitious account owned a separate company. No production data or production deployment was changed.

Verified:
- Actual password authentication and full employee portal: login, visible company selector, switch A to B and back, correct profile and one selector.
- Using the authenticated browser session and QA database: scoped profile, time account, QR history, wage preview, time submission, profile request, shift swap creation/cancellation, market claim, replacement decline, and shift-change rejection returned success. Foreign company profile access and a time submission for the other company were denied.
- An absence was submitted through the actual portal form in company B, appeared in B, and was absent after switching to A.
- During an active session, access to B was revoked in the QA database. The scoped profile, time account, swap list and open-market calls returned permission denied; switching to active company A still worked.
- Test accounts were blocked, their employee profiles disabled, and their sessions revoked after testing. The previously existing QA functions replaced for the test were restored to their exact pre-test definitions. Temporary public endpoints were revoked.

Limitations:
- The QR/wage/time/profile/swap/market request checks above include authenticated API calls; they do not prove every screen and button end-to-end.
- The QA database lacks production company branding, leave-account, and personnel-evidence endpoints; these parts returned 404 and remain unverified.
- Submitting a profile request through the screen was not completed: one attempt timed out waiting for a visible submit button; another inspection showed the profile form later visible. The timing needs investigation and retest.
- Planning warnings, open-market claims for open staffing demand, handover, wishes, QR terminal booking, invitation/registration and administrator UI were not comprehensively reverified in this run. No production release is implied.
