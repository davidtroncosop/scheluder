import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import api from '../services/api';

interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'coordinator' | 'viewer';
    career_id: string | null;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    error: string | null;
    login: (email: string, password: string) => Promise<boolean>;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for existing session
        const storedUser = api.getUser();
        if (storedUser && api.isAuthenticated()) {
            setUser(storedUser);
        }
        setLoading(false);
    }, []);

    const login = async (email: string, password: string): Promise<boolean> => {
        setLoading(true);
        setError(null);

        try {
            const response = await api.login(email, password);
            setUser(response.user as User);
            setLoading(false);
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error de autenticación');
            setLoading(false);
            return false;
        }
    };

    const logout = () => {
        api.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                login,
                logout,
                isAuthenticated: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export default useAuth;
