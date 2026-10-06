import { unzipSync, strFromU8 } from 'fflate';
import { Parser } from 'saxen';

export class ImportError extends Error {}
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_COLUMNS = 128;
const MAX_EXPANDED = 20 * 1024 * 1024;

// Inspect structure only. Never follow relationships, evaluate formulas or expose parser errors.
export function guardWorkbook(bytes: Uint8Array): void {
  if (bytes.length > MAX_FILE_BYTES) throw new ImportError('File exceeds the 5 MiB limit.');
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((value, index) => bytes[index] === value)) {
    throw new ImportError('Encrypted or legacy Excel containers are not supported. Open the file in Excel and save an unencrypted .xlsx copy, then select that copy. Nothing was imported.');
  }
  let total = 0;
  let entries = 0;
  const files = unzipSync(bytes, { filter: info => {
    total += info.originalSize;
    entries++;
    if (total > MAX_EXPANDED) throw new ImportError('Workbook exceeds the 20 MiB expanded-size limit.');
    if (entries > 128) throw new ImportError('Workbook has too many parts for this first slice.');
    if (/vba|externalLinks|embeddings/i.test(info.name)) throw new ImportError('Macros, embedded content and external links are not supported.');
    return true;
  }});
  if (!files['xl/workbook.xml'] || !files['[Content_Types].xml']) throw new ImportError('Could not read a standard .xlsx workbook.');
  if (Object.values(files).reduce((n, f) => n + f.length, 0) > MAX_EXPANDED) throw new ImportError('Workbook exceeds the 20 MiB expanded-size limit.');
  if (!strFromU8(files['[Content_Types].xml']).includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) {
    throw new ImportError('Only standard .xlsx workbooks are supported.');
  }
  let sheets = 0;
  let hidden = false;
  for (const [path, data] of Object.entries(files)) {
    if (!path.endsWith('.xml') && !path.endsWith('.rels')) continue;
    const xml = strFromU8(data);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ImportError('XML declarations with entities are not supported.');
    const parser = new Parser();
    parser.on('error', () => { throw new ImportError('Could not read workbook XML.'); });
    parser.on('warn', () => { throw new ImportError('Could not read workbook XML.'); });
    parser.on('openTag', (qualified, getAttrs, decode) => {
      const tag = qualified.split(':').pop();
      const attrs = Object.fromEntries(Object.entries(getAttrs()).map(([key, value]) => [key, decode(value)]));
      if (path === 'xl/workbook.xml' && tag === 'sheet') {
        sheets++;
        hidden ||= !!attrs.state && attrs.state !== 'visible';
      }
      if (tag === 'workbookPr' && attrs.date1904 && !['0', '1', 'false'].includes(attrs.date1904)) {
        throw new ImportError('Unsupported date-system flag; this slice accepts numeric 1900/1904 flags.');
      }
      if (tag === 'Relationship' && attrs.TargetMode?.toLowerCase() === 'external') throw new ImportError('Workbooks with external relationships are not supported.');
      if (path === 'xl/_rels/workbook.xml.rels' && tag === 'Relationship' && attrs.Type?.endsWith('/worksheet')) {
        // The reader follows these targets, not the ZIP directory convention.
        // Reject alternate/encoded spellings rather than normalizing them: every
        // accepted target must name an XML part covered by the checks below.
        if (!/^worksheets\/[A-Za-z0-9_-]+\.xml$/.test(attrs.Target ?? '')) {
          throw new ImportError('Unsupported worksheet package path; this slice requires canonical worksheets/*.xml targets.');
        }
      }
      if (path.startsWith('xl/worksheets/')) {
        if (tag === 'f') throw new ImportError('Workbooks containing formulas are not supported.');
        if (tag === 'mergeCell') throw new ImportError('Merged cells are not supported in the data sheet.');
        if ((tag === 'row' || tag === 'col') && ['1','true'].includes(attrs.hidden)) throw new ImportError('Hidden rows or columns are not supported.');
        if (tag === 'row' && (!/^\d+$/.test(attrs.r) || Number(attrs.r) > 20000 || Number(attrs.r) < 1)) throw new ImportError('Worksheet row limit is 20000.');
        if (tag === 'c') {
          if (attrs.t === 'd') throw new ImportError('Textual date cells are not supported. Use numeric Excel dates or date-times. Nothing was imported.');
          const match = /^([A-Z]+)([1-9]\d*)$/.exec(attrs.r ?? '');
          if (!match || Number(match[2]) > 20000) throw new ImportError('Worksheet row limit is 20000; explicit cell coordinates are required.');
          const column = [...match[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
          if (column > MAX_SOURCE_COLUMNS) throw new ImportError('Worksheet source column limit is 128.');
        }
      }
    });
    parser.parse(xml);
  }
  if (sheets !== 1 || hidden) throw new ImportError('This slice requires exactly one visible worksheet and no hidden sheets.');
}
