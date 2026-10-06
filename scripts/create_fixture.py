"""Create the wholly synthetic acceptance workbook. Never reads a user export."""
from datetime import date
from html import escape
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
HEADERS = ['Operation Date', 'Operation', 'Hospital', 'Private', 'ASAGrade', 'Patient Years', 'Patient Days', 'CEPOD', 'Supervision', 'Consultant', 'Notes', 'Complication Notes', *[f'Specialty Parameter {i}' for i in range(1, 8)], 'Operation Side', 'Patient Sex', 'Validation Status']
ROWS = [
    ('2026-01-05', 'Synthetic procedure A', 'Assisting', 'Synthetic hospital North'),
    ('2026-02-03', 'Synthetic procedure A', 'Supervised-trainer scrubbed', 'Synthetic hospital North'),
    ('2026-02-10', 'Synthetic procedure A', 'Supervised-trainer unscrubbed but in theatre', 'Synthetic hospital South'),
    ('2026-02-17', 'Synthetic procedure A', 'Performed', 'Synthetic hospital North'),
    ('2026-02-17', 'Synthetic procedure A', 'Performed', 'Synthetic hospital North'),
    ('2026-02-20', 'Synthetic procedure A', None, 'Synthetic hospital South'),
    ('2026-02-24', 'Synthetic procedure A', 'Synthetic unknown role', None),
    ('2026-02-24', 'Synthetic procedure B', 'Assisting', 'Synthetic hospital South'),
    (None, 'Synthetic procedure A', 'Assisting', 'Synthetic hospital North'),
]
# Illustrative values only; numeric 7 has no asserted eLogbook meaning.
CEPOD = ['Synthetic category A', 'Synthetic category B', 'Synthetic category A',
         7, 7, None, 'Synthetic unfamiliar category', '7', 'Synthetic category A']
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
strings = list(dict.fromkeys(HEADERS + [v for row in ROWS for v in row[1:] if v]
                             + [v for v in CEPOD if isinstance(v, str)]))

def string_cell(address, value):
    return f'<c r="{address}" t="s"><v>{strings.index(value)}</v></c>'

sheet_rows = ['<row r="1">' + ''.join(string_cell(f'{chr(65+i)}1', h) for i, h in enumerate(HEADERS)) + '</row>']
for n, (day, operation, supervision, hospital) in enumerate(ROWS, 2):
    cells = ''
    if day:
        serial = (date.fromisoformat(day) - date(1899, 12, 30)).days
        cells += f'<c r="A{n}" s="1"><v>{serial}</v></c>'
    cells += string_cell(f'B{n}', operation)
    if hospital:
        cells += string_cell(f'C{n}', hospital)
    cepod = CEPOD[n - 2]
    if isinstance(cepod, str):
        cells += string_cell(f'H{n}', cepod)
    elif cepod is not None:
        cells += f'<c r="H{n}"><v>{cepod}</v></c>'
    if supervision:
        cells += string_cell(f'I{n}', supervision)
    sheet_rows.append(f'<row r="{n}">{cells}</row>')
sheet_rows.append('<row r="352"><c r="A352" s="1"/></row>')
parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
    '_rels/.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': f'<workbook xmlns="{NS}" xmlns:r="{REL}"><workbookPr date1904="0"/><sheets><sheet name="OperationList" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{REL}/styles" Target="styles.xml"/><Relationship Id="rId3" Type="{REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    'xl/styles.xml': f'<styleSheet xmlns="{NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="14" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/sharedStrings.xml': f'<sst xmlns="{NS}" uniqueCount="{len(strings)}">' + ''.join(f'<si><t>{escape(s)}</t></si>' for s in strings) + '</sst>',
    'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{NS}"><dimension ref="A1:V352"/><sheetData>' + ''.join(sheet_rows) + '</sheetData></worksheet>',
}
output = ROOT / 'public' / 'synthetic-logbook.xlsx'
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w') as archive:
    for name, text in parts.items():
        info = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        archive.writestr(info, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + text)
print(f'Created {output.name}: {len(ROWS)} wholly synthetic procedure rows; no private source read.')
