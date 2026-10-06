import { EstateBoundary, EstateEvidenceFrame, EstatePageTitle, EstateSectionTitle, EstateShell, GitHubMark, PublicEstateHeader, useEstateTheme } from '@sangeev/estate-ui';
import overview from '../assets/casebook-overview.webp';

export default function LandingPage() {
  const { theme, toggleTheme } = useEstateTheme();
  return <>
    <PublicEstateHeader current="casebook" theme={theme} onToggleTheme={toggleTheme}/>
    <EstateShell variant="landing" className="casebook-landing">
      <main>
        <section className="hero" aria-labelledby="page-title">
          <div>
            <a className="back-link" href="https://sangeev.me/#projects"><span aria-hidden="true">←</span> Projects</a>
            <EstatePageTitle id="page-title" variant="landing">Casebook</EstatePageTitle>
            <p className="project-summary">Explore your operative logbook.</p>
            <p className="lede">Open an eLogbook export to see monthly activity, procedure mix and supervision. Filter the charts, then inspect the source rows behind each count.</p>
            <div className="hero-actions">
              <a className="estate-primary-action" href="./app/">Open Casebook <span aria-hidden="true">↗</span></a>
              <a className="estate-primary-action estate-icon-action" href="https://github.com/Snowslash/casebook" aria-label="Source on GitHub" title="Source on GitHub"><GitHubMark size={18}/></a>
            </div>
          </div>
          <EstateBoundary className="hero-boundary" label="Workbook privacy">
            <p>Workbook processing stays in browser memory. Casebook does not upload or save your workbook.</p>
            <p>Reloading or clearing the file removes the working data. Your theme preference is retained.</p>
            <p>Use the synthetic example to try it out. Keep clinical exports out of screenshots and issue reports.</p>
          </EstateBoundary>
        </section>
        <section className="evidence" aria-labelledby="evidence-title">
          <EstateSectionTitle id="evidence-title">The logbook overview</EstateSectionTitle>
          <EstateEvidenceFrame>
            <img src={overview} alt="Casebook with the wholly synthetic example: nine logged procedures, monthly activity, procedure mix and the original supervision labels." width="1440" height="1080"/>
          </EstateEvidenceFrame>
        </section>
        <section className="details" aria-labelledby="details-title">
          <EstateSectionTitle id="details-title">Explore what is recorded</EstateSectionTitle>
          <dl>
            <div><dt>Filter across views</dt><dd>Combine dates, procedures, hospitals and supervision. Search the retained fields without losing the chart context.</dd></div>
            <div><dt>Follow a count</dt><dd>Select a bar, pie slice or category label to see the exact included rows and their original sheet references.</dd></div>
            <div><dt>Keep the gaps visible</dt><dd>Missing values, unfamiliar labels and possible duplicate rows remain in view. Casebook does not merge or rename categories.</dd></div>
          </dl>
        </section>
        <section className="limits" aria-labelledby="limits-title">
          <EstateSectionTitle id="limits-title">Scope and limits</EstateSectionTitle>
          <p>One row is one logged procedure, not a unique patient, theatre case or measure of competence. Supervision labels stay as recorded.</p>
          <p>Casebook accepts the supported native .xlsx export layout: one worksheet, up to 5 MiB. It rejects unsupported files rather than guessing. It is an exploratory tool, not a validated clinical or portfolio assessment.</p>
          <a href="https://github.com/Snowslash/casebook#readme">Read the import requirements and project notes <span aria-hidden="true">↗</span></a>
        </section>
      </main>
    </EstateShell>
  </>;
}
