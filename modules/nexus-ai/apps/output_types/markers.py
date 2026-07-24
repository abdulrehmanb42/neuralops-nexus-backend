"""
Output marker parsing.

AI responses may contain:
    <<<OUTPUT:typename>>>
    ... content ...
    <<<END_OUTPUT>>>

For html/form/terminal output types, the model may also include:
    <<<EMBED>>>
    Plain-text description of what was generated (for ChromaDB embedding).
    <<<END_EMBED>>>

This module extracts the typed content, strips the markers,
and returns the embed description if present.
"""
from __future__ import annotations

import re

_MARKER_RE = re.compile(
    r"<<<OUTPUT:(\w+)>>>\s*(.*?)\s*<<<END_OUTPUT>>>",
    re.DOTALL,
)

_EMBED_RE = re.compile(
    r"<<<EMBED>>>\s*(.*?)\s*<<<END_EMBED>>>",
    re.DOTALL,
)


def parse_output_markers(raw: str) -> tuple[str, str | None, str | None]:
    """
    Parse output type markers and optional embed description from an AI response.

    Returns:
        (clean_content, detected_type_name | None, embed_description | None)

    - clean_content: response with ALL markers stripped
    - detected_type_name: type from <<<OUTPUT:type>>> block, or None
    - embed_description: text from <<<EMBED>>>...<<<END_EMBED>>> block, or None

    Examples:
        Plain text response (no markers):
            (raw, None, None)

        Code response:
            (code_content, "code", None)

        HTML with embed description:
            (html_content, "chart", "Q1 revenue chart showing 40% growth")
    """
    # Extract embed description first (strip it from raw before output parsing)
    embed_description: str | None = None
    embed_m = _EMBED_RE.search(raw)
    if embed_m:
        embed_description = embed_m.group(1).strip()
        # Remove the embed block from raw so it doesn't end up in clean_content
        raw = raw[:embed_m.start()] + raw[embed_m.end():]

    # Extract output content
    output_m = _MARKER_RE.search(raw)
    if not output_m:
        return raw.strip(), None, embed_description

    clean_content = output_m.group(2).strip()
    type_name = output_m.group(1).strip().lower()
    return clean_content, type_name, embed_description
