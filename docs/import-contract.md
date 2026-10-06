# Import contract

## Prepare a download

The [eLogbook FAQ](https://www.elogbook.org/support-help/elogbook-faqs) describes a ZIP containing a password-protected Excel workbook. Extract the download, open the workbook in Excel using its supplied password, remove its opening password and save an unencrypted `.xlsx` copy. Keep that copy secure. Casebook does not decrypt workbooks or import outer ZIP archives.

## Expected headings

The synthetic example uses one worksheet, `OperationList`, with these headings in row 1:

```text
Operation Date | Operation | Hospital | Private | ASAGrade | Patient Years | Patient Days | CEPOD | Supervision | Consultant | Notes | Complication Notes | Specialty Parameter 1 | Specialty Parameter 2 | Specialty Parameter 3 | Specialty Parameter 4 | Specialty Parameter 5 | Specialty Parameter 6 | Specialty Parameter 7 | Operation Side | Patient Sex | Validation Status
```

One row is one logged procedure, including separate rows for multiple procedures in one theatre session. There is no explicit case identifier. Worksheet extents can include formatted empty rows and are not record counts.

Recognised supervision labels are `Assisting`, `Supervised-trainer scrubbed`, `Supervised-trainer unscrubbed but in theatre` and `Performed`. This is not an exhaustive list; unfamiliar labels remain distinct.

## Limits and interpretation

This is a narrow parser contract, not a general spreadsheet viewer:
- One visible worksheet with a canonical `worksheets/<name>.xml` relationship target (letters, digits, underscores and hyphens in the name); relocated, encoded and other noncanonical package targets are rejected. Row 1 must contain each of the 22 exact expected headings once, in any order. Missing or duplicate expected headings stop import. Additional columns are accepted within a 128-column limit; their headings and values are not retained. Diagnostics show only recognised headings, missing/duplicate expected names and structural counts, never arbitrary first-row values. The worksheet name is preserved, not assumed to be a case identifier.
- Maximum 5 MiB input, 20 MiB declared expanded ZIP content, 128 package entries, source columns up to 128 and source row coordinates up to 20000. Import runs in a disposable worker with a 10-second cutoff. These are pragmatic resource limits, not a guarantee against every malicious file.
- Macros, embedded objects, external relationships, formulas, hidden rows/columns/sheets and merged cells are rejected visibly. No fallback to cached formula results or partial import.
- Numeric Excel date cells in the 1900 and 1904 systems are tested. The current parser accepts the usual numeric date-system flag; an explicit `date1904="true"` flag is rejected rather than misread by the dependency.
- Genuine Excel date-times use the workbook calendar date without a local-timezone conversion. The import preview reports how many contain a time component; time is ignored for date filtering and monthly counts. The parsed timestamp remains in the searchable `dateRaw` field; the table displays the calendar date. Text dates and numbers without date formatting remain invalid rather than being guessed. Rows without usable dates remain in the unfiltered view and are visibly excluded while date filters are active.
- OOXML textual-date cells (`t="d"`) are unsupported anywhere in the worksheet, including excluded columns. The workbook is rejected before the dependency can guess a textual date or shift an offset-bearing timestamp. This differs from ordinary text cells in Operation Date, which remain visible as invalid-date rows.
- Analytical categories must be text or blank, except CEPOD, which also accepts finite numeric values. CEPOD numbers remain distinct from text with the same characters; displays append “(number)” or “(text)” while retaining the original value and type. A numeric `7` and literal text `7 (number)` therefore remain distinguishable. No numeric meaning or elective/emergency mapping is inferred. Whitespace and spelling are preserved; there is no trimming, category normalisation or procedure merging.
- Possible duplicates compare all parsed source values before excluded fields are discarded. Flags are not proof of erroneous entries.
- Date placeholders specify `DD/MM/YYYY`, independently of browser locale, and impossible dates are rejected. Incomplete dates show a completion prompt; invalid or reversed dates show a correction message. In those states, summaries, charts and source rows are withheld rather than showing false zero-match results. Completing/clearing the input restores results under the other selections; valid filters with no matches still show an explicit empty result. Search accepts displayed UK dates as well as ISO dates and searches only retained analytical values. Chart selections narrow the table; each chart retains the other dimensions' context so its alternatives remain selectable.
- A failed replacement import clears the previous dataset, preventing stale results from looking like the newly selected file. Clear/reload removes the workbook's working state. Only the theme preference persists.
