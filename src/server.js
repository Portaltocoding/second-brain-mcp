#!/usr/bin/env node
// Servidor MCP `second-brain` (stdio): un second brain en Obsidian como conjunto de
// tools del grafo de conocimiento — lecturas, notas permanentes, conceptos-nodo,
// resurfacing (resurgir), salud del grafo (jardin) y mini-brains por proyecto.
//
// Configuración: la raíz del vault llega por la variable de entorno BRAIN_VAULT
// o como primer argumento de línea de comandos. Sin ella, el servidor no arranca.
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registro } from './registro.js';
import { crearSiNoExiste, nombreArchivoSeguro } from './store.js';

// `--init /ruta`: andamiaje del vault — las tres carpetas y una portada. Idempotente:
// sobre un vault que ya existe no toca nada (Inicio.md solo se crea si no está).
if (process.argv[2] === '--init') {
  const destino = process.argv[3] || process.env.BRAIN_VAULT;
  if (!destino) {
    console.error('uso: second-brain-mcp --init /ruta/al/vault');
    process.exit(1);
  }
  for (const d of ['40-Lecturas', '50-Notas', '60-Conceptos']) {
    await mkdir(join(destino, d), { recursive: true });
  }
  const portada = `# Segundo cerebro

Tres carpetas, un grafo:

- \`40-Lecturas/\`: lo que entra. Libros, artículos, vídeos, cursos.
- \`50-Notas/\`: lo que queda. Ideas permanentes, con tu voz y tu título.
- \`60-Conceptos/\`: lo que conecta. Cada tema es un nodo con backlinks.

Pídele a tu asistente:

- «estoy leyendo X, apunta esto»: captura sin salir de lo que hacías.
- «¿qué sé yo sobre X?»: resurgir trae las notas conectadas.
- «¿cómo está el jardín?»: huérfanas, enlaces rotos y duplicados, para podar.
`;
  const creada = await crearSiNoExiste(join(destino, 'Inicio.md'), portada);
  console.error(`second-brain-mcp: vault listo en ${destino}${creada ? '' : ' (Inicio.md ya existía, no se toca)'}`);
  process.exit(0);
}

const vault = process.env.BRAIN_VAULT || process.argv[2];
if (!vault) {
  console.error('second-brain-mcp: define BRAIN_VAULT (o pasa la ruta del vault como argumento).');
  process.exit(1);
}

const server = new McpServer({ name: 'second-brain', version: '0.1.0' });

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
server.registerPrompt(
  'ingerir',
  {
    description:
      'Ingiere un texto en el second brain de forma organizada: clasifica (lectura/idea propia/apunte de taller), extrae conceptos con moderación, y teje sin enlazar nada sin permiso. modo: directo (guardar íntegro), destilar (solo lo importante) o auto.',
    argsSchema: {
      texto: z.string().describe('el texto a ingerir (pegado, dictado o leído de un fichero)'),
      modo: z.enum(['directo', 'destilar', 'auto']).optional().describe('por defecto auto: decide y confirma'),
      fuente: z.string().optional().describe('si viene de una lectura: título (y autor si se sabe)'),
    },
  },
  ({ texto, modo = 'auto', fuente }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Vas a ingerir un texto en mi second brain (MCP second-brain). Sigue este procedimiento; los pasos marcados DECISIÓN son míos, no los tomes por mí.

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

const transport = new StdioServerTransport();
await server.connect(transport);
