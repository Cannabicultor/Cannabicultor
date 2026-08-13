from __future__ import annotations

import os
from typing import Any

from supabase import create_client, Client

from .catalog import CatalogDocument
from .chunker import TextChunk


def create_kb_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def document_row(doc: CatalogDocument, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    row = {
        "catalog_num": doc.catalog_num,
        "archivo": doc.archivo,
        "drive_file_id": doc.drive_file_id,
        "link_drive": doc.link_drive,
        "idioma_contenido": doc.idioma_contenido,
        "politica_idioma": doc.politica_idioma,
        "factor_idioma_retrieval": doc.factor_idioma_retrieval,
        "incluir_en_kb": doc.incluir_en_kb,
        "peso_prioridad_retrieval": doc.peso_prioridad_retrieval,
        "libro_propuesto": doc.libro_propuesto,
        "tema_cluster": doc.tema_cluster,
        "tipo_documento": doc.tipo_documento,
        "nivel_evidencia": doc.nivel_evidencia,
        "prioridad_expansion": doc.prioridad_expansion,
        "tags": doc.tags,
        "catalog_snapshot": doc.snapshot(),
    }
    if extra:
        row.update(extra)
    return row


def upsert_document(sb: Client, doc: CatalogDocument, extra: dict[str, Any] | None = None) -> dict:
    row = document_row(doc, extra)
    res = (
        sb.table("kb_documents")
        .upsert(row, on_conflict="catalog_num")
        .execute()
    )
    if not res.data:
        raise RuntimeError(f"No se pudo upsert documento #{doc.catalog_num}")
    return res.data[0]


def get_document_by_catalog(sb: Client, catalog_num: int) -> dict | None:
    res = (
        sb.table("kb_documents")
        .select("*")
        .eq("catalog_num", catalog_num)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def delete_chunks_for_document(sb: Client, document_id: int) -> None:
    sb.table("kb_chunks").delete().eq("document_id", document_id).execute()


def insert_chunks(
    sb: Client,
    document_id: int,
    doc: CatalogDocument,
    chunks: list[TextChunk],
) -> int:
    if not chunks:
        return 0

    rows = []
    for ch in chunks:
        rows.append(
            {
                "document_id": document_id,
                "chunk_index": ch.chunk_index,
                "content": ch.content,
                "content_sha256": ch.content_sha256,
                "char_count": ch.char_count,
                "token_estimate": ch.token_estimate,
                "page_start": ch.page_start,
                "page_end": ch.page_end,
                "idioma_contenido": doc.idioma_contenido,
                "politica_idioma": doc.politica_idioma,
                "factor_idioma_retrieval": doc.factor_idioma_retrieval,
                "peso_prioridad_retrieval": doc.peso_prioridad_retrieval,
                "libro_propuesto": doc.libro_propuesto,
                "tema_cluster": doc.tema_cluster,
                "tags": doc.tags,
                "respuesta_requiere_traduccion": doc.respuesta_requiere_traduccion,
                "metadata": {
                    "archivo": doc.archivo,
                    "catalog_num": doc.catalog_num,
                },
            }
        )

    batch_size = 100
    for i in range(0, len(rows), batch_size):
        sb.table("kb_chunks").insert(rows[i : i + batch_size]).execute()

    return len(rows)