import { useEffect, useState } from 'react';
import { ReviewProvider } from './components/FloatingReview';
import ADRsPage from './pages/ADRsPage';
import Home from './pages/Home';
import IntegrationDesign from './pages/IntegrationDesign';
import PolicyServiceDataModel from './pages/PolicyServiceDataModel';

type Route =
  | { kind: 'home' }
  | { kind: 'integration' }
  | { kind: 'data-model' }
  | { kind: 'adrs-index' }
  | { kind: 'adr-detail'; adrId: string };

const TOP_LEVEL_NAV: { hash: string; label: string; matches: (r: Route) => boolean }[] = [
  { hash: '#/',            label: 'Overview',                    matches: (r) => r.kind === 'home' },
  { hash: '#/integration', label: 'Integration design',          matches: (r) => r.kind === 'integration' },
  { hash: '#/data-model',  label: 'PolicyService data model',    matches: (r) => r.kind === 'data-model' },
  { hash: '#/adrs',        label: 'ADRs',                        matches: (r) => r.kind === 'adrs-index' || r.kind === 'adr-detail' },
];

function parseRoute(): Route {
  if (typeof window === 'undefined') return { kind: 'home' };
  const h = window.location.hash;
  if (h === '#/integration')          return { kind: 'integration' };
  if (h === '#/data-model')           return { kind: 'data-model' };
  if (h === '#/adrs' || h === '#/adrs/') return { kind: 'adrs-index' };
  const adrMatch = h.match(/^#\/adrs\/(\w+)\/?$/);
  if (adrMatch)                       return { kind: 'adr-detail', adrId: adrMatch[1] };
  return { kind: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Scroll to top whenever a different page loads (especially helpful when
  // navigating between ADR detail pages with long content).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [route.kind, route.kind === 'adr-detail' ? route.adrId : '']);

  return (
    <ReviewProvider>
      <div className="canvas-app-shell">
        <nav className="canvas-topnav">
          <span className="canvas-topnav-brand">Policy Design</span>
          {TOP_LEVEL_NAV.map((r) => (
            <a key={r.hash} href={r.hash} className={r.matches(route) ? 'active' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <main className="canvas-page">
          {route.kind === 'home'         && <Home />}
          {route.kind === 'integration'  && <IntegrationDesign />}
          {route.kind === 'data-model'   && <PolicyServiceDataModel />}
          {route.kind === 'adrs-index'   && <ADRsPage />}
          {route.kind === 'adr-detail'   && <ADRsPage adrId={route.adrId} />}
        </main>
      </div>
    </ReviewProvider>
  );
}
