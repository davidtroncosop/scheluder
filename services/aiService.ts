import type { MappingAnalysis, MappingAIModelId } from '../features/ai/mapping';
import { createLocalMapping } from '../features/ai/mapping';
import { session } from '../lib/session';

export const analyzeMapping = async (
  headers: string[],
  model: MappingAIModelId = 'auto',
): Promise<MappingAnalysis> => {
  const token = session.getToken();
  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  try {
    const response = await fetch(`${API_BASE}/import/analyze-mapping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ headers, model })
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    return await response.json() as MappingAnalysis;
  } catch (error) {
    console.error('Mapping analysis failed:', error);
    return {
      mappings: createLocalMapping(headers),
      requestedModel: model,
      provider: 'local',
      model: null,
      fallback: true,
      notice: 'No fue posible contactar la API; se aplicaron reglas locales.',
    };
  }
};
