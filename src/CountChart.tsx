import { useEffect, useId, useRef, useState } from 'react';
import { EstateSectionTitle } from '@sangeev/estate-ui';
import type { CountGroup } from './logbook';
import { pieSegments } from './pie';
import { useChartTransition } from './useChartTransition';

export type ChartView = 'bars' | 'pie';
// Category graphics use the estate palette; labels/counts never rely on colour alone.
const PIE_COLOURS = ['var(--estate-coral)', 'var(--estate-shoal)', 'var(--estate-leaf)', 'var(--estate-atlas)', 'var(--estate-mist-soft)', 'var(--estate-channel)', 'color-mix(in srgb, var(--estate-coral) 70%, var(--estate-ink))', 'color-mix(in srgb, var(--estate-leaf) 70%, var(--estate-atlas))', 'var(--estate-mist)', 'color-mix(in srgb, var(--estate-coral) 40%, var(--estate-foam))', 'color-mix(in srgb, var(--estate-shoal) 70%, var(--estate-foam))', 'var(--estate-deep)'];

interface Props {
  title: string;
  dimension: 'Month' | 'Procedure' | 'Supervision';
  groups: (CountGroup & { unknown?: boolean })[];
  activeKey?: string;
  onSelect: (key: string) => void;
  className: string;
  monthly?: boolean;
  totalTestId?: string;
  view?: ChartView;
  onViewChange?: (view: ChartView) => void;
  categoryKeys?: string[];
}

export default function CountChart({ title, dimension, groups, activeKey, onSelect, className, monthly = false, totalTestId, view = 'bars', onViewChange, categoryKeys }: Props) {
  const viewId = useId();
  const motion = useChartTransition(view, `casebook-${dimension.toLowerCase()}`, JSON.stringify([activeKey, groups.map(group => [group.key, group.count])]));
  const isPie = !monthly && motion.view === 'pie';
  const scrollArea = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const area = scrollArea.current;
    if (!area) { setOverflows(false); return; }
    const measure = () => setOverflows(monthly ? area.scrollWidth > area.clientWidth + 1 : area.scrollHeight > area.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [groups, monthly, isPie]);
  const largest = groups.reduce((max, group) => Math.max(max, group.count), 1);
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const labelCounts = new Map<string, number>();
  for (const group of groups) labelCounts.set(group.label, (labelCounts.get(group.label) ?? 0) + 1);
  const groupLabel = (group: Props['groups'][number]) => `${group.label}: ${group.count} procedures${labelCounts.get(group.label)! > 1 ? group.missing ? ' · blank source value' : ' · recorded label' : ''}`;
  // The whole-file key order fixes colours while counts and ordering change under filters.
  const colours = new Map((categoryKeys ?? groups.map(group => group.key)).map((key, index) => [key, PIE_COLOURS[index % PIE_COLOURS.length]]));
  return <section className={`panel count-chart ${className}`} aria-label={title}>
    <div className="panel-heading"><EstateSectionTitle>{title}</EstateSectionTitle><span className="chart-denominator"><b data-testid={totalTestId}>{total}</b> available</span></div>
    {!monthly && onViewChange && <fieldset className="chart-view"><legend className="sr-only">{title} chart type</legend>
      <label><input type="radio" name={viewId} value="bars" checked={view === 'bars'} onChange={() => onViewChange('bars')}/>Bars</label>
      <label><input type="radio" name={viewId} value="pie" checked={view === 'pie'} onChange={() => onViewChange('pie')}/>Pie</label>
    </fieldset>}
    <p className="small muted chart-context">{monthly ? 'Months with entries, in date order.' : isPie ? 'Slices use the available total.' : 'Recorded labels, by count.'}{activeKey !== undefined && activeKey !== '' && <span className="chart-scope">{dimension} selection excluded.</span>}{overflows && <span className="chart-scroll-hint"> Scroll for more.</span>}</p>
    <div ref={motion.body} className="chart-body">{groups.length > 0 ? <>
    {isPie && <svg className="pie-chart" viewBox="0 0 220 220" role="group" aria-label={`${title} pie chart`}>
      {pieSegments(groups).map((segment, index) => <path key={segment.key} className="pie-slice" d={segment.path} fill={colours.get(segment.key)}
        role="button" tabIndex={0} aria-pressed={activeKey === segment.key} aria-label={`${groupLabel(groups[index])} · pie slice`}
        onClick={() => onSelect(segment.key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(segment.key); } }}>
        <title>{groupLabel(groups[index])}</title>
      </path>)}
    </svg>}
    <div ref={scrollArea} className={monthly ? 'month-scroll' : `bars${isPie ? ' pie-legend' : ''}${groups.length > 6 ? ' scrollable' : ''}`}>
      {groups.map(group => <button key={group.key}
        className={`${monthly ? 'month-column' : 'bar-row'} ${group.missing || group.unknown ? 'flagged' : ''}`}
        aria-pressed={activeKey === group.key} aria-label={groupLabel(group)}
        onClick={() => onSelect(group.key)}>
        {monthly ? <>
          <strong>{group.count}</strong>
          <span className="month-track" aria-hidden="true"><span style={{ transform: `scaleY(${group.count / largest})` }}/></span>
          <span className="month-label">{group.label}</span>
        </> : <>
          <span className="bar-label">{isPie && <span className="pie-key" style={{ backgroundColor: colours.get(group.key) }} aria-hidden="true"/>}{group.label}{group.unknown && <small>Unfamiliar label · kept as recorded</small>}{group.missing && <small>Blank source value · included</small>}</span>
          <strong>{group.count}</strong>{!isPie && <span className="bar-track" aria-hidden="true"><span style={{ transform: `scaleX(${group.count / largest})` }}/></span>}
        </>}
      </button>)}
    </div></> : <p className="empty">No procedures match these filters.</p>}</div>
  </section>;
}
