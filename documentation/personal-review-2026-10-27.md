# Personal review — 27 October 2026

Implemented findings from the owner review of the eight Personal areas:

- Simulator uses the company and applicable OT weekly limits, takes monthly targets and weekly maxima from the selected reference profile, and identifies the actual additional positions independently of the scenario name.
- Employee profiles use one work-time-model field for contract and planning; saving no longer overwrites the chosen model with a duplicate field.
- New absences require an explicit employee selection; editing keeps the existing employee. Field labels are associated with their controls.
- QR pause details show minutes and seconds. The once-rounded total and the independent QR report period are explained separately from the central time-entry period. Recorded and paid minutes are unchanged.
- Handover adds today, last seven days and current-month presets. Marketplace search has an accessible name and a useful empty state.
- DATEV rules show readable time sources and missing cost centres. The exported file format is unchanged.

## Existing monthly-target configuration

Secontec Services and Secontec Services - 9h use personal monthly targets from October 2026. Closed months are preserved. Secontec Services - 8h already has an explicit start in January 2027; that date remains unchanged. The administrative alignment SQL is stored in scripts/sql/align-personal-monthly-targets.sql and records a system audit event for maintenance updates.

## Validation before publication

- Full npm test: 1,429 passing, no failures.
- IONOS configuration checks: 5 passing.
- Production static build and JavaScript syntax checks: passed.
- Focused regression tests cover explicit absence selection, preserving the employee while editing, second-precision pause display, company weekly caps and OT-specific caps.
- Pull-request browser workflow checks profile persistence, simulator worker and reference values, QR periods and handover flows using isolated fixture data.

The review does not create employee absences, alter real contracts, approve time entries, or export payroll data.
