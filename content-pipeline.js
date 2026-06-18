// content-pipeline.js
// Pipeline: tema (priorizado por fallos del test) -> Claude (guion/caption/hashtags)
// -> HeyGen (vídeo Reel 9:16) -> output.json
// Uso: node content-pipeline.js

const fs = require('fs');
const path = require('path');

// --- .env loader sin dependencias ---
function loadEnv() {
  const txt = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv();
const required = ['ANTHROPIC_API_KEY', 'HEYGEN_API_KEY', 'HEYGEN_AVATAR_ID', 'HEYGEN_VOICE_ID'];
for (const k of required) {
  if (!env[k]) { console.error(`Falta ${k} en .env`); process.exit(1); }
}

// --- Temas ordenados por fallos reales del test ---
const TEMAS = [
  { tema: 'Sea of Green (SOG)',                  fallos: 6 },
  { tema: 'Flushing/lavado de raíces',           fallos: 4 },
  { tema: 'Ciclo de luz en vegetativo',          fallos: 4 },
  { tema: 'Hermafroditismo en cannabis',         fallos: 3 },
  { tema: 'Perlita en sustrato',                 fallos: 3 },
  { tema: 'pH óptimo en coco e hidroponía',      fallos: 3 },
  { tema: 'Araña roja condiciones favorables',   fallos: 3 },
  { tema: 'Topping/poda apical',                 fallos: 3 },
];

const SYSTEM_PROMPT =
  'Eres cannabicultor, experto en cultivo de cannabis con 30 años de experiencia. ' +
  'Creas guiones de 60-90 segundos para Reels educativos en español, tono cercano y didáctico, ' +
  'basado en evidencia. Estructura: gancho 3 segundos + desarrollo + CTA final.';

// --- Claude: guion + caption + hashtags ---
async function generarContenido(tema) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [
        {
          role: 'user',
          content:
            `Crea un Reel sobre: ${tema}\n\n` +
            `Responde EXCLUSIVAMENTE con un JSON válido. Sin markdown, sin bloques de código, sin prosa antes ni después. Forma exacta:\n` +
            `{"guion": "texto narrable de 60-90s, listo para leer en voz alta", ` +
            `"caption": "máx 220 chars, gancho + valor + CTA suave", ` +
            `"hashtags": ["#tag1", "#tag2"]}\n\n` +
            `Reglas: 8-12 hashtags en español relevantes a cultivo/cannabis. ` +
            `El guion en una sola cadena (sin saltos de línea raros). Nada de emojis en el guion (se narra).`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content[0].text;
  // Extrae JSON entre el primer { y el último } (tolera markdown fences o prosa extra)
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No se encontró JSON en la respuesta de Claude:\n' + raw);
  return JSON.parse(raw.slice(start, end + 1));
}

// --- HeyGen: encolar vídeo 9:16 con avatar + voz del .env ---
async function generarVideo(guion) {
  const res = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'x-api-key': env.HEYGEN_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: env.HEYGEN_AVATAR_ID,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: guion,
          voice_id: env.HEYGEN_VOICE_ID,
        },
        background: { type: 'color', value: '#1a5c32' },
      }],
      dimension: { width: 1080, height: 1920 }, // 9:16 vertical para Reels/TikTok
    }),
  });
  if (!res.ok) throw new Error(`HeyGen ${res.status}: ${await res.text()}`);
  return await res.json();
}

// --- Main ---
async function main() {
  const target = TEMAS[0];
  console.log(`> Tema: ${target.tema} (${target.fallos} fallos del test)`);

  console.log('> Generando guion con Claude…');
  const contenido = await generarContenido(target.tema);
  console.log(`  guion (${contenido.guion.length} chars): ${contenido.guion.slice(0, 90)}…`);
  console.log(`  caption: ${contenido.caption}`);
  console.log(`  hashtags: ${contenido.hashtags.length}`);

  console.log('> Encolando vídeo en HeyGen…');
  const video = await generarVideo(contenido.guion);
  const video_id = video?.data?.video_id || video?.video_id || null;
  console.log(`  video_id: ${video_id || '(sin id en respuesta)'}`);

  const output = {
    tema: target.tema,
    fallos: target.fallos,
    generado_en: new Date().toISOString(),
    contenido,
    heygen: video,
  };
  fs.writeFileSync(path.join(__dirname, 'output.json'), JSON.stringify(output, null, 2));
  console.log('> Guardado en output.json');

  if (video_id) {
    console.log(
      `> HeyGen renderiza async. Consulta estado:\n` +
      `  curl -H "x-api-key: $HEYGEN_API_KEY" "https://api.heygen.com/v1/video_status.get?video_id=${video_id}"`
    );
  }
}

main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
