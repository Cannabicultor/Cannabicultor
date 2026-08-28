#!/usr/bin/env python3
"""
Catalogación e inspección de fotos de cannabis con Gemini Vision.

Recorre todas las imágenes de una carpeta origen, las pasa por la API de
Gemini (gemini-1.5-flash) y decide:

  - DESCARTAR (mover a Descartadas/) si la imagen:
      * Contiene texto o logos añadidos / marcas de agua.
      * Es una captura de pantalla o interfaz de móvil.
      * Muestra personas o rostros humanos.
      * NO es una planta o cogollo de cannabis.

  - APROBAR (copiar a Drive_Limpias/) si es una foto válida de cannabis.

Además genera un CSV listo para importar en Notion con las columnas:
  Nombre_Imagen, Fase_Cultivo, Parte_Planta, Estado_Salud, Nombre_Sugerido

El script es REANUDABLE: si se corta, al volver a ejecutarlo continúa donde
lo dejó (lee las filas ya presentes en el CSV y salta esas imágenes).

Uso:
    export GEMINI_API_KEY="tu_api_key"
    python3 scripts/catalogar_fotos.py

Requiere:
    pip install google-genai
"""

import csv
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

ORIGEN = Path("/Users/ernie/cannabicultor/Fotos")
DIR_DESCARTADAS = ORIGEN / "Descartadas"
DIR_LIMPIAS = ORIGEN / "Drive_Limpias"
CSV_SALIDA = ORIGEN / "notion_import.csv"

# Modelo de Gemini. Los nombres con versión (gemini-1.5-flash, gemini-2.0-flash...)
# van caducando, así que por defecto usamos el alias 'gemini-flash-latest', que
# Google mantiene apuntando al modelo flash vigente. Si no estuviera disponible,
# el script auto-selecciona uno al arrancar (ver seleccionar_modelo()).
# Puedes forzar uno concreto con la variable de entorno GEMINI_MODEL.
MODELO = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")

# Extensiones de imagen que procesamos y su mime type
MIME_POR_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".gif": "image/gif",
}

# Carpetas de salida que NUNCA se deben re-procesar al recorrer el origen
DIRS_IGNORADOS = {DIR_DESCARTADAS.resolve(), DIR_LIMPIAS.resolve()}

CAMPOS_CSV = [
    "Nombre_Archivo",
    "Fase_Cultivo",
    "Parte_Planta",
    "Estado_Salud",
    "Sexo",
    "Instalacion",
    "Etiquetas",
    "Ruta_Drive",
]

LOG_PROCESADAS = ORIGEN / ".procesadas.txt"

# Reintentos ante errores transitorios de la API
MAX_REINTENTOS = 6
ESPERA_BASE_SEG = 3          # backoff exponencial: 3, 6, 12, 24...

# Ritmo entre llamadas: con billing (pay-as-you-go) activado, 1s basta para
# evitar picos bruscos de peticiones por segundo. Ajustable con la variable
# de entorno PAUSA_ENTRE_LLAMADAS si alguna vez quieres cambiarlo.
PAUSA_ENTRE_LLAMADAS = float(os.environ.get("PAUSA_ENTRE_LLAMADAS", "1"))

# ---------------------------------------------------------------------------
# Prompt para Gemini
# ---------------------------------------------------------------------------

PROMPT = """Eres un inspector experto de fotografías de cultivo de cannabis.
Analiza ÚNICAMENTE la imagen adjunta y responde en JSON válido (sin texto extra,
sin markdown, sin ```), con exactamente estas claves:

{
  "es_cannabis": true|false,          // true solo si la imagen principal es una planta o cogollo de cannabis
  "tiene_texto_o_logo": true|false,   // true si hay texto sobreimpreso, logos añadidos o marcas de agua
  "es_captura_pantalla": true|false,  // true si es una captura de pantalla o interfaz de móvil/app
  "tiene_personas": true|false,       // true si aparecen personas o rostros humanos
  "fase_cultivo": "...",              // germinacion | plantula | vegetativo | floracion | cosecha | secado | desconocido
  "parte_planta": "...",              // planta_entera | cogollo | hoja | tricomas | raices | semilla | otro
  "estado_salud": "...",              // sana | plaga | deficiencia | hongo | estres | desconocido
  "sexo": "...",                      // macho | hembra | hermafrodita | desconocido
  "instalacion": "...",               // interior | invernadero | exterior | esquejero | secadero | laboratorio | desconocido
  "nombre_sugerido": "..."            // nombre de archivo descriptivo en minusculas-con-guiones, sin extension
}

Reglas:
- Sé estricto: si NO es claramente cannabis, pon "es_cannabis": false.
- El texto natural que forme parte de la planta no cuenta como "tiene_texto_o_logo".
- "sexo": marca "macho" solo si ves sacos polinicos o racimos de estambres claros.
  "hembra" si hay pistilos o cogollos. Si no se distingue, "desconocido".
- "instalacion": "esquejero" si son bandejas de clones o propagador. "invernadero" si hay
  estructura translucida o luz natural filtrada. "interior" si hay paredes, mylar o focos.
  "exterior" si es campo abierto. "secadero" si hay ramas colgadas secandose.
- "nombre_sugerido" debe ser corto, descriptivo y en formato kebab-case
  (ej: "cogollo-floracion-tricomas", "hoja-deficiencia-nitrogeno").
"""

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------


def log(msg):
    print(msg, flush=True)


def cargar_cliente():
    try:
        from google import genai  # noqa: F401
    except ImportError:
        log("ERROR: falta el paquete 'google-genai'. Instálalo con:")
        log("    pip install google-genai")
        sys.exit(1)

    from google import genai
    from google.genai import types

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        log("ERROR: define tu API key antes de ejecutar:")
        log('    export GEMINI_API_KEY="tu_api_key"')
        sys.exit(1)

    # Timeout por petición (en ms) para que una llamada colgada no bloquee
    # el script para siempre. Ajustable con GEMINI_TIMEOUT_SEG.
    timeout_ms = int(float(os.environ.get("GEMINI_TIMEOUT_SEG", "120")) * 1000)
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=timeout_ms),
    )


def _modelos_disponibles(client):
    """Devuelve la lista de nombres de modelo (sin 'models/') que soportan generateContent."""
    nombres = []
    for m in client.models.list():
        acciones = getattr(m, "supported_actions", None) or []
        if "generateContent" in acciones:
            nombres.append(m.name.replace("models/", ""))
    return nombres


def seleccionar_modelo(client):
    """Devuelve un modelo válido: el pedido si existe; si no, uno flash vigente."""
    disponibles = _modelos_disponibles(client)
    if not disponibles:
        log("ERROR: tu API key no lista ningún modelo con generateContent.")
        sys.exit(1)

    # 1) Respetar el modelo pedido si está disponible.
    if MODELO in disponibles:
        return MODELO

    # 2) Preferir aliases 'flash-latest', luego cualquier 'flash', luego el que haya.
    def puntua(nombre):
        n = nombre.lower()
        if "flash" in n and "latest" in n and "lite" not in n:
            return 0
        if "flash" in n and "lite" not in n:
            return 1
        if "flash" in n:
            return 2
        return 3

    elegido = sorted(disponibles, key=puntua)[0]
    log(f"AVISO: '{MODELO}' no está disponible. Uso automáticamente: {elegido}")
    log(f"       (para fijarlo: export GEMINI_MODEL=\"{elegido}\")")
    return elegido


def encontrar_imagenes():
    """Devuelve la lista de imágenes a procesar, saltando las carpetas de salida."""
    imagenes = []
    for ruta in sorted(ORIGEN.rglob("*")):
        if not ruta.is_file():
            continue
        if ruta.suffix.lower() not in MIME_POR_EXT:
            continue
        # Saltar cualquier archivo que ya esté dentro de Descartadas/ o Drive_Limpias/
        if any(padre.resolve() in DIRS_IGNORADOS for padre in ruta.parents):
            continue
        imagenes.append(ruta)
    return imagenes


def cargar_procesadas():
    """Set de nombres ORIGINALES ya procesados (el CSV guarda el nombre nuevo)."""
    if LOG_PROCESADAS.exists():
        return {l.strip() for l in LOG_PROCESADAS.read_text(encoding="utf-8").splitlines() if l.strip()}
    return set()


def normaliza(txt, por_defecto):
    """Limpia un valor de Gemini para usarlo en nombre de archivo."""
    import unicodedata
    t = (txt or "").strip().lower() or por_defecto
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return (t or por_defecto).upper()


CONTADORES = {}


def siguiente_numero(clave):
    """Numeración secuencial por combinación FASE_PARTE, continuando lo ya existente."""
    if not CONTADORES:
        for f in DIR_LIMPIAS.glob("*"):
            m = re.match(r"^(.+)_(\d{3})\.[^.]+$", f.name)
            if m:
                k, n = m.group(1), int(m.group(2))
                CONTADORES[k] = max(CONTADORES.get(k, 0), n)
    CONTADORES[clave] = CONTADORES.get(clave, 0) + 1
    return CONTADORES[clave]


def construir_etiquetas(r):
    """Multi-select para Notion, separado por comas."""
    tags = []
    for campo, defecto in (("fase_cultivo", "desconocido"), ("parte_planta", "otro"),
                           ("estado_salud", "desconocido"), ("sexo", "desconocido"),
                           ("instalacion", "desconocido")):
        v = (r.get(campo) or defecto).strip().lower()
        if v and v not in ("desconocido", "otro"):
            tags.append(v)
    for palabra in re.split(r"[-_\s]+", (r.get("nombre_sugerido") or "").lower()):
        if len(palabra) > 3 and palabra not in tags:
            tags.append(palabra)
    return ", ".join(tags[:8])


def destino_sin_colision(carpeta, nombre):
    """Evita sobrescribir: si el nombre existe, añade sufijo _1, _2, ..."""
    destino = carpeta / nombre
    if not destino.exists():
        return destino
    tallo = destino.stem
    ext = destino.suffix
    i = 1
    while True:
        candidato = carpeta / f"{tallo}_{i}{ext}"
        if not candidato.exists():
            return candidato
        i += 1


class CuotaDiariaAgotada(Exception):
    """Se agotó la cuota DIARIA del free tier; hay que continuar otro día."""


def _segundos_reintento(texto_error):
    """Extrae el retryDelay (p.ej. '52s') que sugiere la API en un 429."""
    m = re.search(r"'retryDelay':\s*'(\d+)s'", texto_error)
    return int(m.group(1)) if m else None


def analizar_imagen(client, ruta):
    """Llama a Gemini y devuelve el dict de resultado, o None si falla.

    Lanza CuotaDiariaAgotada si detecta que el tope POR DÍA está agotado.
    """
    from google.genai import types

    mime = MIME_POR_EXT[ruta.suffix.lower()]
    datos = ruta.read_bytes()
    if len(datos) > 700_000 or ruta.suffix.lower() in (".heic", ".heif"):  # REDUCIDA
        import subprocess, tempfile
        fd, _ruta_tmp = tempfile.mkstemp(suffix=".jpg"); os.close(fd); tmp = Path(_ruta_tmp)
        r = subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1024",
                            str(ruta), "--out", str(tmp)],
                           capture_output=True, timeout=60)
        if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 0:
            datos = tmp.read_bytes(); mime = "image/jpeg"
        tmp.unlink(missing_ok=True)
    if len(datos) > 900_000:
        import subprocess, tempfile
        fd, _ruta_tmp = tempfile.mkstemp(suffix=".jpg"); os.close(fd); tmp = Path(_ruta_tmp)
        r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(ruta),
                            "-vf", "scale='min(1024,iw)':-2", "-q:v", "4", str(tmp)],
                           capture_output=True)
        if r.returncode == 0 and tmp.stat().st_size > 0:
            datos = tmp.read_bytes(); mime = "image/jpeg"
        tmp.unlink(missing_ok=True)
    log(f"    analizando... ({len(datos) // 1024} KB)")

    for intento in range(1, MAX_REINTENTOS + 1):
        try:
            respuesta = client.models.generate_content(
                model=MODELO,
                contents=[
                    types.Part.from_bytes(data=datos, mime_type=mime),
                    PROMPT,
                ],
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                ),
            )
            texto = (respuesta.text or "").strip()
            # Por si acaso viene envuelto en ```json ... ```
            if texto.startswith("```"):
                texto = texto.strip("`")
                if texto.lower().startswith("json"):
                    texto = texto[4:]
                texto = texto.strip()
            return json.loads(texto)
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            es_429 = "429" in msg or "RESOURCE_EXHAUSTED" in msg
            # Tope diario: reintentar no sirve, mejor parar y seguir mañana.
            if es_429 and "PerDay" in msg:
                raise CuotaDiariaAgotada(msg)

            if es_429:
                # Respetamos el retryDelay que sugiere Google (límite por minuto)
                espera = _segundos_reintento(msg) or (ESPERA_BASE_SEG * (2 ** (intento - 1)))
                espera += 2  # margen de seguridad
                log(f"    límite por minuto alcanzado (intento {intento}/{MAX_REINTENTOS}). "
                    f"Esperando {espera}s...")
            else:
                espera = ESPERA_BASE_SEG * (2 ** (intento - 1))
                log(f"    aviso: fallo intento {intento}/{MAX_REINTENTOS} "
                    f"({type(e).__name__}: {e}). Reintento en {espera}s...")

            if intento < MAX_REINTENTOS:
                time.sleep(espera)
    return None


def decidir_descarte(r):
    """Devuelve (descartar: bool, motivo: str)."""
    if not r.get("es_cannabis", False):
        return True, "no es cannabis"
    if r.get("tiene_texto_o_logo", False):
        return True, "texto/logo/marca de agua"
    if r.get("es_captura_pantalla", False):
        return True, "captura de pantalla"
    if r.get("tiene_personas", False):
        return True, "personas/rostros"
    return False, ""


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------


def listar_modelos():
    """Imprime los modelos disponibles que soportan generateContent."""
    client = cargar_cliente()
    log("Modelos disponibles para tu API key (soportan generateContent):\n")
    for m in client.models.list():
        acciones = getattr(m, "supported_actions", None) or []
        if "generateContent" in acciones:
            log(f"  {m.name}")
    log("\nElige uno (sin el prefijo 'models/') y ejecútalo así:")
    log('    export GEMINI_MODEL="gemini-2.0-flash"')


def test_conexion():
    """Prueba rápida: verifica key, modelo, red y una petición mínima."""
    global MODELO
    client = cargar_cliente()
    log("1) Conexión OK, listando modelos...")
    MODELO = seleccionar_modelo(client)
    log(f"2) Modelo elegido: {MODELO}")
    log("3) Enviando petición de prueba (solo texto)...")
    t0 = time.time()
    try:
        r = client.models.generate_content(
            model=MODELO,
            contents=["Responde solo con la palabra: OK"],
        )
        log(f"   Respuesta en {time.time() - t0:.1f}s: {(r.text or '').strip()!r}")
        log("\n✅ La API responde correctamente. El problema no es la conexión.")
    except Exception as e:  # noqa: BLE001
        log(f"\n❌ Falló la petición de prueba tras {time.time() - t0:.1f}s:")
        log(f"   {type(e).__name__}: {e}")


def main():
    if "--listar-modelos" in sys.argv:
        listar_modelos()
        return
    if "--test" in sys.argv:
        test_conexion()
        return

    if "--reset" in sys.argv:
        for ruta in (CSV_SALIDA, LOG_PROCESADAS):
            if ruta.exists():
                ruta.rename(ruta.with_suffix(ruta.suffix + ".old"))
                log(f"Reset: {ruta.name} -> {ruta.name}.old")
        if DIR_LIMPIAS.exists():
            viejo = DIR_LIMPIAS.parent / "Drive_Limpias_old"
            if viejo.exists():
                shutil.rmtree(viejo)
            DIR_LIMPIAS.rename(viejo)
            log("Reset: Drive_Limpias -> Drive_Limpias_old")

    global MODELO
    client = cargar_cliente()
    MODELO = seleccionar_modelo(client)
    log(f"Usando modelo: {MODELO}")

    DIR_DESCARTADAS.mkdir(parents=True, exist_ok=True)
    DIR_LIMPIAS.mkdir(parents=True, exist_ok=True)

    imagenes = encontrar_imagenes()
    procesadas = cargar_procesadas()

    log(f"Encontradas {len(imagenes)} imágenes en {ORIGEN}")
    if procesadas:
        log(f"Reanudando: {len(procesadas)} ya estaban en el CSV, se saltarán.")

    # Abrimos el CSV en modo append; escribimos cabecera si es nuevo/vacío
    csv_nuevo = not CSV_SALIDA.exists() or CSV_SALIDA.stat().st_size == 0
    f_csv = open(CSV_SALIDA, "a", newline="", encoding="utf-8")
    writer = csv.DictWriter(f_csv, fieldnames=CAMPOS_CSV)
    if csv_nuevo:
        writer.writeheader()
        f_csv.flush()

    total = len(imagenes)
    n_aprobadas = n_descartadas = n_errores = 0

    try:
        for idx, ruta in enumerate(imagenes, start=1):
            if ruta.name in procesadas:
                continue

            log(f"[{idx}/{total}] {ruta.name}")
            try:
                resultado = analizar_imagen(client, ruta)
            except CuotaDiariaAgotada:
                log("\n⚠️  Se agotó la CUOTA DIARIA gratuita de Gemini.")
                log("   El progreso está guardado. Vuelve a ejecutar el script")
                log("   mañana (o activa billing) y continuará donde lo dejó.")
                break

            if resultado is None:
                n_errores += 1
                log("    ERROR: no se pudo analizar tras varios intentos. Se deja tal cual.")
                continue

            descartar, motivo = decidir_descarte(resultado)

            if descartar:
                destino = destino_sin_colision(DIR_DESCARTADAS, ruta.name)
                shutil.move(str(ruta), str(destino))
                n_descartadas += 1
                log(f"    ✗ DESCARTADA ({motivo}) -> {destino.name}")
            else:
                fase = normaliza(resultado.get("fase_cultivo"), "desconocido")
                parte = normaliza(resultado.get("parte_planta"), "otro")
                clave = f"{fase}_{parte}"
                num = siguiente_numero(clave)
                ext = ruta.suffix.lower()
                if ext in (".jpeg",):
                    ext = ".jpg"
                nuevo = f"{clave}_{num:03d}{ext}"
                destino = destino_sin_colision(DIR_LIMPIAS, nuevo)
                shutil.copy2(str(ruta), str(destino))
                n_aprobadas += 1
                writer.writerow({
                    "Nombre_Archivo": destino.name,
                    "Fase_Cultivo": resultado.get("fase_cultivo", "desconocido"),
                    "Parte_Planta": resultado.get("parte_planta", "otro"),
                    "Estado_Salud": resultado.get("estado_salud", "desconocido"),
                    "Sexo": resultado.get("sexo", "desconocido"),
                    "Instalacion": resultado.get("instalacion", "desconocido"),
                    "Etiquetas": construir_etiquetas(resultado),
                    "Ruta_Drive": str(destino),
                })
                f_csv.flush()
                log(f"    ✓ APROBADA  {ruta.name}  ->  {destino.name}")

            procesadas.add(ruta.name)
            with open(LOG_PROCESADAS, "a", encoding="utf-8") as fp:
                fp.write(ruta.name + "\n")
                fp.flush()
            time.sleep(PAUSA_ENTRE_LLAMADAS)
    except KeyboardInterrupt:
        log("\nInterrumpido por el usuario. El progreso está guardado; "
            "vuelve a ejecutar para continuar.")
    finally:
        f_csv.close()

    log("\n===== RESUMEN =====")
    log(f"Aprobadas:   {n_aprobadas}  -> {DIR_LIMPIAS}")
    log(f"Descartadas: {n_descartadas}  -> {DIR_DESCARTADAS}")
    log(f"Errores:     {n_errores}")
    log(f"CSV Notion:  {CSV_SALIDA}")


if __name__ == "__main__":
    main()
