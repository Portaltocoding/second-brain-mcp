#!/usr/bin/env node
// Servidor MCP `second-brain` (stdio): un second brain en Obsidian como conjunto de
// tools del grafo de conocimiento — lecturas, notas permanentes, conceptos-nodo,
// resurfacing (resurgir), salud del grafo (jardin) y mini-brains por proyecto.
//
// Configuración: la raíz del vault llega por la variable de entorno BRAIN_VAULT
// o como primer argumento de línea de comandos. Sin ella, el servidor no arranca.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registro } from './registro.js';

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

const transport = new StdioServerTransport();
await server.connect(transport);
