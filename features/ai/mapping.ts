import type { MappingField } from '../../types';

export const MAPPING_AI_MODELS = [
  {
    id: 'auto',
    label: 'Automático',
    shortLabel: 'Automático',
    provider: 'auto',
    model: null,
    description: 'Usa el primer proveedor configurado y recurre a reglas locales.',
  },
  {
    id: 'openai:gpt-5.6-luna',
    label: 'OpenAI · GPT-5.6 Luna',
    shortLabel: 'GPT-5.6 Luna',
    provider: 'openai',
    model: 'gpt-5.6-luna',
    description: 'Rápido y eficiente para mapeos frecuentes.',
  },
  {
    id: 'openai:gpt-5.6-terra',
    label: 'OpenAI · GPT-5.6 Terra',
    shortLabel: 'GPT-5.6 Terra',
    provider: 'openai',
    model: 'gpt-5.6-terra',
    description: 'Mayor razonamiento para archivos ambiguos.',
  },
  {
    id: 'openai:gpt-5.6-sol',
    label: 'OpenAI · GPT-5.6 Sol',
    shortLabel: 'GPT-5.6 Sol',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    description: 'Máxima capacidad para casos difíciles.',
  },
  {
    id: 'gemini:gemini-2.5-flash',
    label: 'Google · Gemini 2.5 Flash',
    shortLabel: 'Gemini 2.5 Flash',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    description: 'Proveedor usado originalmente por la demo.',
  },
  {
    id: 'local',
    label: 'Reglas locales',
    shortLabel: 'Reglas locales',
    provider: 'local',
    model: null,
    description: 'No consume APIs externas.',
  },
] as const;

export type MappingAIModelId = typeof MAPPING_AI_MODELS[number]['id'];
export type MappingAIProvider = 'openai' | 'gemini' | 'local';

export interface MappingAnalysis {
  mappings: MappingField[];
  requestedModel: MappingAIModelId;
  provider: MappingAIProvider;
  model: string | null;
  fallback: boolean;
  notice?: string;
}

export interface ResolvedMappingAIModel {
  requestedModel: MappingAIModelId;
  provider: MappingAIProvider;
  model: string | null;
  fallback: boolean;
  notice?: string;
}

export function isMappingAIModelId(value: unknown): value is MappingAIModelId {
  return typeof value === 'string' && MAPPING_AI_MODELS.some(option => option.id === value);
}

export function resolveMappingAIModel(
  requested: unknown,
  availability: { openai: boolean; gemini: boolean },
): ResolvedMappingAIModel {
  const requestedModel = isMappingAIModelId(requested) ? requested : 'auto';

  if (requestedModel === 'auto') {
    if (availability.gemini) {
      return { requestedModel, provider: 'gemini', model: 'gemini-2.5-flash', fallback: false };
    }
    if (availability.openai) {
      return { requestedModel, provider: 'openai', model: 'gpt-5.6-luna', fallback: false };
    }
    return {
      requestedModel,
      provider: 'local',
      model: null,
      fallback: true,
      notice: 'No hay una clave de IA configurada; se aplicaron reglas locales.',
    };
  }

  const option = MAPPING_AI_MODELS.find(candidate => candidate.id === requestedModel)!;
  if (option.provider === 'local') {
    return { requestedModel, provider: 'local', model: null, fallback: false };
  }

  if (option.provider !== 'openai' && option.provider !== 'gemini') {
    return { requestedModel, provider: 'local', model: null, fallback: true };
  }

  if (!availability[option.provider]) {
    return {
      requestedModel,
      provider: 'local',
      model: null,
      fallback: true,
      notice: `Falta configurar la clave de ${option.provider === 'openai' ? 'OpenAI' : 'Gemini'}; se aplicaron reglas locales.`,
    };
  }

  return {
    requestedModel,
    provider: option.provider,
    model: option.model,
    fallback: false,
  };
}

const FIELD_ALIASES: Array<{ systemField: string; aliases: string[] }> = [
  { systemField: 'Docente', aliases: ['docente', 'profesor', 'teacher', 'academico'] },
  { systemField: 'Asignatura', aliases: ['asignatura', 'curso', 'ramo', 'subject'] },
  { systemField: 'NRC', aliases: ['nrc'] },
  { systemField: 'Sala', aliases: ['sala', 'aula', 'room'] },
  { systemField: 'Día', aliases: ['dia', 'day'] },
  { systemField: 'Horario', aliases: ['horario', 'bloque', 'modulo', 'timeslot', 'hora'] },
];

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createLocalMapping(headers: string[]): MappingField[] {
  return FIELD_ALIASES.map(({ systemField, aliases }) => {
    const csvHeader = headers.find(header => {
      const normalized = normalizeHeader(header);
      return aliases.some(alias => normalized.includes(alias));
    }) || '';

    return {
      systemField,
      csvHeader,
      status: csvHeader ? 'valid' : 'warning',
      message: csvHeader ? 'Coincidencia detectada por reglas locales.' : 'Mapeo manual requerido.',
    };
  });
}

export function getMappingAIModel(id: MappingAIModelId) {
  return MAPPING_AI_MODELS.find(option => option.id === id) || MAPPING_AI_MODELS[0];
}
