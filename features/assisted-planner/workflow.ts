import type { SectionWithDetails } from '../../types';

export const REQUIRED_SCHEDULE_FIELDS = ['nrc', 'codigo', 'nombre', 'nivel', 'horas'] as const;

export interface AssistedImportValidation {
  valid: boolean;
  errors: string[];
  matchedHeaders: Record<string, string>;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'critical';

export interface SectionDifficultyResult {
  score: number; // 0 to 100
  level: DifficultyLevel;
  factors: Array<{ description: string; impact: number }>;
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
    const typeHeader = normalizedHeaders.find(header => header.normalized === 'tipo')?.original;
    const parentHeader = normalizedHeaders.find(header => ['nrc_teorico', 'nrc_padre'].includes(header.normalized))?.original;
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
      const type = String(typeHeader ? row[typeHeader] : 'TEO').trim().toUpperCase();
      if (type !== 'TEO' && !String(parentHeader ? row[parentHeader] : '').trim()) {
        errors.push(`Fila ${index + 2}: las secciones ${type || 'prácticas'} requieren nrc_teorico`);
      }
    });
  }

  return { valid: errors.length === 0, errors: errors.slice(0, 50), matchedHeaders };
};

/**
 * Calculates difficulty score for placing an academic section.
 * Considers room type scarcity, weekly hours, parent/child relationships, and teacher assignments.
 */
export const calculateSectionDifficulty = (
  section: {
    type?: string;
    hours_per_week?: number;
    teacher_id?: string | null;
    parent_section_id?: string | null;
    [key: string]: any;
  },
  context?: {
    hasDependentChildren?: boolean;
    availableRoomsCountByType?: Record<string, number>;
  }
): SectionDifficultyResult => {
  let score = 20; // Baseline
  const factors: Array<{ description: string; impact: number }> = [];

  const type = (section.type || 'TEO').toUpperCase();
  const hours = Number(section.hours_per_week || 2);

  // 1. Specialized Room Requirements (Scarcity)
  if (type === 'SIM') {
    score += 35;
    factors.push({ description: 'Requiere sala de simulación clínica (alta escasez)', impact: 35 });
  } else if (type === 'LAB') {
    score += 25;
    factors.push({ description: 'Requiere laboratorio especializado', impact: 25 });
  } else if (type === 'TAL') {
    score += 20;
    factors.push({ description: 'Requiere taller', impact: 20 });
  }

  // 2. Weekly Hours Volume
  if (hours >= 6) {
    score += 25;
    factors.push({ description: `Carga horaria alta (${hours} hrs/sem)`, impact: 25 });
  } else if (hours >= 4) {
    score += 15;
    factors.push({ description: `Carga horaria moderada (${hours} hrs/sem)`, impact: 15 });
  }

  // 3. Dependent Practical Sections (Theories with children)
  if (context?.hasDependentChildren) {
    score += 20;
    factors.push({ description: 'Teoría con prácticas vinculadas que condicionan horarios', impact: 20 });
  }

  // 4. Practical section with parent dependency
  if (section.parent_section_id) {
    score += 15;
    factors.push({ description: 'Práctica vinculada a teoría padre', impact: 15 });
  }

  // 5. Teacher Assignment
  if (section.teacher_id || section.teacher_name) {
    score += 10;
    factors.push({ description: 'Docente asignado con restricciones de agenda', impact: 10 });
  }

  const finalScore = Math.min(100, Math.max(0, score));
  let level: DifficultyLevel = 'easy';
  if (finalScore >= 75) level = 'critical';
  else if (finalScore >= 50) level = 'hard';
  else if (finalScore >= 30) level = 'medium';

  return {
    score: finalScore,
    level,
    factors,
  };
};

/**
 * Builds an assignment queue sorted intelligently by difficulty (hardest first),
 * ensuring critical sections get prime timeslots and rooms before grid saturation.
 */
export const buildPrioritizedAssignmentQueue = (
  sections: Array<{
    id: string;
    hours_per_week?: number;
    assigned_slots?: number;
    type?: string;
    teacher_id?: string | null;
    parent_section_id?: string | null;
    [key: string]: any;
  }>,
): string[] => {
  const sectionsWithDifficulty = sections.map(section => {
    const remaining = Math.max(0, Number(section.hours_per_week || 0) - Number(section.assigned_slots || 0));
    const difficulty = calculateSectionDifficulty(section);
    return {
      id: section.id,
      remaining,
      score: difficulty.score,
    };
  });

  // Sort descending by difficulty score so the most constrained sections are placed first
  sectionsWithDifficulty.sort((a, b) => b.score - a.score);

  return sectionsWithDifficulty.flatMap(item => Array.from({ length: item.remaining }, () => item.id));
};

export const buildAssignmentQueue = (
  sections: Array<Pick<SectionWithDetails, 'id' | 'hours_per_week' | 'assigned_slots'>>,
): string[] => sections.flatMap(section => (
  Array.from({ length: Math.max(0, Number(section.hours_per_week || 0) - Number(section.assigned_slots || 0)) }, () => section.id)
));

export const calculateCoverage = (required: number, assigned: number) => (
  required > 0 ? Math.min(100, Math.round((assigned / required) * 100)) : 0
);
