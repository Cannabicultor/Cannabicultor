#!/usr/bin/env python3
"""Inventaría fotos, detecta duplicados y crea miniaturas para revisión visual."""

from __future__ import annotations

import csv
import hashlib
import os
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "fotos"
WORK = ROOT / ".catalogacion-fotos"
THUMBS = WORK / "miniaturas"
SHEETS = WORK / "hojas-contacto"
IMAGE_EXTS = {".jpg", ".jpeg", ".heic"}
VIDEO_EXTS = {".mov", ".mp4"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalized_image(path: Path) -> Image.Image:
    if path.suffix.lower() in {".jpg", ".jpeg"}:
        with Image.open(path) as image:
            return ImageOps.exif_transpose(image).convert("RGB")

    with tempfile.TemporaryDirectory(prefix="catalogo-heic-") as tmp:
        target = Path(tmp) / "imagen.jpg"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path), "-frames:v", "1", str(target)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        with Image.open(target) as image:
            return ImageOps.exif_transpose(image).convert("RGB")


def dhash(image: Image.Image, size: int = 16) -> str:
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    value = 0
    for row in range(size):
        offset = row * (size + 1)
        for col in range(size):
            value = (value << 1) | (pixels[offset + col] > pixels[offset + col + 1])
    return f"{value:0{size * size // 4}x}"


def thumb_path(index: int) -> Path:
    return THUMBS / f"{index:05d}.jpg"


def make_thumb(image: Image.Image, target: Path) -> None:
    canvas = Image.new("RGB", (360, 270), "#202020")
    fitted = ImageOps.contain(image, (360, 270), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((360 - fitted.width) // 2, (270 - fitted.height) // 2))
    canvas.save(target, "JPEG", quality=86, optimize=True)


def create_sheets(rows: list[dict[str, str]], per_sheet: int = 16, folder: Path = SHEETS) -> None:
    font = ImageFont.load_default(size=16)
    columns = 4 if per_sheet == 16 else 2
    rows_per_sheet = 4 if per_sheet == 16 else 2
    folder.mkdir(exist_ok=True)
    for start in range(0, len(rows), per_sheet):
        group = rows[start : start + per_sheet]
        sheet = Image.new("RGB", (columns * 380, rows_per_sheet * 320), "white")
        draw = ImageDraw.Draw(sheet)
        for slot, row in enumerate(group):
            x = (slot % columns) * 380 + 10
            y = (slot // columns) * 320 + 10
            with Image.open(row["miniatura"]) as thumb:
                sheet.paste(thumb, (x, y))
            label = f"{row['indice']} | {Path(row['ruta_original']).name}"
            draw.text((x, y + 275), label[:43], fill="black", font=font)
            context = row["categoria_carpeta"] or row["origen"]
            draw.text((x, y + 295), context[:43], fill="#555555", font=font)
        number = start // per_sheet + 1
        sheet.save(folder / f"hoja-{number:03d}.jpg", "JPEG", quality=88, optimize=True)


def main() -> None:
    WORK.mkdir(exist_ok=True)
    THUMBS.mkdir(exist_ok=True)
    SHEETS.mkdir(exist_ok=True)

    files = sorted(
        path for path in SOURCE.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTS | VIDEO_EXTS
        and "catalogadas-sin-duplicados" not in path.parts
    )
    hashes: dict[str, list[Path]] = defaultdict(list)
    for path in files:
        hashes[sha256(path)].append(path)

    image_rows: list[dict[str, str]] = []
    canonical_by_hash: dict[str, Path] = {}
    image_index = 0
    for path in files:
        digest = sha256(path)
        canonical = canonical_by_hash.setdefault(digest, path)
        is_duplicate = canonical != path
        parts = path.relative_to(SOURCE).parts
        origin = parts[0] if parts else ""
        category = "/".join(parts[1:-1])
        row = {
            "indice": "",
            "ruta_original": str(path.relative_to(ROOT)),
            "origen": origin,
            "categoria_carpeta": category,
            "extension": path.suffix.lower(),
            "tamano_bytes": str(path.stat().st_size),
            "sha256": digest,
            "duplicado_exacto": "si" if is_duplicate else "no",
            "duplicado_de": str(canonical.relative_to(ROOT)) if is_duplicate else "",
            "dhash": "",
            "miniatura": "",
            "error_lectura": "",
        }
        if path.suffix.lower() in IMAGE_EXTS and not is_duplicate:
            try:
                image = normalized_image(path)
                image_index += 1
                target = thumb_path(image_index)
                make_thumb(image, target)
                row["indice"] = str(image_index)
                row["dhash"] = dhash(image)
                row["miniatura"] = str(target)
                image_rows.append(row)
            except Exception as exc:
                row["error_lectura"] = f"{type(exc).__name__}: {exc}"
        all_rows.append(row)

    fields = list(all_rows[0]) if all_rows else []
    with (WORK / "inventario.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(all_rows)

    create_sheets(image_rows)
    create_sheets(image_rows, per_sheet=4, folder=WORK / "hojas-contacto-4")
    duplicates = sum(1 for row in all_rows if row["duplicado_exacto"] == "si")
    print(f"archivos={len(all_rows)}")
    print(f"duplicados_exactos={duplicates}")
    print(f"imagenes_unicas_con_miniatura={len(image_rows)}")
    print(f"hojas_contacto={(len(image_rows) + 15) // 16}")
    print(WORK)


all_rows: list[dict[str, str]] = []


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
