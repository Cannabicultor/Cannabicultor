from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from .extract_pdf import PageText

DEFAULT_CHUNK_SIZE = 1400
DEFAULT_OVERLAP = 200
MIN_CHUNK_CHARS = 120


@dataclass
class TextChunk:
    chunk_index: int
    content: str
    char_count: int
    token_estimate: int
    page_start: int | None
    page_end: int | None
    content_sha256: str


def _token_estimate(text: str) -> int:
    return max(1, len(text) // 4)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _split_paragraphs(pages: list[PageText]) -> list[tuple[str, int]]:
    units: list[tuple[str, int]] = []
    for page in pages:
        parts = re.split(r"\n{2,}", page.text)
        for part in parts:
            cleaned = part.strip()
            if cleaned:
                units.append((cleaned, page.page_num))
    return units


def _merge_units(units: list[tuple[str, int]], chunk_size: int) -> list[tuple[str, int, int]]:
    """Returns list of (merged_text, page_start, page_end)."""
    merged: list[tuple[str, int, int]] = []
    buf: list[str] = []
    p_start: int | None = None
    p_end: int | None = None

    def flush():
        nonlocal buf, p_start, p_end
        if not buf:
            return
        text = "\n\n".join(buf).strip()
        if text:
            merged.append((text, p_start or 1, p_end or p_start or 1))
        buf = []
        p_start = None
        p_end = None

    for text, page in units:
        if p_start is None:
            p_start = page
        p_end = page

        candidate = ("\n\n".join(buf + [text])).strip() if buf else text
        if len(candidate) <= chunk_size:
            buf.append(text)
        else:
            if buf:
                flush()
            if len(text) <= chunk_size:
                buf = [text]
                p_start = page
                p_end = page
            else:
                sentences = re.split(r"(?<=[.!?])\s+", text)
                sub: list[str] = []
                for sent in sentences:
                    sub_candidate = (" ".join(sub + [sent])).strip()
                    if len(sub_candidate) <= chunk_size:
                        sub.append(sent)
                    else:
                        if sub:
                            merged.append((" ".join(sub), page, page))
                        sub = [sent]
                if sub:
                    merged.append((" ".join(sub), page, page))
                p_start = None
                p_end = None

    flush()
    return merged


def chunk_pages(
    pages: list[PageText],
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[TextChunk]:
    if not pages:
        return []

    units = _split_paragraphs(pages)
    if not units:
        return []

    blocks = _merge_units(units, chunk_size)
    if not blocks:
        return []

    chunks: list[TextChunk] = []
    prev_tail = ""

    for i, (text, p_start, p_end) in enumerate(blocks):
        content = text
        if prev_tail and i > 0:
            content = f"{prev_tail}\n\n{text}".strip()

        if len(content) < MIN_CHUNK_CHARS and i < len(blocks) - 1:
            prev_tail = content[-overlap:].strip() if len(content) > overlap else content
            continue

        chunks.append(
            TextChunk(
                chunk_index=len(chunks),
                content=content,
                char_count=len(content),
                token_estimate=_token_estimate(content),
                page_start=p_start,
                page_end=p_end,
                content_sha256=_sha256(content),
            )
        )
        prev_tail = content[-overlap:].strip() if len(content) > overlap else ""

    if not chunks and blocks:
        text, p_start, p_end = blocks[0]
        chunks.append(
            TextChunk(
                chunk_index=0,
                content=text,
                char_count=len(text),
                token_estimate=_token_estimate(text),
                page_start=p_start,
                page_end=p_end,
                content_sha256=_sha256(text),
            )
        )

    return chunks