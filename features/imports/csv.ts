export type CsvRow = Record<string, string>;

export const parseCsv = (content: string, maxRows = 10_000): { headers: string[]; rows: CsvRow[] } => {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index++;
      row.push(field.trim());
      field = '';
      if (row.some(value => value !== '')) matrix.push(row);
      row = [];
      if (matrix.length > maxRows + 1) throw new Error(`El archivo supera el máximo de ${maxRows} registros`);
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(value => value !== '')) matrix.push(row);
  if (matrix.length > maxRows + 1) throw new Error(`El archivo supera el máximo de ${maxRows} registros`);
  if (quoted) throw new Error('El CSV contiene una comilla sin cerrar');
  if (matrix.length < 2) return { headers: matrix[0] || [], rows: [] };

  const headers = matrix[0].map((header, index) => header.replace(/^\uFEFF/, '') || `columna_${index + 1}`);
  const rows = matrix.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  return { headers, rows };
};
