import React, { useEffect, useRef, useState } from 'react';
import { MainLayout } from '../components/MainLayout';
import ConflictPanel from '../components/ConflictPanel';
import api from '../services/api';
import * as dataStore from '../lib/dataStore';
import { useAcademicPeriods } from '../lib/academicPeriods';
import { useSchedulerState } from '../features/scheduler/hooks/useSchedulerState';
import { useSchedulerOperations } from '../features/scheduler/hooks/useSchedulerOperations';

import { SchedulerHeader } from '../features/scheduler/components/SchedulerHeader';
import { SchedulerStats } from '../features/scheduler/components/SchedulerStats';
import { SchedulerGrid } from '../features/scheduler/components/SchedulerGrid';
import { SchedulerSidebar } from '../features/scheduler/components/SchedulerSidebar';
import { AssignmentModal } from '../features/scheduler/components/AssignmentModal';
import { SectionModal } from '../features/scheduler/components/SectionModal';
import { RoomSelectorModal } from '../features/scheduler/components/RoomSelectorModal';
import { ExportModal } from '../features/scheduler/components/ExportModal';
import { AuditDrawer } from '../features/scheduler/components/AuditDrawer';

export type { SchedulerConflict as Conflict } from '../features/scheduler/model';

const DAYS_LIST = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const SchedulerPage: React.FC = () => {
  const { periods, selectedPeriod, setSelectedPeriod } = useAcademicPeriods();
  const state = useSchedulerState();
  const operations = useSchedulerOperations({ state, selectedPeriod, periods });

  const [, setSelectedConflict] = useState<any>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Initialize Master Data on Mount
  useEffect(() => {
    state.refreshRooms();
    const storedTeachers = dataStore.getTeachers();
    state.setTeachers(storedTeachers);
    const storedSubjects = dataStore.getSubjects();
    state.setAllSubjects(storedSubjects);
  }, [state.refreshRooms, state.setAllSubjects, state.setTeachers]);

  // Load Schedule Data on Period change
  useEffect(() => {
    operations.loadScheduleData();
  }, [operations.loadScheduleData]);

  const {
    sections,
    assignments,
    conflicts,
    timeslots,
    metrics,
    loading,
    saving,
    hasChanges,
    setHasChanges,
    error,
    setError,
    notice,
    setNotice,
    scheduleStatus,
    availableRooms,
    teachers,
    allSubjects,
    teacherAvailabilities,
    viewMode,
    setViewMode,
    selectedViewLevel,
    setSelectedViewLevel,
    selectedViewTeacher,
    setSelectedViewTeacher,
    selectedViewRoom,
    setSelectedViewRoom,
    sidebarCollapsed,
    setSidebarCollapsed,
    availableTeachersList,
    availableLevels,
    draggingSection,
    activeSchedulingSection,
    setActiveSchedulingSection,
    dropTarget,
    roomSelectorData,
    setRoomSelectorData,
    editingAssignment,
    setEditingAssignment,
    editingSection,
    setEditingSection,
    isSectionModalOpen,
    setIsSectionModalOpen,
    showExportModal,
    setShowExportModal,
    showAuditPanel,
    setShowAuditPanel,
    showConflictsPanel,
    setShowConflictsPanel,
    showClearConfirmModal,
    setShowClearConfirmModal,
    modalDefaultLevel,
    modalInitialValues,
    setModalInitialValues,
    proposalResult,
    setProposalResult,
    auditLog,
    canPublish,
  } = state;

  const {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleSlotClick,
    handleConfirmRoomAssignment,
    handleUpdateSectionTeacher,
    handleUpdateSectionRoom,
    handleAutoAssign,
    handleClearAllAssignments,
    handleEditAssignment,
    handleSaveAssignment,
    handleDeleteAssignment,
    handleOpenSectionModal,
    handleDuplicateSection,
    handleSaveSection,
    handleDeleteSection,
    handlePublish,
    handleExportPdf,
  } = operations;

  return (
    <MainLayout
      title="Planificador"
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      showPeriodSelector={false}
      noPadding={true}
      noHeader={true}
    >
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Notice alert */}
        {notice && (
          <div className={`px-6 py-2 text-xs font-semibold flex items-center justify-between shrink-0 ${
            notice.type === 'success' ? 'bg-emerald-500 text-white' : notice.type === 'error' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'
          }`}>
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} className="hover:opacity-80">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Error alert */}
        {error && (
          <div className="px-6 py-2 text-xs font-semibold bg-rose-600 text-white flex items-center justify-between shrink-0">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="hover:opacity-80">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Header Toolbar */}
        <SchedulerHeader
          periods={periods}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
          scheduleStatus={scheduleStatus}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          selectedViewLevel={selectedViewLevel}
          onChangeViewLevel={setSelectedViewLevel}
          availableLevels={availableLevels}
          onAddSectionForLevel={(lvl) => handleOpenSectionModal(null, lvl)}
          selectedViewRoom={selectedViewRoom}
          onChangeViewRoom={setSelectedViewRoom}
          availableRooms={availableRooms}
          selectedViewTeacher={selectedViewTeacher}
          onChangeViewTeacher={setSelectedViewTeacher}
          availableTeachers={availableTeachersList}
          onAutoAssign={handleAutoAssign}
          onClearAll={() => setShowClearConfirmModal(true)}
          assignedCount={assignments.length}
          onPublish={handlePublish}
          onOpenExport={() => setShowExportModal(true)}
          onOpenAudit={() => setShowAuditPanel(true)}
          onSaveDraft={() => setHasChanges(false)}
          saving={saving}
          hasChanges={hasChanges}
          canPublish={canPublish}
        />

        {/* Health Stats & Conflict Badges */}
        <SchedulerStats
          metrics={metrics}
          conflicts={conflicts}
          assignments={assignments}
          onOpenConflictsPanel={() => setShowConflictsPanel(true)}
        />

        {/* Main Planning Area: Sidebar + Grid */}
        <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
          {/* Backlog Sidebar */}
          <SchedulerSidebar
            sections={sections}
            teachers={teachers}
            availableRooms={availableRooms}
            activeSectionId={activeSchedulingSection?.id || null}
            onSelectSectionForScheduling={setActiveSchedulingSection}
            onUpdateSectionTeacher={handleUpdateSectionTeacher}
            onUpdateSectionRoom={handleUpdateSectionRoom}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onOpenSectionModal={handleOpenSectionModal}
            onDuplicateSection={handleDuplicateSection}
            onTeacherSelect={(name) => {
              setViewMode('docente');
              setSelectedViewTeacher(name);
            }}
          />

          {/* Interactive Timetable Grid */}
          <div ref={gridContainerRef} className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                <span className="material-symbols-outlined animate-spin text-2xl mr-2">progress_activity</span>
                Cargando horario académico...
              </div>
            ) : (
              <SchedulerGrid
                timeslots={timeslots}
                assignments={assignments}
                conflicts={conflicts}
                viewMode={viewMode}
                selectedViewLevel={selectedViewLevel}
                selectedViewRoom={selectedViewRoom}
                selectedViewTeacher={selectedViewTeacher}
                parallelCount={3}
                draggingSection={draggingSection}
                activeSchedulingSection={activeSchedulingSection}
                onSelectActiveSection={setActiveSchedulingSection}
                onUpdateActiveTeacher={handleUpdateSectionTeacher}
                onUpdateActiveRoom={handleUpdateSectionRoom}
                dropTarget={dropTarget}
                availableRooms={availableRooms}
                teacherAvailabilities={teacherAvailabilities}
                teachers={teachers}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onSlotClick={handleSlotClick}
                onEditAssignment={handleEditAssignment}
                onDeleteAssignment={handleDeleteAssignment}
              />
            )}
          </div>
        </div>

        {/* Modals and Drawers */}
        <AssignmentModal
          assignment={editingAssignment}
          isOpen={Boolean(editingAssignment)}
          onClose={() => setEditingAssignment(null)}
          availableRooms={availableRooms}
          availableTeachers={availableTeachersList}
          onSave={handleSaveAssignment}
          onDelete={handleDeleteAssignment}
        />

        <SectionModal
          section={editingSection}
          isOpen={isSectionModalOpen}
          onClose={() => {
            setIsSectionModalOpen(false);
            setEditingSection(null);
            setModalInitialValues(null);
          }}
          allSubjects={allSubjects}
          availableTeachers={availableTeachersList}
          existingTheories={sections.filter(s => s.type === 'TEO')}
          defaultLevel={modalDefaultLevel}
          initialValues={modalInitialValues}
          onSave={handleSaveSection}
          onDelete={handleDeleteSection}
        />

        <RoomSelectorModal
          selectorData={roomSelectorData}
          compatibleRooms={roomSelectorData ? availableRooms.filter(r => {
            const minCapacity = roomSelectorData.section.expected_students || 0;
            if (minCapacity > 0 && r.capacity < minCapacity) return false;
            const t = (roomSelectorData.section.type || '').toUpperCase();
            if (t === 'SIM') return r.type === 'SIM';
            if (t === 'LAB') return r.type === 'LAB' || r.type === 'SIM';
            if (t === 'TAL') return r.type === 'TAL';
            return r.type === 'TEO' || r.type === 'AUD';
          }) : []}
          onClose={() => setRoomSelectorData(null)}
          onSelectRoom={handleConfirmRoomAssignment}
        />

        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          assignments={assignments}
          periodName={periods.find(p => p.id === selectedPeriod)?.name}
          viewMode={viewMode}
          selectedLevel={selectedViewLevel}
          selectedRoom={selectedViewRoom}
          selectedTeacher={selectedViewTeacher}
          parallelTracks={2}
          onExportPdf={handleExportPdf}
        />

        <AuditDrawer
          isOpen={showAuditPanel}
          onClose={() => setShowAuditPanel(false)}
          auditLog={auditLog}
        />

        {/* Clear All Confirmation Modal */}
        {showClearConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
              <div className="flex items-center gap-3.5">
                <div className="size-12 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">delete_sweep</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    ¿Desasignar todo el horario?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Periodo activo: {periods.find(p => p.id === selectedPeriod)?.name || selectedPeriod}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/70">
                Esta acción removerá todas las <strong>{assignments.length} asignaciones</strong> de la matriz horaria. Todas las secciones volverán al backlog con sus horas requeridas para ser re-planificadas.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirmModal(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleClearAllAssignments}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md shadow-rose-600/20 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">restart_alt</span>
                  <span>{saving ? 'Desasignando...' : 'Confirmar y Desasignar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Proposal Result Modal with Academic Disclaimer */}
        {proposalResult && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
            <div className="relative bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 my-auto flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Propuesta de Horario Generada
                    </h3>
                    <p className="text-xs text-slate-500">
                      Motor de optimización heurística y restricciones académicas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProposalResult(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center">
                <div>
                  <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                    {proposalResult.completed}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Asignados</div>
                </div>
                <div>
                  <div className="text-xl font-extrabold text-slate-800 dark:text-slate-200">
                    {proposalResult.total}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Requerido</div>
                </div>
                <div>
                  <div className={`text-xl font-extrabold ${proposalResult.failed > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {proposalResult.failed}
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pendientes</div>
                </div>
              </div>

              {/* Disclaimer Block */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-300">
                  <span className="material-symbols-outlined text-base">verified_user</span>
                  <span>Aviso de Responsabilidad y Auditoría (Disclaimer)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                  Esta propuesta es una recomendación matemática y heurística generada por el algoritmo para optimizar la distribución horaria sin choques de docentes ni salas. 
                  <strong> La coordinación académica o dirección de carrera debe auditar y validar los acuerdos docentes, requerimientos de equipamiento y criterios pedagógicos antes de publicar este horario como oficial.</strong>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setProposalResult(null)}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Revisar en la Matriz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProposalResult(null);
                    setShowExportModal(true);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white transition-colors cursor-pointer"
                >
                  Exportar Borrador
                </button>
                {canPublish && (
                  <button
                    type="button"
                    onClick={() => {
                      setProposalResult(null);
                      handlePublish();
                    }}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm cursor-pointer"
                  >
                    Publicar Horario Oficial
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showConflictsPanel && (
          <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
            <ConflictPanel
              conflicts={conflicts}
              days={DAYS_LIST}
              setShowConflictsPanel={setShowConflictsPanel}
              setSelectedConflict={setSelectedConflict}
              onResolveAll={async () => {
                for (const conflict of conflicts) {
                  await api.resolveConflict(conflict.id, true);
                }
                await operations.loadScheduleData();
              }}
            />
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default SchedulerPage;
