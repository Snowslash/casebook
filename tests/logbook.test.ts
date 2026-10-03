import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { importWorkbook, filterRows, aggregateRoles } from '../src/logbook';

const original = new Uint8Array(readFileSync(new URL('../public/synthetic-logbook.xlsx', import.meta.url)));
function modified(part: string, transform: (xml: string) => string): Uint8Array {
  const files = unzipSync(original);
  files[part] = strToU8(transform(strFromU8(files[part])));
  return zipSync(files);
}
const sheet = 'xl/worksheets/sheet1.xml';
const strings = 'xl/sharedStrings.xml';
function relocatedSheet(target: string, transform: (xml: string) => string): Uint8Array {
  const files = unzipSync(original);
  const destination = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  files[destination] = strToU8(transform(strFromU8(files[sheet])));
  delete files[sheet];
  const relationships = 'xl/_rels/workbook.xml.rels';
  files[relationships] = strToU8(strFromU8(files[relationships]).replace('Target="worksheets/sheet1.xml"', `Target="${target}"`));
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace(`PartName="/${sheet}"`, `PartName="/${destination}"`));
  return zipSync(files);
}

// Integration: real XLSX bytes; expected source rows are independent of implementation.
describe('synthetic workbook acceptance', () => {
  it('imports nine procedures, not the declared 352-row extent', async () => {
    const result = await importWorkbook(original);
    expect(result.sheet).toBe('OperationList');
    expect(result.rows.map(r => r.sourceRow)).toEqual([2,3,4,5,6,7,8,9,10]);
    expect(result.rows[0].date).toBe('2026-01-05');
    expect(result.rows[8].dateIssue).toBe('missing');
    expect(result.rows[5].supervision).toBeNull();
    expect(result.rows[6].unknownRole).toBe(true);
    expect(result.rows.filter(r => r.duplicate).map(r => r.sourceRow)).toEqual([5,6]);
  });
  it('filters, aggregates and drills down without deduplication', async () => {
    const { rows } = await importWorkbook(original);
    const filters = { from: '2026-02-01', to: '2026-02-28', procedure: 'Synthetic procedure A' };
    const selected = filterRows(rows, filters);
    expect(selected.map(r => r.sourceRow)).toEqual([3,4,5,6,7,8]);
    expect(Object.fromEntries(aggregateRoles(selected).map(g => [g.label, g.count]))).toEqual({
      'Supervised-trainer scrubbed': 1,
      'Supervised-trainer unscrubbed but in theatre': 1,
      'Performed': 2,
      'Missing supervision': 1,
      'Synthetic unknown role': 1,
    });
    expect(filterRows(rows, { ...filters, role: JSON.stringify('Performed') }).map(r => r.sourceRow)).toEqual([5,6]);
    expect(filterRows(rows, {}).length).toBe(9);
    expect(filterRows(rows, { query: 'unknown role' }).map(r => r.sourceRow)).toEqual([8]);
    expect(filterRows(rows, { query: '17/02/2026' }).map(r => r.sourceRow)).toEqual([5,6]);
    expect(filterRows(rows, { from: '2026-03-01', to: '2026-02-01' })).toEqual([]);
  });
  it('does not retain or search excluded fields', async () => {
    const data = modified(sheet, x => x.replace(/(<row r="3">.*?)(<\/row>)/, '$1<c r="K3" t="inlineStr"><is><t>PRIVATE_SENTINEL</t></is></c>$2'));
    const result = await importWorkbook(data);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SENTINEL');
    expect(filterRows(result.rows, { query: 'PRIVATE_SENTINEL' })).toEqual([]);
  });
  it('compares all source columns for duplicate candidates, not only retained fields', async () => {
    const data = modified(sheet, x => x.replace(/(<row r="6">.*?)(<\/row>)/, '$1<c r="K6" t="inlineStr"><is><t>Different synthetic note</t></is></c>$2'));
    const { rows } = await importWorkbook(data);
    expect(rows.filter(r => r.duplicate)).toEqual([]);
  });
  it('preserves row provenance across interior empty rows', async () => {
    const data = modified(sheet, x => x.replace(/<row r="4">.*?<\/row>/, '<row r="4"/>'));
    const { rows } = await importWorkbook(data);
    expect(rows.map(r => r.sourceRow)).toEqual([2,3,5,6,7,8,9,10]);
  });
  it('does not silently trim or merge labels', async () => {
    const data = modified(strings, x => x.replace('<t>Performed</t>', '<t xml:space="preserve"> Performed </t>'));
    const { rows } = await importWorkbook(data);
    expect(rows[3].supervision).toBe(' Performed ');
    expect(rows[3].unknownRole).toBe(true);
  });
  it('separates a literal missing-label string from an actually blank role', async () => {
    const data = modified(strings, x => x.replace('Synthetic unknown role', 'Missing supervision'));
    const { rows } = await importWorkbook(data);
    const groups = aggregateRoles(rows).filter(g => g.label === 'Missing supervision');
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map(g => g.key)).size).toBe(2);
  });
  it('keeps text dates visible but invalid instead of guessing locale', async () => {
    const data = modified(sheet, x => x.replace(/<c r="A2".*?<\/c>/, '<c r="A2" t="inlineStr"><is><t>01/02/2026</t></is></c>'));
    const { rows } = await importWorkbook(data);
    expect(rows[0].date).toBeNull();
    expect(rows[0].dateIssue).toBe('invalid');
    expect(rows[0].dateRaw).toBe('01/02/2026');
    expect(filterRows(rows, { from: '2026-01-01' }).some(r => r.sourceRow === 2)).toBe(false);
  });
  it('reads numeric dates under the 1904 date system', async () => {
    const data = modified('xl/workbook.xml', x => x.replace('date1904="0"', 'date1904="1"'));
    const { rows } = await importWorkbook(data);
    expect(rows[0].date).toBe('2030-01-06');
  });
});

describe('bounded import failures', () => {
  it.each([
    ['cached formula', (x: string) => x.replace(/<c r="I2".*?<\/c>/, '<c r="I2" t="str"><f>"Performed"</f><v>Performed</v></c>')],
    ['hidden row', (x: string) => x.replace('<row r="2">', '<row r="2" hidden="1">')],
    ['merged cells', (x: string) => x.replace('</worksheet>', '<mergeCells count="1"><mergeCell ref="B2:C2"/></mergeCells></worksheet>')],
  ] as const)('rejects a relocated worksheet with %s', async (_name, transform) => {
    await expect(importWorkbook(relocatedSheet('custom.xml', transform))).rejects.toThrow('Unsupported worksheet package path');
  });
  it.each([
    '/xl/custom.xml',
    './custom.xml',
    'worksheets/../custom.xml',
    'worksheets/%2e%2e/custom.xml',
    'worksheets/%73heet1.xml',
    'worksheets/nested/sheet1.xml',
  ])('rejects noncanonical worksheet target %s', async target => {
    await expect(importWorkbook(relocatedSheet(target, x => x))).rejects.toThrow('Unsupported worksheet package path');
  });
  it('rejects corrupt input with a content-free error', async () => {
    await expect(importWorkbook(strToU8('PRIVATE_SENTINEL'))).rejects.toThrow('Could not read');
  });
  it('rejects files above the compressed size bound', async () => {
    await expect(importWorkbook(new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toThrow('5 MiB');
  });
  it('rejects excessive uncompressed data before parsing', async () => {
    await expect(importWorkbook(zipSync({ 'huge.xml': new Uint8Array(21 * 1024 * 1024) }))).rejects.toThrow('20 MiB');
  });
  it('rejects a changed schema rather than silently reinterpreting it', async () => {
    await expect(importWorkbook(modified(strings, x => x.replace('<t>Operation</t>', '<t>Renamed</t>')))).rejects.toThrow('headings');
  });
  it('rejects hidden worksheets', async () => {
    await expect(importWorkbook(modified('xl/workbook.xml', x => x.replace('sheetId="1"', 'sheetId="1" state="hidden"')))).rejects.toThrow('visible worksheet');
  });
  it('rejects multiple sheets', async () => {
    await expect(importWorkbook(modified('xl/workbook.xml', x => x.replace('</sheets>', '<sheet name="Second" sheetId="2" r:id="rId2"/></sheets>')))).rejects.toThrow('one visible worksheet');
  });
  it('rejects formulas rather than trusting cached values', async () => {
    await expect(importWorkbook(modified(sheet, x => x.replace('<row r="2">', '<row r="2"><c r="K2"><f>1+1</f><v>2</v></c>')))).rejects.toThrow('formulas');
  });
  it('rejects external relationships without following them', async () => {
    await expect(importWorkbook(modified('xl/_rels/workbook.xml.rels', x => x.replace('</Relationships>', '<Relationship Id="rBad" Target="https://example.invalid" TargetMode="External"/></Relationships>')))).rejects.toThrow('external');
  });
  it('rejects huge row coordinates before the library allocates them', async () => {
    await expect(importWorkbook(modified(sheet, x => x.replaceAll('352', '1048576')))).rejects.toThrow('20000');
  });
  it('rejects an unexpected cell type in a categorical field', async () => {
    const data = modified(sheet, x => x.replace(/<c r="I2".*?<\/c>/, '<c r="I2"><v>4</v></c>'));
    await expect(importWorkbook(data)).rejects.toThrow('text');
  });
});
