import { describe, expect, it } from 'vitest';
import {
  buildAssignmentQueue,
  buildPrioritizedAssignmentQueue,
  calculateCoverage,
  calculateSectionDifficulty,
  validateScheduleImport,
} from './workflow';

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

  it('requires a theoretical NRC for practical sections', () => {
    const result = validateScheduleImport(
      ['nrc', 'codigo', 'nombre', 'nivel', 'horas', 'tipo', 'nrc_teorico'],
      [{ nrc: '10002', codigo: 'MOR101', nombre: 'Morfología LAB', nivel: '1', horas: '2', tipo: 'LAB', nrc_teorico: '' }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('nrc_teorico');
  });

  it('accepts a practical section linked to its theory', () => {
    const result = validateScheduleImport(
      ['nrc', 'codigo', 'nombre', 'nivel', 'horas', 'tipo', 'nrc_teorico'],
      [{ nrc: '10002', codigo: 'MOR101', nombre: 'Morfología LAB', nivel: '1', horas: '2', tipo: 'LAB', nrc_teorico: '10001' }],
    );
    expect(result.valid).toBe(true);
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

  it('calculates difficulty correctly for standard and constrained sections', () => {
    const easyTheory = calculateSectionDifficulty({ type: 'TEO', hours_per_week: 2 });
    expect(easyTheory.level).toBe('easy');

    const hardSimulation = calculateSectionDifficulty({
      type: 'SIM',
      hours_per_week: 6,
      parent_section_id: 'sec-parent',
      teacher_id: 'tch-1',
    });
    expect(hardSimulation.level).toBe('critical');
    expect(hardSimulation.score).toBeGreaterThanOrEqual(75);
    expect(hardSimulation.factors.length).toBeGreaterThan(2);
  });

  it('prioritizes difficult sections in assignment queue', () => {
    const sections = [
      { id: 'easy-teo', type: 'TEO', hours_per_week: 2, assigned_slots: 0 },
      { id: 'hard-sim', type: 'SIM', hours_per_week: 4, assigned_slots: 0, teacher_id: 'tch-1' },
    ];
    const queue = buildPrioritizedAssignmentQueue(sections);
    // Hard section should be placed first
    expect(queue[0]).toBe('hard-sim');
    expect(queue.filter(id => id === 'hard-sim').length).toBe(4);
    expect(queue.filter(id => id === 'easy-teo').length).toBe(2);
  });
});
