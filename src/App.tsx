import { useEffect, useRef, useState } from 'react';
import { EstatePageTitle, EstateSectionTitle, EstateShell, PublicEstateHeader, useEstateTheme } from '@sangeev/estate-ui';
import { aggregateRoles, aggregateMonths, aggregateProcedures, aggregateHospitals, filterRows, HEADINGS, USED_HEADINGS, type Filters, type ImportedLogbook } from './logbook';
import { MAX_FILE_BYTES } from './workbookGuard';
import { parseUKDate } from './dates';
import CountChart, { type ChartView } from './CountChart';

const ukDate = (iso: string) => iso.split('-').reverse().join('/');
const missing = (value: string | null) => value === null ? <span className="muted">Not recorded</span> : value;
const optionValue = (value: string | null | undefined) => value === undefined ? '' : JSON.stringify(value);

export default function App() {
  const { theme, toggleTheme } = useEstateTheme();
  const [book, setBook] = useState<ImportedLogbook | null>(null);
  const [exploring, setExploring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>({});
  const [chartViews, setChartViews] = useState<{ procedure: ChartView; role: ChartView }>({ procedure: 'bars', role: 'bars' });
  const input = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterArea = useRef<HTMLDivElement>(null);
  const job = useRef<{ worker: Worker; timer: ReturnType<typeof setTimeout> } | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (preference.matches) filterArea.current?.getAnimations().forEach(animation => animation.cancel()); };
    preference.addEventListener('change', stop);
    return () => preference.removeEventListener('change', stop);
  }, []);

  function removeFilter(key: keyof Filters, button: HTMLButtonElement) {
    // Remove data immediately; feedback belongs to the remaining controls, not a stale chip.
    const area = filterArea.current;
    area?.getAnimations().forEach(animation => animation.cancel());
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      area?.animate([{ backgroundColor: getComputedStyle(area).getPropertyValue('--secondary').trim() }, { backgroundColor: 'transparent' }], { duration: 120, easing: 'ease-out' });
    }
    if (document.activeElement === button && button.nextElementSibling instanceof HTMLElement) button.nextElementSibling.focus({ preventScroll: true });
    changeFilter(key, undefined);
  }

  function clear() {
    generation.current++;
    if (job.current) { job.current.worker.terminate(); clearTimeout(job.current.timer); job.current = null; }
    setBook(null); setExploring(false); setLoading(false); setError(''); setFilters({});
    setChartViews({ procedure: 'bars', role: 'bars' });
    if (input.current) input.current.value = '';
  }
  async function openFile(file: File) {
    clear();
    const token = generation.current;
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Choose a native .xlsx export. .xls and CSV are not supported in this slice.'); return; }
    if (file.size > MAX_FILE_BYTES) { setError('File exceeds the 5 MiB limit. Nothing was imported.'); return; }
    setLoading(true);
    try {
      const bytes = await file.arrayBuffer();
      if (token !== generation.current) return;
      const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
      const finish = () => {
        worker.terminate();
        if (job.current) clearTimeout(job.current.timer);
        job.current = null; setLoading(false);
      };
      const timer = setTimeout(() => { finish(); setError('Import exceeded 10 seconds and was stopped. No data was retained.'); }, 10_000);
      job.current = { worker, timer };
      worker.onmessage = (event: MessageEvent<{ ok: boolean; result?: ImportedLogbook; error?: string }>) => {
        if (token !== generation.current) return;
        finish();
        if (event.data.ok && event.data.result) setBook(event.data.result);
        else setError(event.data.error ?? 'Could not read this workbook.');
      };
      worker.onerror = () => { if (token === generation.current) { finish(); setError('Could not read this workbook. Import stopped.'); } };
      worker.postMessage(bytes, [bytes]);
    } catch {
      if (token === generation.current) { setLoading(false); setError('Could not read this file. Nothing was imported.'); }
    }
  }

  const rows = book?.rows ?? [];
  const noDates = rows.filter(r => r.dateIssue).length;
  const noRoles = rows.filter(r => r.supervision === null).length;
  const unknown = rows.filter(r => r.unknownRole).length;
  const duplicates = rows.filter(r => r.duplicate).length;
  const noProcedure = rows.filter(r => r.operation === null).length;
  const noHospital = rows.filter(r => r.hospital === null).length;
  const from = parseUKDate(filters.from ?? '');
  const to = parseUKDate(filters.to ?? '');
  const invalidDates = from === null || to === null;
  const invalidRange = !!(from && to && from > to);
  const datesBlocked = invalidDates || invalidRange;
  const incompleteDate = (from === null && (filters.from ?? '').length < 10) || (to === null && (filters.to ?? '').length < 10);
  const effectiveFilters = { ...filters, from: from ?? undefined, to: to ?? undefined };
  const base = invalidDates || invalidRange ? [] : filterRows(rows, { ...effectiveFilters, role: undefined });
  const selected = invalidDates || invalidRange ? [] : filterRows(rows, effectiveFilters);
  const groups = aggregateRoles(base);
  const months = aggregateMonths(invalidDates || invalidRange ? [] : filterRows(rows, { ...effectiveFilters, month: undefined }));
  const procedureGroups = aggregateProcedures(invalidDates || invalidRange ? [] : filterRows(rows, { ...effectiveFilters, procedure: undefined }));
  const procedures = aggregateProcedures(rows).sort((a, b) => a.label.localeCompare(b.label));
  const hospitals = aggregateHospitals(rows).sort((a, b) => a.label.localeCompare(b.label));
  const selectedProcedures = new Set(selected.map(row => row.operation).filter(value => value !== null)).size;
  const selectedHospitals = new Set(selected.map(row => row.hospital).filter(value => value !== null)).size;
  const dates = selected.flatMap(row => row.date ? [row.date] : []).sort();
  const changeFilter = (key: keyof Filters, value: string | null | undefined) => setFilters(previous => ({ ...previous, [key]: value }));
  const selectCategory = (key: 'procedure' | 'hospital', value: string) => changeFilter(key, value === '' ? undefined : JSON.parse(value));
  const toggleCategory = (key: 'procedure' | 'month', value: string) => setFilters(previous => ({ ...previous, [key]: optionValue(previous[key]) === value ? undefined : JSON.parse(value) }));
  const activeFilters = [
    ...(from ? [{ key: 'from' as const, label: `From ${filters.from}` }] : []),
    ...(to ? [{ key: 'to' as const, label: `To ${filters.to}` }] : []),
    ...(filters.hospital !== undefined ? [{ key: 'hospital' as const, label: `Hospital: ${filters.hospital ?? 'Missing hospital'}` }] : []),
    ...(filters.procedure !== undefined ? [{ key: 'procedure' as const, label: `Procedure: ${filters.procedure ?? 'Missing procedure'}` }] : []),
    ...(filters.month !== undefined ? [{ key: 'month' as const, label: `Month: ${filters.month ?? 'Missing / invalid date'}` }] : []),
    ...(filters.role ? [{ key: 'role' as const, label: `Supervision: ${JSON.parse(filters.role) ?? 'Missing supervision'}` }] : []),
    ...(filters.query ? [{ key: 'query' as const, label: `Search: ${filters.query}` }] : []),
  ];
  const quality = <div className="quality" aria-label="Whole-file data quality">
    <span><b>{noDates}</b> missing / invalid dates</span><span><b>{noRoles}</b> missing supervision</span>
    <span><b>{unknown}</b> unfamiliar labels</span><span><b>{duplicates}</b> possible duplicate rows</span>
    {noProcedure > 0 && <span><b>{noProcedure}</b> missing procedures</span>}
    {noHospital > 0 && <span><b>{noHospital}</b> missing hospitals</span>}
  </div>;

  return <>
    <PublicEstateHeader current="casebook" theme={theme} onToggleTheme={toggleTheme}/>
    <EstateShell variant="wide-app" className="app-shell">
    <div className="topbar">
      <div className="identity"><span className="brand-mark" aria-hidden="true">CB</span><div><strong>Casebook</strong><span className="tagline">Explore your operative logbook</span></div></div>
      <div className="header-actions">
        {(book || loading || error) && <button className="quiet" onClick={clear}>Clear file</button>}
        <button className="primary estate-primary-action" onClick={() => input.current?.click()}>Open .xlsx <span aria-hidden="true">↗</span></button>
        <input hidden ref={input} type="file" accept=".xlsx" aria-label="Choose .xlsx file" onChange={event => { const file = event.target.files?.[0]; if (file) void openFile(file); }}/>
      </div>
    </div>

    <main>
      {error && <div className="error" role="alert">{error}</div>}
      {loading && <div className="loading" role="status">Reading workbook locally… <span>You can clear or replace it at any time.</span></div>}
      {!book && !loading && <section className="welcome">
        <div className="welcome-copy"><EstatePageTitle variant="app">Explore your eLogbook export</EstatePageTitle>
          <p className="lede">Open a workbook, filter by date, procedure or hospital, then inspect the entries behind each chart.</p>
          <button className="primary estate-primary-action" onClick={() => input.current?.click()}>Choose a workbook <span aria-hidden="true">→</span></button>
          <p className="welcome-privacy">No uploads. No saved working data.</p>
          <p className="small muted">Native .xlsx · one worksheet · up to 5 MiB</p>
          <a className="sample-link" href="/synthetic-logbook.xlsx" download>Download the wholly synthetic example</a>
          <p className="small muted">Open the example here to try it without your own data.</p>
        </div>
      </section>}

      {book && !exploring && <section className="preview panel">
        <EstatePageTitle variant="app">Review your import</EstatePageTitle>
        <p className="lede">One row is one logged procedure. Multiple procedures in a theatre session remain separate entries.</p>
        <div className="preview-summary"><strong data-testid="preview-count">{rows.length} logged procedures</strong><span>Sheet: <b>{book.sheet}</b></span><span>{book.headings.length} recognised headings</span></div>
        {quality}
        <p className="small">These flags describe the whole file. Nothing has been deduplicated or remapped. Possible duplicates have identical parsed values across all source columns, not necessarily the same clinical event.</p>
        <details className="columns"><summary>Review included and excluded fields</summary><p><b>Included:</b> {USED_HEADINGS.join(' · ')}.</p>
          <p><b>Excluded from display and search:</b> {HEADINGS.filter(h => !USED_HEADINGS.includes(h)).join(' · ')}.</p>
          <p>The parser temporarily reads the workbook. Only the included fields and row-quality flags enter the explorer. Workbook metadata and excluded values are not retained in its working state.</p></details>
        {rows.length === 0 && <p>No procedure rows were found. Open a workbook containing entries.</p>}
        <div className="preview-actions"><button className="primary estate-primary-action" disabled={!rows.length} onClick={() => setExploring(true)}>Explore procedures <span aria-hidden="true">→</span></button><span className="small muted">Original labels preserved. No competence score.</span></div>
      </section>}

      {book && exploring && <div className="explorer">
        <section className="section-heading"><div><EstatePageTitle variant="app">Recorded procedures</EstatePageTitle><p className="muted">{book.sheet} · {rows.length} imported entries</p></div><button className="quiet" onClick={() => setExploring(false)}>Review import</button></section>
        <section className="filters panel" aria-label="Filters">
          <label className="search-label">Search all views<input ref={searchInput} type="search" placeholder="Procedure, role, hospital, date…" value={filters.query ?? ''} onChange={e => changeFilter('query', e.target.value)}/></label>
          <label>From date<input type="text" aria-label="From date" placeholder="DD/MM/YYYY" maxLength={10} aria-invalid={from === null || invalidRange} aria-describedby={datesBlocked ? 'date-feedback' : undefined} value={filters.from ?? ''} onChange={e => changeFilter('from', e.target.value)}/></label>
          <label>To date<input type="text" aria-label="To date" placeholder="DD/MM/YYYY" maxLength={10} aria-invalid={to === null || invalidRange} aria-describedby={datesBlocked ? 'date-feedback' : undefined} value={filters.to ?? ''} onChange={e => changeFilter('to', e.target.value)}/></label>
          <label className="procedure-filter">Procedure<select aria-label="Procedure" value={optionValue(filters.procedure)} onChange={e => selectCategory('procedure', e.target.value)}><option value="">All procedures</option>{procedures.map(group => <option key={group.key} value={group.key}>{group.label}{group.missing ? ' (blank)' : ''}</option>)}</select></label>
          <label className="hospital-filter">Hospital<select aria-label="Hospital" value={optionValue(filters.hospital)} onChange={e => selectCategory('hospital', e.target.value)}><option value="">All hospitals</option>{hospitals.map(group => <option key={group.key} value={group.key}>{group.label}{group.missing ? ' (blank)' : ''}</option>)}</select></label>
        </section>
        {datesBlocked && <p id="date-feedback" className={incompleteDate ? 'filter-status' : 'error'} role={incompleteDate ? 'status' : 'alert'}>{incompleteDate ? 'Complete or clear the date filters to view results.' : invalidRange ? 'From date must not be after To date. Correct the range or reset filters.' : 'Enter a valid date in DD/MM/YYYY format, or leave it empty. Results are paused until the date is valid.'}</p>}
        <div ref={filterArea} className="active-filters" aria-label="Active filters">
          {activeFilters.length === 0 && !datesBlocked && <span className="muted">No active filters</span>}
          {activeFilters.map(filter => <button key={filter.key} className="chip selected" aria-label={`Remove ${filter.key === 'role' ? 'supervision' : filter.key} filter`} onClick={event => removeFilter(filter.key, event.currentTarget)}>{filter.label} <span aria-hidden="true">×</span></button>)}
          <button className="quiet filter-reset" onClick={() => setFilters({})}>Reset filters</button>
        </div>
        {!datesBlocked && <>
        {(from || to) && noDates > 0 && <p className="small muted">{noDates} whole-file rows have no usable date and are excluded while a date filter is active. Reset filters to inspect them.</p>}

        <aside className="selection" aria-label="Current selection">
          <div className="selection-summary">
            <div className="selection-count"><strong className="big-number" data-testid="match-count" aria-live="polite">{selected.length}</strong><span>selected {selected.length === 1 ? 'procedure' : 'procedures'}</span></div>
            <div className="summary-stat"><strong data-testid="procedure-count">{selectedProcedures}</strong><span>procedure {selectedProcedures === 1 ? 'label' : 'labels'}</span></div>
            <div className="summary-stat"><strong data-testid="hospital-count">{selectedHospitals}</strong><span>hospital {selectedHospitals === 1 ? 'label' : 'labels'}</span></div>
            <div className="summary-date"><span>Recorded dates</span><strong>{dates.length ? `${ukDate(dates[0])} – ${ukDate(dates[dates.length - 1])}` : 'No dated entries'}</strong></div>
            <a className="source-link" href="#source-rows">View source rows <span aria-hidden="true">↓</span></a>
          </div>
          <details className="quality-details"><summary>Whole-file data quality</summary>{quality}<p className="small muted">Missing labels are not included in the label totals. Flags do not remove rows. All validation statuses remain included. Identical rows may be legitimate separate entries.</p></details>
        </aside>

        <div className="overview-heading"><p>Select a chart category to filter.</p></div>
        <section className="analysis-grid" aria-label="Overview charts">
          <CountChart title="Monthly activity" dimension="Month" className="activity" groups={months} activeKey={optionValue(filters.month)} onSelect={key => toggleCategory('month', key)} monthly/>
          <CountChart title="Procedure mix" dimension="Procedure" className="procedure-chart" groups={procedureGroups} activeKey={optionValue(filters.procedure)} onSelect={key => toggleCategory('procedure', key)}
            view={chartViews.procedure} onViewChange={view => setChartViews(previous => ({ ...previous, procedure: view }))} categoryKeys={procedures.map(group => group.key)}/>
          <CountChart title="Supervision breakdown" dimension="Supervision" className="chart" groups={groups} activeKey={filters.role} onSelect={key => setFilters(previous => ({ ...previous, role: previous.role === key ? undefined : key }))} totalTestId="chart-total"
            view={chartViews.role} onViewChange={view => setChartViews(previous => ({ ...previous, role: view }))} categoryKeys={aggregateRoles(rows).map(group => group.key).sort()}/>
        </section>

        <section className="panel table-panel" id="source-rows"><div className="table-heading"><div><EstateSectionTitle>Included source rows</EstateSectionTitle><p className="small muted">{selected.length} matching {selected.length === 1 ? 'row' : 'rows'} · sheet {book.sheet}</p></div></div>
          <p className="small muted scroll-hint">Scroll horizontally to see all source columns.</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Source rows, scroll horizontally if needed"><table><caption className="sr-only">Logged procedures included in the current selection. Row numbers refer to the original sheet.</caption><thead><tr><th scope="col">Source row</th><th scope="col">Operation date</th><th scope="col">Procedure</th><th scope="col">Supervision</th><th scope="col">Hospital</th><th scope="col">Validation</th><th scope="col">Review flags</th></tr></thead><tbody>
          {selected.map(row => <tr key={row.sourceRow}><th scope="row">{row.sourceRow}</th><td>{row.date ? ukDate(row.date) : row.dateIssue === 'invalid' ? <><span className="flag">Invalid date</span><span className="raw-date">{row.dateRaw}</span></> : missing(null)}</td><td>{missing(row.operation)}</td><td>{missing(row.supervision)}</td><td>{missing(row.hospital)}</td><td>{missing(row.validation)}</td><td className="row-flags">{row.duplicate && <span className="flag">Possible duplicate</span>}{row.dateIssue && <span className="flag">{row.dateIssue === 'missing' ? 'Missing date' : 'Invalid date'}</span>}{row.supervision === null && <span className="flag">Missing supervision</span>}{row.unknownRole && <span className="flag">Unfamiliar label</span>}{row.operation === null && <span className="flag">Missing procedure</span>}{!row.duplicate && !row.dateIssue && row.supervision !== null && !row.unknownRole && row.operation !== null && <span className="muted">—</span>}</td></tr>)}
          </tbody></table></div>{selected.length === 0 && <div className="empty"><p>No included rows. Change or reset the active filters.</p>{filters.query && <button className="quiet" onClick={() => { changeFilter('query', undefined); searchInput.current?.focus(); }}>Clear search</button>} <button className="quiet" onClick={() => { setFilters({}); searchInput.current?.focus(); }}>Reset all filters</button></div>}
        </section>
        </>}
      </div>}
    </main>
    </EstateShell>
  </>;
}
