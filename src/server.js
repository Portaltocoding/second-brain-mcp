#!/usr/bin/env node
// Servidor MCP `second-brain` (stdio): un second brain en Obsidian como conjunto de
// tools del grafo de conocimiento — lecturas, notas permanentes, conceptos-nodo,
// resurfacing (resurgir), salud del grafo (jardin) y mini-brains por proyecto.
//
// Configuración: la raíz del vault llega por la variable de entorno BRAIN_VAULT
// o como primer argumento de línea de comandos. Sin ella, el servidor no arranca.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registro } from './registro.js';
import { nombreArchivoSeguro } from './store.js';

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

const transport = new StdioServerTransport();
await server.connect(transport);
