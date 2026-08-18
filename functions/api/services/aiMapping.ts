import { createLocalMapping, type MappingAnalysis, type ResolvedMappingAIModel } from '../../../features/ai/mapping';
import type { MappingField } from '../../../types';

export function isConfiguredApiKey(value?: string): value is string {
    return Boolean(value && value !== 'PLACEHOLDER_API_KEY');
}

export function createMappingAnalysis(headers: string[], selected: ResolvedMappingAIModel): MappingAnalysis {
    return { ...selected, mappings: createLocalMapping(headers) };
}

export function validateMappingResponse(value: unknown, headers: string[]): MappingField[] {
    if (!Array.isArray(value) || value.length !== 6) throw new Error('Respuesta de mapeo inválida');
    const validSystemFields = new Set(['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario']);
    const validStatuses = new Set(['valid', 'warning', 'error']);
    const seen = new Set<string>();

    const mappings = value.map(item => {
        if (!item || typeof item !== 'object') throw new Error('Elemento de mapeo inválido');
        const candidate = item as Record<string, unknown>;
        if (typeof candidate.systemField !== 'string' || !validSystemFields.has(candidate.systemField) || seen.has(candidate.systemField) ||
            typeof candidate.csvHeader !== 'string' || (candidate.csvHeader !== '' && !headers.includes(candidate.csvHeader)) ||
            typeof candidate.status !== 'string' || !validStatuses.has(candidate.status) ||
            typeof candidate.message !== 'string') {
            throw new Error('Campos de mapeo inválidos');
        }
        seen.add(candidate.systemField);
        return candidate as unknown as MappingField;
    });

    return mappings;
}

export async function analyzeMappingWithGemini(headers: string[], model: string, apiKey: string): Promise<MappingField[]> {
    const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `Analiza los siguientes encabezados de un archivo CSV de horarios académicos: [${headers.join(', ')}]. Mapea cada uno a los campos del sistema: [${systemFields.join(', ')}]. Devuelve un objeto JSON con el mapeo sugerido y una evaluación de validez.`
                }]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            systemField: { type: "STRING" },
                            csvHeader: { type: "STRING" },
                            status: { type: "STRING", description: "valid, warning, or error" },
                            message: { type: "STRING" }
                        },
                        required: ["systemField", "csvHeader", "status", "message"]
                    }
                }
            }
        })
    });

    if (!response.ok) throw new Error(`Gemini API error ${response.status}`);

    const resData = await response.json() as any;
    const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini no devolvió contenido');
    return validateMappingResponse(JSON.parse(text), headers);
}

export async function analyzeMappingWithOpenAI(headers: string[], model: string, apiKey: string, safetyIdentifier: string): Promise<MappingField[]> {
    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            store: false,
            safety_identifier: safetyIdentifier,
            reasoning: { effort: 'low' },
            max_output_tokens: 1200,
            instructions: 'Eres un asistente de importación académica. Mapea encabezados CSV solo a los seis campos indicados. No inventes encabezados que no existan.',
            input: `Encabezados CSV: ${JSON.stringify(headers)}. Campos del sistema: Docente, Asignatura, NRC, Sala, Día, Horario. Marca valid si la coincidencia es clara, warning si requiere revisión y error si es incompatible.`,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'mapping_analysis',
                    strict: true,
                    schema: {
                        type: 'object',
                        properties: {
                            mappings: {
                                type: 'array',
                                minItems: 6,
                                maxItems: 6,
                                items: {
                                    type: 'object',
                                    properties: {
                                        systemField: { type: 'string', enum: ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'] },
                                        csvHeader: { type: 'string' },
                                        status: { type: 'string', enum: ['valid', 'warning', 'error'] },
                                        message: { type: 'string' },
                                    },
                                    required: ['systemField', 'csvHeader', 'status', 'message'],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ['mappings'],
                        additionalProperties: false,
                    },
                },
            },
        }),
    });

    if (!response.ok) throw new Error(`OpenAI API error ${response.status}`);

    const data = await response.json() as { status?: string; output_text?: string };
    if (data.status !== 'completed' || !data.output_text) throw new Error('OpenAI no completó la respuesta');
    const parsed = JSON.parse(data.output_text) as { mappings?: unknown };
    return validateMappingResponse(parsed.mappings, headers);
}
