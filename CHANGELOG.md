# Changelog

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
