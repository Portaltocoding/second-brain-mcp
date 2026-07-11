// Única capa que toca disco. Reglas:
// - Frontmatter: leer con gray-matter; al actualizar, editar SOLO la línea de la
//   clave (regex anclada ^clave:), sin re-serializar el documento (evita que Obsidian
//   o el usuario vean reformateado lo que no tocamos).
// - Escritura atómica: tmp + rename. Releer siempre, nunca cachear (Obsidian también escribe).
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import matter from 'gray-matter';

// Serializa operaciones "leer -> calcular -> escribir" sobre la misma clave: el
// servidor MCP es un único proceso Node, así que un mutex en memoria basta para
// evitar que dos tools concurrentes lean el mismo estado antes de que ninguna
// escriba y pisen/dupliquen resultado.
const colas = new Map();

export function conLock(clave, tarea) {
  const cola = colas.get(clave) ?? Promise.resolve();
  const resultado = cola.then(tarea, tarea);
  colas.set(clave, resultado.then(() => {}, () => {}));
  return resultado;
}

// Obsidian/el filesystem no admiten ciertos caracteres en nombres de fichero
// (una `/` en el título, p.ej., crearía subdirectorios en vez de tratarse como texto).
export function nombreArchivoSeguro(titulo) {
  return titulo.replace(/[\\/:*?"<>|]/g, '-').trim();
}

export async function existeArchivo(ruta) {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

export async function leerCruda(ruta) {
  return readFile(ruta, 'utf8');
}

export async function leerNota(ruta) {
  const texto = await leerCruda(ruta);
  const { data, content } = matter(texto);
  return { data, content, cruda: texto };
}

// Escritura atómica genérica: tmp en el mismo directorio (mismo filesystem) + rename.
export async function escribirAtomica(ruta, contenido) {
  await mkdir(dirname(ruta), { recursive: true });
  const tmp = `${ruta}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, contenido, 'utf8');
    await rename(tmp, ruta);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

// Crea la nota si no existe ya (idempotente). Devuelve false si ya existía.
export async function crearSiNoExiste(ruta, contenido) {
  if (await existeArchivo(ruta)) return false;
  await escribirAtomica(ruta, contenido);
  return true;
}

function valorYaml(v) {
  if (Array.isArray(v)) return `[${v.map(valorYaml).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (v === null || v === undefined || v === '') return '';
  return /[:#\[\]{}"']/.test(v) || /^\d/.test(v) ? JSON.stringify(v) : v;
}

// Para interpolar texto libre dentro de un valor "entre comillas" al construir
// contenido nuevo desde cero — actualizarCampoFrontmatter ya usa valorYaml() al EDITAR;
// esto es para el mismo caso al CREAR.
export function escaparComillas(s) {
  return String(s).replace(/"/g, '\\"');
}

// Edita SOLO la línea `clave: ...` dentro del bloque de frontmatter (entre los dos
// primeros `---`), preservando comentarios y el resto del documento intacto.
export async function actualizarCampoFrontmatter(ruta, clave, valor) {
  return conLock(ruta, async () => {
    const cruda = await leerCruda(ruta);
    const fin = cruda.indexOf('\n---', 3);
    if (!cruda.startsWith('---') || fin === -1) {
      throw new Error(`${ruta}: no tiene frontmatter válido`);
    }
    const cabecera = cruda.slice(0, fin);
    const resto = cruda.slice(fin);
    const re = new RegExp(`^${clave}:.*$`, 'm');
    if (!re.test(cabecera)) {
      throw new Error(`${ruta}: la clave "${clave}" no existe en el frontmatter`);
    }
    const nuevaCabecera = cabecera.replace(re, `${clave}: ${valorYaml(valor)}`);
    await escribirAtomica(ruta, nuevaCabecera + resto);
  });
}

// Rango [inicio, fin) del CUERPO de una sección `^marcador Nombre$` hasta el
// siguiente encabezado del mismo nivel o superior, o EOF. `nivel` es '##' o '###'.
function rangoSeccion(texto, nombre, nivel = '##') {
  // [ \t]* y no \s*: con \s* el propio \n de después del encabezado podía colarse
  // dentro del match (greedy backtracking), haciendo variable dónde empieza
  // "cuerpo" según cuántas líneas en blanco hubiera. Anclado así, inicioCuerpo cae
  // siempre justo antes del \n que termina la línea del encabezado.
  const reInicio = new RegExp(`^${nivel} ${nombre}[ \\t]*$`, 'm');
  const m = reInicio.exec(texto);
  if (!m) return null;
  const inicioCuerpo = m.index + m[0].length;
  const resto = texto.slice(inicioCuerpo);
  const finMatch = resto.match(new RegExp(`^${nivel.length <= 2 ? '#{1,2}' : '#{1,3}'} `, 'm'));
  const finCuerpo = finMatch ? inicioCuerpo + finMatch.index : texto.length;
  return { inicioCuerpo, finCuerpo };
}

// Añade una línea al final del cuerpo de una sección (antes del siguiente encabezado).
// Crea la sección al final del fichero si no existe todavía (ficheros editados a mano).
export async function appendEnSeccion(ruta, nombre, linea, nivel = '##') {
  return conLock(ruta, async () => {
    const cruda = await leerCruda(ruta);
    const rango = rangoSeccion(cruda, nombre, nivel);
    if (!rango) {
      const conSeccion = `${cruda.replace(/\s*$/, '')}\n\n${nivel} ${nombre}\n${linea}\n`;
      await escribirAtomica(ruta, conSeccion);
      return;
    }
    const cuerpo = cruda.slice(rango.inicioCuerpo, rango.finCuerpo);
    const cuerpoSinFinal = cuerpo.replace(/\s*$/, '');
    const nuevoCuerpo = cuerpoSinFinal.length > 0
      ? `${cuerpoSinFinal}\n${linea}\n\n`
      : `\n${linea}\n\n`;
    const nuevo = cruda.slice(0, rango.inicioCuerpo) + nuevoCuerpo + cruda.slice(rango.finCuerpo);
    await escribirAtomica(ruta, nuevo);
  });
}

export function leerSeccion(texto, nombre, nivel = '##') {
  const rango = rangoSeccion(texto, nombre, nivel);
  return rango ? texto.slice(rango.inicioCuerpo, rango.finCuerpo).trim() : null;
}

// gray-matter (vía js-yaml) parsea `fecha: 2026-07-10` sin comillas como Date, no
// como string — y lo hace anclado a UTC. Para no depender de la zona horaria local,
// reconstruimos con los getters UTC en vez de con getFullYear()/getMonth() locales.
export function textoFecha(v) {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  return v;
}
