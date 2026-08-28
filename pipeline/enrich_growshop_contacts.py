#!/usr/bin/env python3
"""Enriquece growshops: web/teléfono CANNA, altas Fast Buds, logos de webs oficiales."""
from __future__ import annotations

import html as htmllib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

import psycopg

UA = "CannabicultorBot/1.0 (+https://cannabicultor.com)"
BAD_LOGO = re.compile(
    r"rsrc\.php|via\.placeholder|/defaults/|favicon|16x16|32x32|1x1|pixel|sprite|"
    r"logo_google|maps\.google|hugedomains|dutch-passion|atami-logo",
    re.I,
)


def load_db_url() -> str:
    for p in (Path(__file__).resolve().parents[1] / ".env", Path.home() / "cannabis-data-pipeline" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Falta DATABASE_URL")


def fetch(url: str, timeout: int = 25) -> tuple[str, str]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace"), r.geturl()


def clean_web(raw: str | None) -> str | None:
    if not raw:
        return None
    u = raw.strip()
    u = re.sub(r"^https?://https?://", "https://", u, flags=re.I)
    u = u.replace("http://https://", "https://")
    if u.startswith("//"):
        u = "https:" + u
    if not re.match(r"^https?://", u, re.I):
        if re.match(r"^[\w.-]+\.[a-z]{2,}", u, re.I):
            u = "https://" + u
        else:
            return None
    low = u.lower()
    if any(x in low for x in ("google.com", "facebook.com", "maps.", "canna.es", "2fast4buds", "github.com", "list.shop")):
        return None
    if "instagram.com" in low:
        return None
    return u.split()[0][:240]


def slugify(*parts: str) -> str:
    raw = "-".join(p for p in parts if p)
    s = raw.lower()
    for a, b in (("á", "a"), ("à", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"), ("ü", "u")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:80] or "growshop"


def norm_name(s: str) -> str:
    s = htmllib.unescape(s or "").lower()
    s = re.sub(r"grow\s*-?\s*shop", "growshop", s)
    s = re.sub(r"[^a-z0-9áéíóúñü]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_canna_popups() -> list[dict]:
    html, _ = fetch("https://www.canna.es/stores", timeout=45)
    m = re.search(r'data-drupal-selector="drupal-settings-json"[^>]*>([^<]+)', html)
    if not m:
        return []
    js = json.loads(m.group(1))
    feats = js["leaflet"]["leaflet-map-view-dealers-page-stores-map"]["features"]
    out = []
    for f in feats:
        val = htmllib.unescape((f.get("popup") or {}).get("value") or "")
        name = re.search(r"field--name-title[^>]*>([^<]+)", val)
        loc = re.search(r'class="locality">([^<]+)', val)
        phone = re.search(r'href="tel:([^"]+)"', val)
        country = re.search(r'class="country">([^<]+)', val)
        if country and not country.group(1).lower().startswith("espa"):
            continue
        nombre = (name.group(1).strip() if name else "") or ""
        if re.search(r"\(online\)|\bonline\b", nombre, re.I):
            continue
        web = None
        for h in re.findall(r'href="(https?://[^"]+)"', val):
            web = clean_web(h)
            if web:
                break
        hours = re.findall(
            r'office-hours__item-label">([^<]+)</span>\s*<span class="office-hours__item-slots">([^<]+)',
            val,
        )
        out.append(
            {
                "nombre": htmllib.unescape(nombre)[:160],
                "ciudad": loc.group(1).strip() if loc else None,
                "telefono": phone.group(1) if phone else None,
                "web": web,
                "lat": f.get("lat"),
                "lon": f.get("lon"),
                "horario": " · ".join(f"{a} {b}" for a, b in hours[:7]) or None,
            }
        )
    return out


def parse_fastbuds() -> list[dict]:
    html, _ = fetch("https://2fast4buds.com/distributors/es", timeout=45)
    cards = re.findall(r'<div class="store"[^>]*>([\s\S]*?)</div>\s*<div class="store"|<div class="store"[^>]*>([\s\S]*?)$', html)
    # simpler: split by class="store"
    parts = re.split(r'<div class="store"[^>]*>', html)[1:]
    out = []
    skip = re.compile(r"online|zamnesia|herbies|seedsman|linda.?seeds|wholesale|distributors", re.I)
    for part in parts:
        name_m = re.search(r'<div class="name">\s*<span>([^<]+)', part)
        if not name_m:
            continue
        nombre = htmllib.unescape(name_m.group(1)).strip()
        if not nombre or skip.search(nombre):
            continue
        link_m = re.search(r'<span class="link">([^<]+)', part)
        text_m = re.search(r'<div class="text">([\s\S]*?)</div>', part)
        text = htmllib.unescape(re.sub(r"<br\s*/?>", "\n", text_m.group(1) if text_m else ""))
        text = re.sub(r"<[^>]+>", "", text)
        web = clean_web((link_m.group(1).strip() if link_m else "") or None)
        if not web:
            for m in re.findall(r"([a-z0-9-]+\.(?:com|es|net|shop|eu))\b", text, re.I):
                web = clean_web(m)
                if web:
                    break
        phone = None
        pm = re.search(r"(?:Phone|Tel|Telf)[:\s]*([+\d][\d\s()./-]{7,20})", text, re.I)
        if pm:
            phone = pm.group(1).strip()
        else:
            pm = re.search(r"(\+34[\d\s]{8,16}|\b\d{3}[\s.-]?\d{2,3}[\s.-]?\d{2,3}[\s.-]?\d{2,3}\b)", text)
            if pm:
                phone = pm.group(1).strip()
        street = None
        sm = re.search(
            r"((?:Calle|C/|Carrer|Avenida|Avda?\.?|Plaza|Plaça|Passeig|Paseo|Camí|Camino|Ronda|Polígono|Av\.)[^\n]{5,90})",
            text,
            re.I,
        )
        if sm:
            street = sm.group(1).strip(" ,")
        ciudad = None
        cm = re.search(r"\b(\d{5})\s*,?\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][A-Za-zÁÉÍÓÚáéíóúñü .'-]{2,40})", text)
        if cm:
            ciudad = cm.group(2).strip(" ,")
        if not ciudad:
            for hint in ("Barcelona", "Madrid", "Valencia", "Sevilla", "Málaga", "Granada", "Alicante", "Murcia"):
                if hint.lower() in text.lower():
                    ciudad = hint
                    break
        if not (web or street):
            continue
        out.append({"nombre": nombre[:160], "ciudad": ciudad, "direccion": street, "telefono": phone, "web": web})
    return out


def pick_logo(html: str, base: str) -> str | None:
    cands = []
    for pat in [
        r'<link[^>]+rel=["\'](?:apple-touch-icon(?:-precomposed)?|icon)[^>]+href=["\']([^"\']+)',
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)',
        r'src=["\']([^"\']*logo[^"\']+\.(?:png|svg|webp|jpg|jpeg))',
        r'href=["\']([^"\']*logo[^"\']+\.(?:png|svg|webp))',
    ]:
        cands.extend(re.findall(pat, html, re.I))
    scored = []
    for raw in cands:
        try:
            absu = urllib.parse.urljoin(base, raw)
        except Exception:
            continue
        if BAD_LOGO.search(absu):
            continue
        if "wixstatic" in absu and "logo" not in absu.lower():
            continue
        score = 0
        if "logo" in absu.lower():
            score += 8
        if re.search(r"\.svg($|\?)", absu, re.I):
            score += 3
        if re.search(r"apple-touch-icon", absu, re.I):
            score += 5
        if re.search(r"/icon.*\.(png|webp)", absu, re.I):
            score += 2
        if score == 0:
            continue
        scored.append((score, absu[:400]))
    scored.sort(key=lambda x: -x[0])
    return scored[0][1] if scored else None


def fetch_logo(web: str) -> str | None:
    try:
        html, final = fetch(web, timeout=12)
        return pick_logo(html, final)
    except Exception:
        return None


def match_shop(shops, nombre, ciudad):
    nn = norm_name(nombre)
    nc = norm_name(ciudad or "")
    best = None
    for s in shops:
        sn = norm_name(s["nombre"])
        if sn == nn:
            if not nc or nc in norm_name(s["ciudad"] or "") or norm_name(s["ciudad"] or "") in nc:
                return s
            best = best or s
        elif nn and nc and (nn in sn or sn in nn) and nc in norm_name(s["ciudad"] or ""):
            best = best or s
    return best


def main():
    url = load_db_url()
    with psycopg.connect(url) as conn:
        conn.execute("DELETE FROM growshops WHERE fuente = 'fastbuds';")
        conn.commit()
        shops = conn.execute(
            "SELECT id, nombre, ciudad, web, logo_url FROM growshops WHERE activo"
        ).fetchall()
        shops = [{"id": r[0], "nombre": r[1], "ciudad": r[2] or "", "web": r[3] or "", "logo_url": r[4] or ""} for r in shops]
        print("db after cleanup", len(shops))

        print("canna popups…")
        canna = parse_canna_popups()
        print("canna", len(canna), "web", sum(1 for r in canna if r.get("web")))
        n = 0
        for r in canna:
            hit = match_shop(shops, r["nombre"], r.get("ciudad"))
            if not hit:
                continue
            conn.execute(
                """
                UPDATE growshops SET
                  web = COALESCE(NULLIF(web,''), %s),
                  telefono = COALESCE(NULLIF(telefono,''), %s),
                  horario = COALESCE(NULLIF(horario,''), %s),
                  lat = COALESCE(lat, %s),
                  lon = COALESCE(lon, %s),
                  updated_at = now()
                WHERE id = %s AND verificado = false
                """,
                (r.get("web"), r.get("telefono"), r.get("horario"), r.get("lat"), r.get("lon"), hit["id"]),
            )
            if r.get("web") and not hit["web"]:
                hit["web"] = r["web"]
            n += 1
        conn.commit()
        print("canna updates", n)

        print("fastbuds…")
        fb = parse_fastbuds()
        print("fastbuds cards", len(fb), "web", sum(1 for r in fb if r.get("web")))
        used = {slugify(s["nombre"], s["ciudad"]) for s in shops}
        ins = 0
        for r in fb:
            if match_shop(shops, r["nombre"], r.get("ciudad")):
                hit = match_shop(shops, r["nombre"], r.get("ciudad"))
                if r.get("web") and hit and not hit["web"]:
                    conn.execute(
                        "UPDATE growshops SET web = %s, telefono = COALESCE(NULLIF(telefono,''), %s), direccion = COALESCE(NULLIF(direccion,''), %s) WHERE id = %s AND verificado = false",
                        (r.get("web"), r.get("telefono"), r.get("direccion"), hit["id"]),
                    )
                    hit["web"] = r["web"]
                continue
            slug = slugify(r["nombre"], r.get("ciudad") or "")
            base, i = slug, 2
            while slug in used:
                slug = f"{base}-{i}"
                i += 1
            used.add(slug)
            conn.execute(
                """
                INSERT INTO growshops (slug, nombre, direccion, ciudad, telefono, web, fuente, osm_id, activo, verificado)
                VALUES (%s,%s,%s,%s,%s,%s,'fastbuds',%s,true,false)
                ON CONFLICT (osm_id) DO NOTHING
                """,
                (slug, r["nombre"], r.get("direccion"), r.get("ciudad"), r.get("telefono"), r.get("web"), f"fastbuds/{slug}"),
            )
            shops.append({"id": 0, "nombre": r["nombre"], "ciudad": r.get("ciudad") or "", "web": r.get("web") or "", "logo_url": ""})
            ins += 1
        conn.commit()
        print("fastbuds nuevas", ins)

        pending = conn.execute(
            "SELECT id, nombre, web FROM growshops WHERE activo AND coalesce(web,'')<>'' AND coalesce(logo_url,'')=''"
        ).fetchall()
        print("logos pendientes", len(pending))
        ok = 0
        for gid, nombre, web in pending:
            logo = fetch_logo(web)
            time.sleep(0.15)
            if not logo:
                continue
            conn.execute(
                "UPDATE growshops SET logo_url = %s, updated_at = now() WHERE id = %s AND coalesce(logo_url,'')=''",
                (logo, gid),
            )
            ok += 1
            if ok % 10 == 0:
                conn.commit()
                print("logos", ok)
        conn.commit()
        stats = conn.execute(
            """
            SELECT count(*),
                   count(*) FILTER (WHERE coalesce(logo_url,'')<>''),
                   count(*) FILTER (WHERE coalesce(web,'')<>'')
            FROM growshops WHERE activo
            """
        ).fetchone()
        print(f"listo total={stats[0]} logos={stats[1]} webs={stats[2]} logos_nuevos={ok}")


if __name__ == "__main__":
    main()
