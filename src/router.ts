import { useCallback, useSyncExternalStore } from 'react';

export type View = 'welcome' | 'docs' | 'app';

export interface Route {
  view: View;
  /** Chapter id for docs, workspace tab for the app; null means "whatever the default is". */
  param: string | null;
  /** Element id inside a docs chapter to scroll to; absent means the top of the chapter. */
  anchor?: string | null;
}

/**
 * Hash routing rather than the history API: the app is served as static files, and a hash URL
 * survives a reload without needing the host to rewrite unknown paths back to index.html.
 *
 *   #/            welcome
 *   #/docs        docs, first chapter
 *   #/docs/page   that chapter
 *   #/docs/page/x that chapter, scrolled to the element with id x
 *   #/app         workspace, default tab
 *   #/app/locks   that tab
 */
export function parseHash(hash: string): Route {
  const [view, param, anchor] = hash.replace(/^#\/?/, '').split('/');
  if (view === 'docs') return { view, param: param || null, anchor: anchor || null };
  if (view === 'app') return { view, param: param || null };
  return { view: 'welcome', param: null };
}

export function formatHash(route: Route): string {
  if (route.view === 'welcome') return '#/';
  if (!route.param) return `#/${route.view}`;
  return route.anchor ? `#/${route.view}/${route.param}/${route.anchor}` : `#/${route.view}/${route.param}`;
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
