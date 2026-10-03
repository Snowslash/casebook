# Casebook

A local-first, read-only explorer for UK operative eLogbook `.xlsx` exports. **The official eLogbook remains authoritative.** Counts represent logged procedures, not unique patients, theatre sessions, competence or official portfolio points.

## Explore a workbook

Open an `.xlsx` file, review the import, then explore monthly activity, procedure mix and supervision. Filter by date, procedure, supervision or hospital; search retained analytical fields across every view; inspect the exact included source rows.

- Each chart applies all active filters except its own dimension, keeping alternatives selectable. Its **available** count can differ from the summary's **selected procedures** count. Selecting a category toggles it; selecting another replaces only that dimension.
- Procedure mix and supervision offer an optional **Bars/Pie** choice, defaulting to bars. Click a slice or a full-size legend entry to filter; keyboard activation works on both. Slice sizes use the chart's **available** total and exact counts remain in the legend. Monthly activity remains bars. View choices survive filter changes but reset on Clear or a new import; they are never saved.
- Monthly bars show only months with entries, in chronological order, plus a missing/invalid-date category—not an inferred continuous activity timeline.
- Exact source labels, blank categories, unfamiliar supervision labels and possible duplicates remain visible. Charts retain every category rather than collapsing a long tail into “Other”.
- Filter chips remove individual selections. Search recovery can clear just search; Reset clears all filters. The summary describes the current source-table selection, excluding blank labels from distinct procedure/hospital counts.

## Data and privacy

- Processing is in browser memory, with no upload endpoint, accounts, analytics, AI or automatic retention. No backend or database is required.
- There is no localStorage, IndexedDB or service worker. Reload or Clear removes the app's working state, but is not a guarantee of secure memory erasure. There is no saved session or export/backup feature; keep your original workbook securely outside this repository.
- Application state retains only operation date, operation label, supervision, hospital, validation status and row provenance/quality flags. Parsing temporarily reads the supplied workbook. Notes, consultant details, patient attributes and specialty parameters are not displayed or searched.
- Use only wholly synthetic files for development, tests, screenshots and issue reports. Never commit clinical exports, patient-identifiable information or credentials. The only workbook intended for publication is the authored `public/synthetic-logbook.xlsx` example.
- No automatic deduplication, category mapping or interpretation of numeric codes. `Performed` remains the recorded label; it is not renamed independent. Supervision patterns do not establish competence.
- No targets, curriculum comparisons or recommendations. This is an exploratory view of recorded activity, not clinical decision support or an official portfolio assessment.

## Expected source structure

The synthetic example uses one worksheet, `OperationList`, with these headings in row 1:

```text
Operation Date | Operation | Hospital | Private | ASAGrade | Patient Years | Patient Days | CEPOD | Supervision | Consultant | Notes | Complication Notes | Specialty Parameter 1 | Specialty Parameter 2 | Specialty Parameter 3 | Specialty Parameter 4 | Specialty Parameter 5 | Specialty Parameter 6 | Specialty Parameter 7 | Operation Side | Patient Sex | Validation Status
```

One row is one logged procedure, including separate rows for multiple procedures in one theatre session. There is no explicit case identifier. Worksheet extents can include formatted empty rows and are not record counts.

Recognised supervision labels are `Assisting`, `Supervised-trainer scrubbed`, `Supervised-trainer unscrubbed but in theatre` and `Performed`. This is not an exhaustive list; unfamiliar labels remain distinct.

## Hand-checkable synthetic acceptance fixture

The fixture is authored from scratch with the same headings, real Excel numeric date cells, synthetic procedure/supervision/hospital values, all other fields empty, and trailing formatted empty rows. `Synthetic unknown role` is deliberately NOT asserted to be an eLogbook label.

| Excel row | Date | Operation | Supervision | Hospital |
|---:|---|---|---|---|
| 2 | 2026-01-05 | Synthetic procedure A | Assisting | Synthetic hospital North |
| 3 | 2026-02-03 | Synthetic procedure A | Supervised-trainer scrubbed | Synthetic hospital North |
| 4 | 2026-02-10 | Synthetic procedure A | Supervised-trainer unscrubbed but in theatre | Synthetic hospital South |
| 5 | 2026-02-17 | Synthetic procedure A | Performed | Synthetic hospital North |
| 6 | 2026-02-17 | Synthetic procedure A | Performed | Synthetic hospital North |
| 7 | 2026-02-20 | Synthetic procedure A | (blank) | Synthetic hospital South |
| 8 | 2026-02-24 | Synthetic procedure A | Synthetic unknown role | (blank) |
| 9 | 2026-02-24 | Synthetic procedure B | Assisting | Synthetic hospital South |
| 10 | (blank) | Synthetic procedure A | Assisting | Synthetic hospital North |

Expected: nine imported rows. February 2026 + Synthetic procedure A selects rows 3–8, six procedures: scrubbed 1; unscrubbed 1; Performed 2; missing role 1; unfamiliar role 1. Clicking Performed selects exactly rows 5 and 6. Both remain and are flagged as possible duplicates. Reset restores all nine, including missing-date row 10. Empty trailing rows are ignored.

Overview checks: January 1, February 7, missing/invalid date 1; procedure A 8 and B 1. North selects rows 2, 3, 5, 6 and 10; South selects 4, 7 and 9; missing hospital selects 8. North + February selects 3, 5 and 6; adding Performed selects 5 and 6. The summary has two distinct nonblank hospital labels, not three.

## Run locally

Requires Node.js 22.12+ and npm. From the project directory:

```bash
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. The server binds to loopback only; do not expose the development/preview server publicly. Download the synthetic example from the opening screen, select it with **Open .xlsx**, review the import and choose **Explore procedures**.

For editing, use `npm run dev`. The strict page CSP intentionally blocks network connections, including development hot reload; manually reload after changes. Prefer the production build/preview path for checks. Scripts, styles and workers are served locally, without runtime CDNs or remote fonts.

## Build and check

```bash
# Install the browser binary once for end-to-end checks:
npx playwright install chromium
npm run check
# Re-author the deterministic synthetic fixture without reading an export:
npm run fixture
```

`npm run check` runs Vitest, TypeScript checking, the production build and Playwright against that build. The browser test server uses loopback port 4173 and exits after testing; stop any manually running preview on that port first. Tests use only synthetic files. Playwright traces are disabled; synthetic screenshots go to ignored `test-results/`. Dependencies are locked in `package-lock.json`.

## Deliberate import limits

This is a narrow parser contract, not a general spreadsheet viewer:
- One visible worksheet with a canonical `worksheets/<name>.xml` relationship target (letters, digits, underscores and hyphens in the name); relocated, encoded and other noncanonical package targets are rejected. Row 1 must contain the exact 22 headings in the original order. The worksheet name is preserved, not assumed to be a case identifier.
- Maximum 5 MiB input, 20 MiB declared expanded ZIP content, 128 package entries, and source row coordinates up to 20000. Import runs in a disposable worker with a 10-second cutoff. These are pragmatic resource limits, not a guarantee against every malicious file.
- Macros, embedded objects, external relationships, formulas, hidden rows/columns/sheets and merged cells are rejected visibly. No fallback to cached formula results or partial import.
- Numeric Excel date cells in the 1900 and 1904 systems are tested. The current parser accepts the usual numeric date-system flag; an explicit `date1904="true"` flag is rejected rather than misread by the dependency.
- Text dates, numbers without date formatting, and date-times with a time component are kept as invalid-date rows, not guessed or silently truncated. Rows without usable dates remain in the unfiltered view and are visibly excluded while date filters are active.
- Analytical categories must be text or blank. Whitespace and spelling are preserved; there is no trimming, category normalisation or procedure merging.
- Possible duplicates compare all parsed source values before excluded fields are discarded. Flags are not proof of erroneous entries.
- Date placeholders specify `DD/MM/YYYY`, independently of browser locale, and impossible dates are rejected. Incomplete dates show a completion prompt; invalid or reversed dates show a correction message. In those states, summaries, charts and source rows are withheld rather than showing false zero-match results. Completing/clearing the input restores results under the other selections; valid filters with no matches still show an explicit empty result. Search accepts displayed UK dates as well as ISO dates and searches only retained analytical values. Chart selections narrow the table; each chart retains the other dimensions' context so its alternatives remain selectable.
- A failed replacement import clears the previous dataset, preventing stale results from looking like the newly selected file. Clear/reload removes the working state. No persistence is implemented.

## Project status

The current synthetic suite passes **65 unit/integration tests and 34 Chromium browser tests**, plus TypeScript checking and a production build. Browser checks cover Bars/Pie switching, exact source-row drill-down, missing and unfamiliar labels, single/empty charts, keyboard activation, date validation, responsive overflow and absence of upload/persistent state in the exercised journeys. Desktop, tablet and narrow phone viewports have been checked; this is not physical-device certification. `npm audit` reported no known vulnerabilities in the locked dependencies during this verification, not a guarantee of security.

An early, narrowly scoped browser tool. Synthetic tests are not clinical validation, a full accessibility audit or security certification. Broader export compatibility, other browsers and larger-file performance are not validated. The importer intentionally rejects unsupported workbooks rather than guessing or partially importing them.

No project licence has been selected; choosing one remains a publication decision.
