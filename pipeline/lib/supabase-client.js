// pipeline/lib/supabase-client.js
// Cliente Supabase compartido para todos los módulos del pipeline.
// Usa SERVICE_ROLE key (nunca la anon key para escrituras masivas).

import { createClient } from '@supabase/supabase-js';

export function createPipelineClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en el entorno. Revisa pipeline/.env');
  }

  if (key.length < 100 || key.includes('PEGA') || key.includes('AQUI') || key.includes('...')) {
    throw new Error('SUPABASE_SERVICE_KEY parece inválida o es un placeholder. Pon la service_role key real en pipeline/.env');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Utilidad simple de logging con timestamp
export function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
