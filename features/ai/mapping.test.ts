import { describe, expect, it } from 'vitest';
import { createLocalMapping, resolveMappingAIModel } from './mapping';

describe('mapping AI model selection', () => {
  it('preserves Gemini as the automatic provider when both keys exist', () => {
    expect(resolveMappingAIModel('auto', { openai: true, gemini: true })).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      fallback: false,
    });
  });

  it('uses the explicitly selected OpenAI model', () => {
    expect(resolveMappingAIModel('openai:gpt-5.6-terra', { openai: true, gemini: true })).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      fallback: false,
    });
  });

  it('falls back visibly when the selected provider has no key', () => {
    expect(resolveMappingAIModel('openai:gpt-5.6-luna', { openai: false, gemini: true })).toMatchObject({
      provider: 'local',
      fallback: true,
    });
  });
});

describe('local mapping', () => {
  it('recognizes common Spanish scheduling headers', () => {
    const mappings = createLocalMapping(['PROFESOR_NOMBRE', 'COD_ASIGNATURA', 'N_NRC', 'SALA_COD', 'DIA_SEMANA', 'BLOQUE_HORARIO']);
    expect(mappings.every(mapping => mapping.status === 'valid')).toBe(true);
    expect(mappings.find(mapping => mapping.systemField === 'Docente')?.csvHeader).toBe('PROFESOR_NOMBRE');
  });
});
