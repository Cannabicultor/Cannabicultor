from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import fitz  # pymupdf

MIN_CHARS_PER_PAGE = 80
LOW_DENSITY_RATIO = 0.55


@dataclass
class PageText:
    page_num: int
    text: str


@dataclass
class ExtractionResult:
    pages: list[PageText]
    full_text: str
    char_count: int
    page_count: int
    quality: str
    sha256: str
    ocr_used: bool
    txt_path: Path | None = None


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _readable_ratio(text: str) -> float:
    if not text:
        return 0.0
    sample = text[:8000]
    readable = sum(1 for c in sample if c.isalnum() or c.isspace() or c in ".,;:!?¿¡()-")
    return readable / len(sample)


def _ocr_page(doc: fitz.Document, page_index: int) -> str:
    if not shutil.which("tesseract"):
        return ""
    page = doc.load_page(page_index)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    img_bytes = pix.tobytes("png")

    proc = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", "spa+eng", "--psm", "3"],
        input=img_bytes,
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        return ""
    return _normalize_text(proc.stdout.decode("utf-8", errors="ignore"))


def extract_pdf(pdf_path: Path, txt_dir: Path | None = None, use_ocr: bool = True) -> ExtractionResult:
    doc = fitz.open(pdf_path)
    pages: list[PageText] = []
    ocr_pages = 0

    for i in range(doc.page_count):
        raw = doc.load_page(i).get_text("text") or ""
        text = _normalize_text(raw)

        if use_ocr and len(text) < MIN_CHARS_PER_PAGE:
            ocr_text = _ocr_page(doc, i)
            if len(ocr_text) > len(text):
                text = ocr_text
                ocr_pages += 1

        if text:
            pages.append(PageText(page_num=i + 1, text=text))

    doc.close()

    full_text = "\n\n".join(p.text for p in pages)
    char_count = len(full_text)
    page_count = len(pages) or 1
    density = char_count / max(page_count, 1)

    readable = _readable_ratio(full_text)

    if char_count < 200:
        quality = "fallida"
    elif readable < 0.55:
        quality = "baja_densidad"
    elif density < MIN_CHARS_PER_PAGE * LOW_DENSITY_RATIO:
        quality = "baja_densidad"
    elif ocr_pages > 0:
        quality = "ocr"
    else:
        quality = "buena"

    txt_path = None
    if txt_dir is not None:
        txt_dir.mkdir(parents=True, exist_ok=True)
        txt_path = txt_dir / (pdf_path.stem + ".txt")
        txt_path.write_text(full_text, encoding="utf-8")

    return ExtractionResult(
        pages=pages,
        full_text=full_text,
        char_count=char_count,
        page_count=page_count,
        quality=quality,
        sha256=_sha256(full_text),
        ocr_used=ocr_pages > 0,
        txt_path=txt_path,
    )