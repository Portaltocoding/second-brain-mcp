# second-brain-mcp

Un **second brain en Obsidian**, servido por MCP. Lecturas, notas permanentes y
conceptos que son nodos reales del grafo — con un motor de *resurfacing* que trae
las ideas conectadas cuando trabajas, y un jardín que te dice dónde podar.

En castellano, de principio a fin.

## Filosofía

- **Nada entra suelto.** Cada idea se teje: idea↔origen, idea↔idea (`relacionadas`),
  idea↔concepto (`temas`). Los conceptos no son tags: son notas reales en
  `60-Conceptos/` que acumulan backlinks.
- **La escasez es el significado.** Máximo 2-3 relacionadas por nota, cada enlace
  con su porqué (el `motivo` de `nota_enlazar` queda escrito en `## Conexiones`).
  Un cajón de sastre con 12 enlaces no conecta nada.
- **Enlazar es decisión del usuario, nunca un side effect.** `nota_permanente`
  devuelve `sugerencias` de conexión (solo las fuertes: score ≥ 5, máximo 2);
  el asistente las propone, tú decides.
- **El vault es la única fuente de verdad.** El servidor relee siempre y nunca
  cachea: Obsidian y tú podéis editar a mano sin romper nada. Escritura atómica,
  frontmatter editado línea a línea sin re-serializar tu documento.

## Instalación

Necesitas Node ≥ 18 y un vault (una carpeta; el servidor crea las subcarpetas al
escribir).

Con Claude Code, registrado a nivel de usuario (disponible en cualquier proyecto):

```bash
claude mcp add --scope user second-brain \
  --env BRAIN_VAULT=/ruta/a/tu/vault \
  -- npx -y second-brain-mcp
```

Con cualquier otro cliente MCP (config JSON genérica):

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": ["-y", "second-brain-mcp"],
      "env": { "BRAIN_VAULT": "/ruta/a/tu/vault" }
    }
  }
}
```

La ruta del vault también puede pasarse como primer argumento en vez de la
variable de entorno: `second-brain-mcp /ruta/a/tu/vault`.

## Estructura del vault

```
vault/
├── 40-Lecturas/     una nota por lectura (libro, artículo, vídeo, curso)
├── 50-Notas/        ideas permanentes; el título es una afirmación
└── 60-Conceptos/    cada tema es un NODO con backlinks, no un tag
```

Convive con el resto de tu vault: el servidor solo escribe en esas tres carpetas
(y `vault_buscar` puede buscar en todo).

## Las tools

### Capturar

| Tool | Qué hace |
|---|---|
| `lectura_crear` | Crea la nota de una lectura con su frontmatter (autor, formato, temas) |
| `lectura_nota` | Apunte a `## Notas mientras leo` (con ubicación opcional: "cap 3", "min 20") |
| `lectura_actualizar` | Cambia estado (fija inicio/fin solo) y valoración (1-5) |
| `nota_permanente` | Crea una idea en `50-Notas/`, la enlaza a su origen y materializa sus temas como conceptos. Devuelve sugerencias de conexión |
| `nota_enlazar` | Enlaza dos ideas (bidireccional), con el motivo escrito en ambas |
| `concepto_crear` | Crea o define un nodo-concepto |

### Pensar

| Tool | Qué hace |
|---|---|
| `resurgir` | *Resurfacing*: dado un texto (una tarea, una idea a medias), devuelve las notas más conectadas, puntuadas (título×3, temas×2, cuerpo×1). Solo aparece cuando hay solape real |
| `vault_buscar` | Grep estructurado sobre todo el vault, con filtro por tipo y límite de resultados |

### Podar

| Tool | Qué hace |
|---|---|
| `jardin` | Salud del grafo: huérfanas, wikilinks rotos, conceptos sin definir, notas sobreconectadas, conceptos duplicados |
| `concepto_fusionar` | Fusiona dos conceptos duplicados: reescribe todos los wikilinks del vault y borra el nodo partido |

## Resources

Además de las tools, cada nota del grafo se expone como **resource MCP** legible
y navegable — leer una nota completa no gasta una tool call, y en clientes como
Claude Code puedes adjuntarlas con `@`:

```
vault://lectura/{titulo}     una lectura de 40-Lecturas/
vault://nota/{titulo}        una nota permanente de 50-Notas/
vault://concepto/{nombre}    un nodo-concepto de 60-Conceptos/
```

El contenido llega como `text/markdown`, tal cual está en el fichero
(frontmatter incluido). Patrón típico: `vault_buscar` o `resurgir` para
localizar, el resource para leer entero.

### Mini-brains (bandeja por proyecto)

Cualquier repo puede tener su `brain/` local: apuntes de taller, crudos, que viven
y mueren con el proyecto — salvo los que se ganan la biblioteca.

| Tool | Qué hace |
|---|---|
| `mini_nota` | Apunte crudo en `<proyecto>/brain/` |
| `mini_listar` | Cuáles CALIFICAN para subir (resuenan ≥ 5 con el brain, o llevan 7+ días madurando) |
| `mini_promover` | Sube una mini-nota como permanente (temas → conceptos) y marca la local |

Taller abajo, biblioteca arriba; promover es decisión del usuario.

## Notas de diseño

- Las tools de solo lectura (`resurgir`, `jardin`, `vault_buscar`, `mini_listar`)
  se declaran con `readOnlyHint`, y `concepto_fusionar` con `destructiveHint`,
  para que el cliente pueda auto-aprobar unas y pedir confirmación para la otra.
- Las respuestas son JSON compacto y acotado (`limite` + `truncado` en las
  búsquedas): el contexto del cliente se paga en tokens.
- Sin base de datos ni índice: solo Markdown con frontmatter. Todo lo que el
  servidor sabe está en tus ficheros, legible y tuyo.

## Desarrollo

```bash
npm install
npm test
```

## Licencia

MIT
