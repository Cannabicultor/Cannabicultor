#!/usr/bin/env python3
"""Agrupa imágenes candidatas a duplicado visual por distancia de dHash."""

from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / ".catalogacion-fotos" / "inventario.csv"
OUTPUT = ROOT / ".catalogacion-fotos" / "candidatos-duplicado-visual.csv"


def distance(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()


def main() -> None:
    with INVENTORY.open(encoding="utf-8") as handle:
        rows = [
            row for row in csv.DictReader(handle)
            if row["duplicado_exacto"] == "no" and row["dhash"]
        ]

    candidates: list[dict[str, str | int]] = []
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            score = distance(left["dhash"], right["dhash"])
            if score <= 10:
                candidates.append({
                    "distancia_hamming_256": score,
                    "indice_a": left["indice"],
                    "ruta_a": left["ruta_original"],
                    "indice_b": right["indice"],
                    "ruta_b": right["ruta_original"],
                })

    candidates.sort(key=lambda item: (int(item["distancia_hamming_256"]), item["ruta_a"], item["ruta_b"]))
    with OUTPUT.open("w", newline="", encoding="utf-8") as handle:
        fields = ["distancia_hamming_256", "indice_a", "ruta_a", "indice_b", "ruta_b"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(candidates)
    print(f"candidatos={len(candidates)}")
    print(OUTPUT)


if __name__ == "__main__":
    main()
