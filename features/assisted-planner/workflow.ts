import type { SectionWithDetails } from '../../types';

export const REQUIRED_SCHEDULE_FIELDS = ['nrc', 'codigo', 'nombre', 'nivel', 'horas'] as const;

export interface AssistedImportValidation {
  valid: boolean;
  errors: string[];
  matchedHeaders: Record<string, string>;
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_');

export const validateScheduleImport = (
  headers: string[],
  rows: Array<Record<string, string>>,
): AssistedImportValidation => {
  const matchedHeaders: Record<string, string> = {};
  const normalizedHeaders = headers.map(header => ({ original: header, normalized: normalize(header) }));

  for (const required of REQUIRED_SCHEDULE_FIELDS) {
    const match = normalizedHeaders.find(header => (
      header.normalized === required ||
      header.normalized.includes(required) ||
      required.includes(header.normalized)
    ));
    if (match) matchedHeaders[required] = match.original;
  }

  const errors: string[] = [];
  const missing = REQUIRED_SCHEDULE_FIELDS.filter(field => !matchedHeaders[field]);
  if (missing.length) errors.push(`Faltan columnas requeridas: ${missing.join(', ')}`);
  if (!rows.length) errors.push('El archivo no contiene registros para importar');

  if (!missing.length) {
    rows.forEach((row, index) => {
      for (const required of REQUIRED_SCHEDULE_FIELDS) {
        if (!String(row[matchedHeaders[required]] || '').trim()) {
          errors.push(`Fila ${index + 2}: ${required} está vacío`);
        }
      }
      const hours = Number(row[matchedHeaders.horas]);
      if (!Number.isInteger(hours) || hours < 1 || hours > 12) {
        errors.push(`Fila ${index + 2}: horas debe ser un entero entre 1 y 12`);
      }
      const level = Number(row[matchedHeaders.nivel]);
      if (!Number.isInteger(level) || level < 1 || level > 12) {
        errors.push(`Fila ${index + 2}: nivel debe ser un entero entre 1 y 12`);
      }
    });
  }

  return { valid: errors.length === 0, errors: errors.slice(0, 50), matchedHeaders };
};

export const buildAssignmentQueue = (
  sections: Array<Pick<SectionWithDetails, 'id' | 'hours_per_week' | 'assigned_slots'>>,
): string[] => sections.flatMap(section => (
  Array.from({ length: Math.max(0, Number(section.hours_per_week || 0) - Number(section.assigned_slots || 0)) }, () => section.id)
));

export const calculateCoverage = (required: number, assigned: number) => (
  required > 0 ? Math.min(100, Math.round((assigned / required) * 100)) : 0
);
