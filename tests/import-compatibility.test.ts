import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { HEADINGS, USED_HEADINGS, importWorkbook, aggregateCepod, formatCepod, filterRows } from '../src/logbook';

// Reuse only the public synthetic package shell; author worksheet cells independently.
const shell = new Uint8Array(readFileSync(new URL('../public/synthetic-logbook.xlsx', import.meta.url)));
const column = (index: number): string => index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26);
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const dateCell = (serial: number) => ({ serial });
type Value = string | number | boolean | null | { serial: number };
function workbook(headings: Value[] = HEADINGS, rows: Value[][] = [], epoch1904 = false): Uint8Array {
  const files = unzipSync(shell);
  const xml = [headings, ...rows].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
    const ref = `${column(c)}${r + 1}`;
    if (v === null) return '';
    if (typeof v === 'object') return `<c r="${ref}" s="1"><v>${v.serial}</v></c>`;
    if (typeof v === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escape(v)}</t></is></c>`;
    return `<c r="${ref}"${typeof v === 'boolean' ? ' t="b"' : ''}><v>${Number(v)}</v></c>`;
  }).join('')}</row>`).join('');
  files['xl/worksheets/sheet1.xml'] = strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`);
  files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']).replace('date1904="0"', `date1904="${Number(epoch1904)}"`));
  return zipSync(files);
}
function record(cepod: Value = null): Value[] {
  const values: Value[] = HEADINGS.map(() => null);
  values[0] = dateCell(46027); values[1] = 'Synthetic operation'; values[2] = 'Synthetic hospital';
  values[7] = cepod; values[8] = 'Performed'; values[21] = 'Confirmed';
  return values;
}

describe('bounded header compatibility', () => {
  it('matches exact required names after reordering and inserted extras, retaining only safe metadata', async () => {
    const headings = ['PRIVATE_HEADING', ...HEADINGS.slice().reverse(), 'OTHER_PRIVATE_HEADING'];
    const source = ['PRIVATE_VALUE', ...record(' Synthetic category ').reverse(), 'OTHER_PRIVATE_VALUE'];
    const result = await importWorkbook(workbook(headings, [source]));
    expect(result.rows[0]).toMatchObject({ date: '2026-01-05', operation: 'Synthetic operation', hospital: 'Synthetic hospital', supervision: 'Performed', validation: 'Confirmed', cepod: ' Synthetic category ' });
    expect(result.ignoredColumns).toBe(2);
    expect(result.headings).toEqual(HEADINGS);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(filterRows(result.rows, { query: 'PRIVATE' })).toEqual([]);
  });
  it.each([true, false])('compares ignored extra values for duplicate detection (labelled %s)', async labelled => {
    const headings = [...HEADINGS, labelled ? 'PRIVATE_HEADER' : null];
    const result = await importWorkbook(workbook(headings, [[...record(), 'PRIVATE_A'], [...record(), 'PRIVATE_B'], [...record(), 'PRIVATE_A']]));
    expect(result.rows.map(r => r.duplicate)).toEqual([true, false, true]);
    expect(result.ignoredColumns).toBe(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('maps required columns around an inserted unlabelled column without shifting values', async () => {
    const headings: Value[] = [...HEADINGS]; headings.splice(7, 0, null);
    const source = record(7); source.splice(7, 0, 'PRIVATE_INSERT');
    const result = await importWorkbook(workbook(headings, [source]));
    expect(result.rows[0]).toMatchObject({ cepod: 7, supervision: 'Performed', validation: 'Confirmed' });
    expect(result.ignoredColumns).toBe(1);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_INSERT');
  });
  it('rejects duplicate required names even when none are missing', async () => {
    await expect(importWorkbook(workbook([...HEADINGS, 'CEPOD']))).rejects.toThrow('Duplicate required headings: CEPOD.');
  });
  it('keeps formula guards active in ignored extra columns', async () => {
    const files = unzipSync(workbook([...HEADINGS, 'PRIVATE_EXTRA'], [[...record(), 'PRIVATE_VALUE']]));
    const path = 'xl/worksheets/sheet1.xml';
    files[path] = strToU8(strFromU8(files[path]).replace(/<c r="W2".*?<\/c>/, '<c r="W2"><f>1+1</f><v>2</v></c>'));
    await expect(importWorkbook(zipSync(files))).rejects.toThrow('formulas');
  });
  it('allows actual column 128, including unlabelled data, and rejects column 129', async () => {
    const row = record(); while (row.length < 127) row.push(null); row.push('PRIVATE_BOUND');
    const result = await importWorkbook(workbook(HEADINGS, [row]));
    expect(result.ignoredColumns).toBe(106);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BOUND');
    await expect(importWorkbook(workbook(HEADINGS, [[...row, 'PRIVATE_OVER_BOUND']]))).rejects.toThrow('128');
  });
  it('reports only allowlisted heading names and unknown nonempty count on missing or duplicated headings', async () => {
    const headings = [...HEADINGS]; headings[0] = 'PRIVATE_FIRST_ROW'; headings[1] = 'Hospital';
    try { await importWorkbook(workbook(headings)); expect.fail('must reject'); }
    catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('Expected headings:');
      expect(message).toContain('Recognized headings found:');
      expect(message).toContain('Missing required headings: Operation Date, Operation.');
      expect(message).toContain('Duplicate required headings: Hospital.');
      expect(message).toContain('Unknown nonempty columns: 1.');
      expect(message).not.toContain('PRIVATE_FIRST_ROW');
    }
  });
  it('never scans later rows for a header when row 1 is empty or a private title', async () => {
    for (const row1 of [[], ['PRIVATE_TITLE']]) {
      await expect(importWorkbook(workbook(row1, [HEADINGS, record()]))).rejects.toThrow('row-1 headings');
    }
  });
  it('diagnoses OLE as encrypted or legacy, with actionable unencrypted xlsx guidance', async () => {
    await expect(importWorkbook(Uint8Array.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))).rejects.toThrow('Encrypted or legacy Excel');
    await expect(importWorkbook(Uint8Array.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))).rejects.toThrow('unencrypted .xlsx');
  });
});

describe('Excel calendar dates', () => {
  describe.each(['2026-01-05T23:30:00-05:00', '01/05/2026 12:30'])('textual date %s', value => {
    it.each(['A2', 'W2'])('rejects OOXML textual dates in required or ignored cell %s without exposing values', async ref => {
      const files = unzipSync(workbook([...HEADINGS, 'SYNTHETIC_EXTRA'], [[...record(), 'SYNTHETIC_VALUE']]));
      const path = 'xl/worksheets/sheet1.xml';
      files[path] = strToU8(strFromU8(files[path]).replace(new RegExp(`<c r="${ref}".*?</c>`), `<c r="${ref}" t="d"><v>${value}</v></c>`));
      const result = importWorkbook(zipSync(files));
      await expect(result).rejects.toThrow('Textual date cells');
      await expect(result).rejects.not.toThrow(value);
    });
  });
  it.each([[false, '2026-01-05'], [true, '2030-01-06']] as const)('uses UTC calendar fields for date system 1904=%s', async (epoch, day) => {
    const rows = [46027, 46027.5, 46027.99999999, 46027.00000002].map(serial => { const r = record(); r[0] = dateCell(serial); return r; });
    const result = await importWorkbook(workbook(HEADINGS, rows, epoch));
    expect(result.rows.map(r => r.date)).toEqual([day, day, day, day]);
    expect(result.rows.map(r => r.dateIssue)).toEqual([null, null, null, null]);
    expect(result.dateTimeCount).toBe(3);
    expect(result.rows[0].dateRaw).toBe(`${day}T00:00:00.000Z`);
    expect(result.rows[1].dateRaw).toBe(`${day}T12:00:00.000Z`);
    expect(result.rows[2].dateRaw).toBe(`${day}T23:59:59.999Z`);
    expect(filterRows(result.rows, { from: day, to: day })).toHaveLength(4);
  });
  it('does not guess text dates or interpret unformatted numbers as dates', async () => {
    const rows = ['01/02/2026', '2026-01-05T12:00:00Z', 46027, null].map(v => { const r = record(); r[0] = v; return r; });
    const result = await importWorkbook(workbook(HEADINGS, rows));
    expect(result.rows.map(r => r.dateIssue)).toEqual(['invalid', 'invalid', 'invalid', 'missing']);
    expect(result.dateTimeCount).toBe(0);
  });
});

describe('raw CEPOD analysis', () => {
  it('distinguishes numeric, marker-like text and literal missing labels without changing raw identity', async () => {
    const values = [7, '7 (number)', 'Missing CEPOD', null, ' Category A '];
    const labels = ['7 (number)', '7 (number) (text)', 'Missing CEPOD (text)', 'Missing CEPOD', ' Category A  (text)'];
    expect(values.map(formatCepod)).toEqual(labels);
    const { rows } = await importWorkbook(workbook(HEADINGS, values.map(record)));
    expect(rows.map(row => row.cepod)).toEqual(values);
    const groups = aggregateCepod(rows);
    expect(new Set(groups.map(group => group.label)).size).toBe(values.length);
    values.forEach((value, index) => {
      expect(groups.find(group => group.key === JSON.stringify(value))).toEqual({ key: JSON.stringify(value), label: labels[index], count: 1, missing: value === null });
      expect(filterRows(rows, { cepod: value }).map(row => row.sourceRow)).toEqual([index + 2]);
    });
  });
  it('retains raw labels, numeric identity, missing values and all counts without guessing meanings', async () => {
    const values = ['Category A', ' Category A ', 'Unfamiliar synthetic category', 7, '7', null, 'Missing CEPOD', 7, 0, ''];
    const { rows } = await importWorkbook(workbook(HEADINGS, values.map(record)));
    expect(rows.map(r => r.cepod)).toEqual([...values.slice(0, -1), null]);
    expect(USED_HEADINGS).toContain('CEPOD');
    const groups = aggregateCepod(rows);
    expect(groups.reduce((n, g) => n + g.count, 0)).toBe(10);
    expect(groups.find(g => g.key === '7')).toEqual({ key: '7', label: '7 (number)', count: 2, missing: false });
    expect(groups.find(g => g.key === '"7"')).toEqual({ key: '"7"', label: '7 (text)', count: 1, missing: false });
    expect(groups.find(g => g.key === 'null')).toEqual({ key: 'null', label: 'Missing CEPOD', count: 2, missing: true });
    expect(groups.find(g => g.key === '"Missing CEPOD"')).toEqual({ key: '"Missing CEPOD"', label: 'Missing CEPOD (text)', count: 1, missing: false });
    for (const group of groups) expect(filterRows(rows, { cepod: JSON.parse(group.key) })).toHaveLength(group.count);
    expect(filterRows(rows, { cepod: undefined })).toEqual(rows);
    expect(filterRows(rows, { cepod: 0 }).map(r => r.sourceRow)).toEqual([10]);
    expect(filterRows(rows, { query: 'UNFAMILIAR SYNTHETIC CATEGORY' }).map(r => r.sourceRow)).toEqual([4]);
    expect(filterRows(rows, { cepod: 7, hospital: 'different' })).toEqual([]);
    expect(formatCepod(null)).toBe('Missing CEPOD');
    expect(formatCepod(7)).toBe('7 (number)');
    expect(formatCepod(' Category A ')).toBe(' Category A  (text)');
    expect(aggregateCepod([])).toEqual([]);
  });
  it.each([true, dateCell(46027), Infinity, -Infinity])('rejects unsupported CEPOD type %j without exposing cell values', async value => {
    await expect(importWorkbook(workbook(HEADINGS, [record(value)]))).rejects.toThrow('CEPOD');
  });
});
