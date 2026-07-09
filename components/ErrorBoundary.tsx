
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6 mx-auto">
                            <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 mb-2 text-center">Algo salió mal</h1>
                        <p className="text-slate-500 text-sm text-center mb-6">
                            La aplicación encontró un error inesperado. Hemos registrado el problema.
                        </p>
                        <div className="bg-slate-50 rounded-lg p-4 mb-6 overflow-auto max-h-40">
                            <p className="text-xs font-mono text-red-600 break-words">
                                {this.state.error?.message}
                            </p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-primary text-white font-bold py-3 rounded-xl hover:bg-primary-dark transition-all"
                        >
                            Reiniciar Aplicación
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
