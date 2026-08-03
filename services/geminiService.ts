import { MappingField } from "../types";
import { session } from '../lib/session';

export const analyzeMapping = async (headers: string[]): Promise<MappingField[]> => {
  const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
  const token = session.getToken();
  const API_BASE = import.meta.env.VITE_API_URL || '/api';

  try {
    const response = await fetch(`${API_BASE}/import/analyze-mapping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ headers })
    });

    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }

    return await response.json() as MappingField[];
  } catch (error) {
    console.error("Gemini mapping analysis failed:", error);
    // Fallback static mapping
    return systemFields.map(field => ({
      systemField: field,
      csvHeader: headers.find(h => h.toLowerCase().includes(field.toLowerCase())) || '',
      status: 'warning',
      message: 'Mapeo manual requerido'
    }));
  }
};
