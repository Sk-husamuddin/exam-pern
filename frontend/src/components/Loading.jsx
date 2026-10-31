import React from 'react';
import Clock from './ui/clock';

/**
 * Full-page loading indicator using the Swiss Red animated Clock spinner.
 */
export default function Loading({ message = 'Loading…', size = 52, color = '#FF1818' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '55vh',
        gap: 16,
        padding: '40px 20px',
        color: '#FFFFFF',
      }}
    >
      <Clock size={size} color={color} />
      <p style={{ color: '#A1A1AA', fontSize: 15, margin: 0, fontWeight: 600, letterSpacing: '-0.01em' }}>
        {message}
      </p>
    </div>
  );
}

/** Small inline spinner for buttons and inline actions using Clock. */
export function InlineSpinner({ size = 'sm', light = false }) {
  const px = size === 'sm' ? 16 : 22;
  return <Clock size={px} color={light ? '#FFFFFF' : 'currentColor'} />;
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
