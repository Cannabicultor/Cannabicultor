# Estado de configuración de n8n — Cannabicultor

Actualizado: 2026-09-21

Este documento permite retomar la configuración sin exponer claves ni tokens.

## Infraestructura y credenciales

- n8n local está disponible en `http://localhost:5678` mediante Docker.
- Las migraciones de Supabase ya se aplicaron manualmente y se verificaron.
- Credenciales n8n creadas y comprobadas:
  - `Supabase account`
  - `Google Sheets account`
  - `DeepSeek account`
  - `Telegram account`
- La credencial accidental de Google Slides fue eliminada. No hay que recrearla.

## Flujos importados

Los flujos existen, permanecen sin publicar e inactivos:

1. `01-sync-sheet-supabase`
2. `02-enrichment-deepseek`
3. `03-alerts-telegram`

No ejecutar ni publicar los flujos completos hasta terminar sus validaciones.

## Verificaciones realizadas

### Supabase

- El nodo `Get many rows` del flujo `01-sync-sheet-supabase` usa la credencial de Supabase.
- Tabla: `variedades`.
- Límite: 5.
- Resultado: lectura correcta de cinco filas. No se modificó ningún registro.

### Google Sheets

- Documento objetivo:
  `Directorios Cannabicultor — Operación de agentes`
- ID del documento:
  `1M5EZ2-OFtar_i8l4BZEr8j0EzA3oFUGo00HJn_gUm_c`
- Pestañas validadas:
  - `Variedades`
  - `Breeders`
  - `Growshops`
  - `Asociaciones_CSC`
  - `Tiendas_CBD`
- Se comprobó lectura de `Variedades` mediante el nodo Google Sheets, filtrando `id = 1` y ejecutando una sola vez. Resultado correcto.

## Protección de datos

- Supabase es la fuente canónica.
- No sobrescribir en la hoja filas con `status = publicado` ni `status = pendiente_revision`.
- La fila de `Variedades` correspondiente a `Lemon G` existe, pero está en estado `publicado`; por tanto no es válida para una prueba de escritura.
- Las claves de `id` no coinciden entre Supabase y la hoja. No asumir que son equivalentes.
- `Tiendas_CBD` queda excluida de sincronización hasta que se decida su tabla canónica en Supabase.

## Prueba aislada autorizada

El usuario autorizó una única escritura de prueba, pero únicamente en una pestaña aislada.

- El usuario creó la pestaña `Pruebas_n8n` en el mismo documento.
- Encabezados en la fila 1:
  `supabase_id`, `nombre`, `tipo`, `thc_pct`, `status`, `last_updated_by`.
- La pestaña no contiene datos todavía.

## Prueba aislada completada (2026-09-21)

En `01-sync-sheet-supabase`, el nodo Google Sheets se transformó en una operación **Append Row** contra `Pruebas_n8n`. Se mantuvo `Execute Once` activado y se ejecutó una sola vez.

Mapeo usado:

| Columna Sheets | Valor |
| --- | --- |
| `supabase_id` | `{{$json.id}}` |
| `nombre` | `{{$json.nombre}}` |
| `tipo` | `{{$json.tipo}}` |
| `thc_pct` | `{{$json.thc_pct}}` |
| `status` | valor fijo `prueba_n8n` |
| `last_updated_by` | valor fijo `n8n_test` |

El nodo devolvió éxito con una única fila:

`36219 | Lemon G | feminizada | 17 | prueba_n8n | n8n_test`

El flujo sigue sin publicar ni activar. No hubo escrituras en ninguna pestaña operativa.

## Después de la prueba

No sincronizar las pestañas operativas hasta definir una clave de correspondencia estable (por ejemplo, `supabase_id` o un `slug` normalizado) y confirmar la política de altas/actualizaciones.

## Política editorial y de agentes acordada (2026-09-21)

- Piloto inicial: directorio de `Growshops`.
- Los registros nuevos se incorporan al sistema, pero llegan a Google Sheets con estado de revisión para que el propietario identifique qué ha entrado recientemente.
- El agente puede completar todos los campos que pueda justificar con fuentes públicas.
- Un candidato se considera duplicado si coincide con algún campo de un registro existente. No se publica ni se sincroniza como alta y debe generar una notificación al propietario.
- Fuentes permitidas: web oficial, Instagram oficial, Google Maps, Facebook oficial y directorios sectoriales.
- Sincronización de Supabase a Google Sheets: diariamente a las 03:00, zona horaria Europe/Madrid.
- Búsqueda de datos faltantes: semanal.
- Descubrimiento de nuevos negocios: semanal.

Pendiente de diseño: concretar qué significa "coincide con algún campo" en reglas técnicas seguras (normalización y prioridades de coincidencia) para evitar falsos duplicados, y elegir el día y la hora de los dos procesos semanales.

## Implementación preparada (2026-09-21)

- `01-sync-sheet-supabase` queda programado para las 03:00 diarias, zona `Europe/Madrid`.
- `02-enrichment-deepseek` queda programado para los martes a las 03:30, zona `Europe/Madrid`.
- Se añadió la plantilla `04-discover-growshops`, programada para los viernes a las 03:30, zona `Europe/Madrid`, en `DRY_RUN` e inactiva.
- Se añadió la migración manual `202609210003_directory_discovery_control.sql`: incorpora candidatos trazables, identidad de growshops (Instagram/Facebook/Google Maps), deduplicación atómica y alertas para duplicados.
- Por seguridad no se activó ningún workflow. El flujo actual de prueba no debe activarse: todavía apunta a `Pruebas_n8n` y repetiría la inserción de prueba.
- Falta elegir y configurar un proveedor de búsqueda autorizado que entregue evidencia enlazada. No automatizar scraping de Google Maps, Instagram o Facebook.
