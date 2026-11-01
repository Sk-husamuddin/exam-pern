import React from 'react';
import Clock from './ui/clock';
import GhostLoader from './ui/GhostLoader';

/**
 * Screen loading indicator using the animated 8-bit Ghost Loader.
 */
export default function Loading({ message = 'Loading…', scale = 0.85 }) {
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
        gap: 20,
        padding: '40px 20px',
        color: '#000000',
      }}
    >
      <GhostLoader scale={scale} />
      <p style={{ color: '#71717A', fontSize: 15, margin: 0, fontWeight: 600, letterSpacing: '-0.01em' }}>
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
