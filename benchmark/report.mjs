#!/usr/bin/env node
// Genera benchmark/resultados/informe.html (+ resumen.csv) a partir de resultados/raw.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SUFIJO = process.env.BENCH_BANCO ? `-${process.env.BENCH_BANCO}` : '';
const OUT_DIR = path.join(DIR, `resultados${SUFIJO}`);
const config = JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8'));
const { preguntas, version, titulo: tituloBanco, descripcion: descBanco } = JSON.parse(fs.readFileSync(path.join(DIR, `preguntas${SUFIJO}.json`), 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'raw.json'), 'utf8'));

const SLOTS = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const modelos = config.concursantes
  .map((c, i) => ({ ...c, color: `var(${SLOTS[i]})` })) // color fijo por modelo, aunque se desactive alguno
  .filter((c) => !c.desactivado)
  .filter((c) => preguntas.some((p) => raw.notas[`${c.id}|${p.id}`]));
const evaluadas = preguntas.filter((p) => modelos.some((m) => raw.notas[`${m.id}|${p.id}`]));
const categorias = [...new Set(evaluadas.map((p) => p.categoria))];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmt = (n, d = 1) => (n == null ? '—' : n.toFixed(d).replace('.', ','));
const nota = (m, p) => raw.notas[`${m.id}|${p.id}`];

// ── Métricas ────────────────────────────────────────────────────────────────
for (const m of modelos) {
  const ns = evaluadas.map((p) => nota(m, p)).filter(Boolean);
  const mc = evaluadas.filter((p) => p.tipo === 'mc').map((p) => nota(m, p)).filter(Boolean);
  const abiertas = evaluadas.filter((p) => p.tipo === 'abierta').map((p) => nota(m, p)).filter(Boolean);
  const trampas = evaluadas.filter((p) => p.tipo === 'trampa').map((p) => nota(m, p)).filter(Boolean);
  m.global = avg(ns.map((n) => n.nota));
  m.aciertoMC = mc.length ? (100 * mc.filter((n) => n.acierto).length) / mc.length : null;
  m.nMC = mc.length; m.okMC = mc.filter((n) => n.acierto).length;
  m.abiertas = avg(abiertas.map((n) => n.nota));
  m.trampas = avg(trampas.map((n) => n.nota));
  m.alucinacion = ns.length ? (100 * ns.filter((n) => n.alucinacion).length) / ns.length : null;
  m.exactitud = avg(ns.map((n) => n.exactitud)); m.cobertura = avg(ns.map((n) => n.cobertura)); m.utilidad = avg(ns.map((n) => n.utilidad));
  m.latencia = median(evaluadas.map((p) => raw.respuestas[`${m.id}|${p.id}`]?.ms).filter(Number.isFinite)) / 1000;
  m.porCat = Object.fromEntries(categorias.map((c) => [c, avg(evaluadas.filter((p) => p.categoria === c).map((p) => nota(m, p)?.nota).filter((x) => x != null))]));
  m.victorias = evaluadas.filter((p) => { const mine = nota(m, p)?.nota; return mine != null && modelos.every((o) => (nota(o, p)?.nota ?? -1) <= mine); }).length;
}
const ranking = [...modelos].sort((a, b) => (b.global ?? 0) - (a.global ?? 0));
const cc = modelos.find((m) => m.id === 'cannabicultor');
const puesto = cc ? ranking.indexOf(cc) + 1 : null;
const mejorRival = ranking.find((m) => m.id !== 'cannabicultor');
const base = modelos.find((m) => m.id === 'deepseek');

// ── Gráficos (SVG inline) ────────────────────────────────────────────────────
function barras(titulo, sub, campo, { max, unidad = '', dec = 1, menorMejor = false } = {}) {
  const orden = [...modelos].filter((m) => m[campo] != null).sort((a, b) => (menorMejor ? a[campo] - b[campo] : b[campo] - a[campo]));
  const top = max ?? (Math.max(...orden.map((m) => m[campo])) * 1.1 || 1);
  const W = 640, fila = 34, izq = 170, der = 60, H = orden.length * fila + 8;
  const ancho = (v) => Math.max(2, ((W - izq - der) * v) / top);
  const filas = orden.map((m, i) => {
    const y = 4 + i * fila, v = m[campo], w = ancho(v);
    const destacado = m.id === 'cannabicultor';
    return `<g class="hit" data-tip="${esc(m.nombre)}: ${fmt(v, dec)}${unidad}">
      <rect x="0" y="${y}" width="${W}" height="${fila}" fill="transparent"/>
      <text x="${izq - 10}" y="${y + fila / 2 + 4}" text-anchor="end" class="lbl${destacado ? ' strong' : ''}">${esc(m.nombre)}</text>
      <path d="M${izq},${y + 8} h${w - 4} a4,4 0 0 1 4,4 v${fila - 24} a4,4 0 0 1 -4,4 h-${w - 4} z" fill="${m.color}"/>
      <text x="${izq + w + 8}" y="${y + fila / 2 + 4}" class="val${destacado ? ' strong' : ''}">${fmt(v, dec)}${unidad}</text>
    </g>`;
  }).join('');
  return `<figure class="card"><figcaption><h3>${titulo}</h3><p>${sub}</p></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}"><line x1="${izq}" y1="0" x2="${izq}" y2="${H}" class="axis"/>${filas}</svg></figure>`;
}

function radarCriterios() {
  // Barras agrupadas: 3 criterios × modelos (misma escala 0-10, un solo eje).
  const crit = [['exactitud', 'Exactitud'], ['cobertura', 'Cobertura'], ['utilidad', 'Utilidad']];
  const W = 640, H = 240, izq = 30, abajo = 30, arriba = 10, grupo = (W - izq) / crit.length, bw = Math.min(26, (grupo - 30) / modelos.length - 2);
  const y = (v) => arriba + (H - abajo - arriba) * (1 - v / 10);
  let s = [0, 2, 4, 6, 8, 10].map((t) => `<line x1="${izq}" x2="${W}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${izq - 6}" y="${y(t) + 4}" text-anchor="end" class="tick">${t}</text>`).join('');
  crit.forEach(([k, et], gi) => {
    const x0 = izq + gi * grupo + (grupo - modelos.length * (bw + 2)) / 2;
    modelos.forEach((m, mi) => {
      const v = m[k] ?? 0, x = x0 + mi * (bw + 2), top = y(v), h = y(0) - top;
      s += `<g class="hit" data-tip="${esc(m.nombre)} · ${et}: ${fmt(v)}"><rect x="${x - 1}" y="${arriba}" width="${bw + 2}" height="${H - abajo - arriba}" fill="transparent"/>
        <path d="M${x},${y(0)} v-${Math.max(0, h - 4)} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 v${Math.max(0, h - 4)} z" fill="${m.color}"/></g>`;
    });
    s += `<text x="${izq + gi * grupo + grupo / 2}" y="${H - 8}" text-anchor="middle" class="lbl">${et}</text>`;
  });
  return `<figure class="card wide"><figcaption><h3>Calidad por criterio</h3><p>Media de los jueces (0-10) sobre todas las preguntas</p></figcaption>
    ${leyenda()}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calidad por criterio">${s}</svg></figure>`;
}

function leyenda() {
  return `<ul class="legend">${modelos.map((m) => `<li><span class="sw" style="background:${m.color}"></span>${esc(m.nombre)}</li>`).join('')}</ul>`;
}

function heatmap() {
  const celda = (v, m, c) => {
    if (v == null) return '<td class="num">—</td>';
    const paso = Math.min(6, Math.max(0, Math.floor(v / 10 * 7) - 1)); // 0..6 → rampa secuencial
    const mejor = modelos.every((o) => (o.porCat[c] ?? -1) <= v);
    return `<td class="num heat h${paso}${mejor ? ' best' : ''}" data-tip="${esc(m.nombre)} · ${esc(c)}: ${fmt(v)}">${fmt(v)}</td>`;
  };
  return `<figure class="card wide"><figcaption><h3>Nota por categoría</h3><p>Media 0-10 · más oscuro = mejor · <span class="bestmark">borde</span> = mejor de la fila</p></figcaption>
  <div class="tablewrap"><table class="heatmap"><thead><tr><th>Categoría</th><th class="num">Preg.</th>${modelos.map((m) => `<th class="num"><span class="sw" style="background:${m.color}"></span>${esc(m.nombre)}</th>`).join('')}</tr></thead>
  <tbody>${categorias.map((c) => `<tr><td>${esc(c)}</td><td class="num muted">${evaluadas.filter((p) => p.categoria === c).length}</td>${modelos.map((m) => celda(m.porCat[c], m, c)).join('')}</tr>`).join('')}
  <tr class="total"><td>Global</td><td class="num muted">${evaluadas.length}</td>${modelos.map((m) => `<td class="num">${fmt(m.global)}</td>`).join('')}</tr></tbody></table></div></figure>`;
}

function tablaResumen() {
  return `<div class="tablewrap"><table><thead><tr><th>#</th><th>Modelo</th><th class="num">Nota global</th>${hayMC ? '<th class="num">Test (acierto)</th>' : ''}<th class="num">Abiertas</th>${hayTrampas ? '<th class="num">Trampas</th>' : ''}<th class="num">Alucinaciones</th><th class="num" title="Preguntas en las que obtuvo la nota más alta (empates incluidos)">Mejor nota</th><th class="num">Latencia (mediana)</th></tr></thead><tbody>
  ${ranking.map((m, i) => `<tr${m.id === 'cannabicultor' ? ' class="me"' : ''}><td>${i + 1}</td><td><span class="sw" style="background:${m.color}"></span>${esc(m.nombre)}${m.nota ? `<div class="muted small">${esc(m.nota)}</div>` : ''}</td>
    <td class="num"><b>${fmt(m.global, 2)}</b></td>${hayMC ? `<td class="num">${fmt(m.aciertoMC, 0)}% <span class="muted small">(${m.okMC}/${m.nMC})</span></td>` : ''}<td class="num">${fmt(m.abiertas)}</td>${hayTrampas ? `<td class="num">${fmt(m.trampas)}</td>` : ''}
    <td class="num">${fmt(m.alucinacion, 0)}%</td><td class="num">${m.victorias}</td><td class="num">${fmt(m.latencia)} s</td></tr>`).join('')}
  </tbody></table></div>`;
}

function tablaPreguntas() {
  return evaluadas.map((p) => {
    const notas = modelos.map((m) => nota(m, p)?.nota ?? null);
    const mx = Math.max(...notas.filter((x) => x != null));
    const detalle = modelos.map((m) => {
      const r = raw.respuestas[`${m.id}|${p.id}`]; const n = nota(m, p);
      const coment = (n?.veredictos || []).filter((v) => v.comentario).map((v) => `<li>${esc(v.comentario)}</li>`).join('');
      return `<div class="resp"><h4><span class="sw" style="background:${m.color}"></span>${esc(m.nombre)} — ${fmt(n?.nota)}${n?.alucinacion ? ' <span class="flag">alucina</span>' : ''}${p.tipo === 'mc' ? ` · eligió ${esc(n?.opcion || '?')}` : ''}</h4>
        <pre>${esc(r?.reply || r?.error || '')}</pre>${coment ? `<ul class="muted small">${coment}</ul>` : ''}</div>`;
    }).join('');
    return `<tr><td class="muted small">${esc(p.id)}</td><td><details><summary>${esc(p.pregunta.split('\n')[0])}</summary>
      <p class="muted small">${p.tipo === 'mc' ? `Correcta: <b>${p.respuesta}</b>` : `Puntos clave: ${esc((p.puntos_clave || []).join(' · '))}`}</p>${detalle}</details></td>
      <td class="muted small">${esc(p.tipo)}</td>${notas.map((v) => `<td class="num${v === mx ? ' win' : ''}">${fmt(v)}</td>`).join('')}</tr>`;
  }).join('');
}

// ── Titular ─────────────────────────────────────────────────────────────────
const deltaBase = cc && base ? cc.global - base.global : null;
const deltaRival = cc && mejorRival ? cc.global - mejorRival.global : null;
const titular = cc
  ? `Cannabicultor IA queda <b>${puesto}º de ${modelos.length}</b> con <b>${fmt(cc.global, 2)}/10</b>` +
    (deltaBase != null ? `, <b>${deltaBase >= 0 ? '+' : ''}${fmt(deltaBase, 2)}</b> sobre su mismo modelo base sin RAG` : '') +
    (mejorRival ? ` y <b>${deltaRival >= 0 ? '+' : ''}${fmt(deltaRival, 2)}</b> frente al mejor rival (${esc(mejorRival.nombre)})` : '') + '.'
  : 'Sin resultados de Cannabicultor todavía.';

const hayMC = evaluadas.some((p) => p.tipo === 'mc');
const hayTrampas = evaluadas.some((p) => p.tipo === 'trampa');
const kpi = (v, et, sub = '') => `<div class="kpi"><div class="kv">${v}</div><div class="kl">${et}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>`;
const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Benchmark Cannabis IA</title>
<style>
:root{color-scheme:light;--bg:#f6f5f2;--surface:#fcfcfb;--text:#0b0b0b;--text2:#52514e;--muted:#7a7974;--line:#e4e2dc;--grid:#ecebe6;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948;
--h0:#cde2fb;--h1:#b7d3f6;--h2:#9ec5f4;--h3:#6da7ec;--h4:#3987e5;--h5:#256abf;--h6:#184f95;--hl:#0b0b0b;--hd:#ffffff;--accent:#1c5cab;--flag:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#121211;--surface:#1a1a19;--text:#fff;--text2:#c3c2b7;--muted:#98968c;--line:#2e2e2b;--grid:#262624;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;
--h0:#1f2a38;--h1:#1c3553;--h2:#184f95;--h3:#1c5cab;--h4:#256abf;--h5:#3987e5;--h6:#6da7ec;--hl:#fff;--hd:#0b0b0b;--accent:#86b6ef;--flag:#ff8a80}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--text:#fff;--text2:#c3c2b7;--muted:#98968c;--line:#2e2e2b;--grid:#262624;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;
--h0:#1f2a38;--h1:#1c3553;--h2:#184f95;--h3:#1c5cab;--h4:#256abf;--h5:#3987e5;--h6:#6da7ec;--hl:#fff;--hd:#0b0b0b;--accent:#86b6ef;--flag:#ff8a80}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1120px;margin:0 auto;padding:32px 16px 64px}h1{font-size:28px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:19px;margin:40px 0 12px}h3{font-size:15px;margin:0}
.lead{font-size:17px;color:var(--text2);max-width:780px}.lead b{color:var(--text)}.muted{color:var(--muted)}.small{font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:24px 0}
.kpi,.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}.kv{font-size:30px;font-weight:650;font-variant-numeric:tabular-nums}.kl{color:var(--text2);font-size:13px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:16px}.wide{grid-column:1/-1}
figure{margin:0}figcaption{margin-bottom:10px}figcaption p{margin:2px 0 0;color:var(--muted);font-size:13px}svg{width:100%;height:auto;display:block;overflow:visible}
.lbl{fill:var(--text2);font-size:13px}.val{fill:var(--text);font-size:13px;font-variant-numeric:tabular-nums}.strong{font-weight:650;fill:var(--text)}.tick{fill:var(--muted);font-size:11px}
.axis{stroke:var(--line);stroke-width:1}.grid{stroke:var(--grid);stroke-width:1}.hit:hover path{opacity:.8}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;padding:0;margin:0 0 8px;font-size:13px;color:var(--text2)}
.sw{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:baseline}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}.card .tablewrap{border:0}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--text2);font-weight:600;white-space:nowrap}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.me td{background:color-mix(in srgb,var(--s1) 9%,transparent)}tr.total td{font-weight:650}
.heat{color:var(--hl)}.h0{background:var(--h0)}.h1{background:var(--h1)}.h2{background:var(--h2)}.h3{background:var(--h3)}.h4{background:var(--h4);color:var(--hd)}.h5{background:var(--h5);color:var(--hd)}.h6{background:var(--h6);color:var(--hd)}
:root[data-theme="dark"] .h4,:root[data-theme="dark"] .h5,:root[data-theme="dark"] .h6{color:#0b0b0b}
.best{box-shadow:inset 0 0 0 2px var(--text);font-weight:700}.bestmark{border:2px solid var(--text);padding:0 4px;border-radius:3px}
td.win{font-weight:700;color:var(--accent)}details summary{cursor:pointer}.resp{margin:10px 0;border-left:3px solid var(--line);padding-left:10px}.resp h4{margin:0 0 4px;font-size:13px}
pre{white-space:pre-wrap;font:12.5px/1.45 ui-monospace,Menlo,monospace;background:var(--bg);padding:8px;border-radius:8px;max-height:260px;overflow:auto;margin:0}
.flag{color:var(--flag);font-weight:700;font-size:12px}.method li{margin:4px 0;color:var(--text2)}
#tip{position:fixed;pointer-events:none;background:var(--text);color:var(--bg);padding:5px 9px;border-radius:6px;font-size:12.5px;opacity:0;transition:opacity .1s;z-index:9}
</style></head><body><main>
<p class="muted small">Benchmark de conocimiento cannábico · ${fecha} · banco de preguntas v${esc(version)}</p>
<h1>Cannabicultor IA frente a otros modelos${tituloBanco ? `: ${esc(tituloBanco)}` : ''}</h1>
<p class="lead">${titular}</p>${descBanco ? `<p class="muted">${esc(descBanco)}</p>` : ''}
<div class="kpis">
${cc ? kpi(fmt(cc.global, 2), 'Nota global Cannabicultor', `Puesto ${puesto} de ${modelos.length}`) : ''}
${cc && hayMC ? kpi(`${fmt(cc.aciertoMC, 0)}%`, 'Acierto en test', `${cc.okMC}/${cc.nMC} preguntas de opción múltiple`) : ''}
${cc ? kpi(`${fmt(cc.alucinacion, 0)}%`, 'Respuestas con datos inventados', 'Según mayoría de jueces') : ''}
${kpi(evaluadas.length, 'Preguntas evaluadas', `${categorias.length} categorías · ${modelos.length} modelos`)}
</div>

<h2>Clasificación</h2>
${tablaResumen()}

<h2>Gráficos</h2>
<div class="grid2">
${barras('Nota global', 'Media 0-10 de todas las preguntas', 'global', { max: 10, dec: 2 })}
${!hayMC ? '' : barras('Acierto en preguntas tipo test', '% de respuestas correctas (opción múltiple)', 'aciertoMC', { max: 100, unidad: '%', dec: 0 })}
${barras('Preguntas abiertas', 'Nota 0-10: 50% exactitud, 30% cobertura, 20% utilidad', 'abiertas', { max: 10 })}
${!hayTrampas ? '' : barras('Resistencia a trampas', 'Nota 0-10 en premisas falsas y variedades inventadas', 'trampas', { max: 10 })}
${barras('Tasa de alucinación', '% de respuestas con datos inventados · menos es mejor', 'alucinacion', { unidad: '%', dec: 0, menorMejor: true, max: Math.max(10, ...modelos.map((m) => m.alucinacion || 0)) * 1.1 })}
${barras('Latencia', 'Mediana de segundos por respuesta · menos es mejor', 'latencia', { unidad: ' s', menorMejor: true })}
${radarCriterios()}
${heatmap()}
</div>

<h2>Pregunta a pregunta</h2>
<p class="muted small">Pulsa una pregunta para ver las respuestas completas y los comentarios de los jueces. En azul, la mejor nota de cada fila.</p>
<div class="tablewrap"><table><thead><tr><th>ID</th><th>Pregunta</th><th>Tipo</th>${modelos.map((m) => `<th class="num"><span class="sw" style="background:${m.color}"></span>${esc(m.nombre)}</th>`).join('')}</tr></thead><tbody>${tablaPreguntas()}</tbody></table></div>

<h2>Metodología</h2>
<ul class="method">
<li><b>Cannabicultor IA</b> se consulta por el endpoint privado <code>/benchmark</code>, que ejecuta el mismo flujo que el chat real (intención, RAG con Voyage + rerank, prompt de sistema propio y DeepSeek como modelo principal).</li>
<li><b>Los rivales</b> se consultan sin RAG, con un prompt mínimo común: «${esc(config.system_modelos_base)}».</li>
<li><b>Tipo test</b>: se puntúa 10 o 0 según la letra elegida. <b>Abiertas</b>: ${config.jueces.length} jueces (${config.jueces.map((j) => esc(j.model)).join(', ')}) puntúan a ciegas exactitud, cobertura de los puntos clave y utilidad. <b>Trampas</b>: se premia no inventar y corregir la premisa.</li>
<li><b>Limitaciones</b>: un juez puede favorecer respuestas de su propia familia de modelos (por eso se promedian dos jueces de familias distintas); ${evaluadas.length} preguntas dan una idea clara, pero diferencias menores de ~0,3 puntos no son concluyentes.</li>
</ul>
</main><div id="tip" role="tooltip"></div>
<script>
const tip=document.getElementById('tip');
document.addEventListener('mousemove',e=>{const t=e.target.closest('[data-tip]');if(!t){tip.style.opacity=0;return;}tip.textContent=t.dataset.tip;tip.style.opacity=1;
const x=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8);tip.style.left=x+'px';tip.style.top=(e.clientY+14)+'px';});
</script></body></html>`;

fs.writeFileSync(path.join(OUT_DIR, 'informe.html'), html);
const csv = ['modelo,nota_global,acierto_test_pct,abiertas,trampas,alucinacion_pct,latencia_s,' + categorias.map((c) => `"${c}"`).join(',')]
  .concat(ranking.map((m) => [m.nombre, m.global, m.aciertoMC, m.abiertas, m.trampas, m.alucinacion, m.latencia, ...categorias.map((c) => m.porCat[c])].map((v) => (typeof v === 'number' ? v.toFixed(2) : `"${v}"`)).join(',')));
fs.writeFileSync(path.join(OUT_DIR, 'resumen.csv'), csv.join('\n'));
console.log(`Informe: ${path.join(OUT_DIR, 'informe.html')}`);
