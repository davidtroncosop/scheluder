import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PeriodSelector } from './PeriodSelector';

interface MainLayoutProps {
    children: React.ReactNode;
    title: string;
    actions?: React.ReactNode;
    selectedPeriod?: string;
    onPeriodChange?: (period: string) => void;
    showPeriodSelector?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
    children,
    title,
    actions,
    selectedPeriod = '2026-1',
    onPeriodChange = () => { },
    showPeriodSelector = true
}) => {
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem('sidebarCollapsed');
            return saved === 'true';
        } catch (e) {
            return false;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('sidebarCollapsed', String(sidebarCollapsed));
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }, [sidebarCollapsed]);

    const [userInfo, setUserInfo] = useState<{ name?: string, email?: string, role?: string } | null>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('user_info');
            if (saved) {
                setUserInfo(JSON.parse(saved));
            }
        } catch (e) {
            console.warn('Failed to parse user_info:', e);
        }
    }, []);

    const getInitials = () => {
        if (!userInfo || !userInfo.name) return 'US';
        const parts = userInfo.name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + (parts[1][0] || '')).toUpperCase();
        }
        return userInfo.name.slice(0, 2).toUpperCase();
    };

    const getAvatarGradient = () => {
        if (!userInfo || !userInfo.email) return 'from-primary to-indigo-500';
        const hash = userInfo.email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const gradients = [
            'from-primary to-indigo-500',
            'from-emerald-500 to-teal-600',
            'from-rose-500 to-orange-500',
            'from-purple-500 to-pink-500',
            'from-amber-500 to-red-500',
            'from-blue-500 to-cyan-500'
        ];
        return gradients[hash % gradients.length];
    };

    const mainNavItems = [
        { name: 'Planificador', icon: 'grid_view', path: '/scheduler' },
        { name: 'Horarios', icon: 'calendar_month', path: '/horarios' },
    ];

    const masterNavItems = [
        { name: 'Docentes', icon: 'groups', path: '/teachers' },
        { name: 'Asignaturas', icon: 'menu_book', path: '/asignaturas' },
        { name: 'Salas', icon: 'meeting_room', path: '/salas' },
    ];

    return (
        <div className="flex h-screen w-full overflow-hidden bg-background-light dark:bg-background-dark font-display transition-colors duration-500">
            {/* Sidebar */}
            <nav className={`${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl border-r border-slate-200/60 dark:border-white/5 flex flex-col shrink-0 py-6 z-40 transition-all duration-300 relative shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-none`}>
                {/* Toggle Button */}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="absolute -right-3 top-12 size-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/50 rounded-full flex items-center justify-center shadow-md z-50 hover:bg-slate-50 hover:scale-105 active:scale-95 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400 group"
                >
                    <span className="material-symbols-outlined text-[16px] group-hover:text-primary transition-colors">
                        {sidebarCollapsed ? 'chevron_right' : 'chevron_left'}
                    </span>
                </button>

                <div className={`${sidebarCollapsed ? 'px-4' : 'px-8'} mb-6`}>
                    <Link to="/scheduler" className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} text-primary mb-5 overflow-hidden group`}>
                        <div className="bg-gradient-to-br from-primary to-indigo-600 p-1.5 rounded-xl shrink-0 shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
                            <span className="material-symbols-outlined text-white text-[22px]">event_available</span>
                        </div>
                        {!sidebarCollapsed && <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-primary-dark transition-colors whitespace-nowrap">Scheduler Pro</h1>}
                    </Link>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className={`${sidebarCollapsed ? 'px-4 text-center' : 'px-8'} mb-2`}>
                        {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Principal</p>}
                        {sidebarCollapsed && <div className="h-px w-6 mx-auto bg-slate-200 dark:bg-slate-700"></div>}
                    </div>

                    <ul className={`space-y-1.5 ${sidebarCollapsed ? 'px-3' : 'px-4'}`}>
                        {mainNavItems.map(item => {
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={item.name}>
                                    <Link
                                        to={item.path}
                                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'p-3' : 'px-4 py-2.5'} text-[15px] font-medium rounded-xl transition-all group relative overflow-hidden ${isActive
                                            ? 'text-primary dark:text-primary-light bg-primary/10 dark:bg-primary/20 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                                            }`}
                                        title={sidebarCollapsed ? item.name : undefined}
                                    >
                                        <span className={`material-symbols-outlined text-[22px] transition-transform group-hover:scale-110 ${isActive ? 'fill-1' : ''}`}>{item.icon}</span>
                                        {!sidebarCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
                                        {isActive && !sidebarCollapsed && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full"></div>
                                        )}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className={`${sidebarCollapsed ? 'px-4 text-center' : 'px-8'} mt-8 mb-2`}>
                        {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Maestros</p>}
                        {sidebarCollapsed && <div className="h-px w-6 mx-auto bg-slate-200 dark:bg-slate-700"></div>}
                    </div>
                    <ul className={`space-y-1.5 ${sidebarCollapsed ? 'px-3' : 'px-4'}`}>
                        {masterNavItems.map(item => {
                            const isActive = location.pathname === item.path;
                            return (
                                <li key={item.name}>
                                    <Link
                                        to={item.path}
                                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'p-3' : 'px-4 py-2.5'} text-[15px] font-medium rounded-xl transition-all group relative overflow-hidden ${isActive
                                            ? 'text-primary dark:text-primary-light bg-primary/10 dark:bg-primary/20 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                                            }`}
                                        title={sidebarCollapsed ? item.name : undefined}
                                    >
                                        <span className={`material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 ${isActive ? 'fill-1' : ''}`}>{item.icon}</span>
                                        {!sidebarCollapsed && <span className="whitespace-nowrap">{item.name}</span>}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>

                    <div className={`${sidebarCollapsed ? 'px-4 text-center' : 'px-8'} mt-8 mb-2`}>
                        {!sidebarCollapsed && <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Sistema</p>}
                        {sidebarCollapsed && <div className="h-px w-6 mx-auto bg-slate-200 dark:bg-slate-700"></div>}
                    </div>
                    <ul className={`space-y-1.5 ${sidebarCollapsed ? 'px-3' : 'px-4'} pb-4`}>
                        <li>
                            <Link
                                to="/upload"
                                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'p-3' : 'px-4 py-2.5'} text-[15px] font-medium rounded-xl transition-all group ${location.pathname === '/upload'
                                    ? 'text-primary dark:text-primary-light bg-primary/10 dark:bg-primary/20 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                                    }`}
                                title={sidebarCollapsed ? 'Importar Datos' : undefined}
                            >
                                <span className={`material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 ${location.pathname === '/upload' ? 'fill-1' : ''}`}>cloud_upload</span>
                                {!sidebarCollapsed && <span className="whitespace-nowrap">Importar Datos</span>}
                            </Link>
                        </li>
                    </ul>
                </div>

                <div className={`mt-auto pt-4 border-t border-slate-100 dark:border-white/5 ${sidebarCollapsed ? 'px-3' : 'px-4'}`}>
                    <Link
                        to="/configuracion"
                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'p-3' : 'px-4 py-2.5'} text-[15px] font-medium rounded-xl transition-all group ${location.pathname === '/configuracion' ? 'bg-primary/5 text-primary' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
                        title={sidebarCollapsed ? 'Configuración' : undefined}
                    >
                        <span className="material-symbols-outlined text-[20px] group-hover:rotate-45 transition-transform">settings</span>
                        {!sidebarCollapsed && <span className="whitespace-nowrap">Configuración</span>}
                    </Link>
                    <Link
                        to="/"
                        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : ''} gap-3 ${sidebarCollapsed ? 'p-3' : 'px-4 py-2.5'} mt-1 text-[15px] font-medium rounded-xl transition-all group text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10`}
                        title={sidebarCollapsed ? 'Cerrar Sesión' : undefined}
                    >
                        <span className="material-symbols-outlined text-[20px] group-hover:-translate-x-1 transition-transform">logout</span>
                        {!sidebarCollapsed && <span className="whitespace-nowrap">Cerrar Sesión</span>}
                    </Link>
                </div>
            </nav>

            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50 dark:bg-[#020617] transition-colors duration-500">
                {/* Premium Background Effects inside Main area */}
                <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob"></div>
                    <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-400/5 blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000"></div>
                </div>

                {/* Header */}
                <header className="flex items-center justify-between px-8 py-5 glass-effect border-b border-slate-200/50 dark:border-white/5 z-10 shrink-0 sticky top-0">
                    <div className="flex items-center gap-5">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
                        {showPeriodSelector && (
                            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700/50 hidden sm:block"></div>
                        )}
                        {showPeriodSelector && (
                            <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={onPeriodChange} />
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        {actions}

                        {/* Avatar/Profile */}
                        <div 
                            className={`size-10 rounded-full bg-gradient-to-tr ${getAvatarGradient()} shadow-sm flex items-center justify-center p-[2px] cursor-pointer hover:shadow-md transition-shadow`}
                            title={userInfo ? `${userInfo.name} (${userInfo.role === 'admin' ? 'Administrador' : 'Coordinador'})` : 'Usuario'}
                        >
                            <div className="w-full h-full bg-white dark:bg-slate-900 rounded-full flex items-center justify-center">
                                <span className="text-sm font-bold text-primary">{getInitials()}</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-0">
                    <div className="animate-fade-in max-w-7xl mx-auto">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
};
