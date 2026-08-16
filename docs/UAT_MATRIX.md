# Matriz UAT / QA — Scheduler Pro

Fecha de ejecución: 2026-08-15
Entorno: producción (`https://scheduler-pro.pages.dev`)
Rol probado: administrador autenticado
Datos base: 26 secciones, 4 asignaciones, 0 conflictos críticos activos.

## Criterios de resultado

- **PASS**: el resultado observado coincide con el esperado.
- **FAIL**: el resultado observado no cumple el esperado.
- **BLOCKED**: requiere interacción visual en navegador; el navegador integrado no estaba disponible durante esta ejecución.

## Casos ejecutados

| ID | Área | Caso UAT / QA | Resultado esperado | Resultado observado | Estado |
|---|---|---|---|---|---|
| AUTH-01 | Autenticación | Iniciar sesión con administrador válido | HTTP 200 y token | HTTP 200 | PASS |
| AUTH-02 | Autenticación | Consultar perfil autenticado | Devuelve usuario y rol | Devuelve admin activo | PASS |
| AUTH-03 | Seguridad | Consultar endpoint protegido sin token | HTTP 401 | HTTP 401 | PASS |
| AUTH-04 | Seguridad | Intentar asignación con sección inexistente | HTTP 404 y sin cambios | HTTP 404 | PASS |
| PERIOD-01 | Períodos | Consultar períodos disponibles | Devuelve períodos válidos | 2 períodos | PASS |
| PERIOD-02 | Períodos | Verificar período activo automático | Existe un período activo | 2026-2 activo | PASS |
| CAREER-01 | Carreras | Consultar carreras | Devuelve carreras habilitadas | 8 carreras | PASS |
| CATALOG-01 | Docentes | Consultar docentes | Devuelve catálogo autorizado | 15 docentes | PASS |
| CATALOG-02 | Asignaturas | Consultar asignaturas | Devuelve catálogo autorizado | 37 asignaturas | PASS |
| CATALOG-03 | Salas | Consultar salas | Devuelve salas activas sin duplicados por carrera/edificio/nombre | 34 salas activas; 43 duplicados archivados | PASS |
| CATALOG-04 | Bloques | Consultar bloques horarios | Devuelve bloques ordenados | 8 bloques | PASS |
| SECTION-01 | Secciones | Consultar secciones por período | Solo muestra el período solicitado | 26 en 2026-1 | PASS |
| SECTION-02 | Secciones | Validar aislamiento carrera/período | No mezcla datos de otras carreras/períodos | Sin mezcla observada | PASS |
| IMPORT-01 | Importación | Importar NRC con carrera y período | Crea/actualiza dentro del alcance | PASS en prueba controlada | PASS |
| IMPORT-02 | Importación | Reemplazar archivo | Solo elimina carrera + período seleccionados | PASS en prueba controlada | PASS |
| ASSIST-01 | Modo asistido | Validar CSV con columnas requeridas | Archivo aceptado y filas contabilizadas | Prueba automatizada aprobada | PASS |
| ASSIST-02 | Modo asistido | Rechazar CSV incompleto o con horas/nivel inválidos | Muestra errores antes de importar | Prueba automatizada aprobada | PASS |
| ASSIST-03 | Modo asistido | Calcular cola de bloques pendientes | Solo genera módulos faltantes | Prueba automatizada aprobada | PASS |
| ASSIST-04 | Modo asistido | Filtrar contexto del administrador | KINE y ENF no mezclan secciones ni horarios | Producción: KINE 26/4; ENF 0/0 | PASS |
| ASSIST-05 | Modo asistido | Abrir ruta protegida del asistente | La aplicación entrega la pantalla | HTTP 200 | PASS |
| SCHEDULE-01 | Planificador | Consultar asignaciones | Devuelve asignaciones del período | 4 asignaciones | PASS |
| SCHEDULE-02 | Planificador | Intentar asignar docente en bloque bloqueado | HTTP 400 con conflicto crítico y sin insertar | HTTP 400 `TEACHER_BLOCKED`; cantidad sin cambios | PASS |
| SCHEDULE-02B | Planificador | Intentar duplicar docente en el mismo bloque | HTTP 400 con `TEACHER_DUPLICATE` y sin insertar | HTTP 400; asignación temporal de QA eliminada | PASS |
| SCHEDULE-03 | Conflictos | Resolver conflicto TEACHER_DUPLICATE automáticamente | Mueve la asignación a alternativa válida | Movido a martes M1; HTTP 200 | PASS |
| SCHEDULE-04 | Conflictos | Verificar conflictos después de resolver | No quedan conflictos activos | 0 conflictos activos | PASS |
| SCHEDULE-05 | Planificador | Calcular métricas de salud | Devuelve métricas del período | HTTP 200 | PASS |
| SCHEDULE-06 | Publicación | Publicar horario incompleto | HTTP 409 y detalle de módulos faltantes | HTTP 409: 4 de 72 módulos | PASS |
| PERM-01 | Permisos | Acceder a recursos con sesión válida | Acceso permitido según rol/carrera | PASS en endpoints protegidos | PASS |
| PERM-02 | Permisos | Intentar modificar datos fuera de carrera | HTTP 403 | Pendiente con cuenta coordinador dedicada | BLOCKED |
| UI-01 | Interfaz | Abrir planificador y ver bloques horarios | Se muestran celdas para asignar | Pendiente: navegador no disponible | BLOCKED |
| UI-02 | Interfaz | Arrastrar sección del backlog a una celda | Abre selector de sala y permite guardar | Pendiente: navegador no disponible | BLOCKED |
| UI-03 | Interfaz | Abrir detalle de conflicto y resolver | Modal cierra y recarga datos | Pendiente: navegador no disponible | BLOCKED |
| UI-04 | Interfaz | Importar archivo desde pantalla | Muestra resultado y errores de validación | Pendiente: navegador no disponible | BLOCKED |
| UI-05 | Interfaz | Recorrer las cuatro etapas del modo asistido | Mantiene contexto, progreso y acciones correctas | Pendiente: navegador no disponible | BLOCKED |

## Hallazgo corregido durante la prueba

El mensaje `Conflictos críticos detectados` era válido cuando se intentaba ubicar al docente en un bloque bloqueado. Sin embargo, el botón **Resolver** tenía un problema de rendimiento: evaluaba miles de combinaciones con consultas D1 secuenciales y agotaba el tiempo de la solicitud.

La búsqueda de alternativas fue optimizada para cargar el contexto una sola vez y evaluar las combinaciones en memoria. La resolución automática fue probada en producción y respondió HTTP 200.

## Estado final de datos

- Secciones 2026-1 / Kinesiología: 26.
- Asignaciones totales: 4.
- Conflictos críticos activos: 0.
- Registros de prueba sobrantes: 0.

## Pendientes para cerrar UAT al 100%

1. Ejecutar los cuatro casos UI cuando el navegador integrado esté disponible.
2. Crear/usar una cuenta coordinadora de prueba para verificar aislamiento entre carreras.
3. Repetir los casos de importación con un CSV real de cada carrera antes de la puesta en marcha definitiva.
