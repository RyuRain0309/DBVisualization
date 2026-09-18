import { useCallback, useSyncExternalStore } from 'react';

export type View = 'welcome' | 'docs' | 'app';

export interface Route {
  view: View;
  /** Chapter id for docs, workspace tab for the app; null means "whatever the default is". */
  param: string | null;
}

/**
 * Hash routing rather than the history API: the app is served as static files, and a hash URL
 * survives a reload without needing the host to rewrite unknown paths back to index.html.
 *
 *   #/            welcome
 *   #/docs        docs, first chapter
 *   #/docs/page   that chapter
 *   #/app         workspace, default tab
 *   #/app/locks   that tab
 */
export function parseHash(hash: string): Route {
  const [view, param] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'docs' || view === 'app') return { view, param: param || null };
  return { view: 'welcome', param: null };
}

export function formatHash(route: Route): string {
  if (route.view === 'welcome') return '#/';
  return route.param ? `#/${route.view}/${route.param}` : `#/${route.view}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function currentHash() {
  return window.location.hash;
}

export function useRoute(): [Route, (route: Route, replace?: boolean) => void] {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '');
  const route = parseHash(hash);

  const navigate = useCallback((next: Route, replace = false) => {
    const target = formatHash(next);
    if (window.location.hash === target) return;
    if (replace) {
      // Used to normalise an unknown id, where a new history entry would be noise.
      window.history.replaceState(null, '', target);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      return;
    }
    window.location.hash = target;
  }, []);

  return [route, navigate];
}
