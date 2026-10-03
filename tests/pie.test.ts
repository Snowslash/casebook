import { describe, expect, it } from 'vitest';
import { pieSegments } from '../src/pie';
import type { CountGroup } from '../src/logbook';

const group = (key: string, count: number): CountGroup => ({ key, label: key, count, missing: false });

describe('pie geometry uses the exact available counts', () => {
  it('keeps original keys/order and partitions the full circle without regrouping', () => {
    const groups = [group('Recorded A', 8), group('Recorded B', 1)];
    const segments = pieSegments(groups);
    expect(segments.map(s => s.key)).toEqual(groups.map(g => g.key));
    expect(segments[0].start).toBe(0);
    expect(segments[0].end).toBeCloseTo(8 / 9);
    expect(segments[1].start).toBe(segments[0].end);
    expect(segments[1].end).toBe(1);
    expect(groups).toEqual([group('Recorded A', 8), group('Recorded B', 1)]);
  });
  it('uses two arcs so a single-category full circle is not an empty SVG arc', () => {
    const [segment] = pieSegments([group('Performed', 2)]);
    expect(segment.start).toBe(0);
    expect(segment.end).toBe(1);
    expect(segment.path.match(/ A /g)).toHaveLength(2);
    expect(segment.path).toContain('M 110 110 L 110 18');
    expect(segment.path).toContain('110 202');
    expect(segment.path).toMatch(/110 18 Z$/);
  });
  it('returns no geometry for an empty or zero-total chart', () => {
    expect(pieSegments([])).toEqual([]);
    expect(pieSegments([group('empty', 0)])).toEqual([]);
  });
  it('retains tiny categories and distinct blank/literal keys', () => {
    const segments = pieSegments([group('"Large"', 19998), group('null', 1), group('"Missing procedure"', 1)]);
    expect(segments).toHaveLength(3);
    expect(segments[1].end - segments[1].start).toBeCloseTo(1 / 20000, 10);
    expect(segments[2].end).toBe(1);
    expect(segments.every(s => !/NaN|Infinity/.test(s.path))).toBe(true);
  });
});
