import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { importWorkbook } from '../src/logbook';

it('authors two synthetic hospital labels and a blank without changing the nine-row acceptance data', async () => {
  const { rows } = await importWorkbook(new Uint8Array(readFileSync('public/synthetic-logbook.xlsx')));
  expect(rows.map(row => [row.sourceRow, row.hospital])).toEqual([
    [2, 'Synthetic hospital North'], [3, 'Synthetic hospital North'],
    [4, 'Synthetic hospital South'], [5, 'Synthetic hospital North'],
    [6, 'Synthetic hospital North'], [7, 'Synthetic hospital South'],
    [8, null], [9, 'Synthetic hospital South'], [10, 'Synthetic hospital North'],
  ]);
  expect(rows.filter(row => row.duplicate).map(row => row.sourceRow)).toEqual([5, 6]);
});
