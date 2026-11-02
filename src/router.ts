import { useCallback, useSyncExternalStore } from 'react';

export type View = 'welcome' | 'docs' | 'app';

export interface Route {
  view: View;
  /** Chapter id for docs, workspace tab for the app; null means "whatever the default is". */
  param: string | null;
  /** Element id inside a docs chapter to scroll to; absent means the top of the chapter. */
  anchor?: string | null;
}

/** Where the app is mounted, without the trailing slash: '' locally at the root, '/DBVisualization' on GitHub Pages. */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Path routing with the history API. The host serves index.html for unknown paths (GitHub Pages
 * does it through a copy named 404.html), so a reload on any of these lands back in the app.
 *
 *   /            welcome
 *   /docs        docs, first chapter
 *   /docs/page   that chapter
 *   /docs/page/x that chapter, scrolled to the element with id x
 *   /app         workspace, default tab
 *   /app/locks   that tab
 *
 * Every path is relative to BASE.
 */
export function parsePath(pathname: string): Route {
  const local = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const [view, param, anchor] = local.replace(/^\/+/, '').split('/');
  if (view === 'docs') return { view, param: param || null, anchor: anchor || null };
  if (view === 'app') return { view, param: param || null };
  return { view: 'welcome', param: null };
}

export function formatPath(route: Route): string {
  if (route.view === 'welcome') return `${BASE}/`;
  if (!route.param) return `${BASE}/${route.view}`;
  return route.anchor
    ? `${BASE}/${route.view}/${route.param}/${route.anchor}`
    : `${BASE}/${route.view}/${route.param}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
}

function currentPath() {
  return window.location.pathname;
}

export function useRoute(): [Route, (route: Route, replace?: boolean) => void] {
  const pathname = useSyncExternalStore(subscribe, currentPath, () => '');
  const route = parsePath(pathname);

  const navigate = useCallback((next: Route, replace = false) => {
    const target = formatPath(next);
    if (window.location.pathname === target) return;
    // replace is used to normalise an unknown id, where a new history entry would be noise.
    if (replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    // pushState and replaceState do not fire popstate on their own.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  return [route, navigate];
}
