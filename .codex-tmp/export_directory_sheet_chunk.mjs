import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const [kind, offsetRaw, limitRaw] = process.argv.slice(2);
const offset = Number(offsetRaw);
const limit = Number(limitRaw);
if (!['variedades', 'breeders', 'growshops', 'asociaciones'].includes(kind) || !Number.isInteger(offset) || !Number.isInteger(limit)) {
  throw new Error('Usage: export_directory_sheet_chunk.mjs <kind> <offset> <limit>');
}

const envText = fs.readFileSync('/Users/ernie/cannabicultor/.env', 'utf8');
const databaseUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL not found');

const sql = {
  variedades: `
    SELECT coalesce(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_array(
        v.id::text, v.nombre, v.slug, b.slug, v.tipo, NULL,
        coalesce(v.thc_pct, v.thc_max)::text, coalesce(v.cbd_pct, v.cbd_max)::text,
        CASE WHEN v.floracion_dias IS NULL THEN NULL ELSE round(v.floracion_dias::numeric / 7, 1)::text END,
        NULL, NULL, NULL,
        CASE WHEN v.terpenos IS NULL THEN NULL ELSE v.terpenos::text END,
        NULL,
        CASE WHEN coalesce(v.activa, true) THEN 'publicado' ELSE 'inactivo' END,
        CASE WHEN coalesce(v.indexable, false) THEN 'true' ELSE 'false' END,
        'supabase_import_2026_09'
      ) AS row_data
      FROM variedades v
      LEFT JOIN breeders b ON b.id = v.breeder_id
      ORDER BY v.id
      OFFSET ${offset} LIMIT ${limit}
    ) q`,
  breeders: `
    SELECT coalesce(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_array(
        id::text, breeder_name, slug, pais_origen, "año_fundacion"::text, website,
        logo_url, descripcion,
        CASE WHEN coalesce(activo, true) THEN 'publicado' ELSE 'inactivo' END,
        CASE WHEN coalesce(indexable, false) THEN 'true' ELSE 'false' END
      ) AS row_data
      FROM breeders
      ORDER BY id
      OFFSET ${offset} LIMIT ${limit}
    ) q`,
  growshops: `
    SELECT coalesce(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_array(
        id::text, nombre, slug, descripcion, direccion, ciudad,
        nullif(concat_ws(' · ', provincia, ccaa), ''), cp, 'España', lat::text, lon::text,
        telefono, email, web, NULL,
        CASE WHEN horario IS NULL THEN NULL ELSE jsonb_build_object('texto', horario)::text END,
        NULL,
        CASE WHEN coalesce(activo, true) THEN 'publicado' ELSE 'inactivo' END,
        CASE WHEN coalesce(indexable, false) THEN 'true' ELSE 'false' END,
        'supabase_import_2026_09'
      ) AS row_data
      FROM growshops
      ORDER BY id
      OFFSET ${offset} LIMIT ${limit}
    ) q`,
  asociaciones: `
    SELECT coalesce(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_array(
        id::text, nombre, slug, descripcion, direccion, ciudad,
        nullif(concat_ws(' · ', provincia, ccaa), ''), cp, 'España', lat::text, lon::text,
        telefono, email, web, NULL,
        CASE WHEN horario IS NULL THEN NULL ELSE jsonb_build_object('texto', horario)::text END,
        NULL,
        CASE WHEN coalesce(activo, true) THEN 'publicado' ELSE 'inactivo' END,
        CASE WHEN coalesce(indexable, false) THEN 'true' ELSE 'false' END,
        'supabase_import_2026_09'
      ) AS row_data
      FROM asociaciones
      ORDER BY id
      OFFSET ${offset} LIMIT ${limit}
    ) q`,
}[kind];

const output = execFileSync('psql', [databaseUrl, '-At', '-c', sql], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
process.stdout.write(output.trim());
