import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findPillRanges, type KnownSets, type PillKind } from "@/lib/composer/mention-ranges";

export type { KnownSets };

// The composer pushes the current known-set into this plugin's state with
// `tr.setMeta(mentionHighlightKey, known)` whenever the persona/team list changes.
export const mentionHighlightKey = new PluginKey<KnownSets>("mentionHighlight");

const EMPTY: KnownSets = { mentions: new Set(), self: new Set(), humans: new Set(), commands: new Set() };

const PILL_CLASS: Record<PillKind, string> = {
  mention: "nx-mention-pill",
  self: "nx-self-pill",
  human: "nx-human-pill",
  command: "nx-command-pill",
};

// Slack-style pills for @mentions and /commands in the composer — implemented as
// ProseMirror INLINE DECORATIONS, not a node. It only paints existing text, so
// the document (the markdown wire format) is unchanged: no serialization, no
// draft-restore parsing, and the mention/swarm/directive logic that reads the
// text keeps working untouched. Only REAL values are pilled (known personas /
// @directives / teammates / commands) — typos stay plain. @you gets a unique
// color. The known-set lives in plugin state (fed via setMeta), so decorations
// recompute on doc edits AND when that set changes.
export const MentionHighlight = Extension.create({
  name: "mentionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<KnownSets>({
        key: mentionHighlightKey,
        state: {
          init: () => EMPTY,
          apply: (tr, value) => tr.getMeta(mentionHighlightKey) ?? value,
        },
        props: {
          decorations(state) {
            const known = mentionHighlightKey.getState(state) ?? EMPTY;
            if (!known.mentions.size && !known.self.size && !known.humans.size && !known.commands.size) return null;
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const r of findPillRanges(node.text, known)) {
                decos.push(Decoration.inline(pos + r.start, pos + r.end, { class: PILL_CLASS[r.kind] }));
              }
            });
            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
        },
      }),
    ];
  },
});
