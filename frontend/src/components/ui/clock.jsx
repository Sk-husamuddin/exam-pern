"use client";

import * as React from "react";

const DEFAULT_SIZE = 20;
const DEFAULT_DURATION = 1000;

/**
 * Clock — two hands on a faint dial, one sweeping, one creeping.
 * Ported from loadsv (https://loadsv.pedrolu.net) by Pedro Lunet — MIT licensed.
 */
export default function Clock({
  size = DEFAULT_SIZE,
  color,
  duration,
  playState,
  className,
  style,
  ...rest
}) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={["lsv", "lsv-clock", className].filter(Boolean).join(" ")}
      style={{
        "--lsv-size": `${size}px`,
        "--_duration":
          duration === undefined
            ? `var(--lsv-duration, ${DEFAULT_DURATION}ms)`
            : `${duration}ms`,
        "--_play-state": playState ?? "var(--lsv-play-state, running)",
        color,
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fillOpacity={0.12} />
      </svg>
      <svg
        className="lsv-clock-hour"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M12 12V8.5" />
      </svg>
      <svg
        className="lsv-clock-minute"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M12 12V6" />
      </svg>
    </span>
  );
}

