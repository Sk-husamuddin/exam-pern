"use client";

import * as React from "react";

/**
 * Props every loadsv spinner accepts. Extra attributes land on the root `<span>`.
 * Ported from loadsv (https://loadsv.pedrolu.net) by Pedro Lunet — MIT licensed.
 */
export interface ClockProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "color"
> {
  /** Width and height in pixels. Defaults to `20`. */
  size?: number;
  /** Any CSS color. Defaults to `currentColor`. */
  color?: string;
  /** Length of one loop in milliseconds. Defaults to `1000`. */
  duration?: number;
  /** Pauses or resumes the animation. Defaults to `running`. */
  playState?: "running" | "paused";
}

/** Default width and height, in pixels. */
const DEFAULT_SIZE = 20;
/** Default loop length for the clock spinner, in milliseconds. */
const DEFAULT_DURATION = 1000;

/**
 * Clock — two hands on a faint dial, one sweeping, one creeping.
 *
 * One <svg> per hand, so each turn is a plain element transform the compositor can run.
 */
export default function Clock({
  size = DEFAULT_SIZE,
  color,
  duration,
  playState,
  className,
  style,
  ...rest
}: ClockProps) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={["lsv", "lsv-clock", className].filter(Boolean).join(" ")}
      style={
        {
          "--lsv-size": `${size}px`,
          "--_duration":
            duration === undefined
              ? `var(--lsv-duration, ${DEFAULT_DURATION}ms)`
              : `${duration}ms`,
          "--_play-state": playState ?? "var(--lsv-play-state, running)",
          color,
          ...style,
        } as React.CSSProperties
      }
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

