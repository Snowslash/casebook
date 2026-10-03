import { describe, expect, it } from 'vitest';
import { aggregateHospitals, aggregateMonths, aggregateProcedures, filterRows, type Filters, type ProcedureRow } from '../src/logbook';

// Independently authored analytical rows; invalid source dates are represented by
// date:null/dateIssue:'invalid', as in the importer contract.
function row(sourceRow: number, overrides: Partial<ProcedureRow> = {}): ProcedureRow {
  return { sourceRow, date: '2026-01-12', dateRaw: '2026-01-12', dateIssue: null,
    operation: 'Alpha', hospital: 'North', supervision: 'Performed', validation: 'Confirmed',
    duplicate: false, unknownRole: false, ...overrides };
}
const rows = [
  row(2, { date: '2026-02-01', operation: 'Beta', duplicate: true }),
  row(3, { date: '2026-02-01', operation: 'Beta', duplicate: true }),
  row(4, { date: '2025-12-31', hospital: 'South', supervision: 'Assisting' }),
  row(5, { hospital: null, operation: null }),
  row(6, { hospital: 'Missing hospital', operation: 'Missing procedure', date: null, dateRaw: null, dateIssue: 'missing' }),
  row(7, { hospital: ' ', operation: ' ', date: null, dateRaw: 'not a date', dateIssue: 'invalid' }),
  row(8, { hospital: ' North ', operation: 'Alpha ', date: '2027-01-01' }),
  row(9, { hospital: '', date: '2026-01-31' }),
];

describe('exact overview filters', () => {
  it('selects an exact hospital rather than ignoring the new field', () => {
    expect(filterRows(rows, { hospital: 'South' })).toEqual([rows[2]]);
  });
  it.each([
    [null, [5]], ['Missing hospital', [6]], [' ', [7]], [' North ', [8]], ['', [9]], ['North', [2, 3]], ['north', []],
  ] as [string | null, number[]][])('keeps hospital %j distinct', (hospital, ids) => {
    expect(filterRows(rows, { hospital }).map(r => r.sourceRow)).toEqual(ids);
  });
  it('uses undefined hospital as all', () => {
    expect(filterRows(rows, { hospital: undefined })).toEqual(rows);
  });
  it('selects only null procedures for null, without treating it as all', () => {
    expect(filterRows(rows, { procedure: null })).toEqual([rows[3]]);
    expect(filterRows(rows, { procedure: '' })).toEqual(rows);
    expect(filterRows(rows, { procedure: undefined })).toEqual(rows);
    expect(filterRows(rows, { procedure: 'Missing procedure' })).toEqual([rows[4]]);
    expect(filterRows(rows, { procedure: ' ' })).toEqual([rows[5]]);
    expect(filterRows(rows, { procedure: 'Alpha ' })).toEqual([rows[6]]);
  });
  it('selects exact observed months and both kinds of unusable date', () => {
    expect(filterRows(rows, { month: '2026-02' })).toEqual(rows.slice(0, 2));
    expect(filterRows(rows, { month: null })).toEqual(rows.slice(4, 6));
    expect(filterRows(rows, { month: undefined })).toEqual(rows);
    expect(filterRows(rows, { month: '2026-03' })).toEqual([]);
    expect(filterRows(rows, { month: '' })).toEqual([]);
  });
  it('composes all dimensions with AND, retaining inclusive date bounds and source search', () => {
    const filters: Filters = { hospital: 'North', month: '2026-02', procedure: 'Beta', role: JSON.stringify('Performed'), query: 'CONFIRMED', from: '2026-02-01', to: '2026-02-01' };
    expect(filterRows(rows, filters)).toEqual(rows.slice(0, 2));
    for (const mismatch of [{ hospital: 'South' }, { month: '2026-01' }, { procedure: 'Alpha' }, { role: JSON.stringify('Assisting') }, { query: 'absent' }, { from: '2026-02-02' }, { to: '2026-01-31' }]) {
      expect(filterRows(rows, { ...filters, ...mismatch })).toEqual([]);
    }
    expect(filterRows(rows, { ...filters, query: '01/02/2026' })).toEqual(rows.slice(0, 2));
    expect(filterRows(rows, { month: null, query: 'not a date' })).toEqual([rows[5]]);
    expect(filterRows(rows, { month: null, from: '2025-01-01' })).toEqual([]);
  });
});

describe('overview count groups', () => {
  it('counts every procedure with exact labels, missing flag and JSON keys', () => {
    expect(aggregateProcedures(rows)).toEqual([
      { key: '"Alpha"', label: 'Alpha', count: 2, missing: false },
      { key: '"Beta"', label: 'Beta', count: 2, missing: false },
      { key: '" "', label: ' ', count: 1, missing: false },
      { key: '"Alpha "', label: 'Alpha ', count: 1, missing: false },
      { key: 'null', label: 'Missing procedure', count: 1, missing: true },
      { key: '"Missing procedure"', label: 'Missing procedure', count: 1, missing: false },
    ]);
  });
  it('sorts hospitals by descending count then label without merging placeholders', () => {
    expect(aggregateHospitals([row(1, { hospital: 'Zulu' }), row(2, { hospital: 'Alpha' }), row(3, { hospital: 'Zulu' }), row(4, { hospital: null }), row(5, { hospital: 'Missing hospital' })])).toEqual([
      { key: '"Zulu"', label: 'Zulu', count: 2, missing: false },
      { key: '"Alpha"', label: 'Alpha', count: 1, missing: false },
      { key: 'null', label: 'Missing hospital', count: 1, missing: true },
      { key: '"Missing hospital"', label: 'Missing hospital', count: 1, missing: false },
    ]);
  });
  it('orders only observed months chronologically across years, missing last', () => {
    expect(aggregateMonths(rows)).toEqual([
      { key: '"2025-12"', label: 'Dec 2025', count: 1, missing: false },
      { key: '"2026-01"', label: 'Jan 2026', count: 2, missing: false },
      { key: '"2026-02"', label: 'Feb 2026', count: 2, missing: false },
      { key: '"2027-01"', label: 'Jan 2027', count: 1, missing: false },
      { key: 'null', label: 'Missing / invalid date', count: 2, missing: true },
    ]);
  });
  it.each([
    ['procedure', aggregateProcedures, (r: ProcedureRow) => r.operation],
    ['hospital', aggregateHospitals, (r: ProcedureRow) => r.hospital],
    ['month', aggregateMonths, (r: ProcedureRow) => r.date?.slice(0, 7) ?? null],
  ] as const)('%s totals include duplicates and each clicked key selects exactly its category', (dimension, aggregate, value) => {
    const groups = aggregate(rows);
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(rows.length);
    for (const group of groups) {
      const raw = JSON.parse(group.key) as string | null;
      const selected = filterRows(rows, { [dimension]: raw });
      expect(selected).toEqual(rows.filter(r => value(r) === raw));
      expect(selected).toHaveLength(group.count);
    }
  });
  it('does not mutate rows, their order, flags, or filters', () => {
    const frozenRows = rows.map(r => Object.freeze({ ...r }));
    const before = JSON.stringify(frozenRows);
    Object.freeze(frozenRows);
    const filters = Object.freeze({ hospital: 'North', month: '2026-02' });
    aggregateProcedures(frozenRows);
    aggregateHospitals(frozenRows);
    aggregateMonths(frozenRows);
    expect(filterRows(frozenRows, filters)).toEqual(rows.slice(0, 2));
    expect(JSON.stringify(frozenRows)).toBe(before);
  });
  it('returns no fabricated groups for empty input', () => {
    expect(aggregateProcedures([])).toEqual([]);
    expect(aggregateHospitals([])).toEqual([]);
    expect(aggregateMonths([])).toEqual([]);
    expect(filterRows([], { hospital: null, month: null, procedure: null })).toEqual([]);
  });
});
