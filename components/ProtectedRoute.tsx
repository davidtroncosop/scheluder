import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from '../lib/router';
import { session } from '../lib/session';
import api from '../services/api';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [validating, setValidating] = useState(session.isAuthenticated());
  const [authenticated, setAuthenticated] = useState(session.isAuthenticated());

  useEffect(() => {
    if (!session.isAuthenticated()) {
      setValidating(false);
      setAuthenticated(false);
      return;
    }
    api.getMe()
      .then(user => {
        const token = session.getToken();
        if (token) session.save(token, user);
        setAuthenticated(true);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setValidating(false));
  }, []);

  if (validating) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950" aria-label="Validando sesión">
      <span className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>;
  }

  if (!authenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};
