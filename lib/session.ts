export type DemoRole = 'admin' | 'coordinator' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: DemoRole;
  career_id: string | null;
}

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_info';

export const session = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getUser(): SessionUser | null {
    try {
      const value = localStorage.getItem(USER_KEY);
      return value ? JSON.parse(value) as SessionUser : null;
    } catch {
      return null;
    }
  },

  save(token: string, user: SessionUser): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAuthenticated(): boolean {
    return Boolean(this.getToken() && this.getUser());
  },
};

export const createOfflineDemoSession = (email: string): { token: string; user: SessionUser } => {
  const isFono = email.toLowerCase().includes('fono');
  const isAdmin = email.toLowerCase().includes('admin');
  return {
    token: 'offline-demo-token',
    user: {
      id: isAdmin ? 'usr-admin-001' : isFono ? 'usr-coord-fono' : 'usr-coord-kine',
      email,
      name: isAdmin ? 'Administrador Demo' : isFono ? 'Coordinador Fonoaudiología' : 'Coordinador Kinesiología',
      role: isAdmin ? 'admin' : 'coordinator',
      career_id: isAdmin ? null : isFono ? 'car-fono-001' : 'car-kine-001',
    },
  };
};
