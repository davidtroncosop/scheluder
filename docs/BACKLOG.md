# Scheduler Pro — Backlog Funcional

> Desglose de funcionalidades en épicas, historias de usuario y criterios de aceptación.
> Formato compatible con Jira, Linear, Notion, o cualquier herramienta de gestión.

---

## 📊 Resumen de Épicas

| ID | Épica | Prioridad | Estado | Stories |
|----|-------|-----------|--------|---------|
| E01 | Gestión de Asignación Guiada | 🔴 Alta | 🔄 Parcial | 6 |
| E02 | Validación de Disponibilidad | 🔴 Alta | 🔄 Parcial | 5 |
| E03 | Detección y Resolución de Conflictos | 🔴 Alta | 🔄 Parcial | 6 |
| E04 | Vistas Dinámicas del Horario | 🟡 Media | ⏳ Pendiente | 5 |
| E05 | Control y Publicación | 🔴 Alta | ✅ Completo | 4 |
| E06 | Importación de Datos | 🔴 Alta | ✅ Completo | 4 |
| E07 | Automatización Avanzada | 🟡 Media | ⏳ Pendiente | 4 |
| E08 | Gestión de Maestros | 🟢 Baja | ✅ Completo | 5 |

---

## E01: Gestión de Asignación Guiada

**Objetivo:** Permitir al usuario asignar NRCs de forma inteligente sin prueba y error.

### US-01.1: Ver lista de NRCs por asignar
**Como** coordinador académico  
**Quiero** ver una lista de todas las secciones (NRC) pendientes de asignación  
**Para** saber qué trabajo me queda por hacer  

**Criterios de Aceptación:**
- [ ] Mostrar lista de NRCs sin horario asignado
- [ ] Mostrar código de asignatura, nombre, docente
- [ ] Indicar cantidad de slots requeridos por NRC
- [ ] Ordenar por dificultad de asignación

**Estado:** ✅ Implementado (parcial - falta ordenar por dificultad)

---

### US-01.2: Calcular dificultad de asignación
**Como** sistema  
**Quiero** calcular un score de dificultad para cada NRC  
**Para** priorizar automáticamente los casos más críticos  

**Criterios de Aceptación:**
- [ ] Considerar disponibilidad del docente
- [ ] Considerar requisitos de sala (tipo, capacidad)
- [ ] Considerar conflictos potenciales con el nivel
- [ ] Mostrar indicador visual (fácil/difícil/crítico)

**Estado:** ⏳ Pendiente

---

### US-01.3: Seleccionar NRC para asignar
**Como** coordinador académico  
**Quiero** hacer click en un NRC para entrar en "modo decisión"  
**Para** concentrarme en asignar una cosa a la vez  

**Criterios de Aceptación:**
- [ ] Al hacer click, el NRC se marca como seleccionado
- [ ] El panel lateral muestra detalles del NRC
- [ ] El grid resalta solo los slots válidos
- [ ] Los slots inválidos se atenúan o desactivan

**Estado:** 🔄 Parcial

---

### US-01.4: Ver slots disponibles para un NRC
**Como** coordinador académico  
**Quiero** ver qué slots están disponibles para el NRC seleccionado  
**Para** elegir dónde ubicar la clase  

**Criterios de Aceptación:**
- [ ] Filtrar slots por disponibilidad de docente
- [ ] Filtrar slots por disponibilidad de sala
- [ ] Filtrar slots por conflictos de nivel
- [ ] Mostrar código de colores (verde=óptimo, amarillo=aceptable, gris=no disponible)

**Estado:** ⏳ Pendiente

---

### US-01.5: Asignar NRC con un click
**Como** coordinador académico  
**Quiero** hacer click en un slot para asignar el NRC seleccionado  
**Para** no tener que arrastrar ni hacer múltiples pasos  

**Criterios de Aceptación:**
- [ ] Click en slot válido → asigna el NRC
- [ ] Actualizar la vista del grid inmediatamente
- [ ] Remover NRC de la lista "por asignar"
- [ ] Mostrar confirmación visual (toast/animación)

**Estado:** 🔄 Parcial

---

### US-01.6: Desasignar NRC
**Como** coordinador académico  
**Quiero** poder remover una asignación existente  
**Para** corregir errores o reubicar una clase  

**Criterios de Aceptación:**
- [ ] Click derecho o botón "remover" en slot asignado
- [ ] Confirmar acción si hay dependencias
- [ ] Devolver NRC a lista "por asignar"
- [ ] Recalcular conflictos afectados

**Estado:** ⏳ Pendiente

---

## E02: Validación de Disponibilidad

**Objetivo:** Asegurar que cada asignación respete las restricciones de recursos.

### US-02.1: Validar disponibilidad de docente
**Como** sistema  
**Quiero** verificar si el docente está disponible en un slot  
**Para** evitar asignar clases cuando el docente no puede  

**Criterios de Aceptación:**
- [ ] Consultar tabla `teacher_availability`
- [ ] Considerar días y bloques horarios
- [ ] Marcar slot como no disponible si docente no puede
- [ ] Mostrar motivo al usuario (tooltip)

**Estado:** ✅ Implementado

---

### US-02.2: Validar disponibilidad de sala
**Como** sistema  
**Quiero** verificar si hay salas disponibles en un slot  
**Para** no asignar clases sin espacio físico  

**Criterios de Aceptación:**
- [ ] Verificar salas no ocupadas en ese slot
- [ ] Filtrar por tipo de sala requerido (TEO, LAB, SIM, etc.)
- [ ] Considerar capacidad mínima
- [ ] Sugerir salas alternativas si la preferida no está

**Estado:** ✅ Implementado (parcial)

---

### US-02.3: Detectar conflictos de nivel
**Como** sistema  
**Quiero** detectar si un slot ya tiene otra clase del mismo nivel  
**Para** evitar que alumnos tengan dos clases simultáneas  

**Criterios de Aceptación:**
- [ ] Comparar nivel del NRC con asignaciones existentes
- [ ] Marcar como conflicto crítico si hay choque
- [ ] Permitir override con advertencia explícita
- [ ] Registrar excepciones autorizadas

**Estado:** ✅ Implementado

---

### US-02.4: Aplicar reglas RLS (institucionales)
**Como** sistema  
**Quiero** aplicar reglas específicas de la institución  
**Para** cumplir con políticas académicas  

**Criterios de Aceptación:**
- [ ] Cargar reglas desde configuración
- [ ] Evaluar cada regla al validar slot
- [ ] Mostrar qué reglas se violan
- [ ] Permitir configurar nuevas reglas

**Ejemplos de reglas:**
- No más de 4 horas seguidas de clase
- Docentes externos solo en horarios de tarde
- Laboratorios requieren 30 min entre clases

**Estado:** ⏳ Pendiente

---

### US-02.5: Calcular score de idoneidad
**Como** sistema  
**Quiero** calcular un puntaje para cada slot posible  
**Para** recomendar las mejores opciones al usuario  

**Criterios de Aceptación:**
- [ ] Score 0-100 basado en múltiples factores
- [ ] Factores: preferencia docente, distribución de carga, tipo de sala
- [ ] Mostrar ranking visual (1°, 2°, 3° mejor opción)
- [ ] Explicar por qué un slot tiene mejor score

**Estado:** ⏳ Pendiente

---

## E03: Detección y Resolución de Conflictos

**Objetivo:** Identificar problemas automáticamente y guiar al usuario para resolverlos.

### US-03.1: Detectar conflictos en tiempo real
**Como** sistema  
**Quiero** detectar conflictos cada vez que cambia una asignación  
**Para** mantener al usuario informado del estado  

**Criterios de Aceptación:**
- [ ] Ejecutar validación después de cada cambio
- [ ] Clasificar conflictos: CRÍTICO, ALERTA, INFO
- [ ] Actualizar contador en header
- [ ] No bloquear la UI durante validación

**Estado:** ✅ Implementado

---

### US-03.2: Mostrar lista de conflictos
**Como** coordinador académico  
**Quiero** ver todos los conflictos actuales en una lista  
**Para** saber qué problemas debo resolver  

**Criterios de Aceptación:**
- [ ] Panel lateral con lista de conflictos
- [ ] Agrupar por tipo (docente, sala, nivel, regla)
- [ ] Mostrar NRCs afectados
- [ ] Ordenar por severidad

**Estado:** 🔄 Parcial

---

### US-03.3: Ver detalle de un conflicto
**Como** coordinador académico  
**Quiero** ver por qué existe un conflicto  
**Para** entender cómo resolverlo  

**Criterios de Aceptación:**
- [ ] Mostrar recursos involucrados (docente, sala, NRCs)
- [ ] Mostrar regla violada
- [ ] Mostrar sugerencias de resolución
- [ ] Navegar al slot afectado en el grid

**Estado:** ⏳ Pendiente

---

### US-03.4: Resolver conflicto manualmente
**Como** coordinador académico  
**Quiero** poder reubicar una clase para resolver un conflicto  
**Para** tomar decisiones informadas  

**Criterios de Aceptación:**
- [ ] Desde el conflicto, seleccionar qué NRC mover
- [ ] Mostrar slots alternativos válidos
- [ ] Confirmar movimiento
- [ ] Verificar que conflicto se resuelve

**Estado:** ⏳ Pendiente

---

### US-03.5: Resolver conflicto automáticamente
**Como** coordinador académico  
**Quiero** que el sistema sugiera una solución automática  
**Para** ahorrar tiempo en casos sencillos  

**Criterios de Aceptación:**
- [ ] Botón "Resolver automáticamente" en cada conflicto
- [ ] Sistema calcula mejor reubicación
- [ ] Mostrar preview antes de aplicar
- [ ] Aplicar cambio con un click

**Estado:** ⏳ Pendiente

---

### US-03.6: Ignorar/aceptar conflicto (excepción)
**Como** coordinador académico  
**Quiero** poder marcar un conflicto como "aceptado"  
**Para** casos donde la excepción está autorizada  

**Criterios de Aceptación:**
- [ ] Botón "Ignorar" con justificación obligatoria
- [ ] Registrar quién autorizó y cuándo
- [ ] Conflicto deja de contar como crítico
- [ ] Visible en auditoría

**Estado:** ⏳ Pendiente

---

## E04: Vistas Dinámicas del Horario

**Objetivo:** Permitir ver el horario desde diferentes perspectivas.

### US-04.1: Vista por sala
**Como** coordinador académico  
**Quiero** ver el horario organizado por salas  
**Para** verificar ocupación de espacios  

**Criterios de Aceptación:**
- [ ] Selector "Vista: Por Sala"
- [ ] Filas = salas, Columnas = días/bloques
- [ ] Mostrar qué clase está en cada celda
- [ ] Indicar ocupación total por sala

**Estado:** ✅ Implementado

---

### US-04.2: Vista por nivel/semestre
**Como** coordinador académico  
**Quiero** ver el horario de un nivel específico  
**Para** verificar carga de alumnos  

**Criterios de Aceptación:**
- [ ] Selector "Vista: Por Nivel"
- [ ] Dropdown para elegir nivel (1-10)
- [ ] Mostrar todas las clases de ese nivel
- [ ] Detectar huecos y sobrecargas

**Estado:** ⏳ Pendiente

---

### US-04.3: Vista por docente
**Como** coordinador académico  
**Quiero** ver la agenda de un docente específico  
**Para** verificar su carga horaria  

**Criterios de Aceptación:**
- [ ] Selector "Vista: Por Docente"
- [ ] Buscador/dropdown de docentes
- [ ] Mostrar todas las clases del docente
- [ ] Indicar horas totales semanales

**Estado:** ⏳ Pendiente

---

### US-04.4: Modo fantasma (overlay)
**Como** coordinador académico  
**Quiero** ver información de contexto mientras asigno  
**Para** evitar choques invisibles  

**Criterios de Aceptación:**
- [ ] Al pasar mouse sobre slot, mostrar overlay
- [ ] Overlay muestra: otros NRCs del nivel, carga del docente
- [ ] No bloquea la interacción
- [ ] Toggle para activar/desactivar

**Estado:** ⏳ Pendiente

---

### US-04.5: Filtrar por carrera/período
**Como** coordinador académico  
**Quiero** filtrar el horario por carrera y período  
**Para** trabajar con un contexto específico  

**Criterios de Aceptación:**
- [ ] Dropdown de carreras
- [ ] Dropdown de períodos (2026-1, 2026-2)
- [ ] Filtros persistentes en sesión
- [ ] Indicador claro de filtros activos

**Estado:** ✅ Implementado

---

## E05: Control y Publicación

**Objetivo:** Asegurar que solo se publiquen horarios válidos.

### US-05.1: Ver indicador de salud global
**Como** coordinador académico  
**Quiero** ver el estado general del horario  
**Para** saber si está listo para publicar  

**Criterios de Aceptación:**
- [ ] Mostrar % de NRCs asignados
- [ ] Mostrar cantidad de conflictos críticos
- [ ] Mostrar alertas pendientes
- [ ] Indicador visual (rojo/amarillo/verde)

**Estado:** ✅ Implementado

---

### US-05.2: Cambiar estado del horario
**Como** coordinador académico  
**Quiero** cambiar el estado del horario (borrador → revisión → publicado)  
**Para** controlar el flujo de trabajo  

**Criterios de Aceptación:**
- [ ] Estados: Borrador, En Revisión, Publicado
- [ ] Badge visual en header
- [ ] Historial de cambios de estado
- [ ] Notificar a interesados (futuro)

**Estado:** ✅ Implementado

---

### US-05.3: Bloquear publicación si hay conflictos críticos
**Como** sistema  
**Quiero** impedir publicar si hay conflictos sin resolver  
**Para** evitar horarios erróneos en producción  

**Criterios de Aceptación:**
- [ ] Botón "Publicar" deshabilitado si hay críticos
- [ ] Mostrar tooltip con motivo del bloqueo
- [ ] Listar conflictos que impiden publicación
- [ ] Permitir publicar si solo hay alertas (con warning)

**Estado:** ✅ Implementado

---

### US-05.4: Exportar horario
**Como** coordinador académico  
**Quiero** exportar el horario a PDF o Excel  
**Para** compartir con docentes y estudiantes  

**Criterios de Aceptación:**
- [ ] Botón "Exportar" en header
- [ ] Opciones: PDF, Excel, CSV
- [ ] Elegir qué vista exportar (sala, nivel, docente)
- [ ] Incluir metadatos (período, fecha generación)

**Estado:** 🔄 Parcial (solo placeholder)

---

## E06: Importación de Datos

**Objetivo:** Cargar datos iniciales desde archivos CSV.

### US-06.1: Subir archivo CSV
**Como** coordinador académico  
**Quiero** subir un archivo CSV con datos  
**Para** poblar el sistema sin ingreso manual  

**Criterios de Aceptación:**
- [ ] Área de drag & drop
- [ ] Aceptar archivos .csv
- [ ] Validar estructura del archivo
- [ ] Mostrar preview de datos

**Estado:** ✅ Implementado

---

### US-06.2: Importar docentes
**Como** coordinador académico  
**Quiero** importar listado de docentes desde CSV  
**Para** tener el catálogo actualizado  

**Criterios de Aceptación:**
- [ ] Campos: nombre, email, departamento, tipo contrato
- [ ] Detectar duplicados por email
- [ ] Mostrar resumen de importación
- [ ] Manejar errores por fila

**Estado:** ✅ Implementado

---

### US-06.3: Importar asignaturas
**Como** coordinador académico  
**Quiero** importar catálogo de asignaturas desde CSV  
**Para** tener la malla curricular cargada  

**Criterios de Aceptación:**
- [ ] Campos: código, nombre, nivel, créditos
- [ ] Asociar a carrera
- [ ] Validar códigos únicos
- [ ] Actualizar existentes si ya existen

**Estado:** ✅ Implementado

---

### US-06.4: Importar secciones/NRCs
**Como** coordinador académico  
**Quiero** importar las secciones del período desde CSV  
**Para** tener los NRCs a programar  

**Criterios de Aceptación:**
- [ ] Campos: NRC, código asignatura, docente, tipo sala
- [ ] Crear asignatura si no existe
- [ ] Asociar docente si existe
- [ ] Marcar como "por asignar"

**Estado:** ✅ Implementado

---

## E07: Automatización Avanzada

**Objetivo:** Asistencia inteligente para casos complejos.

### US-07.1: Sugerir mejor slot para NRC
**Como** coordinador académico  
**Quiero** que el sistema sugiera dónde ubicar un NRC  
**Para** tomar decisiones más rápido  

**Criterios de Aceptación:**
- [ ] Botón "Sugerir ubicación" en cada NRC
- [ ] Calcular top 3 mejores opciones
- [ ] Mostrar explicación del ranking
- [ ] Permitir aplicar con un click

**Estado:** ⏳ Pendiente

---

### US-07.2: Auto-asignar NRCs fáciles
**Como** coordinador académico  
**Quiero** que el sistema asigne automáticamente los NRCs sin conflicto  
**Para** avanzar rápido en casos obvios  

**Criterios de Aceptación:**
- [ ] Botón "Auto-asignar" global
- [ ] Solo asigna si hay una opción claramente óptima
- [ ] Mostrar preview de lo que asignará
- [ ] Confirmar antes de aplicar

**Estado:** ⏳ Pendiente

---

### US-07.3: Explicar por qué un slot no está disponible
**Como** coordinador académico  
**Quiero** entender por qué no puedo asignar en cierto slot  
**Para** tomar decisiones informadas  

**Criterios de Aceptación:**
- [ ] Tooltip en slots deshabilitados
- [ ] Listar razones (docente, sala, nivel, regla)
- [ ] Link a recurso conflictivo
- [ ] Sugerir alternativa cercana

**Estado:** ⏳ Pendiente

---

### US-07.4: Historial de cambios (auditoría)
**Como** jefe de carrera  
**Quiero** ver quién hizo qué cambios y cuándo  
**Para** tener trazabilidad  

**Criterios de Aceptación:**
- [ ] Log de cada asignación/desasignación
- [ ] Registrar usuario, fecha, hora
- [ ] Filtrar por período, usuario, tipo de cambio
- [ ] Exportar a CSV

**Estado:** ⏳ Pendiente

---

## E08: Gestión de Maestros (CRUD)

**Objetivo:** Administrar catálogos base del sistema.

### US-08.1: CRUD Docentes
**Como** administrador  
**Quiero** crear, editar y eliminar docentes  
**Para** mantener el catálogo actualizado  

**Criterios de Aceptación:**
- [ ] Listar docentes con búsqueda
- [ ] Formulario de creación/edición
- [ ] Validar campos requeridos
- [ ] Soft delete (no eliminar físicamente)

**Estado:** ✅ Implementado (parcial - falta formularios)

---

### US-08.2: Gestionar disponibilidad de docente
**Como** administrador  
**Quiero** definir horarios de disponibilidad por docente  
**Para** respetar sus restricciones  

**Criterios de Aceptación:**
- [ ] Grid de días × bloques
- [ ] Click para marcar disponible/no disponible
- [ ] Guardar cambios en BD
- [ ] Validar contra asignaciones existentes

**Estado:** 🔄 Parcial

---

### US-08.3: CRUD Asignaturas
**Como** administrador  
**Quiero** crear, editar y eliminar asignaturas  
**Para** mantener la malla actualizada  

**Criterios de Aceptación:**
- [ ] Listar por nivel/carrera
- [ ] Formulario con código, nombre, créditos, nivel
- [ ] Asociar prerequisitos (futuro)
- [ ] Validar código único

**Estado:** ✅ Implementado (parcial)

---

### US-08.4: CRUD Salas
**Como** administrador  
**Quiero** crear, editar y eliminar salas  
**Para** reflejar la infraestructura real  

**Criterios de Aceptación:**
- [ ] Listar por edificio/tipo
- [ ] Campos: nombre, tipo, capacidad, edificio, piso
- [ ] Marcar si es compartida
- [ ] Horarios de disponibilidad especial

**Estado:** ✅ Implementado (parcial)

---

### US-08.5: Gestionar períodos académicos
**Como** administrador  
**Quiero** crear y configurar períodos académicos  
**Para** separar los horarios por semestre  

**Criterios de Aceptación:**
- [ ] Crear período con código (ej: 2026-1)
- [ ] Definir fechas de inicio/fin
- [ ] Copiar configuración de período anterior
- [ ] Archivar períodos pasados

**Estado:** 🔄 Parcial

---

## 📋 Priorización por Sprint

### Sprint 1 (MVP Core)
- US-01.3: Seleccionar NRC para asignar
- US-01.4: Ver slots disponibles para un NRC
- US-01.5: Asignar NRC con un click
- US-03.2: Mostrar lista de conflictos

### Sprint 2 (Validación Completa)
- US-02.5: Calcular score de idoneidad
- US-01.2: Calcular dificultad de asignación
- US-03.3: Ver detalle de un conflicto
- US-03.4: Resolver conflicto manualmente

### Sprint 3 (Vistas Avanzadas)
- US-04.2: Vista por nivel/semestre
- US-04.3: Vista por docente
- US-04.4: Modo fantasma

### Sprint 4 (Automatización)
- US-07.1: Sugerir mejor slot para NRC
- US-07.2: Auto-asignar NRCs fáciles
- US-03.5: Resolver conflicto automáticamente

### Sprint 5 (Pulido y Auditoría)
- US-05.4: Exportar horario
- US-07.4: Historial de cambios
- US-02.4: Aplicar reglas RLS

---

## 📊 Métricas de Éxito

| Métrica | Baseline (Excel) | Target |
|---------|------------------|--------|
| Tiempo para armar horario completo | 2-3 días | < 4 horas |
| Errores detectados post-publicación | 5-10 por semestre | 0 |
| Conflictos resueltos manualmente | 100% | < 20% |
| Satisfacción del planificador | 3/10 | 9/10 |
