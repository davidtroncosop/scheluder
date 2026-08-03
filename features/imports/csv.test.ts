import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('supports commas, escaped quotes and new lines inside quoted fields', () => {
    const result = parseCsv('nombre,nota\n"Rivas, María","Dice ""hola""\ny sigue"');
    expect(result.rows[0]).toEqual({ nombre: 'Rivas, María', nota: 'Dice "hola"\ny sigue' });
  });

  it('rejects files above the configured row limit', () => {
    expect(() => parseCsv('a\n1\n2', 1)).toThrow('máximo');
  });
});
