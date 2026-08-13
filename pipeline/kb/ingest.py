#!/usr/bin/env python3
"""
Cannabicultor KB — Pipeline de ingesta (Fase B)

Lee el catálogo v2.2, descarga PDFs de Drive, extrae texto, chunkea y guarda en Supabase.

Uso:
  python3 pipeline/kb/ingest.py --mode=all
  python3 pipeline/kb/ingest.py --mode=download --limit=5
  python3 pipeline/kb/ingest.py --mode=extract --doc=24
  python3 pipeline/kb/ingest.py --mode=chunk --force
  python3 pipeline/kb/ingest.py --dry-run
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = Path(__file__).resolve().parents[1]
KB_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(KB_DIR))

from lib.catalog import load_catalog, update_catalog_estado, CatalogDocument  # noqa: E402
from lib.chunker import chunk_pages  # noqa: E402
from lib.drive_download import download_drive_pdf  # noqa: E402
from lib.extract_pdf import extract_pdf  # noqa: E402
from lib.supabase_kb import (  # noqa: E402
    create_kb_client,
    delete_chunks_for_document,
    get_document_by_catalog,
    insert_chunks,
    upsert_document,
)

DEFAULT_CATALOG = Path.home() / "KB_RAD_cannabicultor" / "Catalogo_Cannabicultor_RAG_v2.2_Multilingual.xlsx"


def _dir_from_env(name: str, default: Path) -> Path:
    import os
    raw = (os.environ.get(name) or "").strip()
    return Path(raw).expanduser() if raw else default


# PDFs/TXT no van a git. Por defecto: research/kb/ en este repo, o KB_PDF_DIR / KB_TXT_DIR.
PDF_DIR = _dir_from_env("KB_PDF_DIR", REPO_ROOT / "research" / "kb" / "pdfs")
TXT_DIR = _dir_from_env("KB_TXT_DIR", REPO_ROOT / "research" / "kb" / "txt")


def log(*args):
    print(datetime.now(timezone.utc).isoformat(), *args)


def load_env():
    for env_path in (
        REPO_ROOT / ".env",
        PIPELINE_DIR / ".env",
        Path.home() / "cannabicultor" / ".env",
    ):
        if env_path.exists():
            load_dotenv(env_path)
            break
    # Re-resolve dirs after .env (KB_PDF_DIR / KB_TXT_DIR)
    global PDF_DIR, TXT_DIR
    PDF_DIR = _dir_from_env("KB_PDF_DIR", REPO_ROOT / "research" / "kb" / "pdfs")
    TXT_DIR = _dir_from_env("KB_TXT_DIR", REPO_ROOT / "research" / "kb" / "txt")


def should_skip(existing: dict | None, content_sha: str | None, force: bool) -> bool:
    if force or not existing:
        return False
    if content_sha and existing.get("content_sha256") == content_sha:
        if existing.get("estado_ingesta") == "indexado" and (existing.get("chunk_count") or 0) > 0:
            return True
    return False


def process_document(
    doc: CatalogDocument,
    *,
    mode: str,
    sb,
    force: bool,
    use_ocr: bool,
    dry_run: bool,
) -> str:
    existing = None if dry_run else get_document_by_catalog(sb, doc.catalog_num)

    if not dry_run and sb is not None:
        prev_estado = (existing or {}).get("estado_ingesta") or "pendiente"
        existing = upsert_document(sb, doc, {"estado_ingesta": prev_estado})

    pdf_path = PDF_DIR / f"{doc.catalog_num:03d}_{Path(doc.archivo).stem[:80]}.pdf"
    if existing and existing.get("local_pdf_path"):
        candidate = Path(existing["local_pdf_path"])
        if candidate.exists():
            pdf_path = candidate

    estado = "pendiente"
    extra: dict = {}

    try:
        if mode in ("download", "all"):
            log(f"[#{doc.catalog_num}] Descargando: {doc.archivo[:60]}")
            if dry_run:
                estado = "descargado"
            else:
                pdf_path = download_drive_pdf(
                    doc.drive_file_id, PDF_DIR, doc.catalog_num, doc.archivo
                )
                extra.update(
                    {
                        "local_pdf_path": str(pdf_path),
                        "estado_ingesta": "descargado",
                    }
                )
                upsert_document(sb, doc, extra)
                estado = "descargado"

        if mode in ("extract", "all"):
            if not pdf_path.exists():
                pdf_path = download_drive_pdf(
                    doc.drive_file_id, PDF_DIR, doc.catalog_num, doc.archivo
                )

            if not dry_run and should_skip(existing, None, force):
                log(f"[#{doc.catalog_num}] Sin cambios, saltando (usa --force)")
                return existing.get("estado_ingesta", "indexado")

            log(f"[#{doc.catalog_num}] Extrayendo texto…")
            if dry_run:
                estado = "extraido"
            else:
                result = extract_pdf(pdf_path, TXT_DIR, use_ocr=use_ocr)
                if should_skip(existing, result.sha256, force):
                    log(f"[#{doc.catalog_num}] SHA256 igual, saltando chunking")
                    return existing.get("estado_ingesta", "indexado")

                extra.update(
                    {
                        "local_pdf_path": str(pdf_path),
                        "local_txt_path": str(result.txt_path) if result.txt_path else None,
                        "text_char_count": result.char_count,
                        "page_count": result.page_count,
                        "calidad_extraccion": result.quality,
                        "content_sha256": result.sha256,
                        "estado_ingesta": "extraido",
                        "error_message": None,
                    }
                )
                row = upsert_document(sb, doc, extra)
                existing = row
                pages = result.pages
                estado = "extraido"
        else:
            pages = None

        if mode in ("chunk", "all"):
            if dry_run:
                log(f"[#{doc.catalog_num}] (dry-run) Chunks → Supabase")
                estado = "indexado"
            else:
                if pages is None:
                    if not pdf_path.exists():
                        raise FileNotFoundError(f"PDF no encontrado: {pdf_path}")
                    result = extract_pdf(pdf_path, TXT_DIR, use_ocr=use_ocr)
                    pages = result.pages
                    if existing and should_skip(existing, result.sha256, force):
                        log(f"[#{doc.catalog_num}] Sin cambios en chunks")
                        return existing.get("estado_ingesta", "indexado")
                    extra.update(
                        {
                            "text_char_count": result.char_count,
                            "page_count": result.page_count,
                            "calidad_extraccion": result.quality,
                            "content_sha256": result.sha256,
                        }
                    )

                chunks = chunk_pages(pages)
                if not chunks:
                    raise ValueError("No se generaron chunks (texto vacío o ilegible)")

                row = existing or upsert_document(sb, doc, extra)
                doc_id = row["id"]
                delete_chunks_for_document(sb, doc_id)
                n = insert_chunks(sb, doc_id, doc, chunks)

                upsert_document(
                    sb,
                    doc,
                    {
                        "estado_ingesta": "indexado",
                        "chunk_count": n,
                        "ingested_at": datetime.now(timezone.utc).isoformat(),
                        "error_message": None,
                    },
                )
                log(f"[#{doc.catalog_num}] {n} chunks indexados (calidad={extra.get('calidad_extraccion', '?')})")
                estado = "indexado"

        return estado

    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        log(f"[#{doc.catalog_num}] ERROR: {err}")
        if not dry_run and sb is not None:
            upsert_document(
                sb,
                doc,
                {"estado_ingesta": "fallido", "error_message": err[:500]},
            )
        return "fallido"


def print_help():
    print(__doc__)
    print(
        """
Modos:
  download   Solo descarga PDFs desde Drive
  extract    Descarga (si falta) + extrae texto
  chunk      Extrae + genera chunks en Supabase
  all        Flujo completo (default)

Opciones:
  --catalog=PATH     Ruta al xlsx v2.2
  --limit=N          Máximo de documentos
  --doc=N            Solo el documento #N del catálogo
  --force            Reprocesar aunque no haya cambios
  --no-ocr           Desactivar OCR (tesseract) en PDFs escaneados
  --dry-run          Simula sin escribir en Supabase
  --update-catalog   Actualiza columna Estado_ingesta en el xlsx

Variables (.env en pipeline/):
  SUPABASE_URL, SUPABASE_SERVICE_KEY

Salida local:
  research/kb/pdfs/   PDFs descargados
  research/kb/txt/    Texto plano extraído
"""
    )


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--mode", default="all")
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--doc", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-ocr", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--update-catalog", action="store_true")
    parser.add_argument("--help", "-h", action="store_true")
    parser.add_argument("--delay", type=float, default=1.0)
    args = parser.parse_args()

    if args.help:
        print_help()
        return

    if args.mode not in {"download", "extract", "chunk", "all"}:
        print_help()
        sys.exit(1)

    if not args.catalog.exists():
        log(f"ERROR: No existe catálogo: {args.catalog}")
        sys.exit(1)

    load_env()
    sb = None if args.dry_run else create_kb_client()

    docs = load_catalog(args.catalog)
    if args.doc:
        docs = [d for d in docs if d.catalog_num == args.doc]
    if args.limit:
        docs = docs[: args.limit]

    log("=== Cannabicultor KB Ingest ===")
    log(f"Modo: {args.mode} | Docs: {len(docs)} | Catálogo: {args.catalog}")
    log(f"PDFs → {PDF_DIR}")
    log(f"TXT  → {TXT_DIR}")

    statuses: dict[int, str] = {}
    counts = {"ok": 0, "fail": 0, "skip": 0}

    for doc in docs:
        estado = process_document(
            doc,
            mode=args.mode,
            sb=sb,
            force=args.force,
            use_ocr=not args.no_ocr,
            dry_run=args.dry_run,
        )
        statuses[doc.catalog_num] = estado
        if estado == "fallido":
            counts["fail"] += 1
        elif estado == "indexado" or estado == "descargado" or estado == "extraido":
            counts["ok"] += 1
        else:
            counts["skip"] += 1

        if args.delay > 0:
            time.sleep(args.delay)

    if args.update_catalog and not args.dry_run:
        update_catalog_estado(args.catalog, statuses)
        log(f"Catálogo actualizado: {args.catalog}")

    log("=== Resumen ===")
    log(f"Procesados OK: {counts['ok']} | Fallidos: {counts['fail']} | Otros: {counts['skip']}")

    if not args.dry_run and sb is not None:
        log("Consultas Supabase:")
        log("  SELECT estado_ingesta, count(*) FROM kb_documents GROUP BY estado_ingesta;")
        log("  SELECT sum(chunk_count) AS chunks FROM kb_documents;")

    if counts["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Interrumpido.")
        sys.exit(130)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
