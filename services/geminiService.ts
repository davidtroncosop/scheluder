import { MappingField } from "../types";

export const analyzeMapping = async (headers: string[]): Promise<MappingField[]> => {
  const systemFields = ['Docente', 'Asignatura', 'NRC', 'Sala', 'Día', 'Horario'];
  const token = localStorage.getItem('scheduler_token');
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
