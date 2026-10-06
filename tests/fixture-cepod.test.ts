import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { importWorkbook } from '../src/logbook';

it('the public synthetic example demonstrates CEPOD labels, numeric values, text numbers and missing values', async () => {
  const { rows } = await importWorkbook(new Uint8Array(readFileSync('public/synthetic-logbook.xlsx')));
  expect(rows.map(row => row.cepod)).toEqual([
    'Synthetic category A', 'Synthetic category B', 'Synthetic category A', 7, 7, null,
    'Synthetic unfamiliar category', '7', 'Synthetic category A',
  ]);
  expect(rows.filter(row => row.duplicate).map(row => row.sourceRow)).toEqual([5, 6]);
});
