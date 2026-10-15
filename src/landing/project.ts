import type { ProjectPageData } from './ProjectPage';
import overview from '../assets/casebook-overview.webp';

// Everything on the project page that is specific to this project. The layout lives in ProjectPage.
export const project: ProjectPageData = {
  key: 'casebook',
  name: 'Casebook',
  tagline: 'Your surgical logbook, as charts',
  description: 'Turns your surgical logbook export into charts you can filter, and shows the exact entries behind every number.',
  why: 'A logbook export is a long spreadsheet, and it’s hard to see what it actually shows about your operating.',
  actions: [{ label: 'Open Casebook', href: './app/' }],
  sourceHref: 'https://github.com/Snowslash/casebook#readme',
  beforeYouUse: [
    'Try the made-up example first, and keep real logbook exports out of screenshots and bug reports.',
    'Your file is read in your browser and never uploaded or saved. Reload the page and it’s gone.',
    'It works with the standard spreadsheet you download from eLogbook, up to about 5 MB. Anything else is turned away rather than guessed at.',
  ],
  shotsNote: 'Casebook with a made-up example logbook.',
  shots: [
    {
      src: overview,
      alt: 'Casebook showing a made-up logbook of nine procedures: cases per month, the mix of procedures, and who supervised, as recorded.',
      width: 1440,
      height: 1080,
      caption: 'The made-up example: nine logged procedures, cases per month, the mix of procedures, and supervision as it was recorded.',
    },
  ],
  capabilities: [
    ['Filter everything at once', 'Narrow by date, procedure, hospital and supervision, or search, while the charts stay in view.'],
    ['See what’s behind a number', 'Click a bar, slice or label to see the exact logbook entries it counts, and where they sit in your original file.'],
    ['See the gaps too', 'Blank fields, unfamiliar labels and possible duplicates stay visible. Casebook doesn’t merge or rename anything.'],
  ],
  limits: 'One row is one logged procedure, not one patient, one theatre case or a measure of competence. It’s for exploring your logbook, not a validated clinical or portfolio assessment.',
};
