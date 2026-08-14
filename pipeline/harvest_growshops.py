#!/usr/bin/env python3
"""Importa growshops de España desde OpenStreetMap (ODbL) a public.growshops.

No inventa fichas. Solo OSM / Nominatim. No pisa fichas verificadas ni manuales.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "CannabicultorBot/1.0 (+https://cannabicultor.com)"
OVERPASS = "https://overpass.kumi.systems/api/interpreter"
NOMINATIM = "https://nominatim.openstreetmap.org"

PROV_CCAA = {
    "álava": "País Vasco",
    "araba": "País Vasco",
    "albacete": "Castilla-La Mancha",
    "alicante": "Comunitat Valenciana",
    "alacant": "Comunitat Valenciana",
    "almería": "Andalucía",
    "asturias": "Asturias",
    "ávila": "Castilla y León",
    "badajoz": "Extremadura",
    "barcelona": "Cataluña",
    "bizkaia": "País Vasco",
    "vizcaya": "País Vasco",
    "burgos": "Castilla y León",
    "cáceres": "Extremadura",
    "cádiz": "Andalucía",
    "cantabria": "Cantabria",
    "castellón": "Comunitat Valenciana",
    "castelló": "Comunitat Valenciana",
    "ceuta": "Ceuta",
    "ciudad real": "Castilla-La Mancha",
    "córdoba": "Andalucía",
    "cuenca": "Castilla-La Mancha",
    "gipuzkoa": "País Vasco",
    "guipúzcoa": "País Vasco",
    "girona": "Cataluña",
    "gerona": "Cataluña",
    "granada": "Andalucía",
    "guadalajara": "Castilla-La Mancha",
    "huelva": "Andalucía",
    "huesca": "Aragón",
    "illes balears": "Illes Balears",
    "islas baleares": "Illes Balears",
    "jaén": "Andalucía",
    "a coruña": "Galicia",
    "la coruña": "Galicia",
    "la rioja": "La Rioja",
    "las palmas": "Canarias",
    "león": "Castilla y León",
    "lleida": "Cataluña",
    "lérida": "Cataluña",
    "lugo": "Galicia",
    "madrid": "Madrid",
    "málaga": "Andalucía",
    "melilla": "Melilla",
    "murcia": "Murcia",
    "navarra": "Navarra",
    "nafarroa": "Navarra",
    "ourense": "Galicia",
    "orense": "Galicia",
    "palencia": "Castilla y León",
    "pontevedra": "Galicia",
    "salamanca": "Castilla y León",
    "santa cruz de tenerife": "Canarias",
    "segovia": "Castilla y León",
    "sevilla": "Andalucía",
    "soria": "Castilla y León",
    "tarragona": "Cataluña",
    "teruel": "Aragón",
    "toledo": "Castilla-La Mancha",
    "valencia": "Comunitat Valenciana",
    "valència": "Comunitat Valenciana",
    "valladolid": "Castilla y León",
    "zamora": "Castilla y León",
    "zaragoza": "Aragón",
}

SKIP_SHOP = {"florist", "gift", "clothes", "supermarket", "convenience", "hairdresser", "beauty"}


def load_db_url() -> str:
    for p in (ROOT / ".env", Path.home() / "cannabis-data-pipeline" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Falta DATABASE_URL")


def psql(sql: str) -> str:
    import subprocess

    return subprocess.check_output(["psql", os.environ["DATABASE_URL"], "-At", "-c", sql], text=True).strip()


def slugify(*parts: str) -> str:
    raw = "-".join(p for p in parts if p)
    s = raw.lower()
    s = re.sub(r"[áàäâ]", "a", s)
    s = re.sub(r"[éèëê]", "e", s)
    s = re.sub(r"[íìïî]", "i", s)
    s = re.sub(r"[óòöô]", "o", s)
    s = re.sub(r"[úùüû]", "u", s)
    s = s.replace("ñ", "n").replace("ç", "c")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80] or "growshop"


def sql_str(v) -> str:
    if v is None or v == "":
        return "NULL"
    return "'" + str(v).replace("'", "''")[:400] + "'"


def sql_num(v):
    if v is None:
        return "NULL"
    try:
        return str(float(v))
    except (TypeError, ValueError):
        return "NULL"


def fetch(url: str, data: bytes | None = None, timeout: int = 90):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def looks_like_growshop(name: str, shop: str) -> bool:
    n = (name or "").lower()
    if shop in SKIP_SHOP and "grow" not in n:
        return False
    if shop in {"growshop", "hydroponics"}:
        return True
    if re.search(r"grow\s*-?\s*shop|growshop|hidropon", n):
        return True
    return False


def ccaa_from(prov: str | None, state: str | None) -> str | None:
    for cand in (prov, state):
        if not cand:
            continue
        key = cand.lower().strip()
        if key in PROV_CCAA:
            return PROV_CCAA[key]
        for k, v in PROV_CCAA.items():
            if k in key or key in k:
                return v
        if cand in {
            "Andalucía", "Aragón", "Asturias", "Illes Balears", "Canarias", "Cantabria",
            "Castilla-La Mancha", "Castilla y León", "Cataluña", "Catalunya",
            "Comunitat Valenciana", "Comunidad Valenciana", "Extremadura", "Galicia",
            "Madrid", "Comunidad de Madrid", "Murcia", "Región de Murcia", "Navarra",
            "País Vasco", "Euskadi", "La Rioja", "Ceuta", "Melilla",
        }:
            return (
                "Cataluña" if cand in {"Catalunya"} else
                "Comunitat Valenciana" if cand in {"Comunidad Valenciana"} else
                "Madrid" if cand in {"Comunidad de Madrid"} else
                "Murcia" if cand in {"Región de Murcia"} else
                "País Vasco" if cand in {"Euskadi"} else
                cand
            )
    return state or None


def tags_to_shop(el: dict) -> dict | None:
    t = el.get("tags") or {}
    name = (t.get("name") or t.get("name:es") or "").strip()
    shop = (t.get("shop") or "").strip()
    if not name or not looks_like_growshop(name, shop):
        return None
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    osm_id = f"{el.get('type', 'n')}/{el.get('id')}"
    street = " ".join(x for x in [t.get("addr:street"), t.get("addr:housenumber")] if x).strip()
    ciudad = t.get("addr:city") or t.get("addr:town") or t.get("addr:place")
    provincia = t.get("addr:province") or t.get("addr:county")
    ccaa = ccaa_from(provincia, t.get("addr:state"))
    phone = t.get("phone") or t.get("contact:phone")
    web = t.get("website") or t.get("contact:website")
    email = t.get("email") or t.get("contact:email")
    ig = t.get("contact:instagram") or t.get("instagram")
    return {
        "osm_id": osm_id,
        "nombre": name[:160],
        "direccion": street or t.get("addr:full"),
        "cp": t.get("addr:postcode"),
        "ciudad": ciudad,
        "provincia": provincia,
        "ccaa": ccaa,
        "lat": lat,
        "lon": lon,
        "telefono": phone,
        "email": email,
        "web": web,
        "instagram": ig,
        "horario": t.get("opening_hours"),
        "fuente": "osm",
    }


def overpass_spain() -> list[dict]:
    q = """
    [out:json][timeout:60];
    (
      nwr["shop"="growshop"](35.9,-9.5,43.9,4.5);
      nwr["shop"="hydroponics"](35.9,-9.5,43.9,4.5);
      nwr["name"~"growshop",i](35.9,-9.5,43.9,4.5);
      nwr["name"~"Grow Shop"](35.9,-9.5,43.9,4.5);
    );
    out tags center;
    """
    data = fetch(OVERPASS, data=q.encode(), timeout=100)
    out = []
    for el in data.get("elements") or []:
        row = tags_to_shop(el)
        if row:
            out.append(row)
    return out


def nominatim_search(q: str) -> list[dict]:
    url = (
        NOMINATIM
        + "/search?"
        + urllib.parse.urlencode(
            {
                "q": q,
                "countrycodes": "es",
                "format": "jsonv2",
                "addressdetails": 1,
                "extratags": 1,
                "limit": 40,
            }
        )
    )
    try:
        hits = fetch(url, timeout=30)
    except Exception:
        return []
    time.sleep(1.05)
    out = []
    for h in hits or []:
        extra = h.get("extratags") or {}
        addr = h.get("address") or {}
        name = (h.get("name") or h.get("display_name") or "").split(",")[0].strip()
        shop = extra.get("shop") or ""
        if not looks_like_growshop(name, shop) and "grow" not in name.lower():
            continue
        osm_type = {"node": "node", "way": "way", "relation": "relation"}.get(h.get("osm_type"), "n")
        ciudad = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("municipality")
        provincia = addr.get("province") or addr.get("county")
        out.append(
            {
                "osm_id": f"{osm_type}/{h.get('osm_id')}",
                "nombre": name[:160],
                "direccion": extra.get("addr:full")
                or " ".join(x for x in [addr.get("road"), addr.get("house_number")] if x),
                "cp": addr.get("postcode"),
                "ciudad": ciudad,
                "provincia": provincia,
                "ccaa": ccaa_from(provincia, addr.get("state")),
                "lat": h.get("lat"),
                "lon": h.get("lon"),
                "telefono": extra.get("phone") or extra.get("contact:phone"),
                "email": extra.get("email"),
                "web": extra.get("website") or extra.get("contact:website"),
                "instagram": extra.get("contact:instagram"),
                "horario": extra.get("opening_hours"),
                "fuente": "osm",
            }
        )
    return out


def upsert(row: dict, used_slugs: set[str]) -> bool:
    slug = slugify(row["nombre"], row.get("ciudad") or "")
    base = slug
    n = 2
    while slug in used_slugs:
        slug = f"{base}-{n}"
        n += 1
    used_slugs.add(slug)
    sql = f"""
    INSERT INTO growshops (
      slug, nombre, direccion, cp, ciudad, provincia, ccaa,
      lat, lon, telefono, email, web, instagram, horario,
      fuente, osm_id, verificado, activo
    ) VALUES (
      {sql_str(slug)}, {sql_str(row['nombre'])}, {sql_str(row.get('direccion'))},
      {sql_str(row.get('cp'))}, {sql_str(row.get('ciudad'))}, {sql_str(row.get('provincia'))},
      {sql_str(row.get('ccaa'))}, {sql_num(row.get('lat'))}, {sql_num(row.get('lon'))},
      {sql_str(row.get('telefono'))}, {sql_str(row.get('email'))}, {sql_str(row.get('web'))},
      {sql_str(row.get('instagram'))}, {sql_str(row.get('horario'))},
      'osm', {sql_str(row['osm_id'])}, false, true
    )
    ON CONFLICT (osm_id) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      direccion = COALESCE(EXCLUDED.direccion, growshops.direccion),
      cp = COALESCE(EXCLUDED.cp, growshops.cp),
      ciudad = COALESCE(EXCLUDED.ciudad, growshops.ciudad),
      provincia = COALESCE(EXCLUDED.provincia, growshops.provincia),
      ccaa = COALESCE(EXCLUDED.ccaa, growshops.ccaa),
      lat = COALESCE(EXCLUDED.lat, growshops.lat),
      lon = COALESCE(EXCLUDED.lon, growshops.lon),
      telefono = COALESCE(EXCLUDED.telefono, growshops.telefono),
      email = COALESCE(EXCLUDED.email, growshops.email),
      web = COALESCE(EXCLUDED.web, growshops.web),
      instagram = COALESCE(EXCLUDED.instagram, growshops.instagram),
      horario = COALESCE(EXCLUDED.horario, growshops.horario),
      updated_at = now()
    WHERE growshops.verificado = false AND growshops.fuente = 'osm'
    RETURNING id;
    """
    try:
        rid = psql(sql)
        return bool(rid)
    except Exception as e:
        print("fail", row.get("nombre"), e)
        return False


def main():
    os.environ["DATABASE_URL"] = load_db_url()
    rows = []
    if os.environ.get("SKIP_OVERPASS") != "1":
        print("overpass…")
        try:
            rows = overpass_spain()
        except Exception as e:
            print("overpass fail", e)
            rows = []
        print("overpass", len(rows))
    print("nominatim…")
    queries = [
        "growshop",
        "grow shop",
        "grow-shop",
        "growshop Madrid",
        "growshop Barcelona",
        "growshop Valencia",
        "growshop Sevilla",
        "growshop Málaga",
        "growshop Zaragoza",
        "growshop Murcia",
        "growshop Palma",
        "growshop Bilbao",
        "growshop Alicante",
        "growshop Granada",
        "growshop Vigo",
        "growshop Córdoba",
        "growshop Las Palmas",
        "growshop Santa Cruz de Tenerife",
    ]
    for q in queries:
        extra = nominatim_search(q)
        print(" nominatim", q, len(extra))
        rows.extend(extra)

    by_osm = {}
    for r in rows:
        if r.get("osm_id"):
            by_osm[r["osm_id"]] = r
    rows = list(by_osm.values())
    print("únicos", len(rows))

    existing = psql("SELECT coalesce(slug,'') FROM growshops;")
    used = {x for x in existing.splitlines() if x.strip()}
    ok = 0
    for r in rows:
        if upsert(r, used):
            ok += 1
    total = psql("SELECT count(*) FROM growshops WHERE activo = true;")
    print(f"upserts={ok} activos={total}")


if __name__ == "__main__":
    main()
