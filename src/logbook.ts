export type CepodValue = string | number | null;
export interface ProcedureRow {
  sourceRow: number; date: string | null; dateRaw: string | null;
  dateIssue: 'missing' | 'invalid' | null; operation: string | null;
  supervision: string | null; hospital: string | null; validation: string | null;
  duplicate: boolean; unknownRole: boolean; cepod: CepodValue;
}
export interface ImportedLogbook { sheet: string; rows: ProcedureRow[]; headings: string[]; ignoredColumns: number; dateTimeCount: number; }
export interface Filters { from?: string; to?: string; procedure?: string | null; hospital?: string | null; month?: string | null; role?: string; query?: string; cepod?: CepodValue; }
export interface CountGroup { key: string; label: string; count: number; missing: boolean; }
export interface RoleGroup { key: string; label: string; count: number; unknown: boolean; missing: boolean; }
import readExcelFile, { type CellValue } from 'read-excel-file/universal';
import { guardWorkbook, ImportError } from './workbookGuard';

export const HEADINGS = ['Operation Date', 'Operation', 'Hospital', 'Private', 'ASAGrade', 'Patient Years', 'Patient Days', 'CEPOD', 'Supervision', 'Consultant', 'Notes', 'Complication Notes', ...Array.from({ length: 7 }, (_, i) => `Specialty Parameter ${i + 1}`), 'Operation Side', 'Patient Sex', 'Validation Status'];
export const USED_HEADINGS = ['Operation Date', 'Operation', 'Supervision', 'Hospital', 'Validation Status', 'CEPOD'];
export const KNOWN_ROLES = ['Assisting', 'Supervised-trainer scrubbed', 'Supervised-trainer unscrubbed but in theatre', 'Performed'];

const empty = (value: unknown) => value === null || value === undefined || value === '';
function text(value: CellValue | null | undefined, row: number): string | null {
  if (empty(value)) return null;
  if (typeof value !== 'string') throw new ImportError(`Expected text in an analytical category at row ${row}. Import stopped; no values were logged.`);
  return value;
}

export async function importWorkbook(bytes: Uint8Array): Promise<ImportedLogbook> {
  try {
    guardWorkbook(bytes);
    const sheets = await readExcelFile(bytes.slice().buffer, { trim: false });
    const data = sheets[0].data;
    const header = data[0] ?? [];
    const positions = HEADINGS.map(name => header.flatMap((value, index) => value === name ? [index] : []));
    const missing = HEADINGS.filter((_, i) => positions[i].length === 0);
    const duplicates = HEADINGS.filter((_, i) => positions[i].length > 1);
    if (sheets.length !== 1 || missing.length || duplicates.length) {
      const recognized = HEADINGS.filter((_, i) => positions[i].length > 0);
      const unknown = header.filter(value => !empty(value) && !(typeof value === 'string' && HEADINGS.includes(value))).length;
      // Only fixed allowlisted names and counts may appear in diagnostics, never arbitrary cells.
      throw new ImportError(`The row-1 headings do not match the required export. Expected headings: ${HEADINGS.join(', ')}. Recognized headings found: ${recognized.join(', ') || 'none'}. Missing required headings: ${missing.join(', ') || 'none'}. Duplicate required headings: ${duplicates.join(', ') || 'none'}. Unknown nonempty columns: ${unknown}. Nothing was imported; headings must be in row 1.`);
    }
    const columns = new Map(HEADINGS.map((name, i) => [name, positions[i][0]]));
    const width = data.reduce((max, source) => Math.max(max, source.length), 0);
    let dateTimeCount = 0;
    const seen = new Map<string, ProcedureRow>();
    const rows: ProcedureRow[] = [];
    data.slice(1).forEach((source, index) => {
      if (source.every(empty)) return;
      const sourceRow = index + 2;
      const get = (name: string) => source[columns.get(name)!];
      const value = get('Operation Date');
      const validDate = value instanceof Date && Number.isFinite(value.getTime());
      // The reader floors numeric serials to UTC milliseconds (never round to the next day).
      // Slice the parsed UTC date, without applying the browser's local timezone.
      const day = validDate ? value.toISOString().slice(0, 10) : null;
      if (validDate && (value.getUTCHours() || value.getUTCMinutes() || value.getUTCSeconds() || value.getUTCMilliseconds())) dateTimeCount++;
      const supervision = text(get('Supervision'), sourceRow);
      const rawCepod = get('CEPOD');
      const cepod = empty(rawCepod) ? null : rawCepod;
      if (cepod !== null && typeof cepod !== 'string' && !(typeof cepod === 'number' && Number.isFinite(cepod))) {
        throw new ImportError(`Expected text, a finite number or a blank CEPOD value at row ${sourceRow}. Import stopped; no values were logged.`);
      }
      const row: ProcedureRow = {
        sourceRow, date: day,
        dateRaw: empty(value) ? null : value instanceof Date ? value.toISOString() : String(value),
        dateIssue: day ? null : empty(value) ? 'missing' : 'invalid',
        operation: text(get('Operation'), sourceRow), supervision, cepod,
        hospital: text(get('Hospital'), sourceRow), validation: text(get('Validation Status'), sourceRow),
        duplicate: false, unknownRole: supervision !== null && !KNOWN_ROLES.includes(supervision),
      };
      // Compare all parsed source values; retain only the duplicate flag, never this fingerprint.
      const fingerprint = JSON.stringify(Array.from({ length: width }, (_, i) => source[i] ?? null));
      const earlier = seen.get(fingerprint);
      if (earlier) { earlier.duplicate = true; row.duplicate = true; }
      else seen.set(fingerprint, row);
      rows.push(row);
    });
    return { sheet: sheets[0].sheet, headings: [...HEADINGS], rows, ignoredColumns: width - HEADINGS.length, dateTimeCount };
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('Could not read this workbook. Use an unencrypted .xlsx with the original export structure. No data was imported.');
  }
}

export function filterRows(rows: ProcedureRow[], filters: Filters): ProcedureRow[] {
  const { from, to, procedure, hospital, month, role, query, cepod } = filters;
  const search = query?.toLocaleLowerCase('en-GB') ?? '';
  return rows.filter(row =>
    (!from || (row.date !== null && row.date >= from)) &&
    (!to || (row.date !== null && row.date <= to)) &&
    (procedure === undefined || procedure === '' || row.operation === procedure) &&
    (hospital === undefined || row.hospital === hospital) &&
    (cepod === undefined || row.cepod === cepod) &&
    (month === undefined || (row.date?.slice(0, 7) ?? null) === month) &&
    (!role || JSON.stringify(row.supervision) === role) &&
    (!search || [row.sourceRow, row.date, row.date?.split('-').reverse().join('/') ?? null, row.dateRaw, row.operation, row.supervision, row.hospital, row.validation, row.cepod].some(value => value !== null && String(value).toLocaleLowerCase('en-GB').includes(search)))
  );
}

export function aggregateRoles(rows: ProcedureRow[]): RoleGroup[] {
  const groups = new Map<string, RoleGroup>();
  for (const row of rows) {
    const key = JSON.stringify(row.supervision);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, label: row.supervision ?? 'Missing supervision', count: 1, unknown: row.unknownRole, missing: row.supervision === null });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countGroups<T extends CepodValue>(rows: ProcedureRow[], value: (row: ProcedureRow) => T, label: (raw: T) => string): CountGroup[] {
  const groups = new Map<string, CountGroup>();
  for (const row of rows) {
    const raw = value(row);
    const key = JSON.stringify(raw);
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { key, label: label(raw), count: 1, missing: raw === null });
  }
  return [...groups.values()];
}

const countThenLabel = (a: CountGroup, b: CountGroup) => b.count - a.count || a.label.localeCompare(b.label);

export function formatCepod(value: CepodValue): string {
  return value === null ? 'Missing CEPOD' : typeof value === 'number' ? `${value} (number)` : `${value} (text)`;
}

export function aggregateCepod(rows: ProcedureRow[]): CountGroup[] {
  return countGroups(rows, row => row.cepod, formatCepod).sort(countThenLabel);
}

export function aggregateProcedures(rows: ProcedureRow[]): CountGroup[] {
  return countGroups(rows, row => row.operation, raw => raw ?? 'Missing procedure').sort(countThenLabel);
}

export function aggregateHospitals(rows: ProcedureRow[]): CountGroup[] {
  return countGroups(rows, row => row.hospital, raw => raw ?? 'Missing hospital').sort(countThenLabel);
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function aggregateMonths(rows: ProcedureRow[]): CountGroup[] {
  // Imported dates are canonical ISO days; unusable source dates have date:null.
  return countGroups(rows, row => row.date?.slice(0, 7) ?? null, raw =>
    raw === null ? 'Missing / invalid date' : `${MONTH_NAMES[Number(raw.slice(5, 7)) - 1]} ${raw.slice(0, 4)}`
  ).sort((a, b) => Number(a.missing) - Number(b.missing) || a.key.localeCompare(b.key));
}
