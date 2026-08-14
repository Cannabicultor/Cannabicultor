#!/usr/bin/env python3
"""Importa asociaciones / clubes cannábicos de España.

Fuente pública: listado de clubes de cannabisafterclub.com (solo España).
Copia datos de directorio (nombre, ciudad, horario, email, coords).
No copia textos largos ni imágenes.
No pisa fichas verificadas ni altas manuales.
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
UA = "CannabicultorBot/1.0 (+https://cannabicultor.com)"
SITEMAP = "https://cannabisafterclub.com/sitemap.xml"

CITY_FIX = {
    "alacant": "Alicante",
    "alicante": "Alicante",
    "almeria": "Almería",
    "astigarraga": "Astigarraga",
    "baleares": "Illes Balears",
    "barcelona": "Barcelona",
    "bilbao": "Bilbao",
    "caceres": "Cáceres",
    "cadiz": "Cádiz",
    "calafell": "Calafell",
    "cantabria": "Cantabria",
    "castelldefels": "Castelldefels",
    "castellon": "Castellón",
    "ciudad-quesada": "Ciudad Quesada",
    "cordoba": "Córdoba",
    "cornella-de-llobregat": "Cornellà de Llobregat",
    "cubelles": "Cubelles",
    "durango": "Durango",
    "gandia": "Gandia",
    "girona": "Girona",
    "granada": "Granada",
    "guadalajara": "Guadalajara",
    "guipuzcoa": "Gipuzkoa",
    "huelva": "Huelva",
    "ibiza": "Ibiza",
    "igualada": "Igualada",
    "irun": "Irun",
    "las-palmas": "Las Palmas",
    "madrid": "Madrid",
    "malaga": "Málaga",
    "manresa": "Manresa",
    "marbella": "Marbella",
    "matola": "Mutxamel",
    "murcia": "Murcia",
    "paracuellos-de-jarama": "Paracuellos de Jarama",
    "portugalete": "Portugalete",
    "rivas-vaciamadrid": "Rivas-Vaciamadrid",
    "sabadell": "Sabadell",
    "salamanca": "Salamanca",
    "sant-antoni-de-portmany": "Sant Antoni de Portmany",
    "sant-cugat-del-valles": "Sant Cugat del Vallès",
    "sant-pere-de-ribes": "Sant Pere de Ribes",
    "sant-sadurni-d-anoia": "Sant Sadurní d'Anoia",
    "santander": "Santander",
    "selaya": "Selaya",
    "sevilla": "Sevilla",
    "sitges": "Sitges",
    "st-cruz-de-tenerife": "Santa Cruz de Tenerife",
    "tarragona": "Tarragona",
    "terrassa": "Terrassa",
    "toledo": "Toledo",
    "torredembarra": "Torredembarra",
    "torrevieja": "Torrevieja",
    "valencia": "Valencia",
    "vallmoll": "Vallmoll",
    "vilanova-del-cami": "Vilanova del Camí",
    "vilanova-i-la-geltru": "Vilanova i la Geltrú",
    "villabanez": "Villabáñez",
    "vitoria-gasteiz": "Vitoria-Gasteiz",
    "vizcaya": "Bizkaia",
    "zarautz": "Zarautz",
    "alcobendas": "Alcobendas",
}

CITY_CCAA = {
    "Alicante": "Comunitat Valenciana",
    "Almería": "Andalucía",
    "Astigarraga": "País Vasco",
    "Illes Balears": "Illes Balears",
    "Barcelona": "Cataluña",
    "Bilbao": "País Vasco",
    "Cáceres": "Extremadura",
    "Cádiz": "Andalucía",
    "Calafell": "Cataluña",
    "Cantabria": "Cantabria",
    "Castelldefels": "Cataluña",
    "Castellón": "Comunitat Valenciana",
    "Ciudad Quesada": "Comunitat Valenciana",
    "Córdoba": "Andalucía",
    "Cornellà de Llobregat": "Cataluña",
    "Cubelles": "Cataluña",
    "Durango": "País Vasco",
    "Gandia": "Comunitat Valenciana",
    "Girona": "Cataluña",
    "Granada": "Andalucía",
    "Guadalajara": "Castilla-La Mancha",
    "Gipuzkoa": "País Vasco",
    "Huelva": "Andalucía",
    "Ibiza": "Illes Balears",
    "Igualada": "Cataluña",
    "Irun": "País Vasco",
    "Las Palmas": "Canarias",
    "Madrid": "Madrid",
    "Málaga": "Andalucía",
    "Manresa": "Cataluña",
    "Marbella": "Andalucía",
    "Mutxamel": "Comunitat Valenciana",
    "Murcia": "Murcia",
    "Paracuellos de Jarama": "Madrid",
    "Portugalete": "País Vasco",
    "Rivas-Vaciamadrid": "Madrid",
    "Sabadell": "Cataluña",
    "Salamanca": "Castilla y León",
    "Sant Antoni de Portmany": "Illes Balears",
    "Sant Cugat del Vallès": "Cataluña",
    "Sant Pere de Ribes": "Cataluña",
    "Sant Sadurní d'Anoia": "Cataluña",
    "Santander": "Cantabria",
    "Selaya": "Cantabria",
    "Sevilla": "Andalucía",
    "Sitges": "Cataluña",
    "Santa Cruz de Tenerife": "Canarias",
    "Tarragona": "Cataluña",
    "Terrassa": "Cataluña",
    "Toledo": "Castilla-La Mancha",
    "Torredembarra": "Cataluña",
    "Torrevieja": "Comunitat Valenciana",
    "Valencia": "Comunitat Valenciana",
    "Vallmoll": "Cataluña",
    "Vilanova del Camí": "Cataluña",
    "Vilanova i la Geltrú": "Cataluña",
    "Villabáñez": "Castilla y León",
    "Vitoria-Gasteiz": "País Vasco",
    "Bizkaia": "País Vasco",
    "Zarautz": "País Vasco",
    "Alcobendas": "Madrid",
}

CITY_PROV = {
    "Alicante": "Alicante",
    "Almería": "Almería",
    "Astigarraga": "Gipuzkoa",
    "Illes Balears": "Illes Balears",
    "Barcelona": "Barcelona",
    "Bilbao": "Bizkaia",
    "Cáceres": "Cáceres",
    "Cádiz": "Cádiz",
    "Calafell": "Tarragona",
    "Cantabria": "Cantabria",
    "Castelldefels": "Barcelona",
    "Castellón": "Castellón",
    "Ciudad Quesada": "Alicante",
    "Córdoba": "Córdoba",
    "Cornellà de Llobregat": "Barcelona",
    "Cubelles": "Barcelona",
    "Durango": "Bizkaia",
    "Gandia": "Valencia",
    "Girona": "Girona",
    "Granada": "Granada",
    "Guadalajara": "Guadalajara",
    "Gipuzkoa": "Gipuzkoa",
    "Huelva": "Huelva",
    "Ibiza": "Illes Balears",
    "Igualada": "Barcelona",
    "Irun": "Gipuzkoa",
    "Las Palmas": "Las Palmas",
    "Madrid": "Madrid",
    "Málaga": "Málaga",
    "Manresa": "Barcelona",
    "Marbella": "Málaga",
    "Mutxamel": "Alicante",
    "Murcia": "Murcia",
    "Paracuellos de Jarama": "Madrid",
    "Portugalete": "Bizkaia",
    "Rivas-Vaciamadrid": "Madrid",
    "Sabadell": "Barcelona",
    "Salamanca": "Salamanca",
    "Sant Antoni de Portmany": "Illes Balears",
    "Sant Cugat del Vallès": "Barcelona",
    "Sant Pere de Ribes": "Barcelona",
    "Sant Sadurní d'Anoia": "Barcelona",
    "Santander": "Cantabria",
    "Selaya": "Cantabria",
    "Sevilla": "Sevilla",
    "Sitges": "Barcelona",
    "Santa Cruz de Tenerife": "Santa Cruz de Tenerife",
    "Tarragona": "Tarragona",
    "Terrassa": "Barcelona",
    "Toledo": "Toledo",
    "Torredembarra": "Tarragona",
    "Torrevieja": "Alicante",
    "Valencia": "Valencia",
    "Vallmoll": "Tarragona",
    "Vilanova del Camí": "Barcelona",
    "Vilanova i la Geltrú": "Barcelona",
    "Villabáñez": "Valladolid",
    "Vitoria-Gasteiz": "Álava",
    "Bizkaia": "Bizkaia",
    "Zarautz": "Gipuzkoa",
    "Alcobendas": "Madrid",
}

PLACEHOLDER_ADDR = re.compile(
    r"no disponible|invitaci[oó]n|solicita|dada con|address not|^n/?a$|^-+$",
    re.I,
)
DAYS = {
    "Monday": "L",
    "Tuesday": "M",
    "Wednesday": "X",
    "Thursday": "J",
    "Friday": "V",
    "Saturday": "S",
    "Sunday": "D",
}


def load_db_url() -> str:
    for p in (ROOT / ".env", Path.home() / "cannabis-data-pipeline" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Falta DATABASE_URL")


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
    return s[:80] or "asociacion"


def city_from_slug(slug: str) -> str:
    if slug in CITY_FIX:
        return CITY_FIX[slug]
    return slug.replace("-", " ").title()


def fetch(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def spain_club_urls() -> list[tuple[str, str, str]]:
    xml = fetch(SITEMAP, timeout=60)
    locs = re.findall(r"<loc>([^<]+)</loc>", xml)
    out = []
    for u in locs:
        m = re.match(r"https://cannabisafterclub\.com/es/espana/([^/]+)/([^/]+)/?$", u)
        if not m:
            continue
        out.append((u, m.group(1), m.group(2)))
    return out


def parse_local_business(html: str) -> dict | None:
    raw_idx = html.find('"@type":"LocalBusiness"')
    if raw_idx >= 0:
        start = html.rfind("{", 0, raw_idx)
        try:
            obj, _ = json.JSONDecoder().raw_decode(html[start:])
            if obj.get("@type") == "LocalBusiness":
                return obj
        except json.JSONDecodeError:
            pass
    esc_idx = html.find('\\"@type\\":\\"LocalBusiness\\"')
    if esc_idx >= 0:
        p = html.rfind('push([1,"', 0, esc_idx)
        if p >= 0:
            s = p + len('push([1,"') - 1
            try:
                payload, _ = json.JSONDecoder().raw_decode(html[s:])
                obj = json.loads(payload) if isinstance(payload, str) else payload
                if isinstance(obj, dict) and obj.get("@type") == "LocalBusiness":
                    return obj
            except Exception:
                pass
    return None


def clean_hours(spec) -> str | None:
    if not spec:
        return None
    parts = []
    for item in spec:
        day = DAYS.get(str(item.get("dayOfWeek") or "").split("/")[-1])
        opens = re.sub(r"[hH]\s*$", "", str(item.get("opens") or "").strip())
        closes = re.sub(r"[hH]\s*$", "", str(item.get("closes") or "").strip())
        if not day or not opens or not closes:
            continue
        if opens in {"00:00", "closed", "Closed"} and closes in {"00:00", "closed", "Closed"}:
            continue
        parts.append(f"{day} {opens}-{closes}")
    if not parts:
        return None
    times = {p.split(" ", 1)[1] for p in parts}
    if len(times) == 1 and len(parts) >= 5:
        return f"L-D {next(iter(times))}" if len(parts) == 7 else " · ".join(parts)
    return " · ".join(parts)


def norm_acceso(street: str | None) -> tuple[str | None, str | None]:
    s = (street or "").strip()
    if not s:
        return None, None
    if PLACEHOLDER_ADDR.search(s):
        low = s.lower()
        if "dada" in low:
            return None, "Dirección al unirse"
        if "solicita" in low:
            return None, "Solicita invitación"
        return None, None
    return s[:200], None


def title_from_html(html: str) -> str | None:
    m = re.search(r"<title>([^|<]+)", html)
    if not m:
        return None
    name = m.group(1).strip()
    return name[:160] if name else None


def scrape_club(url: str, city_slug: str, club_slug: str) -> dict:
    ciudad = city_from_slug(city_slug)
    row = {
        "osm_id": f"cac/{city_slug}/{club_slug}",
        "nombre": club_slug.replace("-", " ").title()[:160],
        "ciudad": ciudad,
        "provincia": CITY_PROV.get(ciudad),
        "ccaa": CITY_CCAA.get(ciudad),
        "fuente": "afterclub",
        "fuente_url": url,
    }
    try:
        html = fetch(url, timeout=25)
    except Exception as e:
        row["_err"] = type(e).__name__
        return row
    obj = parse_local_business(html) or {}
    name = (obj.get("name") or title_from_html(html) or row["nombre"]).strip()
    row["nombre"] = name[:160]
    addr = obj.get("address") or {}
    if isinstance(addr, list):
        addr = addr[0] if addr else {}
    street, acceso = norm_acceso(addr.get("streetAddress") if isinstance(addr, dict) else None)
    row["direccion"] = street
    row["acceso"] = acceso
    if isinstance(addr, dict):
        loc = (addr.get("addressLocality") or "").strip()
        if loc and not PLACEHOLDER_ADDR.search(loc):
            row["ciudad"] = loc[:80]
            row["provincia"] = CITY_PROV.get(loc) or row["provincia"]
            row["ccaa"] = CITY_CCAA.get(loc) or row["ccaa"]
        cp = (addr.get("postalCode") or "").strip()
        row["cp"] = cp or None
        region = (addr.get("addressRegion") or "").strip()
        if region:
            row["provincia"] = region[:80]
    geo = obj.get("geo") or {}
    try:
        lat = float(geo.get("latitude"))
        lon = float(geo.get("longitude"))
        if -90 <= lat <= 90 and -180 <= lon <= 180 and not (lat == 0 and lon == 0):
            row["lat"] = lat
            row["lon"] = lon
    except (TypeError, ValueError):
        pass
    tel = (obj.get("telephone") or "").strip()
    row["telefono"] = tel[:40] if tel else None
    email = (obj.get("email") or "").strip()
    row["email"] = email[:120] if email and "@" in email else None
    row["horario"] = clean_hours(obj.get("openingHoursSpecification"))
    return row


def upsert(conn, row: dict, used_slugs: set[str]) -> bool:
    ext = row["osm_id"]
    existing = conn.execute(
        "SELECT slug FROM asociaciones WHERE osm_id = %s LIMIT 1", (ext,)
    ).fetchone()
    if existing:
        slug = existing[0]
    else:
        slug = slugify(row["nombre"], row.get("ciudad") or "")
        base = slug
        n = 2
        while slug in used_slugs:
            slug = f"{base}-{n}"
            n += 1
        used_slugs.add(slug)
    try:
        conn.execute(
            """
            INSERT INTO asociaciones (
              slug, nombre, direccion, cp, ciudad, provincia, ccaa,
              lat, lon, telefono, email, horario, acceso,
              fuente, fuente_url, osm_id, verificado, activo
            ) VALUES (
              %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,true
            )
            ON CONFLICT (osm_id) DO UPDATE SET
              nombre = EXCLUDED.nombre,
              direccion = COALESCE(EXCLUDED.direccion, asociaciones.direccion),
              cp = COALESCE(EXCLUDED.cp, asociaciones.cp),
              ciudad = COALESCE(EXCLUDED.ciudad, asociaciones.ciudad),
              provincia = COALESCE(EXCLUDED.provincia, asociaciones.provincia),
              ccaa = COALESCE(EXCLUDED.ccaa, asociaciones.ccaa),
              lat = COALESCE(EXCLUDED.lat, asociaciones.lat),
              lon = COALESCE(EXCLUDED.lon, asociaciones.lon),
              telefono = COALESCE(EXCLUDED.telefono, asociaciones.telefono),
              email = COALESCE(EXCLUDED.email, asociaciones.email),
              horario = COALESCE(EXCLUDED.horario, asociaciones.horario),
              acceso = COALESCE(EXCLUDED.acceso, asociaciones.acceso),
              fuente_url = EXCLUDED.fuente_url,
              fuente = EXCLUDED.fuente,
              updated_at = now()
            WHERE asociaciones.verificado = false
              AND asociaciones.fuente <> 'manual'
            """,
            (
                slug,
                row["nombre"],
                row.get("direccion"),
                row.get("cp"),
                row.get("ciudad"),
                row.get("provincia"),
                row.get("ccaa"),
                row.get("lat"),
                row.get("lon"),
                row.get("telefono"),
                row.get("email"),
                row.get("horario"),
                row.get("acceso"),
                row.get("fuente") or "afterclub",
                row.get("fuente_url"),
                ext,
            ),
        )
        return True
    except Exception as e:
        print("fail", row.get("nombre"), e)
        return False


def main():
    os.environ["DATABASE_URL"] = load_db_url()
    print("sitemap…")
    urls = spain_club_urls()
    print("clubes sitemap", len(urls))
    if not urls:
        raise SystemExit("No hay URLs de España en el sitemap")

    workers = int(os.environ.get("HARVEST_WORKERS", "6"))
    rows = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(scrape_club, u, city, slug): (u, city, slug) for u, city, slug in urls}
        done = 0
        for fut in as_completed(futs):
            row = fut.result()
            rows.append(row)
            done += 1
            if done % 25 == 0 or done == len(urls):
                print(f"  scrape {done}/{len(urls)}  {time.time()-t0:.1f}s")

    print("con nombre", sum(1 for r in rows if r.get("nombre")))
    print("con email", sum(1 for r in rows if r.get("email")))
    print("con horario", sum(1 for r in rows if r.get("horario")))
    print("con coords", sum(1 for r in rows if r.get("lat") is not None))
    print("errores", sum(1 for r in rows if r.get("_err")))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        used = {r[0] for r in conn.execute("SELECT coalesce(slug,'') FROM asociaciones").fetchall() if r[0]}
        ok = 0
        for row in rows:
            if upsert(conn, row, used):
                ok += 1
        conn.commit()
        stats = conn.execute(
            """
            SELECT count(*),
                   count(*) FILTER (WHERE coalesce(email,'')<>''),
                   count(*) FILTER (WHERE coalesce(horario,'')<>''),
                   count(*) FILTER (WHERE lat IS NOT NULL)
            FROM asociaciones WHERE activo
            """
        ).fetchone()
        print(f"upserts={ok} activos={stats[0]} email={stats[1]} horario={stats[2]} coords={stats[3]}")


if __name__ == "__main__":
    main()
