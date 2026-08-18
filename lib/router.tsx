import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface LocationValue { pathname: string; state: unknown }
interface NavigateOptions { replace?: boolean; state?: unknown }
type NavigateFunction = (to: string, options?: NavigateOptions) => void;

const readLocation = (): LocationValue => {
  let path = '/';
  if (window.location.hash) {
    path = window.location.hash.slice(1).split('?')[0] || '/';
  } else if (window.location.pathname && window.location.pathname !== '/') {
    path = window.location.pathname;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return {
    pathname: cleanPath,
    state: window.history.state?.schedulerState ?? null,
  };
};

const RouterContext = createContext<{ location: LocationValue; navigate: NavigateFunction } | null>(null);

export const HashRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationValue>(readLocation);

  useEffect(() => {
    // If user landed on direct pathname without hash, normalize to hash
    if (!window.location.hash && window.location.pathname && window.location.pathname !== '/') {
      window.location.replace(`#${window.location.pathname}`);
    }

    const sync = () => setLocation(readLocation());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback<NavigateFunction>((to, options = {}) => {
    const cleanTo = to.startsWith('/') ? to : `/${to}`;
    const url = `#${cleanTo}`;
    const state = { ...(window.history.state || {}), schedulerState: options.state ?? null };
    if (options.replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    setLocation(readLocation());
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export const useLocation = () => {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useLocation must be used within HashRouter');
  return context.location;
};

export const useNavigate = () => {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useNavigate must be used within HashRouter');
  return context.navigate;
};

interface RouteProps { path: string; element: React.ReactNode }
export const Route: React.FC<RouteProps> = () => null;

export const Routes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const routes = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<RouteProps>[];
  const match = routes.find(route => route.props.path === pathname) || routes.find(route => route.props.path === '*');
  return <>{match?.props.element ?? null}</>;
};

export const Navigate: React.FC<{ to: string; replace?: boolean; state?: unknown }> = ({ to, replace, state }) => {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace, state }), [navigate, replace, state, to]);
  return null;
};

export const Link: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }> = ({ to, onClick, children, ...props }) => {
  const navigate = useNavigate();
  const cleanTo = to.startsWith('/') ? to : `/${to}`;
  return (
    <a
      {...props}
      href={`#${cleanTo}`}
      onClick={event => {
        onClick?.(event);
        if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          navigate(cleanTo);
        }
      }}
    >
      {children}
    </a>
  );
};
