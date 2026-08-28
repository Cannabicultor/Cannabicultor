#!/usr/bin/env python3
"""Crea copias SEO sin duplicados a partir del inventario y análisis visual."""

from __future__ import annotations

import csv
import json
import re
import shutil
import subprocess
import unicodedata
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / ".catalogacion-fotos"
OUTPUT = ROOT / "fotos" / "catalogadas-sin-duplicados-seo"


def slug(value: str, fallback: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value or fallback


def canonical_part(value: str) -> str:
    value = slug(value, "imagen")
    rules = [
        (("cogollo", "bud", "muestra-seca"), "cogollo"),
        (("hoja", "hojas"), "hoja"),
        (("raiz", "raices"), "raiz"),
        (("semilla", "semillas"), "semilla"),
        (("captura", "pantalla"), "captura-pantalla"),
        (("equipo", "maquina", "medidor", "microscopio"), "equipo"),
        (("cultivo", "invernadero", "sala"), "cultivo"),
        (("planta", "plantas"), "planta"),
        (("flor", "flores"), "flor"),
    ]
    for needles, result in rules:
        if any(needle in value for needle in needles):
            return result
    return "imagen"


def canonical_phase(value: str) -> str:
    value = slug(value, "sin-fase")
    rules = [
        ("germin", "germinacion"), ("plantula", "plantula"),
        ("preflor", "prefloracion"), ("flor", "floracion"),
        ("veget", "vegetativo"), ("crecimiento", "vegetativo"),
        ("cosecha", "cosecha"), ("secado", "secado"), ("curado", "curado"),
    ]
    for needle, result in rules:
        if needle in value:
            return result
    return "sin-fase"


def canonical_theme(value: str) -> str:
    value = slug(value, "cannabis")
    themes = [
        "tricomas", "flor-femenina", "flor-macho", "planta-macho", "oidio",
        "cultivo-interior", "cultivo-exterior", "muestra-seca", "semillas",
        "germinacion", "jiffy", "sustrato", "raices", "deficiencia",
        "plaga", "riego", "poda", "cannabis",
    ]
    for theme in themes:
        if theme in value:
            return theme
    if "macho" in value:
        return "planta-macho"
    if "invernadero" in value:
        return "cultivo-interior"
    if len(value.split("-")) <= 3 and "fotos-ordenador" not in value:
        return value
    return "cannabis"


def load_analysis(folder: Path) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for path in sorted(folder.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data.get("items", []):
            result[str(item["indice"])] = item
    return result


def copy_photo(source: Path, target: Path) -> None:
    if source.suffix.lower() == ".heic":
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(source), "-frames:v", "1", "-q:v", "2", "-y", str(target)],
            check=True,
        )
    else:
        shutil.copy2(source, target)


def main() -> None:
    photo_analysis = load_analysis(WORK / "analisis-visual-4")
    if len(photo_analysis) < 659:
        raise SystemExit(f"Análisis fotográfico incompleto: {len(photo_analysis)}/659")

    photo_dir = OUTPUT / "imagenes"
    photo_dir.mkdir(parents=True, exist_ok=False)

    with (WORK / "inventario.csv").open(encoding="utf-8") as handle:
        inventory = list(csv.DictReader(handle))

    counters: defaultdict[str, int] = defaultdict(int)
    catalog: list[dict[str, str | int]] = []
    for row in inventory:
        if not row["indice"]:
            continue
        item = photo_analysis[row["indice"]]
        base = "-".join([
            canonical_part(item["parte"]),
            canonical_theme(item["tema"]),
            canonical_phase(item["fase"]),
        ])
        counters[base] += 1
        filename = f"{base}-{counters[base]:02d}.jpg"
        source = ROOT / row["ruta_original"]
        copy_photo(source, photo_dir / filename)
        catalog.append({
            "nombre_nuevo": filename,
            "nombre_anterior": source.name,
            "ruta_anterior": row["ruta_original"],
            "descripcion_larga": item["descripcion_larga"],
            "etiquetas": ",".join(slug(tag, "") for tag in item["etiquetas"] if slug(tag, "")),
            "calidad_1a5": item["calidad_1a5"],
            "apta_para_broll": "si" if item["apta_para_broll"] else "no",
            "confianza": item["confianza"],
            "sha256_original": row["sha256"],
        })

    fields = list(catalog[0])
    with (OUTPUT / "catalogo.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(catalog)

    duplicate_rows = [
        row for row in inventory
        if row["duplicado_exacto"] == "si" and row["extension"] in {".jpg", ".jpeg", ".heic"}
    ]
    with (OUTPUT / "duplicados-excluidos.csv").open("w", newline="", encoding="utf-8") as handle:
        fields = ["ruta_original", "sha256", "duplicado_de"]
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(duplicate_rows)
    print(f"catalogados={len(catalog)}")
    print(f"duplicados_excluidos={len(duplicate_rows)}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
