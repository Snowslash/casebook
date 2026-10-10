# Development and verification

## Commands

```bash
# Install the browser binary once for end-to-end checks:
npx playwright install chromium
npm run check
# Re-author the deterministic synthetic fixture without reading an export:
npm run fixture
```

`npm run check` runs Vitest, TypeScript checking, the production build, Python 3 standard-library crawler/artifact checks and Playwright against that build. `npm run test:crawl` can also check the built files independently. Set `CASEBOOK_HTTP_ORIGIN` to a running loopback Wrangler Pages emulator to additionally exercise real HTTP routing; without it those three HTTP tests are explicitly skipped, not treated as routing evidence. The browser test server uses loopback port 4173 and exits after testing; stop any manually running preview on that port first. Tests use only synthetic files. Playwright traces are disabled; synthetic screenshots go to ignored `test-results/`. Dependencies are locked in `package-lock.json`.

For editing, use `npm run dev`. The strict CSP blocks development hot reload; manually reload or use the production build/preview workflow. Fixture regeneration requires Python 3 available as `python`. All tests and screenshots must use wholly synthetic files.

## Hand-checkable synthetic acceptance fixture

The fixture is authored from scratch with the same headings, real Excel numeric date cells, synthetic procedure/supervision/hospital values, synthetic CEPOD values, all other fields empty, and trailing formatted empty rows. `Synthetic unknown role` is deliberately NOT asserted to be an eLogbook label.

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

### CEPOD fixture values

These are illustrative categories, not asserted eLogbook meanings. Row 2: `Synthetic category A`; row 3: `Synthetic category B`; row 4: `Synthetic category A`; rows 5 and 6: numeric `7`; row 7: blank; row 8: `Synthetic unfamiliar category`; row 9: text `7`; row 10: `Synthetic category A`. Numeric `7` selects rows 5 and 6; text `7` selects only row 9; missing selects row 7. All original row identities and duplicate expectations remain unchanged.

## Shared estate theme

Casebook consumes the exact vendored `@sangeev/estate-ui@2.0.0-alpha.7` package in `vendor/`, pinned by `package-lock.json`. It uses the shared header, light/dark control, `wide-app` layout, Literata headings, Atkinson Hyperlegible Next UI type and theme-aware colours. Fonts are served with the app; their upstream licence texts are included in `public/licenses/` and copied unchanged into the build. No runtime font service is contacted. The archive includes the shared UI source and its MIT licence; a private registry or access to another repository is not needed to build Casebook.

The root project page uses the shared `landing` shell; the explorer at `/app/` keeps `wide-app`. Both explicitly select the shared `navigation="projects"` header: exactly Projects and GitHub, alongside the home wordmark and theme control. The landing screenshot is a cropped capture of the actual explorer using only the nine-row synthetic example, compressed as WebP and served locally. It is not a mock interface or a clinical export.

The archive SHA-256 is `d062371402bb538c008888255597349d5cf7425d5bb51e399f7b3cf97b69ef76`. This repository owns the Casebook integration; other consumers are verified separately. The header does not mark a sibling current; Projects returns to the main estate index.

## Verification status

The compatibility, CEPOD and scoped HTML-header changes pass **98 unit/integration tests and 77 Chromium browser tests**, plus TypeScript checking and the production build through `npm run check`. `git diff --check` passes. The 23 importer compatibility tests were also verified under `TZ=Pacific/Kiritimati` and `TZ=America/Los_Angeles` for the compatibility release.

Independent read-only review passed after fixes for textual-date coercion and colliding CEPOD display labels. Both findings have unit and browser regressions; no blocking findings remain. This is a code-review result, not a security certification.

Coverage includes:

- Exact header-name matching after reordered/inserted columns, the 128-column boundary, missing/duplicate heading diagnostics, title-row refusal and excluded-field sentinels absent from retained state and search. Extra columns remain covered by formula guards and duplicate comparisons.
- Excel 1900/1904 date systems, fractional serials near midnight and date-only filtering without timezone shifts. Ordinary text dates and unformatted numeric dates remain invalid. OOXML `t="d"` textual-date cells, including offset-bearing and ambiguous values in required or excluded columns, cause content-free refusal before parsing. Browser tests verify that refused replacements clear stale results. OLE rejection uses encrypted-or-legacy wording rather than asserting every OLE file is encrypted.
- CEPOD text, whitespace, unknown synthetic values, numeric/text identity, blanks and invalid types. Type markers distinguish a numeric `7`, text `7 (number)` and literal missing-label text without changing their source values. Browser checks combine CEPOD with hospital, month, procedure, supervision and search, retain duplicate rows, then reset, clear, replace and reload.
- Both built entrypoints, landing-to-app navigation, nested-route example download, exact chart-to-source drill-down and available-versus-selected counts. Missing and unfamiliar labels, long category lists, single/empty charts, invalid/reversed date recovery and keyboard activation remain covered.
- Bars/Pie switching, immediate count updates, reduced-motion changes, native-API fallback and cancellation during rapid switch/clear/replacement or overlapping chart transitions.
- Actual theme control, cookie precedence, blocked-storage fallback, reload, rendered text/focus checks and responsive containment. The new CEPOD journeys exercise 1440px, 390px and 320px in both themes; CEPOD fills its own row on narrow screens. The phone density budget explicitly includes this added row rather than reducing shared typography or control sizes.
- No upload/fetch/XHR or external asset requests in the exercised import/filter journeys; only the approved theme preference persists. No workbook data, filters or chart choices are retained after reload. Licence/notice distribution, the Pages header artifact, its synthetic workflow under HTTP headers and iframe refusal remain covered.
- The scoped `no-transform` regressions first failed against the previous header artifact, then passed with overrides for `/` and `/app/` only. The tests check the unchanged CSP, absence of the cache override on built assets, and browser-visible HTML headers. This test fixture applies the built rules locally; actual Cloudflare injection suppression requires the separate live checks in [Deployment](deployment.md).

The landing evidence is a refreshed 1440 × 1080 crop of the actual synthetic light-mode explorer, including CEPOD. Screenshots are synthetic; no private export was used for these changes. These local Chromium checks do not establish live-deployment, Firefox or physical-device behaviour. Synthetic tests are not clinical validation, a full accessibility audit or security certification. Fresh-export compatibility and larger-file performance remain unvalidated.
