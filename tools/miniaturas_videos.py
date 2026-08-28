#!/usr/bin/env python3
"""Extrae un fotograma representativo de cada vídeo único y crea hojas de contacto."""

from __future__ import annotations

import csv
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".catalogacion-fotos"
THUMBS = WORK / "miniaturas-video"
SHEETS = WORK / "hojas-contacto-video"


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def frame(path: Path, target: Path) -> None:
    seconds = min(max(duration(path) * 0.25, 0.25), 5.0)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{seconds:.3f}", "-i", str(path), "-frames:v", "1", "-y", str(target)],
        check=True,
    )


def main() -> None:
    THUMBS.mkdir(exist_ok=True)
    SHEETS.mkdir(exist_ok=True)
    with (WORK / "inventario.csv").open(encoding="utf-8") as handle:
        videos = [
            row for row in csv.DictReader(handle)
            if row["duplicado_exacto"] == "no" and row["extension"] in {".mov", ".mp4"}
        ]

    font = ImageFont.load_default(size=16)
    prepared: list[tuple[dict[str, str], Path]] = []
    for index, row in enumerate(videos, 1):
        source = ROOT / row["ruta_original"]
        raw = THUMBS / f"{index:04d}-raw.jpg"
        target = THUMBS / f"{index:04d}.jpg"
        try:
            frame(source, raw)
            with Image.open(raw) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                canvas = Image.new("RGB", (360, 270), "#202020")
                fitted = ImageOps.contain(image, (360, 270), Image.Resampling.LANCZOS)
                canvas.paste(fitted, ((360 - fitted.width) // 2, (270 - fitted.height) // 2))
                canvas.save(target, "JPEG", quality=86, optimize=True)
            raw.unlink(missing_ok=True)
            prepared.append((row, target))
        except Exception as exc:
            print(f"ERROR {source}: {exc}")

    with (WORK / "inventario-videos-unicos.csv").open("w", newline="", encoding="utf-8") as handle:
        fields = ["indice", "ruta_original", "origen", "categoria_carpeta", "extension", "sha256", "miniatura"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, (row, target) in enumerate(prepared, 1):
            writer.writerow({
                "indice": f"V{index}",
                "ruta_original": row["ruta_original"],
                "origen": row["origen"],
                "categoria_carpeta": row["categoria_carpeta"],
                "extension": row["extension"],
                "sha256": row["sha256"],
                "miniatura": str(target),
            })

    for start in range(0, len(prepared), 16):
        sheet = Image.new("RGB", (1520, 1280), "white")
        draw = ImageDraw.Draw(sheet)
        for slot, (row, target) in enumerate(prepared[start : start + 16]):
            x = (slot % 4) * 380 + 10
            y = (slot // 4) * 320 + 10
            with Image.open(target) as thumb:
                sheet.paste(thumb, (x, y))
            number = start + slot + 1
            draw.text((x, y + 275), f"V{number} | {Path(row['ruta_original']).name}"[:43], fill="black", font=font)
            draw.text((x, y + 295), (row["categoria_carpeta"] or row["origen"])[:43], fill="#555555", font=font)
        sheet.save(SHEETS / f"video-hoja-{start // 16 + 1:03d}.jpg", "JPEG", quality=88, optimize=True)
    print(f"videos_unicos={len(videos)}")
    print(f"miniaturas={len(prepared)}")


if __name__ == "__main__":
    main()
