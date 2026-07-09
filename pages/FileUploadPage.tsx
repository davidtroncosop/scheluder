
import React, { useState, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import * as dataStore from '../lib/dataStore';

interface ParsedRow {
  [key: string]: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  inserted: number;
  errors: string[];
}

const API_BASE = '/api';

const FileUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dataType, setDataType] = useState<'horarios' | 'docentes' | 'asignaturas' | 'salas'>('horarios');
  const [dragActive, setDragActive] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace'); // Reemplazar por defecto

  // Period selection
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const periods = [
    { id: '2026-1', name: '2026 - Primer Semestre' },
    { id: '2026-2', name: '2026 - Segundo Semestre' },
    { id: '2025-2', name: '2025 - Segundo Semestre' },
  ];

  const navItems = [
    { name: 'Planificador', icon: 'grid_view', path: '/scheduler' },
    { name: 'Horarios', icon: 'calendar_month', path: '/horarios' },
  ];

  const masterNavItems = [
    { name: 'Docentes', icon: 'groups', path: '/teachers' },
    { name: 'Asignaturas', icon: 'menu_book', path: '/asignaturas' },
    { name: 'Salas', icon: 'meeting_room', path: '/salas' },
  ];

  // Parse CSV content - handles quoted values with commas
  const parseCSV = (content: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };

    // Parse a CSV line respecting quoted values
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      // Don't forget the last field
      result.push(current.trim().replace(/^"|"$/g, ''));

      return result;
    };

    const headers = parseCSVLine(lines[0]);
    console.log('Headers parsed:', headers);

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = parseCSVLine(line);
      console.log(`Row ${i}:`, values);

      // Be more flexible - allow rows with fewer values
      const row: ParsedRow = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      rows.push(row);
    }

    console.log('Total rows parsed:', rows.length);
    return { headers, rows };
  };

  // Auto-save function
  const autoSaveData = (rows: ParsedRow[]) => {
    if (!selectedPeriod) {
      setUploadResult({
        success: false,
        message: '⚠️ Selecciona un período antes de subir el archivo',
        inserted: 0,
        errors: [],
      });
      return;
    }

    try {
      let savedCount = 0;

      switch (dataType) {
        case 'docentes':
          const teachers = dataStore.parseTeachersFromCSV(rows);
          if (importMode === 'replace') {
            dataStore.saveTeachers(teachers);
          } else {
            dataStore.addTeachers(teachers);
          }
          savedCount = teachers.length;
          break;
        case 'asignaturas':
          const subjects = dataStore.parseSubjectsFromCSV(rows);
          if (importMode === 'replace') {
            dataStore.saveSubjects(subjects);
          } else {
            dataStore.addSubjects(subjects);
          }
          savedCount = subjects.length;
          break;
        case 'salas':
          const rooms = dataStore.parseRoomsFromCSV(rows);
          if (importMode === 'replace') {
            dataStore.saveRooms(rooms);
          } else {
            dataStore.addRooms(rooms);
          }
          savedCount = rooms.length;
          break;
        case 'horarios':
          const sections = dataStore.parseSectionsFromCSV(rows, selectedPeriod);
          if (importMode === 'replace') {
            const allSections = dataStore.getSections();
            const otherPeriodSections = allSections.filter(s => s.periodo !== selectedPeriod);
            dataStore.saveSections([...otherPeriodSections, ...sections]);
          } else {
            dataStore.addSections(sections, selectedPeriod);
          }
          savedCount = sections.length;
          break;
      }

      dataStore.setCurrentPeriod(selectedPeriod);

      const modeText = importMode === 'replace' ? 'reemplazados' : 'agregados';
      const typeLabel = dataType === 'horarios' ? 'secciones' : dataType;
      setUploadResult({
        success: true,
        message: `✅ ${savedCount} ${typeLabel} ${modeText} automáticamente`,
        inserted: savedCount,
        errors: [],
      });
    } catch (error) {
      console.error('Error auto-saving:', error);
      setUploadResult({
        success: false,
        message: 'Error al guardar automáticamente',
        inserted: 0,
        errors: [String(error)],
      });
    }
  };

  // Handle file selection - now with auto-save
  const handleFileChange = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const { headers: parsedHeaders, rows } = parseCSV(content);
      setHeaders(parsedHeaders);
      setParsedData(rows);

      // Auto-save immediately after parsing
      if (rows.length > 0 && selectedPeriod) {
        setTimeout(() => autoSaveData(rows), 100);
      }
    };
    reader.readAsText(selectedFile);
  }, [selectedPeriod, dataType, importMode]);

  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Required fields by data type
  const requiredFields: Record<string, string[]> = {
    horarios: ['nrc', 'nombre', 'nivel', 'horas'],
    docentes: ['nombre', 'email'],
    asignaturas: ['codigo', 'nombre', 'nivel'],
    salas: ['nombre', 'tipo', 'capacidad'],
  };

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState<Array<{
    row: number;
    field: string;
    value: string;
    error: string;
  }>>([]);

  // Validate data before upload
  const validateData = (): boolean => {
    const errors: typeof validationErrors = [];
    const required = requiredFields[dataType] || [];
    console.log('Validating dataType:', dataType, 'Required fields:', required);

    parsedData.forEach((row, index) => {
      // Check required fields
      required.forEach(field => {
        // Find the matching header (case insensitive)
        const matchingHeader = headers.find(h =>
          h.toLowerCase().includes(field.toLowerCase()) ||
          field.toLowerCase().includes(h.toLowerCase())
        );

        if (!matchingHeader) {
          errors.push({
            row: index + 2, // +2 because: 1 for header, 1 for 0-index
            field: field,
            value: '',
            error: `Campo requerido "${field}" no encontrado en el archivo`
          });
        } else if (!row[matchingHeader] || row[matchingHeader].trim() === '') {
          errors.push({
            row: index + 2,
            field: matchingHeader,
            value: row[matchingHeader] || '',
            error: `Campo "${matchingHeader}" está vacío`
          });
        }
      });

      // Type-specific validations
      if (dataType === 'docentes') {
        const emailField = headers.find(h => h.toLowerCase().includes('email'));
        if (emailField && row[emailField]) {
          const email = row[emailField];
          if (!email.includes('@')) {
            errors.push({
              row: index + 2,
              field: emailField,
              value: email,
              error: 'Email inválido (debe contener @)'
            });
          }
        }
      }

      if (dataType === 'horarios') {
        const horasField = headers.find(h => h.toLowerCase().includes('hora'));
        if (horasField && row[horasField]) {
          const horas = parseInt(row[horasField]);
          if (isNaN(horas) || horas < 1 || horas > 10) {
            errors.push({
              row: index + 2,
              field: horasField,
              value: row[horasField],
              error: 'Horas debe ser un número entre 1 y 10'
            });
          }
        }

        const nivelField = headers.find(h => h.toLowerCase().includes('nivel'));
        if (nivelField && row[nivelField]) {
          const nivel = parseInt(row[nivelField]);
          if (isNaN(nivel) || nivel < 1 || nivel > 10) {
            errors.push({
              row: index + 2,
              field: nivelField,
              value: row[nivelField],
              error: 'Nivel debe ser un número entre 1 y 10'
            });
          }
        }
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Export errors to CSV
  const exportErrorsToCSV = () => {
    const csvHeaders = ['Fila', 'Campo', 'Valor Actual', 'Error'];
    const rows = validationErrors.map(err => [
      err.row.toString(),
      err.field,
      err.value,
      err.error
    ]);

    const csvContent = [csvHeaders, ...rows].map(row =>
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `errores_importacion_${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Upload data to API
  const handleUpload = async () => {
    if (!parsedData.length) return;

    // Validate first
    if (!validateData()) {
      return; // Don't upload if there are validation errors
    }

    // 1. Try to upload to Remote API if authenticated
    const token = dataStore.getAuthToken();
    if (token) {
      try {
        console.log(`[Upload] Attempting remote upload for ${dataType}...`);
        const endpoint = `/api/import/${dataType}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            data: parsedData,
            period_id: selectedPeriod,
            import_mode: importMode
          })
        });

        const remoteResult = await response.json() as any;
        if (response.ok) {
          console.log('[Upload] Remote upload successful:', remoteResult);
        } else {
          console.warn('[Upload] Remote upload failed, falling back to local:', remoteResult.error);
        }
      } catch (e) {
        console.error('[Upload] Error during remote sync:', e);
      }
    }

    // 2. Demo mode/Fallback: Save directly to localStorage
    try {
      let savedCount = 0;

      switch (dataType) {
        case 'docentes':
          const teachers = dataStore.parseTeachersFromCSV(parsedData);
          if (importMode === 'replace') {
            dataStore.saveTeachers(teachers);
          } else {
            dataStore.addTeachers(teachers);
          }
          savedCount = teachers.length;
          break;
        case 'asignaturas':
          const subjects = dataStore.parseSubjectsFromCSV(parsedData);
          if (importMode === 'replace') {
            dataStore.saveSubjects(subjects);
          } else {
            dataStore.addSubjects(subjects);
          }
          savedCount = subjects.length;
          break;
        case 'salas':
          const rooms = dataStore.parseRoomsFromCSV(parsedData);
          if (importMode === 'replace') {
            dataStore.saveRooms(rooms);
          } else {
            dataStore.addRooms(rooms);
          }
          savedCount = rooms.length;
          break;
        case 'horarios':
          const sections = dataStore.parseSectionsFromCSV(parsedData, selectedPeriod);
          if (importMode === 'replace') {
            // Clear sections for this period and save new ones
            const allSections = dataStore.getSections();
            const otherPeriodSections = allSections.filter(s => s.periodo !== selectedPeriod);
            dataStore.saveSections([...otherPeriodSections, ...sections]);
          } else {
            dataStore.addSections(sections, selectedPeriod);
          }
          savedCount = sections.length;
          break;
      }

      // Update current period
      dataStore.setCurrentPeriod(selectedPeriod);

      const modeText = importMode === 'replace' ? 'reemplazados' : 'agregados';
      setUploadResult({
        success: true,
        message: `✅ ${savedCount} registros ${modeText} y sincronizados`,
        inserted: savedCount,
        errors: [],
      });

      // Clear file after successful import
      setFile(null);
      setParsedData([]);
      setHeaders([]);
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      setUploadResult({
        success: false,
        message: 'Error al guardar datos localmente',
        inserted: 0,
        errors: [String(error)],
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-[#0b0e11] font-display">
      {/* Sidebar */}
      <nav className="hidden md:flex w-56 flex-col bg-white dark:bg-[#111418] border-r border-slate-200 dark:border-slate-800 z-20 py-6">
        <div className="px-6 mb-4">
          <Link to="/scheduler" className="flex items-center gap-2 text-[#0f172a] dark:text-white mb-6">
            <div className="bg-primary p-1 rounded">
              <span className="material-symbols-outlined text-white text-xl">calendar_today</span>
            </div>
            <h1 className="text-base font-bold tracking-tight">Scheduler Pro</h1>
          </Link>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Principal</p>
        </div>
        <ul className="space-y-1 px-3">
          {navItems.map(item => (
            <li key={item.name}>
              <Link to={item.path} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>

        <div className="px-6 mt-8 mb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Maestros</p>
        </div>
        <ul className="space-y-1 px-3">
          {masterNavItems.map(item => (
            <li key={item.name}>
              <Link to={item.path} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5">
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>

        <div className="px-6 mt-8 mb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sistema</p>
        </div>
        <ul className="space-y-1 px-3">
          <li>
            <Link to="/upload" className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all bg-white dark:bg-slate-800 text-primary border border-slate-100 dark:border-slate-700 shadow-sm">
              <span className="material-symbols-outlined text-[20px] fill-1">upload_file</span>
              Importar Datos
            </Link>
          </li>
        </ul>

        <div className="mt-auto px-4">
          <Link to="/" className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-red-500 transition-all">
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Cerrar Sesión
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-[#111418] border-b border-slate-200 dark:border-slate-800 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Importar Datos</h1>
            <span className="text-slate-400 text-sm">Carga masiva desde CSV</span>
            {selectedPeriod && (
              <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">event</span>
                {periods.find(p => p.id === selectedPeriod)?.name}
              </span>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Period Selector - REQUIRED FIRST */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                <span className="text-red-500">*</span> Período Académico:
              </label>
              <div className="flex flex-wrap gap-3">
                {periods.map(period => (
                  <button
                    key={period.id}
                    onClick={() => setSelectedPeriod(period.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-all ${selectedPeriod === period.id
                      ? 'bg-primary text-white shadow-lg shadow-primary/20 ring-2 ring-primary ring-offset-2'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">event</span>
                    {period.name}
                  </button>
                ))}
              </div>
              {!selectedPeriod && (
                <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">info</span>
                  Debes seleccionar un período antes de importar datos
                </p>
              )}
            </div>

            {/* Data Type Selector */}
            <div className={`mb-6 transition-opacity ${selectedPeriod ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                Tipo de datos a importar:
              </label>
              <div className="flex flex-wrap gap-3">
                {[
                  { id: 'horarios', label: 'Secciones / NRCs', icon: 'format_list_numbered', description: 'Clases a programar' },
                  { id: 'docentes', label: 'Docentes', icon: 'groups', description: 'Planta académica' },
                  { id: 'asignaturas', label: 'Asignaturas', icon: 'menu_book', description: 'Catálogo de cursos' },
                  { id: 'salas', label: 'Salas', icon: 'meeting_room', description: 'Espacios físicos' },
                ].map(type => (
                  <button
                    key={type.id}
                    onClick={() => { setDataType(type.id as any); setValidationErrors([]); }}
                    className={`flex flex-col items-start px-4 py-3 rounded-lg font-semibold text-sm transition-all ${dataType === type.id
                      ? 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">{type.icon}</span>
                      {type.label}
                    </div>
                    <span className={`text-[10px] font-medium ${dataType === type.id ? 'text-white/80' : 'text-slate-400'}`}>{type.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Import Mode Selector */}
            <div className={`mb-6 transition-opacity ${selectedPeriod ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                Modo de importación:
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setImportMode('replace')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${importMode === 'replace'
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-amber-400'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                  Reemplazar existentes
                </button>
                <button
                  onClick={() => setImportMode('merge')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${importMode === 'merge'
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                    }`}
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  Agregar a existentes
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {importMode === 'replace'
                  ? '⚠️ Los datos actuales serán reemplazados completamente por el nuevo archivo'
                  : 'Los nuevos datos se agregarán a los existentes (duplicados se actualizarán)'
                }
              </p>
            </div>

            {/* CSV Structure Info */}
            <div className={`mb-6 transition-opacity ${selectedPeriod ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-blue-500 text-xl">info</span>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">
                      Estructura esperada para: {dataType === 'horarios' ? 'Secciones / NRCs (clases a programar)' : dataType === 'docentes' ? 'Docentes' : dataType === 'asignaturas' ? 'Asignaturas' : 'Salas'}
                    </h4>

                    {/* Columns info */}
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Columnas requeridas:</p>
                      <div className="flex flex-wrap gap-1">
                        {dataType === 'horarios' && ['nrc', 'codigo', 'nombre', 'nivel', 'horas'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded">{col}</span>
                        ))}
                        {dataType === 'docentes' && ['nombre', 'email', 'max_horas'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded">{col}</span>
                        ))}
                        {dataType === 'asignaturas' && ['codigo', 'nombre', 'nivel'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded">{col}</span>
                        ))}
                        {dataType === 'salas' && ['nombre', 'tipo', 'capacidad'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded">{col}</span>
                        ))}
                      </div>
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Columnas opcionales:</p>
                      <div className="flex flex-wrap gap-1">
                        {dataType === 'horarios' && ['tipo', 'docente', 'nrc_teorico', 'sala_preferida', 'seccion'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded">{col}</span>
                        ))}
                        {dataType === 'docentes' && ['departamento', 'tipo_contrato', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded">{col}</span>
                        ))}
                        {dataType === 'asignaturas' && ['creditos', 'carrera'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded">{col}</span>
                        ))}
                        {dataType === 'salas' && ['edificio', 'asignaturas_permitidas'].map(col => (
                          <span key={col} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded">{col}</span>
                        ))}
                      </div>
                    </div>

                    {/* Example preview */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-2 mb-3 overflow-x-auto">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ejemplo:</p>
                      <code className="text-[10px] text-slate-700 dark:text-slate-300 whitespace-pre font-mono">
                        {dataType === 'horarios' && `nrc,codigo,nombre,nivel,horas,tipo,docente,nrc_teorico
10001,DMOR0030,Morfología TEO,3,2,TEO,Prof. Reyes,
10002,DMOR0030,Morfología LAB,3,2,LAB,Prof. Reyes,10001`}
                        {dataType === 'docentes' && `nombre,email,max_horas,lunes,martes,miercoles,jueves,viernes
Prof. José Reyes,jose.reyes@universidad.cl,20,"M1,M2,M3,M4","M1,M2,M3","M1,M2,M3,M4","M1,M2","M1,M2"
Dra. María Rivas,maria.rivas@universidad.cl,16,"M1,M2","M1,M2,M3,M4","M1,M2","M1,M2,M3,M4",`}
                        {dataType === 'asignaturas' && `codigo,nombre,nivel,creditos,carrera
DMOR0030,Morfología,3,6,Mi Carrera
DBIO0031,Biomecánica I,3,4,Mi Carrera`}
                        {dataType === 'salas' && `nombre,tipo,capacidad,edificio,asignaturas_permitidas
SALA 201,TEO,40,Edificio D,
LAB 1,LAB,20,Edificio D,"DMOR0030,DFIS0032"`}
                      </code>
                    </div>

                    {/* Download button */}
                    <button
                      onClick={() => {
                        const examples: Record<string, string> = {
                          horarios: `nrc,codigo,nombre,nivel,horas,tipo,docente,nrc_teorico,sala_preferida,seccion
10001,DMOR0030,Morfología TEO,3,2,TEO,Prof. José Reyes,,,
10002,DMOR0030,Morfología LAB Sec1,3,2,LAB,Prof. José Reyes,10001,LAB 1,1
10003,DMOR0030,Morfología LAB Sec2,3,2,LAB,Ayud. Felipe Pérez,10001,LAB 2,2`,
                          docentes: `nombre,email,max_horas,departamento,tipo_contrato,lunes,martes,miercoles,jueves,viernes
Prof. José Reyes,jose.reyes@universidad.cl,20,Mi Carrera,Planta,"M1,M2,M3,M4","M1,M2,M3","M1,M2,M3,M4","M1,M2","M1,M2"
Dra. María Rivas,maria.rivas@universidad.cl,16,Mi Carrera,Planta,"M1,M2","M1,M2,M3,M4","M1,M2","M1,M2,M3,M4",
Prof. Carlos Soto,carlos.soto@universidad.cl,10,Mi Carrera,Media Jornada,"M1,M2","M1,M2","M1,M2","M1,M2",`,
                          asignaturas: `codigo,nombre,nivel,creditos,carrera
DMOR0030,Morfología,3,6,Mi Carrera
DBIO0031,Biomecánica I,3,4,Mi Carrera
DFIS0032,Fisiología I,3,6,Mi Carrera`,
                          salas: `nombre,tipo,capacidad,edificio,asignaturas_permitidas
SALA 201,TEO,40,Edificio D,
SALA 202,TEO,40,Edificio D,
LAB 1,LAB,20,Edificio D,"DMOR0030,DFIS0032"
SIMULADOR 1,SIM,15,Edificio D,"DKIN0051,DKIN0052"`
                        };
                        const blob = new Blob([examples[dataType]], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `plantilla_${dataType}.csv`;
                        link.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">download</span>
                      Descargar plantilla CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Upload Area */}
            <div
              onDragEnter={selectedPeriod ? handleDrag : undefined}
              onDragLeave={selectedPeriod ? handleDrag : undefined}
              onDragOver={selectedPeriod ? handleDrag : undefined}
              onDrop={selectedPeriod ? handleDrop : undefined}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${!selectedPeriod
                ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                : dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary/50'
                }`}
            >
              <input
                type="file"
                accept=".csv"
                disabled={!selectedPeriod}
                onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                className={`absolute inset-0 w-full h-full opacity-0 ${selectedPeriod ? 'cursor-pointer' : 'cursor-not-allowed'}`}
              />
              <div className="flex flex-col items-center gap-4">
                <div className={`size-16 rounded-full flex items-center justify-center transition-colors ${file ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-slate-100 dark:bg-slate-800'
                  }`}>
                  <span className={`material-symbols-outlined text-3xl ${file ? 'text-emerald-500' : 'text-slate-400'
                    }`}>
                    {file ? 'check_circle' : 'cloud_upload'}
                  </span>
                </div>
                {file ? (
                  <div>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-slate-500">{parsedData.length} registros encontrados</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">Arrastra tu archivo CSV aquí</p>
                    <p className="text-sm text-slate-500">o haz clic para seleccionar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview Table */}
            {parsedData.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Vista previa ({Math.min(5, parsedData.length)} de {parsedData.length} registros)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setValidationErrors([]); validateData(); }}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-semibold"
                    >
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Validar
                    </button>
                    <button
                      onClick={() => { setFile(null); setParsedData([]); setHeaders([]); setUploadResult(null); setValidationErrors([]); }}
                      className="text-xs text-red-500 hover:text-red-600 font-semibold"
                    >
                      Eliminar archivo
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          {headers.slice(0, 6).map((h, i) => (
                            <th key={i} className="px-4 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                          {headers.length > 6 && (
                            <th className="px-4 py-2 font-semibold text-slate-400">+{headers.length - 6} más</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {parsedData.slice(0, 5).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            {headers.slice(0, 6).map((h, j) => (
                              <td key={j} className="px-4 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {row[h] || '-'}
                              </td>
                            ))}
                            {headers.length > 6 && <td className="px-4 py-2 text-slate-400">...</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Errors Panel */}
            {validationErrors.length > 0 && (
              <div className="mt-6 p-4 rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-2xl text-red-500">error</span>
                    <div>
                      <p className="font-bold text-red-700 dark:text-red-400">
                        {validationErrors.length} error{validationErrors.length > 1 ? 'es' : ''} de validación encontrado{validationErrors.length > 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-red-600 dark:text-red-400">
                        Corrige los errores antes de continuar con la importación
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={exportErrorsToCSV}
                    className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm font-bold hover:bg-red-200 dark:hover:bg-red-900/60 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    Descargar Errores CSV
                  </button>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-red-100 dark:border-red-900/40">
                  <table className="w-full text-sm">
                    <thead className="bg-red-100/50 dark:bg-red-900/30">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-red-700 dark:text-red-400">Fila</th>
                        <th className="px-3 py-2 text-left font-bold text-red-700 dark:text-red-400">Campo</th>
                        <th className="px-3 py-2 text-left font-bold text-red-700 dark:text-red-400">Valor</th>
                        <th className="px-3 py-2 text-left font-bold text-red-700 dark:text-red-400">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100 dark:divide-red-900/40">
                      {validationErrors.slice(0, 10).map((err, i) => (
                        <tr key={i} className="hover:bg-red-50 dark:hover:bg-red-900/20">
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono">{err.row}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{err.field}</td>
                          <td className="px-3 py-2 text-slate-500">{err.value || <span className="italic">vacío</span>}</td>
                          <td className="px-3 py-2 text-red-600 dark:text-red-400">{err.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validationErrors.length > 10 && (
                    <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-center text-sm text-red-600 dark:text-red-400 border-t border-red-100 dark:border-red-900/40">
                      ...y {validationErrors.length - 10} errores más. Descarga el CSV para ver todos.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upload Result */}
            {uploadResult && (
              <div className={`mt-6 p-4 rounded-xl border ${uploadResult.success
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-2xl ${uploadResult.success ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                    {uploadResult.success ? 'check_circle' : 'error'}
                  </span>
                  <div>
                    <p className={`font-bold ${uploadResult.success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                      {uploadResult.message}
                    </p>
                    {uploadResult.errors.length > 0 && (
                      <ul className="mt-2 text-sm text-red-600 dark:text-red-400">
                        {uploadResult.errors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
              <Link
                to="/scheduler"
                className="flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                <span className="material-symbols-outlined">arrow_back</span>
                Cancelar
              </Link>
              <button
                onClick={handleUpload}
                disabled={!parsedData.length || uploading}
                className={`flex items-center gap-2 px-8 py-3 rounded-lg font-bold transition-all ${parsedData.length && !uploading
                  ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
              >
                {uploading ? (
                  <>
                    <div className="animate-spin size-5 border-2 border-white border-t-transparent rounded-full"></div>
                    Importando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">upload</span>
                    Importar {parsedData.length} registros
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FileUploadPage;
