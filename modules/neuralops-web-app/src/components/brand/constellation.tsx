"use client";

import { useEffect, useRef } from "react";

// The nexus constellation: drifting nodes joined by proximity links.
// Decorative only — pauses when hidden, freezes under reduced motion.
export function Constellation({ density = 16 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0,
      h = 0,
      raf = 0;
    let nodes: Array<{ x: number; y: number; vx: number; vy: number; r: number }> = [];
    const styles = () => getComputedStyle(document.documentElement);

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      w = canvas.width = rect.width * devicePixelRatio;
      h = canvas.height = rect.height * devicePixelRatio;
      nodes = Array.from({ length: Math.min(70, Math.floor(rect.width / density)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12 * devicePixelRatio,
        vy: (Math.random() - 0.5) * 0.12 * devicePixelRatio,
        r: (Math.random() * 1.6 + 0.8) * devicePixelRatio,
      }));
    };

    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      const star = styles().getPropertyValue("--star");
      const link = styles().getPropertyValue("--link");
      const LINK = 130 * devicePixelRatio;
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      ctx.lineWidth = devicePixelRatio * 0.7;
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = link;
            ctx.globalAlpha = 1 - d / LINK;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      ctx.globalAlpha = 1;
      ctx.fillStyle = star;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, 7);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      resize();
      frame();
    };
    start();
    addEventListener("resize", start, { passive: true });
    const vis = () => (document.hidden ? cancelAnimationFrame(raf) : reduced || frame());
    document.addEventListener("visibilitychange", vis);
    const observer = new MutationObserver(start); // re-read tokens on theme change
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", start);
      document.removeEventListener("visibilitychange", vis);
      observer.disconnect();
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
