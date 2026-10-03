import { expect, it } from 'vitest';
import { parseUKDate } from '../src/dates';
it.each([
  ['', ''], ['01/02/2026', '2026-02-01'], ['28/02/2026', '2026-02-28'],
  ['29/02/2028', '2028-02-29'], ['29/02/2026', null], ['31/04/2026', null],
  ['02/28/2026', null], ['2026-02-01', null], ['1/2/2026', null],
  ['01/02/26', null], ['00/01/2026', null], [' 01/02/2026 ', null],
])('parses an explicit UK date %j without locale guessing', (input, expected) => {
  expect(parseUKDate(input)).toBe(expected);
});
