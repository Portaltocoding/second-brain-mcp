#!/usr/bin/env node
// Servidor MCP `second-brain` (stdio): un second brain en Obsidian como conjunto de
// tools del grafo de conocimiento — lecturas, notas permanentes, conceptos-nodo,
// resurfacing (resurgir), salud del grafo (jardin) y mini-brains por proyecto.
//
// Configuración: la raíz del vault llega por la variable de entorno BRAIN_VAULT
// o como primer argumento de línea de comandos. Sin ninguna de las dos, arranca
// igual sobre un vault por defecto en ~/second-brain.
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registro } from './registro.js';
import { crearSiNoExiste, nombreArchivoSeguro } from './store.js';

// Andamiaje del vault — las tres carpetas y una portada. Idempotente: sobre un
// vault que ya existe no toca nada (Inicio.md solo se crea si no está). Lo usan
// tanto `--init` como el arranque con vault por defecto.
async function andamiar(destino) {
  for (const d of ['40-Lecturas', '50-Notas', '60-Conceptos']) {
    await mkdir(join(destino, d), { recursive: true });
  }
  const portada = `# Segundo cerebro

Tres carpetas, un grafo:

- \`40-Lecturas/\`: lo que entra. Libros, artículos, vídeos, cursos.
- \`50-Notas/\`: lo que queda. Ideas permanentes, con tu voz y tu título.
- \`60-Conceptos/\`: lo que conecta. Cada tema es un nodo con backlinks.

Pídele a tu asistente:

- «hazme el onboarding de mi second brain»: primera sesión guiada (prompt empezar).
- «estoy leyendo X, apunta esto»: captura sin salir de lo que hacías.
- «¿qué sé yo sobre X?»: resurgir trae las notas conectadas.
- «¿cómo está el jardín?»: huérfanas, enlaces rotos y duplicados, para podar.
`;
  return crearSiNoExiste(join(destino, 'Inicio.md'), portada);
}

if (process.argv[2] === '--init') {
  const destino = process.argv[3] || process.env.BRAIN_VAULT;
  if (!destino) {
    console.error('uso: second-brain-mcp --init /ruta/al/vault');
    process.exit(1);
  }
  const creada = await andamiar(destino);
  console.error(`second-brain-mcp: vault listo en ${destino}${creada ? '' : ' (Inicio.md ya existía, no se toca)'}`);
  process.exit(0);
}

// ── Resolución del vault ─────────────────────────────────────────────────────
// Dos reglas, las dos aprendidas de ver el producto fallar en los primeros
// sesenta segundos:
//
// 1. SIN CONFIGURAR NO SE MUERE. Antes, sin BRAIN_VAULT el proceso salía con
//    código 1 y el cliente MCP lo pintaba como «server failed to start»: el
//    mensaje que explicaba qué faltaba iba a stderr, donde nadie mira. Ahora hay
//    vault por defecto en ~/second-brain, andamiado al arrancar, y el producto
//    funciona sin que el usuario configure absolutamente nada.
//
// 2. CON LA RUTA MAL ESCRITA NO SE ESCRIBE A CIEGAS. Al revés del anterior, este
//    fallo era silencioso: una ruta con un typo arrancaba igual y plantaba un
//    vault entero en una carpeta fantasma, mientras el usuario creía estar
//    escribiendo en su Obsidian. La heurística es la intención: si el directorio
//    PADRE existe, crear el vault es lo que el usuario quería; si no existe ni el
//    padre, es un error de escritura. En ese caso el servidor arranca igual —para
//    que el aviso se vea en el chat y no en un log— pero toda tool responde
//    explicando qué ruta se pidió y qué hacer.
const VAULT_POR_DEFECTO = join(homedir(), 'second-brain');
const rutaPedida = process.env.BRAIN_VAULT || process.argv[2];
const vault = rutaPedida || VAULT_POR_DEFECTO;

let vaultInvalido = null;
if (rutaPedida) {
  if (!(await existe(rutaPedida)) && !(await existe(dirname(rutaPedida)))) {
    vaultInvalido = `la ruta configurada no existe y su carpeta contenedora tampoco: "${rutaPedida}". `
      + 'Parece un error al escribirla. Revisa BRAIN_VAULT en la configuración de tu cliente MCP '
      + '(la ruta debe ser absoluta), o quítala del todo para usar el vault por defecto '
      + `en ${VAULT_POR_DEFECTO}.`;
    console.error(`second-brain-mcp: ${vaultInvalido}`);
  }
} else {
  await andamiar(vault);
  console.error(`second-brain-mcp: sin BRAIN_VAULT configurado, uso el vault por defecto en ${vault}`);
}

async function existe(ruta) {
  try {
    await readdir(ruta);
    return true;
  } catch {
    return false;
  }
}

const server = new McpServer({ name: 'second-brain', version: '0.1.2' });

// JSON compacto a propósito: la indentación solo infla la respuesta que el cliente
// paga en tokens de contexto.
function contenidoOk(resultado) {
  return { content: [{ type: 'text', text: JSON.stringify(resultado) }] };
}

function contenidoError(error) {
  return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
}

for (const [nombre, def] of Object.entries(registro)) {
  server.registerTool(
    nombre,
    { description: def.description, inputSchema: def.schema, annotations: def.annotations },
    async (args) => {
      // El aviso de ruta mal configurada viaja como error de tool, no como muerte
      // del proceso: así el usuario lo lee en su conversación y puede arreglarlo.
      if (vaultInvalido) return contenidoError(new Error(vaultInvalido));
      try {
        return contenidoOk(await def.ejecutar(vault, args));
      } catch (e) {
        return contenidoError(e);
      }
    },
  );
}

// ── Resources: leer notas completas sin gastar una tool call ─────────────────
// Cada nota del grafo es un resource navegable (vault://nota/Mi idea). El grep
// (vault_buscar) localiza; el resource trae la nota entera, en Markdown tal cual.
const RESOURCES = [
  { nombre: 'lectura', dir: '40-Lecturas', descripcion: 'Notas de lectura (40-Lecturas/)' },
  { nombre: 'nota', dir: '50-Notas', descripcion: 'Notas permanentes (50-Notas/)' },
  { nombre: 'concepto', dir: '60-Conceptos', descripcion: 'Nodos-concepto (60-Conceptos/)' },
];

async function titulosDe(dir) {
  try {
    return (await readdir(join(vault, dir)))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

for (const { nombre, dir, descripcion } of RESOURCES) {
  server.registerResource(
    nombre,
    new ResourceTemplate(`vault://${nombre}/{titulo}`, {
      list: async () => ({
        resources: (await titulosDe(dir)).map((t) => ({
          uri: `vault://${nombre}/${encodeURIComponent(t)}`,
          name: t,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    { description: descripcion, mimeType: 'text/markdown' },
    async (uri, { titulo }) => {
      // nombreArchivoSeguro neutraliza / y \: un titulo con ../ no puede salir del vault.
      const fichero = `${nombreArchivoSeguro(decodeURIComponent(titulo))}.md`;
      const texto = await readFile(join(vault, dir, fichero), 'utf8');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: texto }] };
    },
  );
}

// ── Prompt de ingesta: el ritual de meter un texto en el jardín ──────────────
// El servidor no piensa (eso es del asistente), pero sí ORGANIZA: este prompt es
// el procedimiento de ingesta escrito, para que «añade esto a mi second brain»
// salga igual de bien en cualquier cliente y cualquier día.
// Cada prompt se registra dos veces: nombre castellano y alias inglés. El
// procedimiento interno queda en castellano (lo lee el modelo, que responde en
// el idioma del usuario); lo que sí se traduce es lo que el usuario ve al
// elegir comando: la descripción.
function registrarPromptDual(nombres, descripciones, argsSchema, construir) {
  nombres.forEach((nombre, i) => {
    server.registerPrompt(nombre, { description: descripciones[i], argsSchema }, construir);
  });
}

registrarPromptDual(
  ['ingerir', 'ingest'],
  [
    'Ingiere un texto en el second brain de forma organizada: clasifica (lectura/idea propia/apunte de taller), extrae conceptos con moderación, y teje sin enlazar nada sin permiso. modo: directo (guardar íntegro), destilar (solo lo importante) o auto.',
    'Ingest a text into the second brain in an organized way: classify it (reading/own idea/workshop note), extract concepts sparingly, and weave without linking anything without permission. modo: directo (store whole), destilar (distill the key ideas) or auto. English alias of `ingerir`.',
  ],
  {
    texto: z.string().describe('el texto a ingerir (pegado, dictado o leído de un fichero)'),
    modo: z.enum(['directo', 'destilar', 'auto']).optional().describe('por defecto auto: decide y confirma'),
    fuente: z.string().optional().describe('si viene de una lectura: título (y autor si se sabe)'),
  },
  ({ texto, modo = 'auto', fuente }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Vas a ingerir un texto en mi second brain (MCP second-brain). Responde siempre en el idioma en el que yo te hable. Sigue este procedimiento; los pasos marcados DECISIÓN son míos, no los tomes por mí.

MODO: ${modo}
FUENTE: ${fuente || 'ninguna declarada'}

TEXTO:
<texto>
${texto}
</texto>

PROCEDIMIENTO:

1. CLASIFICA el texto:
   - Tiene fuente externa (libro, artículo, vídeo) → es LECTURA: lectura_crear si no existe + lectura_nota por cada apunte.
   - Es pensamiento mío, ya digerido → NOTA PERMANENTE (el título es una afirmación).
   - Es apunte crudo de un proyecto en curso → mini_nota (dir = raíz del proyecto).
   Si dudas entre dos, dime cuál eliges y por qué en una línea, y sigue.

2. APLICA EL MODO:
   - directo: guarda el texto íntegro, sin resumir ni recortar. Solo propón el título.
   - destilar: extrae las 1-3 ideas más fuertes, cada una como posible nota independiente, escritas EN MIS PALABRAS, no las del texto. Enséñamelas antes de crear nada. DECISIÓN: yo apruebo cuáles entran.
   - auto: si el texto es corto y ya suena a idea → directo; si es largo o ajeno → propón destilar. Dime qué elegiste en una línea.

3. CONCEPTOS: identifica 2-4 conceptos clave, no más: la escasez es el significado. Prefiere conceptos que YA existan en el grafo (compruébalo con vault_buscar o resurgir) antes que inventar sinónimos nuevos. Pásalos como temas.

4. TEJE: crea con las tools (nota_permanente devuelve sugerencias de conexión). DECISIÓN: propónme las sugerencias fuertes; solo enlazas (nota_enlazar, con motivo de una frase) las que yo confirme.

5. CIERRA en 2-3 líneas: qué entró, con qué conceptos, qué conexiones quedaron hechas o pendientes, y el enlace abrir de lo creado.`,
      },
    }],
  }),
);


// ── Prompt de onboarding: la primera sesión, guiada ──────────────────────────
// El momento más frágil es el vault vacío: el usuario no sabe qué pedir. Este
// prompt es esa primera conversación escrita: mirar el estado, plantar la
// primera lectura y la primera idea, y enseñar los tres gestos del día a día.
registrarPromptDual(
  ['empezar', 'start'],
  [
    'Onboarding guiado del second brain: explica cómo funciona con un diagrama sencillo, mira el estado del vault, planta la primera lectura y la primera idea con el usuario, enseña resurgir con su propio material y deja los tres gestos del día a día. Vale también para un vault con contenido: entonces es un tour.',
    'Guided second brain onboarding: explains how it works with a simple diagram, checks the vault state, plants the first reading and the first idea with the user, shows resurgir on their own material and leaves the three daily gestures. Also works on a vault with content: then it is a tour. English alias of `empezar`.',
  ],
  {
    contexto: z.string().optional().describe('opcional: qué está leyendo o pensando el usuario ahora mismo, si ya se sabe'),
  },
  ({ contexto }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Vas a hacerme el onboarding de mi second brain (MCP second-brain). Es una conversación, no un formulario: un paso cada vez, corto, y los marcados DECISIÓN son míos.

${contexto ? `CONTEXTO QUE YA SABES: ${contexto}\n` : ''}
PROCEDIMIENTO:

1. EL IDIOMA. Tu primer mensaje es solo esto: pregúntame en qué idioma quiero el onboarding, español o inglés (ES / EN), en una línea bilingüe. DECISIÓN: espera mi elección y todo lo que sigue va en ese idioma, incluidas las etiquetas del diagrama.

2. QUÉ ES UN SECOND BRAIN, en 5-6 líneas con ambición y sin jerga. La idea que tiene que quedar: no es una app de notas, es una extensión de tu mente. Un sistema donde todo lo que lees, estudias y piensas queda guardado, digerido y conectado, para que tu cabeza se dedique a pensar y no a recordar. Cada idea entra una vez, escrita con tus palabras, y trabaja para ti para siempre: vuelve sola cuando la necesitas y se cruza con otras produciendo conexiones que no sabías que tenías. Y remata con el dónde: vive en ficheros Markdown en tu disco, gestionado idealmente con Obsidian (recomendado, no obligatorio) porque dibuja tu mente como un grafo navegable y porque así tus notas son tuyas de verdad: sin nube obligatoria, sin base de datos, legibles con cualquier editor dentro de treinta años.

3. CÓMO FUNCIONA, con este diagrama tal cual (etiquetas en mi idioma) y 2-3 líneas: las ideas se conectan a conceptos, y cuando meses después trabajes en algo, las relacionadas vuelven solas.

\`\`\`
   lo que lees          lo que piensas          lo que conecta
  ┌────────────┐  destilar  ┌──────────┐  temas  ┌─────────────┐
  │  Lecturas  │ ─────────▶ │  Ideas   │ ──────▶ │  Conceptos  │
  └────────────┘            └──────────┘         └─────────────┘
        ▲                        ▲                      │
        │ «apunta esto»          │ «añade esto»         │
        └── tú ◀──────────────── «¿qué sé yo de X?» ◀───┘
                     (las ideas vuelven solas: resurgir)
\`\`\`

4. MIRA EL ESTADO con jardin. Si el vault ya tiene notas, esto no es un onboarding sino un tour: enséñame en 3 líneas qué hay (cuántas lecturas, ideas y conceptos, y si el jardín pide poda), haz un resurgir con algo de mi propio contenido para que vea la magia, y salta al paso 8.

5. LA PRIMERA SEMILLA. Si el jardín está vacío, dímelo así de claro («tu jardín está vacío y toca plantar la primera semilla») y ábreme tres puertas para que elija la mía. DECISIÓN: espera mi respuesta, no inventes contenido de ejemplo.
   1. ¿Qué estás leyendo ahora? Un libro, un artículo, un vídeo que te esté dejando apuntes. → lectura_crear con 1-2 temas, y pídeme un apunte concreto para lectura_nota.
   2. ¿Qué idea te ha rondado la cabeza esta semana? Algo tuyo, ya masticado, que merezca quedarse. → salta directo al paso 6 con ella.
   3. ¿Qué tema quieres dominar? Algo que estás estudiando o que necesitas para el trabajo, un examen, un proyecto. → planta la bandera: concepto_crear con ese tema, y pregúntame cuál es mi primera fuente (libro, curso, artículo → lectura_crear con ese concepto como tema) o qué sé o creo ya sobre él (→ paso 6, con ese concepto entre sus temas). Todo lo que ingiera después sobre el tema se cuelga solo de esa bandera, y ver crecer el nodo es ver el dominio ganado.

6. LA PRIMERA IDEA PERMANENTE. De lo que te conté, propón UNA idea destilada en mis palabras, con el título como afirmación (no «Sobre los hábitos» sino «El entorno decide por ti») y 1-2 conceptos. DECISIÓN: yo apruebo o corrijo el título antes de nota_permanente.

7. LA MAGIA. Haz un resurgir con una pregunta relacionada con lo que acabo de plantar, y enséñame qué vuelve. Con una sola nota volverá poco: dilo con honestidad («esto con 30 notas es otra cosa») en vez de fingir.

8. LOS TRES GESTOS. Cierra dejándome esto, tal cual, como chuleta:
   - «estoy leyendo X, apunta esto» → captura sin salir de lo que hacías
   - «añade esto a mi second brain» (directo o lo más importante) → ingesta
   - «¿qué sé yo sobre X?» → resurgir
   Y uno semanal: «¿cómo está el jardín?» → poda.

REGLAS: mensajes cortos, un paso por turno, nada de crear contenido que yo no haya dicho, y ningún enlace entre notas sin mi confirmación.`,
      },
    }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
