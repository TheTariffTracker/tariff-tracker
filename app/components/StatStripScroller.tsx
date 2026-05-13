"use client";

import { useRef, type ReactNode } from "react";

// Scroll distance per arrow click, in pixels. Roughly one and a half cards
// wide so the eye lands on a fresh card after each press without losing
// continuity with the previous view.
const SCROLL_STEP_PX = 320;

type Props = {
  children: ReactNode;
};

// Client wrapper for the horizontal stat strip. Renders left arrow → scroll
// container → right arrow. The scroll container itself is a scrolled div
// (overflow-x: auto), and the arrows call scrollBy() on it.
export default function StatStripScroller({ children }: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  function scroll(delta: number) {
    stripRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div className="stat-strip-wrap">
      <button
        type="button"
        className="stat-strip-arrow"
        onClick={() => scroll(-SCROLL_STEP_PX)}
        aria-label="Scroll left"
      >
        ‹
      </button>
      <div className="stat-strip" ref={stripRef}>
        {children}
      </div>
      <button
        type="button"
        className="stat-strip-arrow"
        onClick={() => scroll(SCROLL_STEP_PX)}
        aria-label="Scroll right"
      >
        ›
      </button>
    </div>
  );
}
