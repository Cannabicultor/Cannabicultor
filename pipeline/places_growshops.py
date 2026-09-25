#!/usr/bin/env python3
"""Growshops por país con Google Places API (New) — MUESTRA, SOLO LECTURA (no escribe en Supabase).

Uso:
  GOOGLE_PLACES_API_KEY=... python3 pipeline/places_growshops.py --pais AR --muestra "growshop en Buenos Aires" --n 10
  GOOGLE_PLACES_API_KEY=... python3 pipeline/places_growshops.py --pais AR --plan      # consultas previstas, sin llamar

Mapea cada resultado a las columnas de `growshops` (osm_id = "gplace/<place_id>", fuente = "google_places").
Descarta CLOSED_PERMANENTLY y lo que no parece un growshop; marca revisión si falta dirección o teléfono.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.request

API = "https://places.googleapis.com/v1/places:searchText"
# Campos pedidos: los de teléfono/web/horario activan el SKU "Enterprise" de Text Search.
FIELD_MASK = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
    "places.location", "places.businessStatus", "places.types", "places.googleMapsUri",
    "places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.websiteUri",
    "places.regularOpeningHours.weekdayDescriptions", "nextPageToken",
])

ZONAS = {
    "AR": [
        "Palermo, CABA", "Villa Crespo, CABA", "Belgrano, CABA", "Caballito, CABA", "San Telmo, CABA",
        "Almagro, CABA", "Zona Norte, Gran Buenos Aires", "Zona Oeste, Gran Buenos Aires",
        "Zona Sur, Gran Buenos Aires", "La Plata", "Mar del Plata", "Córdoba, Argentina", "Rosario",
        "Mendoza", "San Miguel de Tucumán", "Salta", "Neuquén", "Santa Fe, Argentina", "Bahía Blanca",
        "San Carlos de Bariloche", "Paraná, Entre Ríos", "Corrientes", "Resistencia", "Posadas",
        "San Juan, Argentina", "San Salvador de Jujuy", "Santiago del Estero", "Comodoro Rivadavia",
    ],
}
TERMINOS = ["growshop", "grow shop"]
RE_GROW = re.compile(r"grow|cultiv|indoor|hidrop|hydro|semilla|seed|cannab|canna\b|autocultivo|headshop|smart ?shop", re.I)


def slugify(*parts: str) -> str:
    s = " ".join(p for p in parts if p)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:80]


def buscar(query: str, pais: str, key: str, page_token: str | None = None) -> dict:
    body = {"textQuery": query, "regionCode": pais, "languageCode": "es", "pageSize": 20}
    if page_token:
        body["pageToken"] = page_token
    req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST", headers={
        "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK,
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def comp(p: dict, tipo: str) -> str | None:
    for c in p.get("addressComponents") or []:
        if tipo in (c.get("types") or []):
            return c.get("longText")
    return None


def mapear(p: dict, pais: str) -> dict:
    web = p.get("websiteUri") or None
    instagram = facebook = None
    if web and "instagram.com" in web:
        instagram, web = web, None
    elif web and "facebook.com" in web:
        facebook, web = web, None
    ciudad = comp(p, "locality") or comp(p, "administrative_area_level_2")
    provincia = comp(p, "administrative_area_level_1")
    nombre = (p.get("displayName") or {}).get("text", "").strip()
    horas = ((p.get("regularOpeningHours") or {}).get("weekdayDescriptions")) or []
    loc = p.get("location") or {}
    return {
        "osm_id": f"gplace/{p['id']}",
        "slug": slugify(nombre, ciudad or ""),
        "nombre": nombre,
        "direccion": p.get("formattedAddress"),
        "cp": comp(p, "postal_code"),
        "ciudad": ciudad,
        "provincia": provincia,
        "ccaa": None,
        "lat": loc.get("latitude"),
        "lon": loc.get("longitude"),
        "telefono": p.get("nationalPhoneNumber") or p.get("internationalPhoneNumber"),
        "web": web,
        "instagram": instagram,
        "facebook": facebook,
        "horario": " · ".join(horas) or None,
        "google_maps_url": p.get("googleMapsUri"),
        "fuente": "google_places",
        "pais": pais,
        "verificado": False,
        "activo": True,
        "_business_status": p.get("businessStatus"),
        "_types": p.get("types"),
    }


def calidad(r: dict) -> str:
    """descartar | revisar | ok"""
    if r["_business_status"] == "CLOSED_PERMANENTLY":
        return "descartar"
    if not RE_GROW.search(r["nombre"] + " " + (r["web"] or "") + " " + (r["instagram"] or "")):
        return "revisar"          # probablemente vivero, tabaquería, etc.
    if not r["direccion"] and not r["telefono"]:
        return "descartar"
    if not r["direccion"] or not r["telefono"] or r["_business_status"] == "CLOSED_TEMPORARILY":
        return "revisar"
    return "ok"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pais", default="AR")
    ap.add_argument("--muestra", help='consulta única, p. ej. "growshop en Buenos Aires"')
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--plan", action="store_true")
    a = ap.parse_args()
    if a.plan:
        qs = [f"{t} en {z}" for z in ZONAS[a.pais] for t in TERMINOS]
        print(f"{len(qs)} consultas (hasta 3 páginas de 20 cada una → máx. {len(qs) * 3} peticiones):")
        print("\n".join(qs))
        return
    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not key:
        sys.exit("Falta GOOGLE_PLACES_API_KEY (API key con Places API (New) habilitada)")
    vistos, filas = set(), []
    token = None
    while len(filas) < a.n:
        res = buscar(a.muestra, a.pais, key, token)
        for p in res.get("places") or []:
            if p["id"] in vistos:
                continue
            vistos.add(p["id"])
            r = mapear(p, a.pais)
            r["_calidad"] = calidad(r)
            filas.append(r)
        token = res.get("nextPageToken")
        if not token:
            break
    print(json.dumps(filas[: a.n], ensure_ascii=False, indent=2))
    print(f"\n# {len(filas[: a.n])} fichas · " + ", ".join(
        f"{k}={sum(1 for f in filas[: a.n] if f['_calidad'] == k)}" for k in ("ok", "revisar", "descartar")), file=sys.stderr)


if __name__ == "__main__":
    main()
