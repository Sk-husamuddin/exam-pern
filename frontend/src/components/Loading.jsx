import React from 'react';

/**
 * Full-page loading indicator.
 *
 * The spinner styling lives in `src/styles.css` (imported once in main.jsx)
 * so it is available even when only the inline spinner is rendered.
 */
export default function Loading({ message = 'Loading…' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '60vh',
        gap: 12,
      }}
    >
      <div className="exam-spinner" />
      <p style={{ color: '#6b7280', fontSize: 16, margin: 0 }}>{message}</p>
    </div>
  );
}

/** Small inline spinner for buttons and inline actions. */
export function InlineSpinner({ size = 'sm', light = false }) {
  const cls = ['exam-spinner', size === 'sm' ? 'exam-spinner--sm' : '', light ? 'exam-spinner--light' : '']
    .filter(Boolean)
    .join(' ');
  return <span className={cls} aria-hidden="true" />;
}

/**
 * Button contents that swap in a spinner while an action is in flight.
 * `loadingLabel` overrides the default "Working…" text.
 */
export function LoadingButtonContent({ loading, loadingLabel = 'Working…', children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {loading && <InlineSpinner light />}
      <span>{loading ? loadingLabel : children}</span>
    </span>
  );
}
