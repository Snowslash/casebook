# Usage and privacy

Open an `.xlsx` file, review the import, then explore monthly activity, procedure mix and supervision. Filter by date, procedure, supervision, hospital or CEPOD; search retained analytical fields across every view; inspect the exact included source rows.

- Each chart applies all active filters except its own dimension, keeping alternatives selectable. Its **available** count can differ from the summary's **selected procedures** count. Selecting a category toggles it; selecting another replaces only that dimension.
- Procedure mix and supervision offer an optional **Bars/Pie** choice, defaulting to bars. Click a slice or a full-size legend entry to filter; keyboard activation works on both. Slice sizes use the chart's **available** total and exact counts remain in the legend. Monthly activity remains bars. View choices survive filter changes but reset on Clear or a new import; they are never saved.
- Monthly bars show only months with entries, in chronological order, plus a missing/invalid-date category—not an inferred continuous activity timeline.
- Exact source labels, blank categories, unfamiliar supervision labels and possible duplicates remain visible. Charts retain every category rather than collapsing a long tail into “Other”.
- Filter chips remove individual selections. Search recovery can clear just search; Reset clears all filters. The summary describes the current source-table selection, excluding blank labels from distinct procedure/hospital counts.
- Short control, chart and chip feedback respects the system's reduced-motion preference, including changes made while the app is open. Counts and source rows update without waiting for animation. Bars/Pie uses a brief crossfade where the native View Transition API is available, with an immediate switch otherwise. Incoming chart controls stay clickable during the fade; Clear/replacement cancels it. There are no animated numbers, table rows or repeated overview entrances while filtering.

## Privacy

- Workbook processing is in browser memory, with no upload endpoint, accounts, analytics, AI or automatic retention of workbook data. No backend or database is required.
- Only the light/dark preference is saved, using the estate's `sangeevSiteTheme` localStorage key and `SameSite=Lax` cookie. On `sangeev.me`, the preference cookie is shared across estate subdomains. A valid cookie takes precedence over origin-local storage; the first-visit default is dark. Storage failures do not prevent using the app.
- No workbook contents, filenames, filters or chart choices are saved. There is no IndexedDB or service worker. Reload or Clear removes the workbook's working state, but is not a guarantee of secure memory erasure; the theme preference remains. There is no saved workbook session or export/backup feature; keep your original workbook securely outside this repository.
- Application state retains only operation date, operation label, supervision, hospital, CEPOD, validation status and row provenance/quality flags. Parsing temporarily reads the supplied workbook. Notes, consultant details, patient attributes and specialty parameters are not displayed or searched.
- Use only wholly synthetic files for development, tests, screenshots and issue reports. Never commit clinical exports, patient-identifiable information or credentials. The only workbook intended for publication is the authored `public/synthetic-logbook.xlsx` example.
- No automatic deduplication, category mapping or interpretation of numeric codes. `Performed` remains the recorded label; it is not renamed independent. Supervision patterns do not establish competence.
- No targets, curriculum comparisons or recommendations. This is an exploratory view of recorded activity, not clinical decision support or an official portfolio assessment.

## Licence and third-party notices

Casebook is licensed under the [MIT License](../LICENSE). The bundled `@sangeev/estate-ui` code is also MIT; its archive includes its own `LICENSE`. Atkinson Hyperlegible Next and Literata remain under their upstream SIL Open Font Licences. Runtime dependencies retain their own licences.

The static build includes the Casebook and shared UI MIT notices, both font licences and `THIRD-PARTY-NOTICES.txt` under `/licenses/`. Third-party notices retain the licence texts supplied by the locked production packages. The `worker-f` entry explicitly identifies its upstream MIT metadata and missing licence file without inventing a copyright year. `private: true` in the package metadata prevents accidental npm publication; it does not restrict this repository's MIT licence or require a private GitHub repository.
