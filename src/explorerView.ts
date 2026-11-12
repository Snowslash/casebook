import { parseUKDate } from './dates';
import { filterRows, type Filters, type ProcedureRow } from './logbook';

// Inputs keep the user's raw DD/MM/YYYY text; only filtering uses ISO days.
// The table applies every dimension. Each chart excludes only its own selection.
export function buildExplorerView(rows: ProcedureRow[], rawFilters: Filters) {
  const from = parseUKDate(rawFilters.from ?? '');
  const to = parseUKDate(rawFilters.to ?? '');
  const invalidDates = from === null || to === null;
  const invalidRange = !!(from && to && from > to);
  const datesBlocked = invalidDates || invalidRange;
  const incompleteDate = (from === null && (rawFilters.from ?? '').length < 10) || (to === null && (rawFilters.to ?? '').length < 10);
  const effectiveFilters = { ...rawFilters, from: from ?? undefined, to: to ?? undefined };

  return {
    from, to, effectiveFilters, invalidDates, invalidRange, datesBlocked, incompleteDate,
    selected: datesBlocked ? [] : filterRows(rows, effectiveFilters),
    contexts: {
      role: datesBlocked ? [] : filterRows(rows, { ...effectiveFilters, role: undefined }),
      month: datesBlocked ? [] : filterRows(rows, { ...effectiveFilters, month: undefined }),
      procedure: datesBlocked ? [] : filterRows(rows, { ...effectiveFilters, procedure: undefined }),
    },
  };
}
