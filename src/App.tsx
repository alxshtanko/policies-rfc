import { useEffect, useState } from 'react';
import { ReviewProvider } from './components/FloatingReview';
import Home from './pages/Home';
import IntegrationDesign from './pages/IntegrationDesign';
import PolicyServiceDataModel from './pages/PolicyServiceDataModel';

type Route = '#/' | '#/integration' | '#/data-model';

const ROUTES: { hash: Route; label: string }[] = [
  { hash: '#/',            label: 'Overview' },
  { hash: '#/integration', label: 'Integration design' },
  { hash: '#/data-model',  label: 'PolicyService data model' },
];

function currentRoute(): Route {
  if (typeof window === 'undefined') return '#/';
  const h = window.location.hash as Route;
  if (h === '#/integration' || h === '#/data-model') return h;
  return '#/';
}

export function App() {
  const [route, setRoute] = useState<Route>(() => currentRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <ReviewProvider>
      <div className="canvas-app-shell">
        <nav className="canvas-topnav">
          <span className="canvas-topnav-brand">Policy Design</span>
          {ROUTES.map((r) => (
            <a key={r.hash} href={r.hash} className={route === r.hash ? 'active' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <main className="canvas-page">
          {route === '#/' && <Home />}
          {route === '#/integration' && <IntegrationDesign />}
          {route === '#/data-model' && <PolicyServiceDataModel />}
        </main>
      </div>
    </ReviewProvider>
  );
}
