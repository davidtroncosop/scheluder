import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
    DB: D1Database;
    JWT_SECRET?: string;
    ENVIRONMENT: string;
    DEMO_AUTH?: string;
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    API_KEY?: string;
    BOOTSTRAP_TOKEN?: string;
    CORS_ORIGINS?: string;
    ACADEMIC_TIMEZONE?: string;
    APP_VERSION?: string;
}

export interface UserPayload {
    id: string;
    email: string;
    role: 'admin' | 'coordinator' | 'viewer';
    career_id: string | null;
}

export interface HonoEnv {
    Bindings: Env;
    Variables: {
        user: UserPayload;
    };
}

export type SectionType = 'TEO' | 'LAB' | 'TAL' | 'SIM';
