import { useLayoutEffect, useRef, useState } from "react";
import {
  EstatePageTitle,
  EstateSectionTitle,
  EstateShell,
  PublicEstateHeader,
  useEstateTheme,
  type EstatePage,
} from "@sangeev/estate-ui";
import "./project-page.css";

// The shared project page: the homepage card, picked up and opened. Copy this file and
// project-page.css unchanged into each project; only project.ts differs. No inline style
// attributes, so it works under a strict style-src policy.

export type ProjectShot = { src: string; alt: string; width: number; height: number; caption: string };

export type ProjectPageData = {
  /** The homepage card id, used for the back link. */
  key: string;
  name: string;
  /** The homepage card's tagline, word for word. */
  tagline: string;
  /** The homepage description, word for word. */
  description: string;
  why?: string;
  /** The first action is the coral one. Leave empty when there is nothing to open. */
  actions: { label: string; href: string }[];
  actionNote?: string;
  sourceHref: string;
  licencesHref?: string;
  /** Two or three short sentences, written plainly. */
  beforeYouUse: string[];
  shotsNote: string;
  shots: ProjectShot[];
  capabilities: [title: string, text: string][];
  limits: string;
};

/** Small line icons, inline so the template needs no icon package. */
const icons = {
  back: "M19 12H5M12 19l-7-7 7-7",
  out: "M7 17 17 7M7 7h10v10",
  close: "M18 6 6 18M6 6l12 12",
};

function Icon({ name, size = 16 }: { name: keyof typeof icons; size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name]} />
    </svg>
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Wait for this figure's animation, with a cancellable fallback for missing events. */
function afterAnimation(node: HTMLElement, name: string, ms: number, done: () => void) {
  const figure = node.querySelector("figure");
  let finished = false;
  const cancel = () => {
    finished = true;
    window.clearTimeout(timer);
    node.removeEventListener("animationend", onEnd);
  };
  const finish = () => {
    if (finished) return;
    cancel();
    done();
  };
  const onEnd = (event: AnimationEvent) => {
    if (event.target === figure && event.animationName === name && !event.pseudoElement) finish();
  };
  const timer = window.setTimeout(finish, ms);
  node.addEventListener("animationend", onEnd);
  return cancel;
}

/** A screenshot, held up close in a modal dialog. It lifts from, and drops back to, its print on the desk. */
function useHeldShot(shots: ProjectShot[]) {
  const dialog = useRef<HTMLDialogElement>(null);
  const prints = useRef<(HTMLButtonElement | null)[]>([]);
  const [held, setHeld] = useState<{ index: number } | null>(null);
  const pending = useRef<(() => void) | null>(null);

  const clearMotion = () => {
    pending.current?.();
    pending.current = null;
    dialog.current?.removeAttribute("data-lifting");
    dialog.current?.removeAttribute("data-dropping");
  };

  const liftFrom = (index: number) => {
    const node = dialog.current;
    const from = prints.current[index]?.getBoundingClientRect();
    if (!node || !from) return;
    const to = node.getBoundingClientRect();
    node.style.setProperty("--lift-x", `${from.left + from.width / 2 - (to.left + to.width / 2)}px`);
    node.style.setProperty("--lift-y", `${from.top + from.height / 2 - (to.top + to.height / 2)}px`);
    node.style.setProperty("--lift-s", `${Math.min(1, from.width / to.width)}`);
  };

  // Open once the held shot has rendered, so the lift is measured against the real dialog size.
  useLayoutEffect(() => {
    const node = dialog.current;
    if (held === null || !node || node.open) return;
    clearMotion();
    node.showModal();
    if (!reducedMotion()) {
      liftFrom(held.index);
      node.setAttribute("data-lifting", "");
      pending.current = afterAnimation(node, "print-lift", 600, clearMotion);
    }
    return () => {
      clearMotion();
      if (node.open) node.close();
    };
  }, [held]);

  const pickUp = (index: number) => {
    // A fresh cycle also handles the same print before native close is dispatched.
    if (!dialog.current?.open) setHeld({ index });
  };

  const putDown = () => {
    const node = dialog.current;
    if (!node?.open || node.hasAttribute("data-dropping")) return;
    clearMotion();
    if (reducedMotion() || held === null) {
      node.close();
      return;
    }
    liftFrom(held.index);
    node.setAttribute("data-dropping", "");
    pending.current = afterAnimation(node, "print-lift", 360, () => {
      clearMotion();
      node.close();
    });
  };

  const onClosed = () => {
    // A native close event may arrive after the next opening.
    if (dialog.current?.open) return;
    clearMotion();
    setHeld(null);
  };

  return { dialog, prints, held: held === null ? null : shots[held.index], pickUp, putDown, onClosed };
}

export function ProjectPage({ project }: { project: ProjectPageData }) {
  const { theme, toggleTheme } = useEstateTheme();
  const { dialog, prints, held, pickUp, putDown, onClosed } = useHeldShot(project.shots);
  const homeHref = `https://sangeev.me/#${project.key}`;
  const [primary, ...secondary] = project.actions;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <PublicEstateHeader current={project.key as EstatePage} navigation="projects" theme={theme} onToggleTheme={toggleTheme} />
      <div className="project-desk">
        <EstateShell variant="landing">
          <main id="main-content" tabIndex={-1}>
            <a className="back-link" href={homeHref}><Icon name="back" size={15} /> All projects</a>

            <section className="opened" aria-labelledby="page-title">
              <div className="opened-card">
                <div className="opened-face">
                <EstatePageTitle id="page-title" variant="landing">
                  {project.name}<span className="title-stop">.</span>
                </EstatePageTitle>
                <p className="opened-tagline">{project.tagline}</p>
                <p className="opened-description">{project.description}</p>
                {project.why && <p className="opened-why">{project.why}</p>}
                <div className="opened-actions">
                  {primary && <a className="estate-primary-action" href={primary.href}>{primary.label}</a>}
                  {secondary.map((action) => (
                    <a key={action.href} className="opened-secondary" href={action.href}>{action.label}</a>
                  ))}
                  {project.actionNote && <p className="opened-note">{project.actionNote}</p>}
                  <a className="opened-source" href={project.sourceHref}>
                    Source code and notes on GitHub<Icon name="out" size={15} />
                  </a>
                </div>
                </div>
              </div>

              <aside className="slip" aria-labelledby="before-title">
                <h2 id="before-title">Before you use it</h2>
                {project.beforeYouUse.map((line) => <p key={line}>{line}</p>)}
              </aside>
            </section>

            <section className="desk-section" aria-labelledby="shots-title">
              <div className="desk-heading">
                <EstateSectionTitle id="shots-title">See it working</EstateSectionTitle>
                <p>{project.shotsNote} Select one to look closer.</p>
              </div>
              <ul className="prints" role="list">
                {project.shots.map((shot, index) => (
                  <li key={shot.src} className={shot.width > shot.height ? "print print--wide" : "print"}>
                    <figure>
                      <button
                        type="button"
                        className="print-image"
                        ref={(node) => { prints.current[index] = node; }}
                        onClick={() => pickUp(index)}
                        aria-label={`Look closer: ${shot.caption}`}
                        aria-haspopup="dialog"
                      >
                        <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} />
                      </button>
                      <figcaption>{shot.caption}</figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </section>

            <section className="desk-section" aria-labelledby="capabilities-title">
              <div className="desk-heading">
                <EstateSectionTitle id="capabilities-title">What you can do</EstateSectionTitle>
              </div>
              <ul className="index-cards" role="list">
                {project.capabilities.map(([title, text]) => (
                  <li key={title} className="index-card">
                    <div className="index-face">
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="desk-section limits" aria-labelledby="limits-title">
              <EstateSectionTitle id="limits-title">What it won’t do</EstateSectionTitle>
              <p>{project.limits}</p>
            </section>
          </main>

          <footer className="desk-footer">
            <p>{project.name} · Maintained by Sangeev</p>
            <nav aria-label="Footer">
              <a href={project.sourceHref}>Source code and notes on GitHub</a>
              {project.licencesHref && <a href={project.licencesHref}>About &amp; licences</a>}
              <a href={homeHref}>← All projects</a>
            </nav>
          </footer>
        </EstateShell>
      </div>

      <dialog
        ref={dialog}
        className="held-print"
        data-wide={held && held.width > held.height ? "" : undefined}
        aria-label={held ? held.caption : undefined}
        onCancel={(event) => { event.preventDefault(); putDown(); }}
        onClose={onClosed}
        onClick={(event) => { if (event.target === event.currentTarget) putDown(); }}
      >
        {held && (
          <figure>
            <img src={held.src} alt={held.alt} width={held.width} height={held.height} />
            <figcaption>
              <span>{held.caption}</span>
              <button type="button" className="put-down" onClick={putDown} autoFocus>
                <Icon name="close" /> Put down
              </button>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
}
