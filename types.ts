// Cloudflare Workers Types
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown>(): Promise<T[]>;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

interface D1Meta {
  duration: number;
  changes: number;
  last_row_id: number;
}

interface D1ExecResult {
  count: number;
  duration: number;
}

// Application Types
export interface Career {
  id: string;
  faculty_id: string | null;
  name: string;
  code: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'coordinator' | 'viewer';
  career_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Period {
  id: string;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface Teacher {
  id: string;
  career_id: string;
  rut: string;
  name: string;
  email: string | null;
  contract_type: 'Planta' | 'Honorarios' | 'Media Jornada' | 'Adjunto';
  max_hours_per_week: number;
  avatar_url: string | null;
  is_active: boolean;
}

export interface TeacherAvailability {
  id: string;
  teacher_id: string;
  day_of_week: 1 | 2 | 3 | 4 | 5;
  timeslot_id: string;
  status: 'available' | 'blocked' | 'preference';
}

export interface Room {
  id: string;
  career_id: string | null;
  name: string;
  building: string | null;
  floor: number | null;
  type: 'TEO' | 'LAB' | 'SIM' | 'TAL' | 'AUD';
  capacity: number;
  is_shared: boolean;
  equipment: string | null;
  is_active: boolean;
}

export interface Subject {
  id: string;
  career_id: string;
  code: string;
  name: string;
  level: number;
  credits: number;
}

export interface Section {
  id: string;
  subject_id: string;
  nrc: string;
  section_code: string | null;
  type: 'TEO' | 'LAB' | 'TAL' | 'SIM';
  expected_students: number;
  total_hours_semester: number;
  hours_per_week: number;
  teacher_id: string | null;
  color: string | null;
  priority: 0 | 1 | 2;
}

export interface Timeslot {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  order_index: number;
}

export interface ScheduleAssignment {
  id: string;
  career_id: string;
  period_id: string;
  section_id: string;
  room_id: string | null;
  timeslot_id: string;
  day_of_week: 1 | 2 | 3 | 4 | 5;
  is_temporary: boolean;
  is_published: boolean;
  assigned_by: string | null;
}

export interface Conflict {
  id: string;
  assignment_id: string;
  related_assignment_id: string | null;
  type: 'CRITICAL' | 'WARNING';
  rule_code: string;
  description: string | null;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
}

export interface Rule {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: 'CRITICAL' | 'WARNING';
  is_active: boolean;
  score_impact: number;
}

// Scoring Types
export interface SlotScore {
  timeslot_id: string;
  timeslot_label: string;
  day_of_week: number;
  room_id: string;
  room_name: string;
  score: number;
  breakdown: ScoreBreakdown[];
  blocked: boolean;
}

export interface ScoreBreakdown {
  rule: string;
  points: number;
}

// API Response Types
export interface HealthMetrics {
  total_slots_required: number;
  slots_assigned: number;
  assignment_percentage: number;
  critical_conflicts: number;
  warning_conflicts: number;
  health_score: number;
}

export interface SectionWithDetails extends Section {
  subject_name: string;
  subject_code: string;
  level: number;
  career_id: string;
  teacher_name: string | null;
  teacher_rut: string | null;
  assigned_slots: number;
}

export interface AssignmentWithDetails extends ScheduleAssignment {
  nrc: string;
  section_type: string;
  subject_name: string;
  subject_code: string;
  level: number;
  teacher_name: string | null;
  teacher_id: string | null;
  room_name: string | null;
  room_type: string | null;
  timeslot_label: string;
  start_time: string;
  end_time: string;
}

// Auth Types
export interface AuthPayload {
  id: string;
  email: string;
  role: 'admin' | 'coordinator' | 'viewer';
  career_id: string | null;
  exp: number;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    career_id: string | null;
  };
}

// Upload & Import Types
export interface MappingField {
  systemField: string;
  csvHeader: string;
  status: 'valid' | 'warning' | 'error';
  message?: string;
}
