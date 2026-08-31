"use client";

import { useEffect, useRef, useState } from "react";

// Flicker-free loading indicator: a loader that appears for 40ms reads as a
// glitch, not feedback. Show nothing for fast loads (delay), and once shown,
// keep it up long enough to register (minDuration).
export function useDelayedLoading(loading: boolean, { delay = 150, minDuration = 350 }: { delay?: number; minDuration?: number } = {}): boolean {
  const [show, setShow] = useState(false);
  const shownAtRef = useRef(0);

  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, delay);
      return () => clearTimeout(t);
    }
    if (!show) return;
    const elapsed = Date.now() - shownAtRef.current;
    if (elapsed >= minDuration) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(false), minDuration - elapsed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` is deliberately read, not reacted to
  }, [loading, delay, minDuration]);

  // While loading but the delay hasn't elapsed, render NEITHER loader NOR
  // content — the caller keeps the previous frame (usually blank), which is
  // exactly the flicker-free behavior.
  return show;
}
