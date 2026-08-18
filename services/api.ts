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
    AdminOverview,
    TeacherSubject,
    SubjectRoomCompatibility,
    SubjectPrerequisite,
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
            if (response.status === 401 && endpoint !== '/auth/login') {
                this.token = null;
                session.clear();
            }
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

    async getMe(): Promise<SessionUser> {
        return this.request<SessionUser>('/auth/me');
    }

    // =============================================
    // CAREERS
    // =============================================

    async getCareers(): Promise<Career[]> {
        return this.request<Career[]>('/careers');
    }

    async saveCareer(career: { id?: string; name: string; code: string }, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/careers/${career.id}` : '/careers', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(career),
        });
    }

    async deleteCareer(id: string): Promise<{ success: boolean }> {
        return this.request(`/careers/${id}`, { method: 'DELETE' });
    }

    async getPeriods(): Promise<Array<{ id: string; code: string; name: string; start_date: string; end_date: string; is_active: number | boolean }>> {
        return this.request('/periods');
    }

    async savePeriod(period: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/periods/${period.id}` : '/periods', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(period),
        });
    }

    async deletePeriod(id: string): Promise<{ success: boolean }> {
        return this.request(`/periods/${id}`, { method: 'DELETE' });
    }

    async getSettings(careerId?: string): Promise<Record<string, unknown>> {
        return this.request(`/settings${careerId ? `?career_id=${encodeURIComponent(careerId)}` : ''}`);
    }

    async getUsers(): Promise<Array<{ id: string; email: string; name: string; role: 'admin' | 'coordinator' | 'viewer'; career_id: string | null; is_active: number | boolean; account_status: 'pending' | 'active' | 'disabled' }>> {
        return this.request('/users');
    }

    async getAdminOverview(periodId?: string): Promise<AdminOverview> {
        const query = periodId ? `?period_id=${encodeURIComponent(periodId)}` : '';
        return this.request<AdminOverview>(`/admin/overview${query}`);
    }

    async saveUser(user: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/users/${user.id}` : '/users', {
            method: editing ? 'PUT' : 'POST',
            body: JSON.stringify(user),
        });
    }

    async deleteUser(id: string): Promise<{ success: boolean }> {
        return this.request(`/users/${id}`, { method: 'DELETE' });
    }

    async approveUser(id: string): Promise<{ success: boolean }> {
        return this.request(`/users/${id}/approve`, { method: 'POST' });
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

    async getSectionsForContext(periodId: string, careerId?: string, assigned?: boolean): Promise<SectionWithDetails[]> {
        const params = new URLSearchParams({ period_id: periodId });
        if (careerId) params.set('career_id', careerId);
        if (assigned !== undefined) params.set('assigned', String(assigned));
        return this.request<SectionWithDetails[]>(`/sections?${params.toString()}`);
    }

    async importSchedule(data: Array<Record<string, string>>, periodId: string, careerId: string, importMode: 'replace' | 'merge'): Promise<{ success: boolean; inserted: number; linked: number; message: string; errors: string[] }> {
        return this.request('/import/horarios', {
            method: 'POST',
            body: JSON.stringify({ data, period_id: periodId, career_id: careerId, import_mode: importMode }),
        });
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

    async createSection(section: Record<string, unknown>): Promise<{ id: string }> {
        return this.request<{ id: string }>('/sections', {
            method: 'POST',
            body: JSON.stringify(section),
        });
    }

    async updateSection(id: string, section: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/sections/${id}`, {
            method: 'PUT',
            body: JSON.stringify(section),
        });
    }

    async deleteSection(id: string): Promise<{ success: boolean }> {
        return this.request(`/sections/${id}`, { method: 'DELETE' });
    }

    async updateSectionTeacher(id: string, teacherId: string | null): Promise<{ success: boolean }> {
        return this.request(`/sections/${id}/teacher`, {
            method: 'PUT',
            body: JSON.stringify({ teacher_id: teacherId }),
        });
    }

    // =============================================
    // TIMESLOTS
    // =============================================

    async getTimeslots(): Promise<Timeslot[]> {
        return this.request<Timeslot[]>('/timeslots');
    }

    async saveTimeslot(timeslot: Record<string, unknown>, editing = false): Promise<{ id?: string; success?: boolean }> {
        return this.request(editing ? `/timeslots/${timeslot.id}` : '/timeslots', {
            method: editing ? 'PUT' : 'POST', body: JSON.stringify(timeslot),
        });
    }

    async deleteTimeslot(id: string): Promise<{ success: boolean }> {
        return this.request(`/timeslots/${id}`, { method: 'DELETE' });
    }

    // =============================================
    // SCHEDULE
    // =============================================

    async getSchedule(periodId?: string, careerId?: string): Promise<AssignmentWithDetails[]> {
        const params = new URLSearchParams();
        if (periodId) params.set('period_id', periodId);
        if (careerId) params.set('career_id', careerId);
        const query = params.size ? `?${params.toString()}` : '';
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

    async deleteAssignment(assignmentId: string): Promise<{ success: boolean }> {
        return this.unassignSection(assignmentId);
    }

    async updateAssignment(id: string, changes: Record<string, unknown>): Promise<{ success: boolean }> {
        return this.request(`/schedule/${id}`, { method: 'PUT', body: JSON.stringify(changes) });
    }

    async getScheduleStatus(periodId: string, careerId?: string): Promise<{ status: 'draft' | 'review' | 'published' }> {
        const params = new URLSearchParams({ period_id: periodId });
        if (careerId) params.set('career_id', careerId);
        return this.request(`/schedule/status?${params.toString()}`);
    }

    async publishSchedule(periodId: string, careerId?: string): Promise<{ success: boolean; status: 'published' }> {
        return this.request('/schedule/publish', { method: 'POST', body: JSON.stringify({ period_id: periodId, career_id: careerId }) });
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

    async getConflictsForContext(periodId: string, careerId?: string, resolved = false): Promise<Conflict[]> {
        const params = new URLSearchParams({ period_id: periodId, resolved: String(resolved) });
        if (careerId) params.set('career_id', careerId);
        return this.request<Conflict[]>(`/conflicts?${params.toString()}`);
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

    // =============================================
    // ACADEMIC CONSTRAINTS & INTERMEDIATE RELATIONS
    // =============================================

    async getTeacherSubjects(teacherId: string): Promise<TeacherSubject[]> {
        return this.request<TeacherSubject[]>(`/teachers/${teacherId}/subjects`);
    }

    async updateTeacherSubjects(
        teacherId: string,
        subjects: Array<{ subject_id: string; priority?: number; max_sections?: number }>
    ): Promise<{ success: boolean; count: number }> {
        return this.request<{ success: boolean; count: number }>(`/teachers/${teacherId}/subjects`, {
            method: 'PUT',
            body: JSON.stringify({ subjects }),
        });
    }

    async getSubjectTeachers(subjectId: string): Promise<TeacherSubject[]> {
        return this.request<TeacherSubject[]>(`/subjects/${subjectId}/teachers`);
    }

    async getSubjectRooms(subjectId: string): Promise<SubjectRoomCompatibility[]> {
        return this.request<SubjectRoomCompatibility[]>(`/subjects/${subjectId}/rooms`);
    }

    async updateSubjectRooms(
        subjectId: string,
        rooms: Array<{ room_id: string; requirement_level?: 'EXCLUSIVE' | 'PREFERRED' | 'ALLOWED' }>
    ): Promise<{ success: boolean; count: number }> {
        return this.request<{ success: boolean; count: number }>(`/subjects/${subjectId}/rooms`, {
            method: 'PUT',
            body: JSON.stringify({ rooms }),
        });
    }

    async getSubjectPrerequisites(subjectId: string): Promise<SubjectPrerequisite[]> {
        return this.request<SubjectPrerequisite[]>(`/subjects/${subjectId}/prerequisites`);
    }

    async updateSubjectPrerequisites(
        subjectId: string,
        prerequisites: Array<{ prerequisite_id: string; type?: 'MANDATORY' | 'COREQUISITE' | 'RECOMMENDED' }>
    ): Promise<{ success: boolean; count: number }> {
        return this.request<{ success: boolean; count: number }>(`/subjects/${subjectId}/prerequisites`, {
            method: 'PUT',
            body: JSON.stringify({ prerequisites }),
        });
    }
}

// Singleton instance
export const api = new SchedulerAPI();
export default api;
