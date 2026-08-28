// lib-db.mjs — Carga de .env + acceso a Postgres (Supabase) vía DATABASE_URL.
// Evita pegar claves inline: lee ~/cannabicultor/.env automáticamente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Carga .env (repo raíz + un opcional local) sin sobrescribir lo ya definido.
export function cargarEnv() {
  const candidatos = [
    path.join(REPO_ROOT, '.env'),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'), // pipeline/research/.env (opcional)
  ];
  for (const f of candidatos) {
    if (!fs.existsSync(f)) continue;
    for (const linea of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = linea.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  }
}

let _pool = null;
export function getPool() {
  if (_pool) return _pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('Falta DATABASE_URL (revisa ~/cannabicultor/.env)');
  _pool = new pg.Pool({ connectionString: cs, max: 4 });
  return _pool;
}

export async function q(text, params) {
  const r = await getPool().query(text, params);
  return r.rows;
}

export async function cerrar() {
  if (_pool) { await _pool.end(); _pool = null; }
}
