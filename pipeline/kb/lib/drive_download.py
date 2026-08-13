from __future__ import annotations

import re
import time
from pathlib import Path

import requests

USER_AGENT = "CannabicultorKB/1.0 (+https://cannabicultor.com; kb ingest)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def safe_filename(catalog_num: int, archivo: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", Path(archivo).stem).strip("_")
    return f"{catalog_num:03d}_{base[:80]}.pdf"


def drive_download_url(file_id: str) -> str:
    return f"https://drive.google.com/uc?export=download&id={file_id}"


def download_drive_pdf(
    file_id: str,
    out_dir: Path,
    catalog_num: int,
    archivo: str,
    *,
    max_retries: int = 3,
    timeout: int = 120,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / safe_filename(catalog_num, archivo)

    if dest.exists() and dest.stat().st_size > 1024:
        with open(dest, "rb") as f:
            if f.read(4) == b"%PDF":
                return dest

    url = drive_download_url(file_id)
    last_err: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            resp = SESSION.get(url, stream=True, timeout=timeout, allow_redirects=True)
            resp.raise_for_status()

            # Google virus-scan interstitial for large files
            if "text/html" in (resp.headers.get("content-type") or "").lower():
                token_match = re.search(r"confirm=([0-9A-Za-z_]+)", resp.text)
                id_match = re.search(r"id=([a-zA-Z0-9_-]+)", resp.url)
                if token_match and id_match:
                    confirm_url = (
                        f"https://drive.google.com/uc?export=download"
                        f"&confirm={token_match.group(1)}&id={id_match.group(1)}"
                    )
                    resp = SESSION.get(confirm_url, stream=True, timeout=timeout)
                    resp.raise_for_status()

            tmp = dest.with_suffix(".part")
            with open(tmp, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 256):
                    if chunk:
                        f.write(chunk)

            with open(tmp, "rb") as f:
                if f.read(4) != b"%PDF":
                    raise ValueError("La respuesta de Drive no es un PDF válido")

            tmp.replace(dest)
            return dest

        except Exception as e:
            last_err = e
            if attempt < max_retries:
                time.sleep(2 ** attempt)

    raise RuntimeError(f"Fallo descarga Drive {file_id} tras {max_retries} intentos: {last_err}")