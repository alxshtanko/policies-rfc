import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Floating "Leave a review" widget backed by giscus (GitHub Discussions).
 * Visitors authenticate with their GitHub account through the iframe;
 * comments are posted as replies in the linked Discussion thread.
 *
 * Architecture:
 *   <ReviewProvider>          — owns panel state, renders the floating button
 *   useReview().open(...)     — anywhere in the tree, request a panel open
 *   <ReviewButton ... />      — inline button that calls open(...) for a section
 *
 * Threads are scoped per-(page, section) via the giscus `data-term`. Switching
 * sections re-mounts the iframe so the right thread is shown.
 */

const GISCUS_REPO        = import.meta.env.VITE_GISCUS_REPO        ?? 'alxshtanko/policies-rfc';
const GISCUS_REPO_ID     = import.meta.env.VITE_GISCUS_REPO_ID     ?? 'R_kgDOSc3lIA';
const GISCUS_CATEGORY    = import.meta.env.VITE_GISCUS_CATEGORY    ?? 'General';
const GISCUS_CATEGORY_ID = import.meta.env.VITE_GISCUS_CATEGORY_ID ?? 'DIC_kwDOSc3lIM4C8_r1';
const TERM_PREFIX        = import.meta.env.VITE_GISCUS_TERM        ?? 'policy-review';

export type ReviewTarget = { term: string; title: string; subtitle?: string };

type Ctx = {
  /**
   * Open the review panel scoped to a section.
   * Pass `term` as a stable kebab-case suffix (e.g. `integration:simulator`).
   * `title` and `subtitle` are shown in the panel header.
   */
  open: (target: ReviewTarget) => void;
  /** Open the panel scoped to the current page (no specific section). */
  openGeneral: () => void;
};

const ReviewContext = createContext<Ctx>({ open: () => {}, openGeneral: () => {} });

export function useReview() {
  return useContext(ReviewContext);
}

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ReviewTarget | null>(null);

  const open = useCallback((t: ReviewTarget) => setTarget(t), []);
  const openGeneral = useCallback(() => {
    const route = typeof window === 'undefined' ? '' : window.location.hash;
    const page =
      route === '#/integration' ? { key: 'integration', label: 'Integration design' }
      : route === '#/data-model' ? { key: 'data-model',  label: 'PolicyService data model' }
      : { key: 'home', label: 'Overview' };
    setTarget({
      term: `${page.key}:general`,
      title: `Feedback — ${page.label}`,
      subtitle: 'General comments on this page',
    });
  }, []);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTarget(null);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [target]);

  return (
    <ReviewContext.Provider value={{ open, openGeneral }}>
      {children}
      <FloatingButton onClick={openGeneral} />
      {target && (
        <>
          <div className="floating-review-backdrop" onClick={() => setTarget(null)} />
          <aside className="floating-review-panel" role="dialog" aria-label={target.title}>
            <header className="floating-review-header">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="floating-review-title">{target.title}</div>
                <div className="floating-review-sub">
                  {target.subtitle ? `${target.subtitle} · ` : ''}
                  Sign in with GitHub to comment.{' '}
                  <a
                    href={`https://github.com/${GISCUS_REPO}/discussions`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    All threads ↗
                  </a>
                </div>
                <div className="floating-review-term">
                  thread: <code>{TERM_PREFIX}:{target.term}</code>
                </div>
              </div>
              <button
                type="button"
                className="floating-review-close"
                onClick={() => setTarget(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="floating-review-body">
              {/* key forces a re-mount when the section changes — giscus
                  doesn't support live re-config on the same iframe */}
              <GiscusFrame key={target.term} term={`${TERM_PREFIX}:${target.term}`} />
            </div>
          </aside>
        </>
      )}
    </ReviewContext.Provider>
  );
}

function FloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="floating-review-btn"
      onClick={onClick}
      aria-label="Leave a review on this page"
      title="Leave a review on this page"
    >
      <ChatIcon />
      <span>Leave a review</span>
    </button>
  );
}

/** Inline section-scoped review trigger; placed next to section headings. */
export function ReviewButton({
  term,
  title,
  subtitle,
}: {
  term: string;
  title: string;
  subtitle?: string;
}) {
  const { open } = useReview();
  return (
    <button
      type="button"
      className="review-section-btn"
      onClick={() => open({ term, title, subtitle })}
      aria-label={`Review: ${title}`}
      title={`Review: ${title}`}
    >
      <ChatIcon size={12} />
      <span>Review</span>
    </button>
  );
}

function GiscusFrame({ term }: { term: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (container.querySelector('script[src*="giscus"]')) return; // already mounted

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    const attrs: Record<string, string> = {
      'data-repo':              GISCUS_REPO,
      'data-repo-id':           GISCUS_REPO_ID,
      'data-category':          GISCUS_CATEGORY,
      'data-category-id':       GISCUS_CATEGORY_ID,
      'data-mapping':           'specific',
      'data-term':              term,
      'data-strict':            '0',
      'data-reactions-enabled': '1',
      'data-emit-metadata':     '0',
      'data-input-position':    'top',
      'data-theme':             'preferred_color_scheme',
      'data-lang':              'en',
      'data-loading':           'lazy',
    };
    for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);

    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [term]);

  return <div ref={containerRef} className="floating-review-giscus" />;
}

function ChatIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
