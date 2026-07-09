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

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class SchedulerAPI {
    private token: string | null = null;

    constructor() {
        // Load token from localStorage
        this.token = localStorage.getItem('scheduler_token');
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
        localStorage.setItem('scheduler_token', data.token);
        localStorage.setItem('scheduler_user', JSON.stringify(data.user));

        return data;
    }

    logout(): void {
        this.token = null;
        localStorage.removeItem('scheduler_token');
        localStorage.removeItem('scheduler_user');
    }

    getUser(): any {
        const user = localStorage.getItem('scheduler_user');
        return user ? JSON.parse(user) : null;
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

    // =============================================
    // ROOMS
    // =============================================

    async getRooms(): Promise<Room[]> {
        return this.request<Room[]>('/rooms');
    }

    // =============================================
    // SUBJECTS & SECTIONS
    // =============================================

    async getSubjects(level?: number): Promise<Subject[]> {
        const query = level ? `?level=${level}` : '';
        return this.request<Subject[]>(`/subjects${query}`);
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
