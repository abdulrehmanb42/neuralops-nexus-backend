"use client";

import { useEffect, useRef, useState } from "react";

const REPLY = "Here's Q3–Q4 revenue by month — steady climb with a December peak. Want the same as a table?";
const BARS = [46, 57, 74, 66, 82, 94];
const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Phase = "idle" | "typing" | "thinking" | "streaming" | "chart" | "hold";

// Auto-playing product simulation: a directive message types itself, the
// persona thinks, the reply streams, the chart draws. Loops; static under
// reduced motion.
export function ChatDemo() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [typedLen, setTypedLen] = useState(0);
  const [streamed, setStreamed] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) {
      setPhase("chart");
      setTypedLen(999);
      setStreamed(999);
      return;
    }
    let alive = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (alive) {
        setPhase("idle"); setTypedLen(0); setStreamed(0);
        await sleep(900);
        setPhase("typing");
        for (let i = 0; i <= MSG_TEXT.length && alive; i++) { setTypedLen(i); await sleep(32); }
        setPhase("thinking"); await sleep(1600);
        setPhase("streaming");
        const words = REPLY.split(" ");
        for (let i = 0; i <= words.length && alive; i++) { setStreamed(i); await sleep(46); }
        setPhase("chart"); await sleep(5200);
      }
    })();
    return () => { alive = false; };
  }, []);

  const words = REPLY.split(" ");
  const showM1 = phase !== "idle";
  const showM2 = phase === "streaming" || phase === "chart" || phase === "hold";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface/90 shadow-[0_30px_80px_-30px_rgba(0,0,0,.55)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px] text-ink2">
        <span className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => <i key={i} className="size-2 rounded-full bg-line" />)}
        </span>
        <span className="font-mono"># growth · Q3 review</span>
      </div>
      <div className="flex min-h-[308px] flex-col gap-3.5 p-4 pb-2">
        <Message show={showM1} avatar="N" human name="noaman" time="14:02">
          <TypedMessage len={typedLen} caret={phase === "typing"} />
        </Message>
        <div className={`flex items-center gap-2 pl-10 text-[12.5px] text-ink2 transition-opacity ${phase === "thinking" ? "opacity-100" : "opacity-0"}`}>
          <span className="flex gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <i key={i} className="size-1.5 animate-bounce rounded-full bg-live" style={{ animationDelay: `${i * 150}ms` }} />
            ))}
          </span>
          <span><b className="text-ink">@Layla</b> is thinking…</span>
        </div>
        <Message show={showM2} avatar="L" name="@Layla" persona time="14:02">
          <span className="text-sm">{words.slice(0, streamed).join(" ")}{phase === "streaming" && <Caret />}</span>
          <div className={`mt-2 w-full max-w-xs rounded-xl border border-line bg-surface2 px-3.5 pb-2 pt-3 ${phase === "chart" || streamed > 900 ? "" : "hidden"}`}>
            <p className="mb-2 font-mono text-[11px] text-ink2">Q3 revenue · $k</p>
            <svg viewBox="0 0 300 110" className="block w-full">
              {BARS.map((v, i) => (
                <g key={i}>
                  <rect x={12 + i * 48} y={104 - v} width="30" height={v} className="origin-bottom fill-accent opacity-85"
                    style={{ transform: phase === "chart" ? "scaleY(1)" : "scaleY(0)", transition: `transform .7s cubic-bezier(.2,.8,.2,1) ${i * 80}ms`, transformBox: "fill-box", transformOrigin: "bottom" }} />
                  <text x={16 + i * 48} y="109" className="fill-ink2 font-mono text-[9px]">{MONTHS[i]}</text>
                </g>
              ))}
            </svg>
          </div>
        </Message>
      </div>
    </div>
  );
}

const MSG_PARTS: Array<[string, boolean]> = [["@Layla", true], [" show me the sales trend ", false], ["@chart", true]];
const MSG_TEXT = MSG_PARTS.map(([t]) => t).join("");

function TypedMessage({ len, caret }: { len: number; caret: boolean }) {
  const starts = MSG_PARTS.reduce<number[]>((acc, [text]) => [...acc, (acc.at(-1) ?? 0) + text.length], [0]);
  return (
    <span className="text-sm">
      {MSG_PARTS.map(([text, isToken], i) => {
        const take = Math.max(0, Math.min(text.length, len - starts[i]));
        return (
          <span key={i} className={isToken ? "font-mono text-[12.5px] text-accent" : ""}>{text.slice(0, take)}</span>
        );
      })}
      {caret && <Caret />}
    </span>
  );
}

function Caret() {
  return <span aria-hidden className="ml-px inline-block h-[15px] w-[7px] animate-pulse bg-accent align-[-2px]" />;
}

function Message({ show, avatar, name, time, human, persona, children }: {
  show: boolean; avatar: string; name: string; time: string; human?: boolean; persona?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-2.5 transition-all duration-400 ${show ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"}`}>
      <span className={`flex size-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${human ? "bg-gradient-to-br from-stone-500 to-stone-700" : "bg-accent"}`}>
        {avatar}
      </span>
      <div className="min-w-0">
        <p className="mb-0.5 text-[12.5px] text-ink2">
          <b className="font-semibold text-ink">{name}</b>{persona && " · persona"} · {time}
        </p>
        {children}
      </div>
    </div>
  );
}
