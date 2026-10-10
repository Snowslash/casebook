# Casebook

Explore UK operative eLogbook `.xlsx` exports: monthly activity, procedure mix and supervision, with linked source rows. Filter by date, procedure, hospital or CEPOD and keep the original labels, missing values and possible duplicates visible. One row means one logged procedure, not a unique patient, theatre session or measure of competence.

[Open Casebook](https://casebook.sangeev.me/app/) · [Project page](https://casebook.sangeev.me/)

## Import a workbook

Extract the download, open the workbook in Excel, remove its opening password and save an unencrypted `.xlsx` copy to import. Keep the unencrypted copy secure. Review the import before exploring. To try Casebook without your own data, use the [wholly synthetic example](public/synthetic-logbook.xlsx).

Casebook requires one worksheet with the expected headings in row 1, in any order, and a file no larger than 5 MiB. Extra columns are ignored within a bounded limit. Unsupported structures fail visibly rather than being guessed. [Import requirements](docs/import-contract.md).

## Privacy

Workbook processing stays in browser memory. Casebook has no upload endpoint, analytics, accounts or automatic workbook retention. Only your light/dark preference is saved. The parser temporarily reads the workbook; only allowlisted analytical fields and row-quality/provenance information enter the explorer. Clear or reload removes the working state, but does not guarantee secure memory erasure.

Keep clinical exports out of screenshots, issue reports and this repository. There is no export, saved-session or procedure-grouping feature. This is an exploratory tool, not a validated clinical or portfolio assessment. [Usage and privacy details](docs/usage-and-privacy.md).

## Run locally

Use Node.js 22.23.0 or newer within Node 22 (`.node-version` pins 22.23.3) and npm.

```bash
npm ci --ignore-scripts
npm run build
npm run preview
```

Open **http://127.0.0.1:4173/app/**. The preview binds to loopback; do not expose it publicly. For editing, use `npm run dev` and reload manually because the CSP blocks hot reload. Run `npm run check` for tests, type checking, build and Chromium checks; install Chromium first with `npx playwright install chromium`. If port 4173 is in use, run the checks with `CASEBOOK_TEST_PORT=43173 npm run check` instead.

## Project notes

- [Synthetic acceptance fixture, test coverage and verification](docs/testing.md)
- [Parser contract and supported dates](docs/import-contract.md)
- [Cloudflare Pages settings](docs/deployment.md)
- [MIT licence](LICENSE) and [third-party notices](docs/usage-and-privacy.md#licence-and-third-party-notices)
