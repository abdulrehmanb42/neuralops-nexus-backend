"use client";

import { useEffect, useRef, useState } from "react";
import data from "@emoji-mart/data";
import { Picker } from "emoji-mart";

// Slack-grade emoji picker — emoji-mart (MIT), the library Slack's own picker
// popularized. Full set, search, skin tones, frequently-used memory. Rendered
// as a web component with encapsulated styles, so no CSS bleed either way.
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onPickRef.current = onPick;
    onCloseRef.current = onClose;
  });

  // Theme flips while open rebuild the picker — its theme is baked at
  // construction, and a stale dark picker on a light page reads as broken.
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const picker = new Picker({
      data,
      parent: host,
      onEmojiSelect: (emoji: { native?: string }) => {
        if (emoji.native) onPickRef.current(emoji.native);
      },
      theme: document.documentElement.getAttribute("data-theme") ?? "auto",
      autoFocus: true,
      previewPosition: "none",
      skinTonePosition: "search",
      emojiButtonRadius: "8px",
    });
    // Capture phase: emoji-mart's own search field swallows bubbled Escapes.
    // preventDefault marks it consumed for the outer search handler.
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener("keydown", onEsc, true);
    return () => {
      document.removeEventListener("keydown", onEsc, true);
      (picker as unknown as HTMLElement).remove?.();
      host.replaceChildren();
    };
  }, [themeTick]);

  return <div ref={hostRef} className="overflow-hidden rounded-xl shadow-2xl" />;
}
