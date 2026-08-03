import type {
    Career,
    Teacher,
    Room,
    Subject,
    Section,
    SectionWithDetails,
    Timeslot,
    AssignmentWithDetails,
    Conflict,
    SlotScore,
    HealthMetrics,
    LoginResponse,
} from '../types';
import { session, type SessionUser } from '../lib/session';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class SchedulerAPI {
    private token: string | null = null;

    constructor() {
        this.token = session.getToken();
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        };

        if (this.token) {
            (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = (await response.json().catch(() => ({ error: 'Error desconocido' }))) as any;
            throw new Error(error.error || `Error ${response.status}`);
        }

        return response.json();
    }

    // =============================================
    // AUTH
    // =============================================

    async login(email: string, password: string): Promise<LoginResponse> {
        const data = await this.request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });

        this.token = data.token;
        session.save(data.token, data.user as SessionUser);

        return data;
    }

    logout(): void {
        this.token = null;
        session.clear();
    }

    getUser(): SessionUser | null {
        return session.getUser();
    }

    isAuthenticated(): boolean {
        return !!this.token;
    }

    // =============================================
    // CAREERS
    // =============================================

    async getCareers(): Promise<Career[]> {
        return this.request<Career[]>('/careers');
    }

    async getPeriods(): Promise<Array<{ id: string; code: string; name: string; is_active: number | boolean }>> {
        return this.request('/periods');
    }

    async getSettings(careerId?: string): Promise<Record<string, unknown>> {
        return this.request(`/settings${careerId ? `?career_id=${encodeURIComponent(careerId)}` : ''}`);
    }

    async saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.request('/settings', { method: 'PUT', body: JSON.stringify(settings) });
    }

    // =============================================
    // TEACHERS
    // =============================================

    async getTeachers(): Promise<Teacher[]> {
        return this.request<Teacher[]>('/teachers');
    }

    async getTeacher(id: string): Promise<Teacher & { availability: any[] }> {
        return this.request<Teacher & { availability: any[] }>(`/teachers/${id}`);
    }

    async updateTeacherAvailability(
        teacherId: string,
        availability: Array<{ day_of_week: number; timeslot_id: string; status: string }>
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/teachers/${teacherId}/availability`, {
            method: 'PUT',
            body: JSON.stringify({ availability }),
        });
    }

    async saveTeacher(teacher: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/teachers/${teacher.id}` : '/teachers', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(teacher),
        });
    }

    async deleteTeacher(id: string): Promise<{ success: boolean }> {
        return this.request(`/teachers/${id}`, { method: 'DELETE' });
    }

    // =============================================
    // ROOMS
    // =============================================

    async getRooms(): Promise<Room[]> {
        return this.request<Room[]>('/rooms');
    }

    async saveRoom(room: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/rooms/${room.id}` : '/rooms', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(room),
        });
    }

    async deleteRoom(id: string): Promise<{ success: boolean }> {
        return this.request(`/rooms/${id}`, { method: 'DELETE' });
    }

    // =============================================
    // SUBJECTS & SECTIONS
    // =============================================

    async getSubjects(level?: number): Promise<Subject[]> {
        const query = level ? `?level=${level}` : '';
        return this.request<Subject[]>(`/subjects${query}`);
    }

    async saveSubject(subject: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/subjects/${subject.id}` : '/subjects', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(subject),
        });
    }

    async deleteSubject(id: string): Promise<{ success: boolean }> {
        return this.request(`/subjects/${id}`, { method: 'DELETE' });
    }

    async getSections(assigned?: boolean): Promise<SectionWithDetails[]> {
        let query = '';
        if (assigned !== undefined) {
            query = `?assigned=${assigned}`;
        }
        return this.request<SectionWithDetails[]>(`/sections${query}`);
    }

    async getUnassignedSections(): Promise<SectionWithDetails[]> {
        return this.getSections(false);
    }

    async getAssignedSections(): Promise<SectionWithDetails[]> {
        return this.getSections(true);
    }

    async saveSection(section: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/sections/${section.id}` : '/sections', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(section),
        });
    }

    async deleteSection(id: string): Promise<{ success: boolean }> {
        return this.request(`/sections/${id}`, { method: 'DELETE' });
    }

    // =============================================
    // TIMESLOTS
    // =============================================

    async getTimeslots(): Promise<Timeslot[]> {
        return this.request<Timeslot[]>('/timeslots');
    }

    // =============================================
    // SCHEDULE
    // =============================================

    async getSchedule(periodId?: string): Promise<AssignmentWithDetails[]> {
        const query = periodId ? `?period_id=${periodId}` : '';
        return this.request<AssignmentWithDetails[]>(`/schedule${query}`);
    }

    async assignSection(data: {
        section_id: string;
        room_id: string;
        timeslot_id: string;
        day_of_week: number;
        period_id: string;
    }): Promise<{ id: string; warnings: any[] }> {
        return this.request<{ id: string; warnings: any[] }>('/schedule/assign', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async unassignSection(assignmentId: string): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/schedule/${assignmentId}`, {
            method: 'DELETE',
        });
    }

    async updateAssignment(id: string, changes: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.request(`/schedule/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    }

    async getScheduleStatus(periodId: string): Promise<{ status: 'draft' | 'published' }> {
        return this.request(`/schedule/status?period_id=${encodeURIComponent(periodId)}`);
    }

    async publishSchedule(periodId: string): Promise<{ success: boolean; status: 'published' }> {
        return this.request('/schedule/publish', { method: 'POST', body: JSON.stringify({ period_id: periodId }) });
    }

    async getAudit(periodId: string): Promise<Array<Record<string, unknown>>> {
        return this.request(`/audit?period_id=${encodeURIComponent(periodId)}`);
    }

    // =============================================
    // SCORING
    // =============================================

    async getSlotScores(sectionId: string, periodId: string): Promise<SlotScore[]> {
        return this.request<SlotScore[]>(
            `/schedule/score?section_id=${sectionId}&period_id=${periodId}`
        );
    }

    // =============================================
    // CONFLICTS
    // =============================================

    async getConflicts(resolved?: boolean): Promise<Conflict[]> {
        let query = '';
        if (resolved !== undefined) {
            query = `?resolved=${resolved}`;
        }
        return this.request<Conflict[]>(`/conflicts${query}`);
    }

    async getActiveConflicts(): Promise<Conflict[]> {
        return this.getConflicts(false);
    }

    async resolveConflict(
        conflictId: string,
        autoResolve: boolean = false
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/conflicts/${conflictId}/resolve`, {
            method: 'POST',
            body: JSON.stringify({ auto_resolve: autoResolve }),
        });
    }

    // =============================================
    // METRICS
    // =============================================

    async getHealthMetrics(): Promise<HealthMetrics> {
        return this.request<HealthMetrics>('/metrics/health');
    }
}

// Singleton instance
export const api = new SchedulerAPI();
export default api;
