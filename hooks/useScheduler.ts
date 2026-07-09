import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import type {
    SectionWithDetails,
    AssignmentWithDetails,
    Timeslot,
    Room,
    SlotScore,
    HealthMetrics,
    Conflict,
} from '../types';

export interface SchedulerState {
    // Data
    sections: SectionWithDetails[];
    unassignedSections: SectionWithDetails[];
    assignments: AssignmentWithDetails[];
    timeslots: Timeslot[];
    rooms: Room[];
    conflicts: Conflict[];
    metrics: HealthMetrics | null;

    // Selection
    selectedSection: SectionWithDetails | null;
    slotScores: SlotScore[];

    // UI State
    loading: boolean;
    error: string | null;
    view: 'week' | 'day' | 'room';
}

export function useScheduler(periodId: string = 'per-2026-1') {
    const [state, setState] = useState<SchedulerState>({
        sections: [],
        unassignedSections: [],
        assignments: [],
        timeslots: [],
        rooms: [],
        conflicts: [],
        metrics: null,
        selectedSection: null,
        slotScores: [],
        loading: true,
        error: null,
        view: 'week',
    });

    // Load initial data
    const loadData = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const [
                sections,
                unassignedSections,
                assignments,
                timeslots,
                rooms,
                conflicts,
                metrics,
            ] = await Promise.all([
                api.getSections(),
                api.getUnassignedSections(),
                api.getSchedule(periodId),
                api.getTimeslots(),
                api.getRooms(),
                api.getActiveConflicts(),
                api.getHealthMetrics(),
            ]);

            setState(prev => ({
                ...prev,
                sections,
                unassignedSections,
                assignments,
                timeslots,
                rooms,
                conflicts,
                metrics,
                loading: false,
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Error al cargar datos',
            }));
        }
    }, [periodId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Select a section to assign
    const selectSection = useCallback(async (section: SectionWithDetails | null) => {
        if (!section) {
            setState(prev => ({ ...prev, selectedSection: null, slotScores: [] }));
            return;
        }

        setState(prev => ({ ...prev, selectedSection: section, loading: true }));

        try {
            const scores = await api.getSlotScores(section.id, periodId);
            setState(prev => ({ ...prev, slotScores: scores, loading: false }));
        } catch (error) {
            console.error('Error loading scores:', error);
            setState(prev => ({ ...prev, slotScores: [], loading: false }));
        }
    }, [periodId]);

    // Assign section to a slot
    const assignToSlot = useCallback(async (
        roomId: string,
        timeslotId: string,
        dayOfWeek: number
    ) => {
        const { selectedSection } = state;
        if (!selectedSection) return;

        setState(prev => ({ ...prev, loading: true }));

        try {
            const result = await api.assignSection({
                section_id: selectedSection.id,
                room_id: roomId,
                timeslot_id: timeslotId,
                day_of_week: dayOfWeek,
                period_id: periodId,
            });

            // Show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                console.warn('Assignment warnings:', result.warnings);
            }

            // Reload data
            await loadData();

            // Clear selection
            setState(prev => ({ ...prev, selectedSection: null, slotScores: [] }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Error al asignar',
            }));
        }
    }, [state.selectedSection, periodId, loadData]);

    // Remove an assignment
    const removeAssignment = useCallback(async (assignmentId: string) => {
        setState(prev => ({ ...prev, loading: true }));

        try {
            await api.unassignSection(assignmentId);
            await loadData();
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Error al eliminar',
            }));
        }
    }, [loadData]);

    // Resolve a conflict
    const resolveConflict = useCallback(async (conflictId: string, autoResolve: boolean = false) => {
        setState(prev => ({ ...prev, loading: true }));

        try {
            await api.resolveConflict(conflictId, autoResolve);
            await loadData();
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Error al resolver conflicto',
            }));
        }
    }, [loadData]);

    // Get score for a specific slot
    const getScoreForSlot = useCallback((
        timeslotId: string,
        dayOfWeek: number,
        roomId: string
    ): SlotScore | undefined => {
        return state.slotScores.find(
            s => s.timeslot_id === timeslotId &&
                s.day_of_week === dayOfWeek &&
                s.room_id === roomId
        );
    }, [state.slotScores]);

    // Get best available slots
    const getBestSlots = useCallback((limit: number = 5): SlotScore[] => {
        return state.slotScores
            .filter(s => !s.blocked && s.score > 0)
            .slice(0, limit);
    }, [state.slotScores]);

    // Get assignments for a specific slot
    const getAssignmentsForSlot = useCallback((
        timeslotId: string,
        dayOfWeek: number
    ): AssignmentWithDetails[] => {
        return state.assignments.filter(
            a => a.timeslot_id === timeslotId && a.day_of_week === dayOfWeek
        );
    }, [state.assignments]);

    // Get sections by level
    const getSectionsByLevel = useCallback((level: number): SectionWithDetails[] => {
        return state.sections.filter(s => s.level === level);
    }, [state.sections]);

    // Set view mode
    const setView = useCallback((view: 'week' | 'day' | 'room') => {
        setState(prev => ({ ...prev, view }));
    }, []);

    // Clear error
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    return {
        ...state,
        loadData,
        selectSection,
        assignToSlot,
        removeAssignment,
        resolveConflict,
        getScoreForSlot,
        getBestSlots,
        getAssignmentsForSlot,
        getSectionsByLevel,
        setView,
        clearError,
    };
}

export default useScheduler;
