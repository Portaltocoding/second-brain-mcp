# Changelog

## v0.1.2 (2026-08-18)

El servidor deja de dar por supuesto que ya sabes qué es un second brain: ahora
te lo explica y te acompaña hasta la primera nota.

- Prompt `empezar`: onboarding guiado. Explica el sistema antes de pedirte nada
  y abre tres puertas para la primera semilla: algo que has leído, una idea
  tuya, o un territorio que quieres conquistar.
- Los prompts hablan dos idiomas: responden en castellano o en inglés según el
  idioma en que se les hable.
- Instalación con doble clic en Claude Desktop: bundle `.mcpb` en el release,
  sin tocar JSON ni terminal. Claude Desktop pide la carpeta del vault al abrirlo.
- Sección de compatibilidad en el README: qué funciona y qué no si tu cliente
  no es Claude.
- Integración continua: los 36 tests corren en Node 18, 20 y 22 en cada push.

## v0.1.1 (2026-07-12)

Preparación para el registro oficial de MCP.

- `server.json` con el esquema del registro y `mcpName` en el `package.json`,
  publicado como `io.github.Portaltocoding/second-brain-mcp`.
- Descripción recortada al límite de 100 caracteres que impone el registro.

## v0.1.0 (2026-07-12)

Primera versión completa, nacida de extraer el módulo de second brain del
sistema personal Vida y pulirlo hasta ser un paquete independiente.

- 13 tools del grafo de conocimiento: lecturas, notas permanentes, conceptos
  como nodos reales, enlazado con motivo, mini-brains por proyecto, resurgir,
  jardin, vault_buscar y concepto_fusionar.
- Dos motores de resurgir: lexico (título, temas, cuerpo) y rag (BM25 por
  fragmentos con stemming castellano, devuelve el párrafo que responde), con
  guía automática que sugiere el cambio solo cuando el brain es grande y una
  búsqueda lexica sale floja, una vez por sesión.
- Resources MCP (`vault://lectura|nota|concepto/{titulo}`) para leer notas
  enteras sin gastar tool calls, con protección contra path traversal.
- Prompt MCP `ingerir` con tres modos (directo, destilar, auto): el
  procedimiento de ingesta escrito y portable a cualquier cliente.
- Integración Obsidian: wikilinks juzgados sin distinguir mayúsculas, enlaces
  `obsidian://` en cada creación, y `--init` para montar el vault.
- Respuestas en JSON compacto, búsquedas acotadas con aviso de truncado,
  diagnósticos con techo, annotations readOnly/destructive.
- Vault de ejemplo tejido en `ejemplo/`, README bilingüe (castellano e inglés)
  con mapa ASCII del flujo, y 36 tests.
