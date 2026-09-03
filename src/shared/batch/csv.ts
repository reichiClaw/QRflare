/**
 * RFC 4180 CSV parser/serializer (quotes, escaped quotes, embedded newlines,
 * CRLF). Dependency-free so it can run in the browser and in Web Workers.
 */

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export class CsvError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'CsvError';
  }
}

export function parseCsv(input: string, options: { delimiter?: string; maxRows?: number } = {}): CsvTable {
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let i = 0;

  while (i < text.length) {
    const ch = text[i] ?? '';
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      if (field.length > 0) throw new CsvError('Unexpected quote inside an unquoted field.', line);
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      line++;
      if (options.maxRows && rows.length > options.maxRows) break;
      continue;
    }
    field += ch;
    i++;
  }
  if (inQuotes) throw new CsvError('Unterminated quoted field.', line);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  if (headers.length === 0) throw new CsvError('The CSV file has no header row.', 1);
  return { headers, rows };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]?.[1] ? counts[0][0] : ',';
}

export function serializeCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  const escape = (value: string | number | boolean | null | undefined): string => {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\r\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n') + '\r\n';
}

export function tableToObjects(table: CsvTable): Array<Record<string, string>> {
  return table.rows.map((row) => {
    const obj: Record<string, string> = {};
    table.headers.forEach((header, i) => {
      if (header) obj[header] = row[i] ?? '';
    });
    return obj;
  });
}
