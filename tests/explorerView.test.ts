import { describe, expect, it } from 'vitest';
import { buildExplorerView } from '../src/explorerView';
import { type Filters, type ProcedureRow } from '../src/logbook';

function row(sourceRow: number, overrides: Partial<ProcedureRow> = {}): ProcedureRow {
  return { sourceRow, date: '2026-02-17', dateRaw: '2026-02-17', dateIssue: null,
    operation: 'Synthetic A', supervision: 'Performed', hospital: 'North', cepod: 7,
    validation: 'Confirmed', duplicate: false, unknownRole: false, ...overrides };
}
const rows = [
  row(2, { duplicate: true }), row(3, { duplicate: true }),
  row(4, { supervision: 'Assisting' }),
  row(5, { date: '2026-01-12', dateRaw: '2026-01-12' }),
  row(6, { operation: 'Synthetic B' }), row(7, { hospital: 'South' }),
  row(8, { cepod: '7' }), row(9, { validation: 'Provisional' }),
];
const rawFilters: Filters = { from: '01/01/2026', to: '28/02/2026', month: '2026-02',
  procedure: 'Synthetic A', role: '"Performed"', hospital: 'North', cepod: 7, query: 'CONFIRMED' };
const ids = (values: ProcedureRow[]) => values.map(value => value.sourceRow);
const scopeIds = (view: ReturnType<typeof buildExplorerView>) => ({
  selected: ids(view.selected), role: ids(view.contexts.role),
  month: ids(view.contexts.month), procedure: ids(view.contexts.procedure),
});

describe('explorer composition (small, pure)', () => {
  it('uses all filters for source rows and excludes only each chart’s own dimension', () => {
    expect(scopeIds(buildExplorerView(rows, rawFilters))).toEqual({
      selected: [2, 3], role: [2, 3, 4], month: [2, 3, 5], procedure: [2, 3, 6],
    });
  });

  it('normalizes raw UK bounds without rewriting the authored inputs or category identity', () => {
    const view = buildExplorerView(rows, rawFilters);
    expect(view.from).toBe('2026-01-01');
    expect(view.to).toBe('2026-02-28');
    expect(view.effectiveFilters).toEqual({ ...rawFilters, from: '2026-01-01', to: '2026-02-28' });
    expect(view).toMatchObject({ invalidDates: false, invalidRange: false, datesBlocked: false, incompleteDate: false });
    expect(rawFilters.from).toBe('01/01/2026');
  });

  it('keeps open bounds and every row, including missing and invalid dates, on reset', () => {
    const input = [...rows, row(10, { date: null, dateRaw: null, dateIssue: 'missing' }),
      row(11, { date: null, dateRaw: 'not a date', dateIssue: 'invalid' })];
    const view = buildExplorerView(input, {});
    expect(view.from).toBe('');
    expect(view.to).toBe('');
    expect(view.effectiveFilters).toEqual({ from: '', to: '' });
    for (const result of [view.selected, ...Object.values(view.contexts)]) expect(result).toEqual(input);
    expect(view.datesBlocked).toBe(false);
  });

  it.each([
    { from: '17/02/2026', to: '17/02/2026' },
    { from: '17/02/2026' },
    { to: '17/02/2026', month: '2026-02' },
  ])('applies inclusive dates, excluding unusable dates from every chart: %j', bounds => {
    const input = [row(2), row(3, { date: null, dateRaw: '17/02/2026', dateIssue: 'invalid' })];
    expect(scopeIds(buildExplorerView(input, bounds))).toEqual({ selected: [2], role: [2], month: [2], procedure: [2] });
  });

  it.each([
    [{ from: '01/0' }, true, false],
    [{ to: 'bad' }, true, false],
    [{ from: '31/02/2026' }, false, false],
    [{ to: '2026-02-17' }, false, false],
    [{ from: ' 17/02/2026' }, false, false],
    [{ from: '01/03/2026', to: '28/02/2026' }, false, true],
  ] as [Filters, boolean, boolean][])('blocks all scopes for invalid or incomplete raw dates: %j', (filters, incompleteDate, invalidRange) => {
    const view = buildExplorerView(rows, filters);
    expect(scopeIds(view)).toEqual({ selected: [], role: [], month: [], procedure: [] });
    expect(view).toMatchObject({ datesBlocked: true, incompleteDate, invalidRange, invalidDates: !invalidRange });
  });

  const exactRows = [
    row(20, { operation: null, hospital: null, supervision: null, cepod: null, date: null, dateRaw: null, dateIssue: 'missing' }),
    row(21, { operation: 'Missing procedure', hospital: 'Missing hospital', supervision: 'Missing supervision', unknownRole: true, cepod: 'Missing CEPOD' }),
    row(22, { operation: ' Synthetic A ', hospital: ' North ', supervision: ' Performed ', unknownRole: true, cepod: '7', date: null, dateRaw: 'invalid synthetic date', dateIssue: 'invalid' }),
    row(23),
  ];
  it.each([
    [{ procedure: null, hospital: null, role: 'null', cepod: null, month: null }, [20]],
    [{ procedure: 'Missing procedure', hospital: 'Missing hospital', role: '"Missing supervision"', cepod: 'Missing CEPOD' }, [21]],
    [{ procedure: ' Synthetic A ', hospital: ' North ', role: '" Performed "', cepod: '7' }, [22]],
    [{ procedure: 'Synthetic A', hospital: 'North', role: '"Performed"', cepod: 7 }, [23]],
    [{ procedure: 'synthetic a' }, []],
    [{ month: null }, [20, 22]],
    [{ query: 'INVALID SYNTHETIC DATE' }, [22]],
  ] as [Filters, number[]][])('preserves missing, literal, whitespace and typed labels: %j', (filters, expected) => {
    expect(ids(buildExplorerView(exactRows, filters).selected)).toEqual(expected);
  });

  it('keeps missing categories distinct in each chart context, not just the table', () => {
    expect(scopeIds(buildExplorerView(exactRows, { procedure: null, role: 'null', month: null }))).toEqual({
      selected: [20], role: [20], month: [20], procedure: [20],
    });
    expect(scopeIds(buildExplorerView(exactRows, { procedure: null }))).toEqual({
      selected: [20], role: [20], month: [20], procedure: [20, 21, 22, 23],
    });
  });

  it('retains the original row objects, order and duplicate flags without mutating inputs', () => {
    const input = rows.map(value => Object.freeze({ ...value }));
    Object.freeze(input);
    const filters = Object.freeze({ ...rawFilters });
    const before = JSON.stringify({ input, filters });
    const view = buildExplorerView(input, filters);
    expect(view.selected[0]).toBe(input[0]);
    expect(view.selected[1]).toBe(input[1]);
    expect(view.selected.map(value => value.duplicate)).toEqual([true, true]);
    for (const context of Object.values(view.contexts)) {
      for (const value of context) expect(value).toBe(input.find(original => original.sourceRow === value.sourceRow));
    }
    expect(JSON.stringify({ input, filters })).toBe(before);
  });

  it('returns empty scopes for an empty workbook without fabricated rows', () => {
    expect(scopeIds(buildExplorerView([], {}))).toEqual({ selected: [], role: [], month: [], procedure: [] });
  });
});
