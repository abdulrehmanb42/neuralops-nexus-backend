"use client";

import { useState } from "react";
import { Maximize2, Minimize2, RotateCw } from "lucide-react";

// AI-generated HTML runs ONLY inside this sandbox. SECURITY INVARIANT:
// sandbox="allow-scripts" and nothing else — never allow-same-origin,
// allow-forms, or allow-popups. The frame gets no access to the app's
// origin, cookies, or storage. Covered by tests; do not loosen.
export const HTML_SANDBOX_FLAGS = "allow-scripts";

export function HtmlFrame({ content, title }: { content: string; title: string }) {
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface2 px-3 py-1.5">
        <span className="font-mono text-[11px] text-ink2">interactive output</span>
        <span className="flex items-center gap-1">
          <button
            aria-label="Reload output"
            title="Reload"
            onClick={() => setNonce((n) => n + 1)}
            className="flex size-6 items-center justify-center rounded text-ink2 hover:bg-surface hover:text-ink"
          >
            <RotateCw size={12.5} strokeWidth={2} />
          </button>
          <button
            aria-label={expanded ? "Collapse output" : "Expand output"}
            title={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((e) => !e)}
            className="flex size-6 items-center justify-center rounded text-ink2 hover:bg-surface hover:text-ink"
          >
            {expanded ? <Minimize2 size={12.5} strokeWidth={2} /> : <Maximize2 size={12.5} strokeWidth={2} />}
          </button>
        </span>
      </div>
      {content ? (
        <iframe
          key={nonce}
          srcDoc={content}
          sandbox={HTML_SANDBOX_FLAGS}
          referrerPolicy="no-referrer"
          title={title}
          // AI markup can't be trusted to theme itself: fixed light "paper".
          className={`w-full border-0 bg-white transition-[height] ${expanded ? "h-[600px]" : "h-[360px]"}`}
        />
      ) : (
        <p className="px-3 py-6 text-center text-[12.5px] text-ink2">No content.</p>
      )}
    </div>
  );
}
