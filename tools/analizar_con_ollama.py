#!/usr/bin/env python3
"""Describe hojas de contacto con un modelo visual local de Ollama (reanuda por hoja)."""

from __future__ import annotations

import argparse
import base64
import csv
import json
import re
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".catalogacion-fotos"
MODEL = "qwen2.5vl:3b"
TEXT_MODEL = "llama3.1:latest"


SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "indice": {"type": "string"},
                    "parte": {"type": "string"},
                    "tema": {"type": "string"},
                    "fase": {"type": "string"},
                    "descripcion_larga": {"type": "string"},
                    "etiquetas": {"type": "array", "items": {"type": "string"}},
                    "calidad_1a5": {"type": "integer", "minimum": 1, "maximum": 5},
                    "apta_para_broll": {"type": "boolean"},
                    "confianza": {"type": "string", "enum": ["alta", "media", "baja"]},
                },
                "required": [
                    "indice", "parte", "tema", "fase", "descripcion_larga", "etiquetas",
                    "calidad_1a5", "apta_para_broll", "confianza"
                ],
            },
        }
    },
    "required": ["items"],
}

SINGLE_SCHEMA = SCHEMA["properties"]["items"]["items"]


def parse_thinking(text: str, records: list[dict[str, str]]) -> dict:
    """Recupera campos del razonamiento cuando el modelo agota tokens antes del JSON."""
    starts = list(re.finditer(r"\*\*Image\s+(\d+)(?::\*\*|\*\*:)", text, flags=re.IGNORECASE))
    items: list[dict] = []
    for position, match in enumerate(starts):
        slot = int(match.group(1))
        if not 1 <= slot <= len(records):
            continue
        end = starts[position + 1].start() if position + 1 < len(starts) else len(text)
        block = text[match.end() : end]

        def field(label: str, default: str) -> str:
            found = re.search(rf"\*\*{label}(?::\*\*|\*\*:)\s*([^\n]+)", block, flags=re.IGNORECASE)
            if not found:
                return default
            return found.group(1).strip().strip('"').split(" (")[0].strip()

        description = field("Descripcion_larga", "Imagen de cannabis pendiente de revisión manual.")
        tags_raw = field("Etiquetas", "cannabis")
        tags = re.findall(r"[\wáéíóúüñ-]+", tags_raw, flags=re.IGNORECASE)
        quality_match = re.search(r"\*\*Calidad(?:_1a5)?(?::\*\*|\*\*:)\s*([1-5])", block, flags=re.IGNORECASE)
        broll_raw = field("Apta_para_broll", "false").lower()
        confidence = field("Confianza", "baja").lower()
        if confidence not in {"alta", "media", "baja"}:
            confidence = "baja"
        items.append({
            "indice": records[slot - 1]["indice"],
            "parte": field("Parte", "imagen"),
            "tema": field("Tema", "cannabis"),
            "fase": field("Fase", "sin-fase"),
            "descripcion_larga": description,
            "etiquetas": tags[:8] or ["cannabis"],
            "calidad_1a5": int(quality_match.group(1)) if quality_match else 2,
            "apta_para_broll": broll_raw.startswith("true") or broll_raw.startswith("si"),
            "confianza": confidence,
        })
    if len(items) != len(records):
        raise RuntimeError(f"Solo se recuperaron {len(items)}/{len(records)} registros del razonamiento")
    return {"items": items}


def normalize_thinking(text: str, records: list[dict[str, str]]) -> dict:
    markers = list(re.finditer(r"(?:\*\*)?Image\s+(\d+)(?:\s*\(indice\s+\d+\))?(?::\*\*|\*\*:|:)", text, re.I))
    sections: dict[int, str] = {}
    for position, marker in enumerate(markers):
        slot = int(marker.group(1))
        if 1 <= slot <= len(records) and slot not in sections:
            end = markers[position + 1].start() if position + 1 < len(markers) else len(text)
            sections[slot] = text[marker.start() : end]
    if len(sections) != len(records):
        raise RuntimeError(f"Observaciones separadas: {len(sections)}/{len(records)}")

    items: list[dict] = []
    for slot, row in enumerate(records, 1):
        prompt = f"""Convierte solo esta observación visual en una ficha JSON.
Indice obligatorio: {row['indice']}.
No inventes detalles. Usa fase=sin-fase y confianza=baja cuando no esté claro.
La descripción debe ser una frase literal en español. Etiquetas: 3-8. Calidad: entero 1-5.

OBSERVACIÓN:
{sections[slot]}
"""
        payload = {
            "model": TEXT_MODEL,
            "stream": False,
            "format": SINGLE_SCHEMA,
            "messages": [{"role": "user", "content": prompt}],
            "options": {"temperature": 0, "num_ctx": 2048, "num_predict": 400},
        }
        request = urllib.request.Request(
            "http://127.0.0.1:11434/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            body = json.load(response)
        item = json.loads(body["message"]["content"])
        item["indice"] = row["indice"]
        items.append(item)
    return {"items": items}


def request_ollama(image_path: Path, records: list[dict[str, str]], media: str) -> dict:
    compact = [
        {
            "indice": row["indice"],
            "archivo": Path(row["ruta_original"]).name,
            "carpeta": row["categoria_carpeta"] or row["origen"],
        }
        for row in records
    ]
    prompt = f"""/no_think
Analiza esta hoja de contacto de {media} de cannabis. Las celdas están en orden de lectura, de izquierda a derecha y de arriba abajo. Devuelve exactamente un registro por celda usando el indice indicado.

Registros esperados: {json.dumps(compact, ensure_ascii=False)}

Objetivo: crear una biblioteca visual SEO fiable. Para cada celda:
- parte: objeto o parte principal visible (cogollo, hoja, planta, cultivo, raiz, semilla, equipo, captura-pantalla, etc.).
- tema: rasgo visual o tema concreto (tricomas, flor-femenina, flor-macho, oidio, cultivo-interior, muestra-seca, etc.).
- fase: germinacion, plantula, vegetativo, prefloracion, floracion, cosecha, secado, curado o sin-fase.
- descripcion_larga: español natural, literal y útil; no inventes variedad, plaga, deficiencia ni fase si no se ve con claridad.
- etiquetas: 3 a 8 etiquetas breves sin tildes.
- calidad 1-5 considera nitidez, encuadre y utilidad editorial; capturas de pantalla suelen ser 1-2.
- apta_para_broll: true solo si aporta valor visual real.
- confianza baja si la miniatura no permite determinar el detalle.

Usa exclusivamente lo visible. La carpeta es contexto, no prueba diagnóstica. No añadas texto fuera del JSON."""
    payload = {
        "model": MODEL,
        "stream": False,
        "think": False,
        "format": SCHEMA,
        "messages": [{
            "role": "user",
            "content": prompt,
            "images": [base64.b64encode(image_path.read_bytes()).decode("ascii")],
        }],
        "options": {"temperature": 0.1, "num_ctx": 4096, "num_predict": 1800},
    }
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/chat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        body = json.load(response)
    content = body.get("message", {}).get("content", "")
    if not content:
        debug = WORK / "ultima-respuesta-ollama.json"
        debug.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
        thinking = body.get("message", {}).get("thinking", "")
        if thinking:
            return normalize_thinking(thinking, records)
        raise RuntimeError(f"Ollama devolvió contenido vacío; respuesta guardada en {debug}")
    result = json.loads(content)
    items = result.get("items") if isinstance(result, dict) else None
    if not isinstance(items, list):
        numeric = [result[key] for key in sorted(result, key=lambda value: int(value)) if str(key).isdigit()]
        items = numeric
    normalized: list[dict] = []
    for index, item in enumerate(items or []):
        if index >= len(records):
            break
        normalized.append({
            "indice": records[index]["indice"],
            "parte": item.get("parte", "imagen"),
            "tema": item.get("tema", "cannabis"),
            "fase": item.get("fase", "sin-fase"),
            "descripcion_larga": item.get("descripcion_larga", "Imagen de cannabis pendiente de revisión manual."),
            "etiquetas": item.get("etiquetas", ["cannabis"]),
            "calidad_1a5": item.get("calidad_1a5", item.get("calidad", 2)),
            "apta_para_broll": item.get("apta_para_broll", item.get("aptas_para_broll", False)),
            "confianza": item.get("confianza", "baja" if item.get("confianza_baja", True) else "alta"),
        })
    if len(normalized) != len(records):
        raise RuntimeError(f"Respuesta incompleta: {len(normalized)}/{len(records)}")
    return {"items": normalized}


def photo_records() -> list[dict[str, str]]:
    with (WORK / "inventario.csv").open(encoding="utf-8") as handle:
        return [row for row in csv.DictReader(handle) if row["indice"]]


def video_records() -> list[dict[str, str]]:
    with (WORK / "inventario-videos-unicos.csv").open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--end", type=int)
    parser.add_argument("--media", choices=["fotos", "videos"], default="fotos")
    parser.add_argument("--batch-size", choices=[4, 16], type=int, default=4)
    args = parser.parse_args()

    if args.media == "fotos":
        records = photo_records()
        sheet_folder = WORK / ("hojas-contacto-4" if args.batch_size == 4 else "hojas-contacto")
        sheets = sorted(sheet_folder.glob("hoja-*.jpg"))
        output = WORK / ("analisis-visual-4" if args.batch_size == 4 else "analisis-visual-jsonl")
        media_label = "fotografías"
    else:
        records = video_records()
        sheets = sorted((WORK / "hojas-contacto-video").glob("video-hoja-*.jpg"))
        output = WORK / "analisis-video-jsonl"
        media_label = "fotogramas representativos de vídeos"
    end = args.end or len(sheets)
    output.mkdir(exist_ok=True)
    for sheet_number in range(args.start, end + 1):
        sheet = sheets[sheet_number - 1]
        target = output / f"hoja-{sheet_number:03d}.json"
        if target.exists():
            print(f"OMITIDA {sheet_number}: ya existe", flush=True)
            continue
        subset = records[(sheet_number - 1) * args.batch_size : sheet_number * args.batch_size]
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                result = request_ollama(sheet, subset, media_label)
                break
            except Exception as exc:
                last_error = exc
                print(f"REINTENTO {sheet_number} ({attempt}/3): {exc}", flush=True)
                time.sleep(1)
        else:
            raise RuntimeError(f"Hoja {sheet_number} falló tras 3 intentos") from last_error
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"OK {sheet_number}/{end}: {len(result.get('items', []))} registros", flush=True)


if __name__ == "__main__":
    main()
