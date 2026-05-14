import { useEffect, useRef, useState } from 'react';

/**
 * Floating "Leave a review" widget backed by giscus (GitHub Discussions).
 * Visitors authenticate with their GitHub account through the iframe;
 * comments are posted as replies in the linked Discussion thread.
 *
 * Configuration is pulled from build-time env vars so the component is
 * portable across repos / forks. Defaults point at alxshtanko/policies-rfc.
 */

const GISCUS_REPO          = import.meta.env.VITE_GISCUS_REPO          ?? 'alxshtanko/policies-rfc';
const GISCUS_REPO_ID       = import.meta.env.VITE_GISCUS_REPO_ID       ?? 'R_kgDOSc3lIA';
const GISCUS_CATEGORY      = import.meta.env.VITE_GISCUS_CATEGORY      ?? 'General';
const GISCUS_CATEGORY_ID   = import.meta.env.VITE_GISCUS_CATEGORY_ID   ?? 'DIC_kwDOSc3lIM4C8_r1';
const GISCUS_TERM          = import.meta.env.VITE_GISCUS_TERM          ?? 'policy-design-review';

export function FloatingReview() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="floating-review-btn"
        onClick={() => setOpen(true)}
        aria-label="Leave a review"
        title="Leave a review"
      >
        <ChatIcon />
        <span>Leave a review</span>
      </button>

      {open && (
        <>
          <div className="floating-review-backdrop" onClick={() => setOpen(false)} />
          <aside className="floating-review-panel" role="dialog" aria-label="Reviews">
            <header className="floating-review-header">
              <div>
                <div className="floating-review-title">Reviews</div>
                <div className="floating-review-sub">
                  Sign in with GitHub to comment — posts to{' '}
                  <a
                    href={`https://github.com/${GISCUS_REPO}/discussions`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {GISCUS_REPO} · Discussions
                  </a>
                </div>
              </div>
              <button
                type="button"
                className="floating-review-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="floating-review-body">
              <GiscusFrame />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function GiscusFrame() {
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
      'data-term':              GISCUS_TERM,
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
      // On unmount or remount, drop the iframe so we don't accumulate frames.
      container.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} className="floating-review-giscus" />;
}

function ChatIcon() {
  return (
    <svg
      width="16"
      height="16"
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
