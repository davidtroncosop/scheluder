import { describe, expect, it } from 'vitest';
import { buildAssignmentQueue, calculateCoverage, validateScheduleImport } from './workflow';

describe('assisted planner workflow', () => {
  it('accepts a valid schedule CSV using common lowercase headers', () => {
    const result = validateScheduleImport(
      ['nrc', 'codigo', 'nombre', 'nivel', 'horas'],
      [{ nrc: '10001', codigo: 'MAT101', nombre: 'Matemática', nivel: '1', horas: '2' }],
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports missing and invalid values', () => {
    const result = validateScheduleImport(
      ['nrc', 'codigo', 'nombre', 'nivel'],
      [{ nrc: '', codigo: 'MAT101', nombre: 'Matemática', nivel: '20' }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('horas');
  });

  it('builds one queue item for every unassigned weekly block', () => {
    expect(buildAssignmentQueue([
      { id: 'a', hours_per_week: 3, assigned_slots: 1 },
      { id: 'b', hours_per_week: 2, assigned_slots: 2 },
    ])).toEqual(['a', 'a']);
  });

  it('caps coverage at one hundred percent', () => {
    expect(calculateCoverage(10, 12)).toBe(100);
    expect(calculateCoverage(0, 0)).toBe(0);
  });
});
