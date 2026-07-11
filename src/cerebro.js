// El motor del second brain: lecturas, notas permanentes, conceptos como nodos,
// resurfacing (resurgir), salud del grafo (jardin) y mini-brains por proyecto.
import { readdir } from 'node:fs/promises';
import { join, relative, basename, isAbsolute } from 'node:path';
import matter from 'gray-matter';
import * as fechas from './fechas.js';
import * as store from './store.js';
import { resurgirRag } from './rag.js';

const FORMATOS = ['libro', 'articulo', 'video', 'curso'];
const ESTADOS_LECTURA = ['por-leer', 'leyendo', 'terminada', 'abandonada'];

function dirLecturas(vault) {
  return join(vault, '40-Lecturas');
}

function dirNotas(vault) {
  return join(vault, '50-Notas');
}

function rutaLectura(vault, titulo) {
  return join(dirLecturas(vault), `${store.nombreArchivoSeguro(titulo)}.md`);
}

function rutaPermanente(vault, titulo) {
  return join(dirNotas(vault), `${store.nombreArchivoSeguro(titulo)}.md`);
}

function listaYaml(arr) {
  return `[${(arr || []).join(', ')}]`;
}

const CONCEPTOS = '60-Conceptos';
function dirConceptos(vault) {
  return join(vault, CONCEPTOS);
}

// Un concepto/tema es un NODO del grafo. Se canoniza (recorta + inicial en mayúscula)
// para no duplicar "foco"/"Foco", y se referencia como wikilink de Obsidian.
function normalizarConcepto(nombre) {
  const t = String(nombre).trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
// Wikilink a un concepto (canonizado). Los envuelve en comillas para que sean válidos
// dentro de una lista YAML de frontmatter que Obsidian interpreta como enlaces.
function wikilinkConcepto(nombre) {
  return `"[[${store.nombreArchivoSeguro(normalizarConcepto(nombre))}]]"`;
}
// Wikilink a una nota concreta (lectura, permanente): su título tal cual, sin canonizar
// (los títulos son frases, capitalizarlos rompería el match del enlace).
function wikilinkNota(titulo) {
  return `"[[${store.nombreArchivoSeguro(titulo)}]]"`;
}
function listaConceptos(temas) {
  return `[${(temas || []).map(wikilinkConcepto).join(', ')}]`;
}
function listaNotas(titulos) {
  return `[${(titulos || []).map(wikilinkNota).join(', ')}]`;
}

// Asegura la nota-nodo del concepto en 60-Conceptos/ (idempotente). Que sea una nota
// real y no "fantasma" permite darle definición y que Obsidian agregue ahí los
// backlinks de todo lo que lo menciona: lecturas, ideas y otros conceptos.
export async function conceptoAsegurar(vault, nombre) {
  const canon = store.nombreArchivoSeguro(normalizarConcepto(nombre));
  if (!canon) throw new Error('concepto vacío');
  const ruta = join(dirConceptos(vault), `${canon}.md`);
  const contenido = `---
tipo: concepto
nombre: "${store.escaparComillas(canon)}"
creado: ${fechas.hoy()}
---
## Qué es

## Relacionados
`;
  await store.crearSiNoExiste(ruta, contenido);
  return { nombre: canon, ruta };
}

export async function lecturaCrear(vault, { titulo, autor, formato = 'libro', temas = [] } = {}) {
  if (!titulo) throw new Error('lectura_crear exige "titulo"');
  if (!FORMATOS.includes(formato)) throw new Error(`formato debe ser una de: ${FORMATOS.join(', ')}`);
  const ruta = rutaLectura(vault, titulo);
  if (await store.existeArchivo(ruta)) throw new Error(`ya existe una lectura con el título "${titulo}"`);

  const contenido = `---
tipo: lectura
titulo: "${store.escaparComillas(titulo)}"
autor: "${store.escaparComillas(autor || '')}"
formato: ${formato}
estado: por-leer
inicio:
fin:
valoracion:
temas: ${listaConceptos(temas)}
---
## Notas mientras leo

## Resumen en mis palabras

## Ideas extraídas
`;
  await store.escribirAtomica(ruta, contenido);
  for (const t of temas) await conceptoAsegurar(vault, t);
  return { creado: true, ruta };
}

export async function lecturaNota(vault, { titulo, texto, ubicacion } = {}) {
  if (!titulo || !texto) throw new Error('lectura_nota exige "titulo" y "texto"');
  const ruta = rutaLectura(vault, titulo);
  if (!(await store.existeArchivo(ruta))) throw new Error(`no existe la lectura "${titulo}"; usa lectura_crear primero`);
  const linea = ubicacion ? `- (${ubicacion}) ${texto}` : `- ${texto}`;
  await store.appendEnSeccion(ruta, 'Notas mientras leo', linea);
  return { ok: true, ruta };
}

export async function lecturaActualizar(vault, { titulo, estado, valoracion } = {}) {
  if (!titulo) throw new Error('lectura_actualizar exige "titulo"');
  const ruta = rutaLectura(vault, titulo);
  if (!(await store.existeArchivo(ruta))) throw new Error(`no existe la lectura "${titulo}"`);

  if (estado !== undefined) {
    if (!ESTADOS_LECTURA.includes(estado)) throw new Error(`estado debe ser una de: ${ESTADOS_LECTURA.join(', ')}`);
    await store.actualizarCampoFrontmatter(ruta, 'estado', estado);
    if (estado === 'leyendo') {
      const { data } = await store.leerNota(ruta);
      if (!data.inicio) await store.actualizarCampoFrontmatter(ruta, 'inicio', fechas.hoy());
    }
    if (estado === 'terminada') {
      await store.actualizarCampoFrontmatter(ruta, 'fin', fechas.hoy());
    }
  }
  if (valoracion !== undefined) {
    if (!(valoracion >= 1 && valoracion <= 5)) throw new Error('valoracion debe estar entre 1 y 5');
    await store.actualizarCampoFrontmatter(ruta, 'valoracion', valoracion);
  }
  return { ok: true, ruta };
}

export async function notaPermanente(vault, { titulo, contenido, origen, temas = [], relacionadas = [] } = {}) {
  if (!titulo || !contenido) throw new Error('nota_permanente exige "titulo" y "contenido"');
  const ruta = rutaPermanente(vault, titulo);
  if (await store.existeArchivo(ruta)) throw new Error(`ya existe una nota permanente con el título "${titulo}"`);

  const lineaOrigen = origen ? `origen: "[[${store.nombreArchivoSeguro(origen)}]]"` : 'origen:';
  const texto = `---
tipo: permanente
creada: ${fechas.hoy()}
temas: ${listaConceptos(temas)}
relacionadas: ${listaNotas(relacionadas)}
${lineaOrigen}
---
${contenido}
`;
  await store.escribirAtomica(ruta, texto);

  // Teje el grafo: un nodo de concepto por tema...
  for (const t of temas) await conceptoAsegurar(vault, t);
  // ...y si el origen es una lectura existente, enlázala DE VUELTA a esta idea en su
  // sección de Ideas extraídas (Obsidian ya da el backlink; esto lo hace visible
  // dentro de la propia lectura).
  if (origen) {
    const rLect = rutaLectura(vault, origen);
    if (await store.existeArchivo(rLect)) {
      await store.appendEnSeccion(rLect, 'Ideas extraídas', `- [[${store.nombreArchivoSeguro(titulo)}]]`);
    }
  }

  // Sugerencias de conexión: las notas más afines a esta idea (por resurgir), para
  // que /captura pueda proponer nota_enlazar en vez de dejar la idea suelta. Solo
  // sugiere — nunca enlaza solo: la conexión es una decisión, no un side effect.
  let sugerencias = [];
  if (!relacionadas.length) {
    try {
      const r = await resurgir(vault, {
        texto: `${titulo} ${contenido}`,
        limite: 3,
        excluir: relative(vault, ruta),
        modo: 'lexico',
      });
      // Umbral de calidad: solo se sugiere lo que conecta FUERTE (score >= 5, el
      // mismo listón que califica a los mini-brains) y como mucho 2 — sugerir
      // conexiones débiles fabrica la maraña que un buen grafo debe evitar.
      sugerencias = r.resultados
        .filter((s) => s.fichero.startsWith('50-Notas/') && s.score >= 5)
        .slice(0, 2);
    } catch {
      /* sin sugerencias no pasa nada */
    }
  }
  return { creado: true, ruta, sugerencias };
}

// Añade "[[X]]" a una lista del frontmatter (p.ej. relacionadas: [...]) por regex,
// porque actualizarCampoFrontmatter serializa escalares, no listas. Idempotente.
async function agregarWikilinkALista(ruta, clave, destino) {
  const cruda = await store.leerCruda(ruta);
  const link = `[[${store.nombreArchivoSeguro(destino)}]]`;
  const re = new RegExp(`^(${clave}:\\s*)\\[(.*)\\][ \\t]*$`, 'm');
  const m = cruda.match(re);
  if (!m) throw new Error(`${ruta}: no tiene una lista "${clave}" en el frontmatter`);
  if (m[2].includes(link)) return false; // ya enlazadas
  const dentro = m[2].trim();
  const nuevaLista = dentro ? `${dentro}, "${link}"` : `"${link}"`;
  await store.escribirAtomica(ruta, cruda.replace(re, `${clave}: [${nuevaLista}]`));
  return true;
}

// Enlaza dos notas permanentes entre sí (relacionadas ↔ relacionadas). Por defecto
// bidireccional. El `motivo` (opcional pero MUY recomendado) queda escrito en la
// sección ## Conexiones de ambas notas: un enlace sin porqué se pudre — dentro de
// un año nadie recuerda qué unía esas dos ideas.
export async function notaEnlazar(vault, { titulo, con, bidireccional = true, motivo } = {}) {
  if (!titulo || !con) throw new Error('nota_enlazar exige "titulo" y "con"');
  const rutaA = rutaPermanente(vault, titulo);
  const rutaB = rutaPermanente(vault, con);
  if (!(await store.existeArchivo(rutaA))) throw new Error(`no existe la nota permanente "${titulo}"`);
  if (!(await store.existeArchivo(rutaB))) throw new Error(`no existe la nota permanente "${con}"`);
  const cambioA = await agregarWikilinkALista(rutaA, 'relacionadas', con);
  let cambioB = false;
  if (bidireccional) cambioB = await agregarWikilinkALista(rutaB, 'relacionadas', titulo);
  // El motivo solo se escribe cuando el enlace es NUEVO (idempotencia: repetir la
  // llamada no duplica la línea).
  if (motivo && motivo.trim()) {
    if (cambioA) await store.appendEnSeccion(rutaA, 'Conexiones', `- [[${store.nombreArchivoSeguro(con)}]] — ${motivo.trim()}`);
    if (cambioB) await store.appendEnSeccion(rutaB, 'Conexiones', `- [[${store.nombreArchivoSeguro(titulo)}]] — ${motivo.trim()}`);
  }
  return { ok: true, enlazadas: [titulo, con], bidireccional, nuevo: cambioA || cambioB };
}

// Crea/define un concepto (nodo del grafo) explícitamente, opcionalmente con una
// definición y enlaces a conceptos relacionados (que también se aseguran).
export async function conceptoCrear(vault, { nombre, definicion, relacionados = [] } = {}) {
  if (!nombre) throw new Error('concepto_crear exige "nombre"');
  const { nombre: canon, ruta } = await conceptoAsegurar(vault, nombre);
  if (definicion) await store.appendEnSeccion(ruta, 'Qué es', definicion);
  for (const rel of relacionados) {
    const { nombre: relCanon } = await conceptoAsegurar(vault, rel);
    await store.appendEnSeccion(ruta, 'Relacionados', `- [[${relCanon}]]`);
  }
  return { ok: true, nombre: canon, ruta };
}

// Grep estructurado sobre todo el vault: fichero, número de línea, la línea y su
// contexto (una línea antes y después). `tipo` filtra por el frontmatter de la nota.
// `limite` (por defecto 20) acota la respuesta: sin techo, una query genérica sobre
// un vault grande volcaría miles de líneas en el contexto del cliente.
export async function vaultBuscar(vault, { query, tipo, limite = 20 } = {}) {
  if (!query) throw new Error('vault_buscar exige "query"');
  const ficheros = await store.listarMd(vault);
  const queryMin = query.toLowerCase();
  const resultados = [];
  let total = 0;

  const leidos = await Promise.all(ficheros.map(async (ruta) => {
    try {
      return { ruta, texto: await store.leerCruda(ruta) };
    } catch {
      return null;
    }
  }));
  for (const item of leidos) {
    if (!item) continue;
    const { ruta, texto } = item;
    if (tipo) {
      let data = {};
      try {
        ({ data } = matter(texto));
      } catch {
        continue;
      }
      if (data.tipo !== tipo) continue;
    }
    const lineas = texto.split('\n');
    lineas.forEach((linea, i) => {
      if (linea.toLowerCase().includes(queryMin)) {
        total += 1;
        if (resultados.length < limite) {
          resultados.push({
            fichero: relative(vault, ruta),
            numeroLinea: i + 1,
            linea: linea.trim(),
            contexto: [lineas[i - 1], linea, lineas[i + 1]].filter((l) => l !== undefined).map((l) => l.trim()),
          });
        }
      }
    });
  }

  return { query, tipo: tipo || null, total, truncado: total > resultados.length, resultados };
}

// ── Esteroides del second brain ──────────────────────────────────────────────

// Stopwords castellanas mínimas para tokenizar consultas de resurfacing.
const STOPWORDS = new Set([
  'para', 'como', 'este', 'esta', 'esto', 'estos', 'estas', 'sobre', 'entre', 'donde',
  'cuando', 'porque', 'pero', 'más', 'menos', 'todo', 'toda', 'todos', 'todas', 'unas',
  'unos', 'una', 'los', 'las', 'del', 'con', 'por', 'que', 'qué', 'hacia', 'desde',
  'hasta', 'tiene', 'tienen', 'hacer', 'hace', 'cada', 'muy', 'sin', 'ser', 'estar',
]);

function tokenizar(texto) {
  return [...new Set(
    String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes para casar mejor
      .split(/[^a-zñ0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  )];
}

// RESURGIR: el motor de resurfacing. Dado un texto (una tarea, un foco de semana, una
// idea a medias), devuelve las notas del second brain más conectadas con él, con
// puntuación y el porqué. Es lo que hace que el vault "piense contigo": aparece solo
// cuando hay solape real, ordenado por fuerza de la conexión.
//   score = 3×hit en título + 2×hit en temas (frontmatter) + 1×hit en cuerpo (cap 3/término)
// A partir de cuántas notas el modo lexico empieza a quedarse corto y resurgir
// sugiere activar el rag. Con pocas notas, BM25 no aporta (poca estadística y el
// título ya lo encuentra todo); con muchas, el fragmento citado vale oro.
const UMBRAL_RAG = 30;

export async function resurgir(vault, { texto, limite = 3, excluir, modo } = {}) {
  // El modo se decide por llamada (`modo`), por entorno (BRAIN_MODO) o queda en
  // lexico. Los llamadores internos (sugerencias, mini-brains) fijan lexico
  // explícitamente: sus umbrales (score >= 5) están calibrados a ese scoring.
  const modoEfectivo = modo || process.env.BRAIN_MODO || 'lexico';
  if (!['lexico', 'rag'].includes(modoEfectivo)) throw new Error(`modo debe ser "lexico" o "rag", no "${modoEfectivo}"`);
  if (modoEfectivo === 'rag') return resurgirRag(vault, { texto, limite, excluir });

  if (!texto) throw new Error('resurgir exige "texto"');
  const terminos = tokenizar(texto);
  if (!terminos.length) return { texto, resultados: [] };

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
  const candidatos = [];
  for (const item of leidas) {
    if (!item) continue;
    const { rel, cruda } = item;
    const titulo = rel.split('/').pop().replace(/\.md$/, '');
    const tituloNorm = tokenizar(titulo).join(' ');
    const cuerpoNorm = cruda.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const temasLinea = (cruda.match(/^temas:.*$/m) || [''])[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let score = 0;
    const motivos = [];
    for (const t of terminos) {
      let s = 0;
      if (tituloNorm.includes(t)) s += 3;
      if (temasLinea.includes(t)) s += 2;
      const enCuerpo = (cuerpoNorm.match(new RegExp(t, 'g')) || []).length;
      s += Math.min(3, enCuerpo);
      if (s > 0) { score += s; motivos.push(t); }
    }
    if (score > 0) candidatos.push({ fichero: rel, titulo, score, terminos: motivos });
  }
  candidatos.sort((a, b) => b.score - a.score);
  const salida = { texto, modo: 'lexico', resultados: candidatos.slice(0, limite) };

  // Detección: cuando el brain ya es grande, el modo lexico se queda corto y el
  // sistema lo dice — una vez por respuesta, sin insistir en modo rag.
  const totalNotas = leidas.filter(Boolean).length;
  const umbral = Number(process.env.BRAIN_RAG_UMBRAL) || UMBRAL_RAG;
  if (totalNotas >= umbral) {
    salida.sugerencia = `tu brain ya tiene ${totalNotas} notas: el modo rag (BM25 por fragmentos) afina más a este tamaño. Actívalo con BRAIN_MODO=rag, o pruébalo en una llamada con modo: "rag".`;
  }
  return salida;
}

// JARDÍN: la salud del grafo. Un second brain se pudre en silencio — notas huérfanas
// que nada enlaza, wikilinks rotos que apuntan a notas renombradas, conceptos vacíos
// que se materializaron y nadie definió. Esta tool lo hace visible para poder podar.
export async function jardin(vault) {
  const dirs = ['40-Lecturas', '50-Notas', '60-Conceptos'];
  const leer = async (ruta) => {
    try {
      return { ruta, cruda: await store.leerCruda(ruta) };
    } catch {
      return null;
    }
  };

  const notas = new Map(); // titulo -> {rel, salientes:Set, cruda}
  const rutasBrain = (await Promise.all(dirs.map((d) => store.listarMd(join(vault, d))))).flat();
  for (const item of await Promise.all(rutasBrain.map(leer))) {
    if (!item) continue;
    const rel = relative(vault, item.ruta);
    const titulo = rel.split('/').pop().replace(/\.md$/, '');
    const salientes = new Set(
      [...item.cruda.matchAll(/\[\[([^\]#|]+?)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim()),
    );
    notas.set(titulo, { rel, salientes, cruda: item.cruda });
  }

  // Entrantes desde TODO el vault (también semanas/meses/diarios enlazan al brain).
  const entrantes = new Map(); // titulo -> count
  for (const item of await Promise.all((await store.listarMd(vault)).map(leer))) {
    if (!item) continue;
    for (const m of item.cruda.matchAll(/\[\[([^\]#|]+?)(?:[#|][^\]]*)?\]\]/g)) {
      const destino = m[1].trim();
      entrantes.set(destino, (entrantes.get(destino) || 0) + 1);
    }
  }

  const huerfanas = [];
  const rotos = [];
  const conceptosVacios = [];
  const sobreconectadas = [];
  for (const [titulo, { rel, salientes, cruda }] of notas) {
    const tieneEntrantes = (entrantes.get(titulo) || 0) > 0;
    // Huérfana: nadie la enlaza Y ella no enlaza a ninguna nota existente del brain.
    const salientesReales = [...salientes].filter((s) => notas.has(s));
    if (!tieneEntrantes && salientesReales.length === 0) huerfanas.push(rel);
    for (const s of salientes) {
      // Un wikilink es "roto" si su destino no existe NI como nota del brain NI como
      // nota de estructura (mes/semana/día, que viven fuera de estos dirs).
      if (!notas.has(s) && !/^\d{4}-(W\d{2}|\d{2})(-\d{2})?$/.test(s)) {
        rotos.push({ en: rel, destino: s });
      }
    }
    if (rel.startsWith('60-Conceptos/')) {
      const queEs = store.leerSeccion(cruda, 'Qué es');
      if (!queEs || !queEs.trim()) conceptosVacios.push(rel);
    }
    // Sobreconectada: más de 5 `relacionadas` es un cajón de sastre, no un enlace —
    // la escasez es lo que hace que una conexión signifique algo.
    if (rel.startsWith('50-Notas/')) {
      const lista = (cruda.match(/^relacionadas: \[(.*)\]$/m) || [])[1] || '';
      const n = (lista.match(/\[\[/g) || []).length;
      if (n > 5) sobreconectadas.push({ nota: rel, enlaces: n });
    }
  }

  // Conceptos probablemente duplicados: mismo nombre normalizado (sin tildes,
  // sin plural simple). "Hábito"/"Habitos" son el mismo nodo partido en dos —
  // y un nodo partido reparte sus backlinks y debilita el grafo.
  const porClave = new Map();
  for (const [titulo, { rel }] of notas) {
    if (!rel.startsWith('60-Conceptos/')) continue;
    const clave = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/e?s$/, '');
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(titulo);
  }
  const conceptosDuplicados = [...porClave.values()].filter((g) => g.length > 1);

  // Techo por categoría: jardin es un diagnóstico, no un inventario. Si una lista
  // se corta, `omitidos` dice cuántos quedaron fuera — se poda por tandas.
  const LIMITE_LISTA = 30;
  const informe = { huerfanas, rotos, conceptosVacios, sobreconectadas, conceptosDuplicados };
  const omitidos = {};
  for (const [clave, lista] of Object.entries(informe)) {
    if (lista.length > LIMITE_LISTA) {
      omitidos[clave] = lista.length - LIMITE_LISTA;
      informe[clave] = lista.slice(0, LIMITE_LISTA);
    }
  }

  return {
    totales: {
      lecturas: [...notas.values()].filter((n) => n.rel.startsWith('40-')).length,
      notas: [...notas.values()].filter((n) => n.rel.startsWith('50-')).length,
      conceptos: [...notas.values()].filter((n) => n.rel.startsWith('60-')).length,
    },
    ...informe,
    ...(Object.keys(omitidos).length ? { omitidos } : {}),
  };
}

// Fusiona dos conceptos duplicados: reescribe TODOS los wikilinks [[duplicado...]]
// del vault hacia [[canonico...]], vuelca la definición y los relacionados del
// duplicado en el canónico, y borra el nodo duplicado. Cirugía de precisión para
// cuando el jardín detecta un nodo partido en dos.
export async function conceptoFusionar(vault, { duplicado, canonico } = {}) {
  if (!duplicado || !canonico) throw new Error('concepto_fusionar exige "duplicado" y "canonico"');
  if (duplicado === canonico) throw new Error('duplicado y canonico no pueden ser el mismo');
  const rutaDup = join(dirConceptos(vault), `${store.nombreArchivoSeguro(duplicado)}.md`);
  const rutaCanon = join(dirConceptos(vault), `${store.nombreArchivoSeguro(canonico)}.md`);
  if (!(await store.existeArchivo(rutaDup))) throw new Error(`no existe el concepto "${duplicado}"`);
  if (!(await store.existeArchivo(rutaCanon))) throw new Error(`no existe el concepto "${canonico}"`);

  // 1. Reescribir wikilinks en todo el vault ([[Dup]], [[Dup|alias]], [[Dup#sec]]).
  let ficherosTocados = 0;
  let reemplazos = 0;
  const marcaDup = `[[${store.nombreArchivoSeguro(duplicado)}`;
  const marcaCanon = `[[${store.nombreArchivoSeguro(canonico)}`;
  for (const ruta of await store.listarMd(vault)) {
    if (ruta === rutaDup) continue;
    let cruda;
    try {
      cruda = await store.leerCruda(ruta);
    } catch {
      continue;
    }
    if (!cruda.includes(marcaDup)) continue;
    const partes = cruda.split(marcaDup);
    reemplazos += partes.length - 1;
    await store.escribirAtomica(ruta, partes.join(marcaCanon));
    ficherosTocados += 1;
  }

  // 2. Volcar lo que el duplicado tuviera de valor en el canónico.
  const crudaDup = await store.leerCruda(rutaDup);
  const queEsDup = (store.leerSeccion(crudaDup, 'Qué es') || '').trim();
  if (queEsDup) await store.appendEnSeccion(rutaCanon, 'Qué es', queEsDup);
  const relDup = (store.leerSeccion(crudaDup, 'Relacionados') || '').trim();
  if (relDup) {
    const crudaCanon = await store.leerCruda(rutaCanon);
    for (const linea of relDup.split('\n')) {
      const l = linea.trim();
      if (!l || l.includes(`[[${store.nombreArchivoSeguro(canonico)}]]`) || crudaCanon.includes(l)) continue;
      await store.appendEnSeccion(rutaCanon, 'Relacionados', l);
    }
  }

  // 3. Retirar el nodo duplicado.
  const { unlink } = await import('node:fs/promises');
  await unlink(rutaDup);

  return { fusionado: true, canonico, reemplazos, ficherosTocados };
}

// ── Mini-brains: la bandeja de entrada por proyecto ──────────────────────────
// Cada proyecto puede tener su mini-brain local (<proyecto>/brain/): apuntes de
// taller, sucios, que viven y mueren con el proyecto — SALVO los que califican.
// Una nota califica para subir al brain principal cuando madura o cuando ya
// RESUENA con lo que hay arriba (resurgir la conecta antes de promoverla).
// Taller abajo, biblioteca arriba; la promoción es una decisión, nunca automática.

function dirMini(dir) {
  if (!dir || !isAbsolute(dir)) throw new Error('las tools de mini-brain exigen "dir" absoluto (la raíz del proyecto)');
  return join(dir, 'brain');
}

export async function miniNota(vault, { dir, titulo, contenido, temas = [] } = {}) {
  if (!titulo || !contenido) throw new Error('mini_nota exige "titulo" y "contenido"');
  const ruta = join(dirMini(dir), `${store.nombreArchivoSeguro(titulo)}.md`);
  if (await store.existeArchivo(ruta)) throw new Error(`ya existe una mini-nota "${titulo}" en este proyecto`);
  const texto = `---
tipo: mini
proyecto: "${store.escaparComillas(basename(dir))}"
estado: cruda
creada: "${fechas.hoy()}"
temas: ${listaYaml(temas)}
---
${contenido}
`;
  await store.escribirAtomica(ruta, texto);
  return { creado: true, ruta };
}

// Lista las mini-notas crudas del proyecto y, por cada una, si RESUENA con el brain
// principal (la nota más conectada y su puntuación). `califica: true` cuando la
// resonancia es fuerte (score >= 5) o la nota lleva madurando 7+ días — son los dos
// caminos por los que un apunte de taller se gana la biblioteca.
export async function miniListar(vault, { dir } = {}) {
  const d = dirMini(dir);
  let ficheros = [];
  try {
    ficheros = (await readdir(d)).filter((f) => f.endsWith('.md'));
  } catch {
    return { proyecto: basename(dir), notas: [] };
  }
  const notas = [];
  for (const f of ficheros) {
    const ruta = join(d, f);
    let data = {};
    let cruda = '';
    try {
      ({ data } = await store.leerNota(ruta));
      cruda = await store.leerCruda(ruta);
    } catch {
      continue;
    }
    if (data.tipo !== 'mini' || data.estado !== 'cruda') continue;
    const titulo = f.replace(/\.md$/, '');
    const creada = store.textoFecha(data.creada) || fechas.hoy();
    const dias = Math.max(0, Math.round((new Date(fechas.hoy()) - new Date(creada)) / 86400000));
    let resuena = null;
    try {
      const r = await resurgir(vault, { texto: `${titulo} ${cruda}`, limite: 1, modo: 'lexico' });
      if (r.resultados[0]) resuena = { con: r.resultados[0].titulo, score: r.resultados[0].score };
    } catch {
      /* brain vacío: sin resonancia */
    }
    notas.push({ titulo, dias, resuena, califica: (resuena?.score ?? 0) >= 5 || dias >= 7 });
  }
  notas.sort((a, b) => (b.resuena?.score ?? 0) - (a.resuena?.score ?? 0));
  return { proyecto: basename(dir), notas };
}

// Sube una mini-nota al brain principal: crea la nota permanente (con sus temas
// convertidos en conceptos, sugerencias de conexión incluidas) y marca la local como
// promovida — se queda en el proyecto como rastro, pero ya no es cruda.
export async function miniPromover(vault, { dir, titulo, temas, relacionadas } = {}) {
  if (!titulo) throw new Error('mini_promover exige "titulo"');
  const ruta = join(dirMini(dir), `${store.nombreArchivoSeguro(titulo)}.md`);
  if (!(await store.existeArchivo(ruta))) throw new Error(`no existe la mini-nota "${titulo}" en este proyecto`);
  const { data, content } = await store.leerNota(ruta);
  if (data.estado === 'promovida') throw new Error(`"${titulo}" ya está promovida`);

  const temasFinales = temas ?? (Array.isArray(data.temas) ? data.temas : []);
  const contenido = `${content.trim()}\n\n*(del taller de ${basename(dir)}, ${store.textoFecha(data.creada) || ''})*`;
  const r = await notaPermanente(vault, { titulo, contenido, temas: temasFinales, relacionadas });

  await store.actualizarCampoFrontmatter(ruta, 'estado', 'promovida');
  return { promovida: true, rutaVault: r.ruta, sugerencias: r.sugerencias || [] };
}
