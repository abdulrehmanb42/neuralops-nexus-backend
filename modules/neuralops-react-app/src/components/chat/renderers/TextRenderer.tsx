import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import "highlight.js/styles/github-dark.css";
import React from "react";
// ---------------------------------------------------------------------------
// Mermaid diagram block — renders fenced ```mermaid blocks as real diagrams.
// Mermaid is imported dynamically so it stays out of the initial bundle and
// never runs during SSR (useEffect is client-only).
// ---------------------------------------------------------------------------
// Mermaid treats () {} <> as node-shape delimiters, so an unquoted label like
// C[foo(Dog)] is a parse error. LLMs emit this constantly.
//
// Each shape is matched separately so the closing delimiter always pairs with
// its own opening one — a single combined pattern will happily terminate an
// "[" label on a ")" and corrupt otherwise-valid diagrams.
const NEEDS_QUOTING = /[()<>|"]/;

function quoteLabel(id: string, open: string, label: string, close: string) {
  const text = label.trim();
  if (!text || text.startsWith('"')) return `${id}${open}${label}${close}`;
  if (!NEEDS_QUOTING.test(text)) return `${id}${open}${label}${close}`;
  return `${id}${open}"${text.replace(/"/g, "'")}"${close}`;
}

function sanitizeMermaid(src: string): string {
  return (
    src
      // Square nodes:  A[label]
      .replace(/([A-Za-z0-9_-]+)\[([^\]\n]*)\]/g, (_m, id, label) =>
        quoteLabel(id, "[", label, "]"),
      )
      // Rhombus nodes: A{label}
      .replace(/([A-Za-z0-9_-]+)\{([^}\n]*)\}/g, (_m, id, label) =>
        quoteLabel(id, "{", label, "}"),
      )
  );
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef("mermaid-" + Math.random().toString(36).slice(2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    const source = code.trim();
    if (!el || !source) return;

    let cancelled = false;

    // Debounce rendering during streaming to prevent tooltip errors and DOM thrashing
    const timer = setTimeout(() => {
      import("mermaid")
        .then(async (mod) => {
          const mermaid = mod.default;
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            themeVariables: {
              background: "transparent",
            },
            securityLevel: "strict",
          });
          // Only touch the source if mermaid itself rejects it.
          const valid = await mermaid.parse(source, { suppressErrors: true });
          const finalSource = valid ? source : sanitizeMermaid(source);

          const { svg } = await mermaid.render(idRef.current, finalSource);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
            setError(null);
          }
        })
        .catch((err) => {
          console.error("[MermaidBlock] render failed", err);
          if (!cancelled) setError(String(err?.message ?? err));
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  // If the diagram can't be rendered, degrade to showing its source rather
  // than surfacing parser internals to the user.
  if (error) {
    return (
      <div
        className="my-2 overflow-hidden rounded-md border"
        style={{
          backgroundColor: "var(--code-bg)",
          borderColor: "var(--code-border)",
        }}
        title={error}
      >
        <div
          className="border-b px-3 py-1.5 text-xs font-medium text-muted-foreground"
          style={{
            backgroundColor: "var(--code-header-bg)",
            borderColor: "var(--code-border)",
          }}
        >
          mermaid
        </div>
        <pre className="overflow-x-auto p-4 text-sm">{code}</pre>
      </div>
    );
  }

  return <div ref={ref} className="my-2 flex justify-center overflow-x-auto" />;
}

// ---------------------------------------------------------------------------
// Inline code — small monospace chip
// ---------------------------------------------------------------------------
function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-sm font-mono text-foreground">
      {children}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Block code — styled container that matches CodeRenderer, with copy button.
// The `pre` ref lets us grab plain innerText for the clipboard (works even
// when rehype-highlight has wrapped the content in <span> elements).
// ---------------------------------------------------------------------------
function BlockCode({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Extract language from the className of the child <code> element.
  // NOTE: `code` is overridden in the components map, so the child element's
  // `type` is that component function — not the string "code". Match on any
  // element child instead, otherwise the language is never detected.
  const codeEl = React.Children.toArray(children).find(
    (
      c,
    ): c is React.ReactElement<{
      className?: string;
      children?: React.ReactNode;
    }> => React.isValidElement(c),
  );
  const rawClass = codeEl?.props?.className ?? "";
  const language =
    rawClass
      .split(" ")
      .find((cls: string) => cls.startsWith("language-"))
      ?.replace("language-", "") ?? "code";

  // Mermaid diagrams render as diagrams, not as a code block.
  if (language === "mermaid") {
    const extractText = (node: React.ReactNode): string => {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (React.isValidElement(node))
        return extractText(
          (node.props as { children?: React.ReactNode }).children,
        );
      return "";
    };
    return <MermaidBlock code={extractText(codeEl?.props?.children)} />;
  }

  async function handleCopy() {
    const text = preRef.current?.innerText ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="relative my-2 overflow-hidden rounded-md border"
      style={{
        backgroundColor: "var(--code-bg)",
        borderColor: "var(--code-border)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between border-b px-3 py-1.5"
        style={{
          backgroundColor: "var(--code-header-bg)",
          borderColor: "var(--code-border)",
        }}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {language}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </Button>
      </div>

      {/* Code body */}
      <pre
        ref={preRef}
        {...props}
        className="overflow-x-auto text-sm [&]:!m-0 [&]:!bg-transparent [&]:p-4"
      >
        {children}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextRenderer — renders markdown with GFM + syntax-highlighted code blocks
// ---------------------------------------------------------------------------
export function TextRenderer({ content }: { content: string }) {
  return (
    <div
      className={[
        "prose prose-sm max-w-none text-foreground",
        // Links
        "[&_a]:text-primary [&_a]:underline",
        // Headings
        "[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm",
        // Lists
        "[&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5",
        // Blockquote
        "[&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        // Tables (GFM)
        "[&_table]:text-sm [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        // Reset prose's default background on code so our custom components control it
        "[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Block code goes through our styled BlockCode
          pre: BlockCode,
          // Inline code uses the chip style
          code: ({ children, className }) => {
            // When code is inside a pre, BlockCode already wraps it —
            // className will contain "language-*". Inline code has no className.
            if (className) {
              // This is the inner <code> of a fenced block; BlockCode renders it
              return <code className={className}>{children}</code>;
            }
            return <InlineCode>{children}</InlineCode>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
