#!/usr/bin/env python3
"""Importa growshops de España desde fuentes oficiales y OSM.

Fuentes: GB The Green Brand (localizador), CANNA (distribuidores),
páginas de contacto de tiendas y OpenStreetMap (ODbL).
No pisa fichas verificadas ni altas manuales.
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


GB_LOGO = "https://www.growbarato.net/img/logo-1768933553.svg"
BAD_LOGO = re.compile(
    r"rsrc\.php|via\.placeholder|/defaults/|favicon|16x16|32x32|1x1|pixel|sprite|logo_google",
    re.I,
)


def hours_to_text(hours) -> str | None:
    if not hours:
        return None
    days = ["L", "M", "X", "J", "V", "S", "D"]
    parts = []
    if isinstance(hours, list):
        for i, slot in enumerate(hours[:7]):
            val = slot[0] if isinstance(slot, list) and slot else slot
            if val:
                parts.append(f"{days[i]} {val}")
    return " · ".join(parts) if parts else None


def harvest_gb() -> list[dict]:
    url = "https://www.growbarato.net/module/advancedstoremaps/data?ajax=1"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.growbarato.net/tiendas",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8", "replace"))
    out = []
    for s in data.get("stores") or []:
        if not s.get("active") or (s.get("country_iso") or "ES") != "ES":
            continue
        ciudad = re.sub(r"\s*\([^)]*\)\s*", " ", s.get("city") or "").strip()
        out.append(
            {
                "osm_id": f"gb/{s.get('id_store')}",
                "nombre": (s.get("name") or f"GB {ciudad}")[:160],
                "direccion": s.get("address1") or None,
                "cp": s.get("postcode"),
                "ciudad": ciudad,
                "provincia": s.get("state"),
                "ccaa": ccaa_from(s.get("state"), None),
                "lat": s.get("latitude"),
                "lon": s.get("longitude"),
                "telefono": s.get("phone") or None,
                "email": s.get("email") or None,
                "web": "https://www.growbarato.net/tiendas",
                "horario": hours_to_text(s.get("hours")),
                "logo_url": GB_LOGO,
                "cadena": "GB The Green Brand",
                "fuente": "cadena",
            }
        )
    return out


def harvest_canna() -> list[dict]:
    html = None
    req = urllib.request.Request("https://www.canna.es/stores", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        html = r.read().decode("utf-8", "replace")
    blocks = re.findall(r"<article[^>]*node--type-dealer[\s\S]*?</article>", html)
    out = []
    for b in blocks:
        name = re.search(r'field--name-title[^>]*>([^<]+)', b)
        country = re.search(r'class="country">([^<]+)', b)
        loc = re.search(r'class="locality">([^<]+)', b)
        prov = re.search(r'class="administrative-area">([^<]+)', b)
        cp = re.search(r'class="postal-code">([^<]+)', b)
        org = re.search(r'class="organization">([^<]+)', b)
        line1 = re.search(r'class="address-line1">([^<]+)', b)
        if not name:
            continue
        nombre = name.group(1).strip()
        if re.search(r"\(online\)|\bonline\b", nombre, re.I):
            continue
        if country and not country.group(1).lower().startswith("espa"):
            continue
        street_parts = []
        if org and re.search(r"\d|c/|calle|av|plaza|carrer|camino|ronda", org.group(1), re.I):
            street_parts.append(org.group(1).strip())
        if line1 and line1.group(1).strip().lower() not in {"bajo", "local", "nave"}:
            street_parts.append(line1.group(1).strip())
        elif line1 and street_parts:
            street_parts.append(line1.group(1).strip())
        ciudad = loc.group(1).strip() if loc else None
        provincia = prov.group(1).strip() if prov else None
        out.append(
            {
                "osm_id": f"canna/{slugify(nombre, ciudad or '')}",
                "nombre": nombre[:160],
                "direccion": ", ".join(street_parts) or None,
                "cp": cp.group(1).strip() if cp else None,
                "ciudad": ciudad,
                "provincia": provincia,
                "ccaa": ccaa_from(provincia, None),
                "fuente": "canna",
            }
        )
    return out


def harvest_oficiales() -> list[dict]:
    return [
        {
            "osm_id": "web/santa-maria-barcelona",
            "nombre": "Santa Maria Growshop",
            "direccion": "Carrer Canvis Vells, 5",
            "cp": "08003",
            "ciudad": "Barcelona",
            "provincia": "Barcelona",
            "ccaa": "Cataluña",
            "telefono": "930101130",
            "web": "https://www.santamariagrowshop.com/",
            "fuente": "web",
        },
        {
            "osm_id": "web/kaya-barcelona",
            "nombre": "Kaya Barcelona Growshop",
            "direccion": "Carrer Moianes, 24",
            "ciudad": "Barcelona",
            "provincia": "Barcelona",
            "ccaa": "Cataluña",
            "telefono": "+34 93 432 87 56",
            "email": "kayabcn@kayabarcelona.com",
            "web": "https://kayabarcelonagrowshop.com/",
            "horario": "L-V 11:00-20:00 · S 10:00-14:00",
            "fuente": "web",
        },
        {
            "osm_id": "web/all-in-pulianas",
            "nombre": "Grow Shop All-in",
            "direccion": "Carretera de Güevejar, 9",
            "cp": "18197",
            "ciudad": "Pulianas",
            "provincia": "Granada",
            "ccaa": "Andalucía",
            "telefono": "696509201",
            "web": "https://growshopall-in.com/",
            "fuente": "web",
        },
        {
            "osm_id": "web/matillaplant-peligros",
            "nombre": "MatillaPlant Central",
            "direccion": "Polígono Ind. Navegran, C/ Melilla, S/N",
            "cp": "18210",
            "ciudad": "Peligros",
            "provincia": "Granada",
            "ccaa": "Andalucía",
            "lat": 37.2273372,
            "lon": -3.6345854,
            "telefono": "858 990 207",
            "web": "https://www.matillaplant.com/",
            "horario": "L-V 09:30-20:30 · S 10:00-14:00",
            "fuente": "web",
        },
    ]


def pick_logo_from_html(html: str, base: str) -> str | None:
    cands = []
    for pat in [
        r'<link[^>]+rel=["\'](?:apple-touch-icon|icon)[^>]+href=["\']([^"\']+)',
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'src=["\']([^"\']*logo[^"\']+\.(?:png|svg|webp|jpg|jpeg))',
    ]:
        cands.extend(re.findall(pat, html, re.I))
    scored = []
    for raw in cands:
        try:
            absu = urllib.parse.urljoin(base, raw.split("?")[0] if "logo" in raw.lower() else raw)
        except Exception:
            continue
        if BAD_LOGO.search(absu):
            continue
        if "wixstatic" in absu and "logo" not in absu.lower():
            continue
        score = 0
        if "logo" in absu.lower():
            score += 6
        if re.search(r"\.svg($|\?)", absu, re.I):
            score += 3
        if re.search(r"apple-touch|icon", absu, re.I):
            score += 1
        if score <= 0 and not re.search(r"\.(png|svg|webp)$", absu, re.I):
            continue
        scored.append((score, absu[:400]))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored else None


def fetch_logo(web: str) -> str | None:
    if not web:
        return None
    try:
        req = urllib.request.Request(web, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read(250000).decode("utf-8", "replace")
            final = r.geturl()
        return pick_logo_from_html(html, final)
    except Exception:
        return None


def upsert(row: dict, used_slugs: set[str]) -> bool:
    ext = row.get("osm_id")
    if not ext:
        ext = f"tmp/{slugify(row['nombre'], row.get('ciudad') or '')}"
        row["osm_id"] = ext
    existing_slug = psql(f"SELECT slug FROM growshops WHERE osm_id = {sql_str(ext)} LIMIT 1;")
    if existing_slug:
        slug = existing_slug
    else:
        slug = slugify(row["nombre"], row.get("ciudad") or "")
        base = slug
        n = 2
        while slug in used_slugs:
            slug = f"{base}-{n}"
            n += 1
        used_slugs.add(slug)
    fuente = row.get("fuente") or "osm"
    sql = f"""
    INSERT INTO growshops (
      slug, nombre, direccion, cp, ciudad, provincia, ccaa,
      lat, lon, telefono, email, web, instagram, logo_url, horario,
      fuente, osm_id, cadena, verificado, activo
    ) VALUES (
      {sql_str(slug)}, {sql_str(row['nombre'])}, {sql_str(row.get('direccion'))},
      {sql_str(row.get('cp'))}, {sql_str(row.get('ciudad'))}, {sql_str(row.get('provincia'))},
      {sql_str(row.get('ccaa'))}, {sql_num(row.get('lat'))}, {sql_num(row.get('lon'))},
      {sql_str(row.get('telefono'))}, {sql_str(row.get('email'))}, {sql_str(row.get('web'))},
      {sql_str(row.get('instagram'))}, {sql_str(row.get('logo_url'))}, {sql_str(row.get('horario'))},
      {sql_str(fuente)}, {sql_str(ext)}, {sql_str(row.get('cadena'))}, false, true
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
      logo_url = COALESCE(EXCLUDED.logo_url, growshops.logo_url),
      horario = COALESCE(EXCLUDED.horario, growshops.horario),
      cadena = COALESCE(EXCLUDED.cadena, growshops.cadena),
      fuente = EXCLUDED.fuente,
      updated_at = now()
    WHERE growshops.verificado = false
    RETURNING id;
    """
    try:
        rid = psql(sql)
        return bool(rid)
    except Exception as e:
        print("fail", row.get("nombre"), e)
        return False


def fill_missing_logos():
    raw = psql(
        """
        SELECT id || E'\\t' || coalesce(web,'')
        FROM growshops
        WHERE activo = true AND (logo_url IS NULL OR logo_url = '')
          AND web IS NOT NULL AND web <> ''
        LIMIT 80;
        """
    )
    n = 0
    for line in raw.splitlines():
        if "\t" not in line:
            continue
        gid, web = line.split("\t", 1)
        try:
            logo = fetch_logo(web)
            if not logo:
                continue
            sql_path = Path("/tmp/gs_logo.sql")
            sql_path.write_text(
                f"UPDATE growshops SET logo_url = {sql_str(logo)}, updated_at = now() "
                f"WHERE id = {int(gid)} AND (logo_url IS NULL OR logo_url = '');\n",
                encoding="utf-8",
            )
            import subprocess
            subprocess.check_output(
                ["psql", os.environ["DATABASE_URL"], "-At", "-f", str(sql_path)],
                text=True,
            )
            n += 1
            print("logo", gid, logo[:80])
        except Exception as e:
            print("logo fail", gid, type(e).__name__)
        time.sleep(0.2)
    print(f"logos nuevos={n}")


def main():
    os.environ["DATABASE_URL"] = load_db_url()
    rows = []
    print("gb…")
    try:
        gb = harvest_gb()
        print("gb", len(gb))
        rows.extend(gb)
    except Exception as e:
        print("gb fail", e)
    print("canna…")
    try:
        canna = harvest_canna()
        print("canna", len(canna))
        rows.extend(canna)
    except Exception as e:
        print("canna fail", e)
    rows.extend(harvest_oficiales())
    if os.environ.get("SKIP_OVERPASS") != "1":
        print("overpass…")
        try:
            osm = overpass_spain()
            print("overpass", len(osm))
            rows.extend(osm)
        except Exception as e:
            print("overpass fail", e)
    if os.environ.get("RUN_NOMINATIM") == "1":
        print("nominatim…")
        for q in ("growshop", "grow shop"):
            extra = nominatim_search(q)
            print(" nominatim", q, len(extra))
            rows.extend(extra)

    by_id = {}
    for r in rows:
        if r.get("osm_id"):
            by_id[r["osm_id"]] = r
    rows = list(by_id.values())
    print("únicos", len(rows))

    existing = psql("SELECT coalesce(slug,'') FROM growshops;")
    used = {x for x in existing.splitlines() if x.strip()}
    ok = 0
    for r in rows:
        if upsert(r, used):
            ok += 1
    fill_missing_logos()
    total = psql("SELECT count(*) FROM growshops WHERE activo = true;")
    logos = psql("SELECT count(*) FROM growshops WHERE logo_url IS NOT NULL AND logo_url <> '';")
    print(f"upserts={ok} activos={total} con_logo={logos}")


if __name__ == "__main__":
    main()
