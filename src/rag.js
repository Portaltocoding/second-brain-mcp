// Modo rag de `resurgir`: BM25 sobre FRAGMENTOS (párrafos) con stemming castellano
// ligero. Frente al modo lexico (que apunta a notas enteras por título/temas), este
// motor devuelve el párrafo concreto que responde, listo para usarse como contexto —
// la "R" de RAG, sin índices persistentes ni modelos: se calcula al vuelo releyendo
// el vault, fiel a la regla de que Obsidian también escribe.
import { join, relative } from 'node:path';
import * as store from './store.js';

const STOPWORDS = new Set([
  'para', 'como', 'este', 'esta', 'esto', 'estos', 'estas', 'sobre', 'entre', 'donde',
  'cuando', 'porque', 'pero', 'más', 'menos', 'todo', 'toda', 'todos', 'todas', 'unas',
  'unos', 'una', 'los', 'las', 'del', 'con', 'por', 'que', 'qué', 'hacia', 'desde',
  'hasta', 'tiene', 'tienen', 'hacer', 'hace', 'cada', 'muy', 'sin', 'ser', 'estar',
]);

// Stemming castellano MUY conservador: plurales y un puñado de sufijos frecuentes.
// Preferimos quedarnos cortos a fusionar palabras distintas: un stem agresivo
// fabrica coincidencias falsas, que en un buscador de notas personales son peores
// que las ausencias.
const SUFIJOS = [
  'aciones', 'uciones', 'amientos', 'imientos',
  'amiento', 'imiento', 'idades',
  'cion', 'sion', 'mente', 'anza', 'idad', 'ista',
  'ando', 'iendo', 'adas', 'idas', 'ados', 'idos',
];

export function stem(palabra) {
  let w = palabra;
  // plural: "papeles" -> "papel", "notas" -> "nota"
  if (w.length > 5 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1);
  for (const suf of SUFIJOS) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokenizarRag(texto) {
  return normalizar(texto)
    .split(/[^a-zñ0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    .map(stem);
}

// Trocea una nota en fragmentos: el título es uno más (con peso propio vía tf) y
// cada párrafo del cuerpo (separado por línea en blanco) es otro. El frontmatter
// no se trocea — sus temas ya viven en el grafo, no son prosa que citar.
function trocear(rel, cruda) {
  const titulo = rel.split('/').pop().replace(/\.md$/, '');
  const sinFrontmatter = cruda.startsWith('---')
    ? cruda.slice(cruda.indexOf('\n---', 3) + 4)
    : cruda;
  const fragmentos = [];
  for (const parrafo of sinFrontmatter.split(/\n\s*\n/)) {
    const texto = parrafo.trim();
    if (!texto || /^#{1,3} [^\n]*$/.test(texto)) continue; // encabezados solos no citan nada
    fragmentos.push({ fichero: rel, titulo, texto });
  }
  return fragmentos;
}

const K1 = 1.5;
const B = 0.75;

// BM25 clásico sobre los fragmentos del brain. Bonus de título (+2 por término que
// aparece en el título del fragmento) para que la nota cuyo TÍTULO responde no
// quede por detrás de una mención de pasada en un párrafo largo.
export async function resurgirRag(vault, { texto, limite = 3, excluir } = {}) {
  if (!texto) throw new Error('resurgir exige "texto"');
  const consulta = [...new Set(tokenizarRag(texto))];
  if (!consulta.length) return { texto, modo: 'rag', resultados: [] };

  const dirs = ['40-Lecturas', '50-Notas', '60-Conceptos'];
  const rutas = (await Promise.all(dirs.map((d) => store.listarMd(join(vault, d))))).flat();
  const leidas = await Promise.all(rutas.map(async (ruta) => {
    const rel = relative(vault, ruta);
    if (excluir && rel === excluir) return null;
    try {
      return { rel, cruda: await store.leerCruda(ruta) };
    } catch {
      return null;
    }
  }));

  const fragmentos = [];
  for (const item of leidas) {
    if (!item) continue;
    fragmentos.push(...trocear(item.rel, item.cruda));
  }
  if (!fragmentos.length) return { texto, modo: 'rag', resultados: [] };

  // tf por fragmento + df por término, en una pasada.
  const df = new Map();
  let sumaLen = 0;
  for (const f of fragmentos) {
    f.stems = tokenizarRag(f.texto);
    f.tituloStems = new Set(tokenizarRag(f.titulo));
    sumaLen += f.stems.length;
    f.tf = new Map();
    for (const s of f.stems) f.tf.set(s, (f.tf.get(s) || 0) + 1);
    for (const s of f.tf.keys()) df.set(s, (df.get(s) || 0) + 1);
  }
  const N = fragmentos.length;
  const avgLen = sumaLen / N || 1;

  const candidatos = [];
  for (const f of fragmentos) {
    let score = 0;
    const motivos = [];
    for (const t of consulta) {
      const tf = f.tf.get(t) || 0;
      const enTitulo = f.tituloStems.has(t);
      if (!tf && !enTitulo) continue;
      if (tf) {
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * f.stems.length) / avgLen)));
      }
      if (enTitulo) score += 2;
      motivos.push(t);
    }
    if (score > 0) candidatos.push({ ...f, score, motivos });
  }
  candidatos.sort((a, b) => b.score - a.score);

  // Un fragmento por nota (el mejor): resurgir propone NOTAS con su cita, no un
  // ranking de párrafos donde la misma nota acapara los tres puestos.
  const vistos = new Set();
  const resultados = [];
  for (const c of candidatos) {
    if (vistos.has(c.fichero)) continue;
    vistos.add(c.fichero);
    resultados.push({
      fichero: c.fichero,
      titulo: c.titulo,
      score: Math.round(c.score * 100) / 100,
      fragmento: c.texto.length > 400 ? `${c.texto.slice(0, 400)}…` : c.texto,
      terminos: c.motivos,
    });
    if (resultados.length >= limite) break;
  }
  return { texto, modo: 'rag', resultados };
}
