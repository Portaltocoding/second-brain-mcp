# second-brain-mcp

Tu segundo cerebro, en tu Obsidian, hablando con tu asistente.

Esto es un servidor MCP que convierte una carpeta de Markdown en un **second brain
de verdad**: capturas lo que lees, lo conviertes en ideas con tus palabras, y esas
ideas se conectan entre sí hasta formar un grafo que *piensa contigo* — cuando
trabajas en algo, las notas relacionadas aparecen solas.

Todo en castellano. Todo en ficheros tuyos. Sin bases de datos, sin nube, sin magia
que no puedas abrir con un editor de texto.

## ¿Cómo se siente?

Le dices a tu asistente:

> «Estoy leyendo Hábitos Atómicos, apunta esto: el entorno decide más que la
> fuerza de voluntad»

y él crea la lectura si no existía, guarda el apunte, y cuando esa idea madure la
convierte en una nota permanente conectada al concepto `[[Hábitos]]` — que a su
vez acumula todo lo que has pensado sobre el tema, venga del libro que venga.

Semanas después, trabajando en otra cosa, preguntas por diseñar tu rutina de
mañanas y el sistema te trae de vuelta *«El entorno decide por ti»* con el párrafo
exacto. Eso es el segundo cerebro: no recordar tú, que recuerde él.

## El mapa

Cada etiqueta es `método / qué es`; en las dos puertas principales va también la
frase que lo dispara:

```
                             tú + tu asistente
                                  │      ▲
                ingerir / ingesta │      │ resurgir / recuerdo
                   «añade esto»   ▼      │   «¿qué sé de esto?»
                           ┌──────────────┐
                           │ second-brain │
                           └───────┬──────┘
                     clasifica lo que entra
       ┌───────────────────────────┼───────────────────────────┐
       │ lectura_crear / ficha     │ nota_permanente / idea    │ mini_nota / apunte
       │ lectura_nota / apuntes    │                           │
       ▼                           ▼                           ▼
┌──────────────┐            ┌─────────────┐           ┌────────────────┐
│ 40-Lecturas/ │            │  50-Notas/  │           │ proyecto/brain/│
│ lo que entra │            │ lo que queda│           │ el taller      │
└──────┬───────┘            └──────┬──────┘           └────────┬───────┘
       │                           │                           │
       │ nota_permanente /         │ temas                     │ mini_promover /
       │ la idea madura            │                           │ madura o resuena
       └──────────────────────────▶│───────────┐               │
                                   │           ▼               │
              nota_enlazar /       │   ┌───────────────┐       │
              relacionar con       │   │ 60-Conceptos/ │◀──────┘
              motivo (2-3 máx)     ▼   │ lo que conecta│
                             otras ideas└───────────────┘

     jardin / poda «¿cómo está el jardín?» · concepto_fusionar / coser nodos
     vault_buscar / grep «busca dónde dije X» · mini_listar / cosecha del taller
```

## Instalación

Necesitas Node 18 o más nuevo y una carpeta para el vault (puede ser tu vault de
Obsidian de siempre: el servidor solo escribe en tres subcarpetas y no toca nada más).

Con **Claude Code**, a nivel de usuario (disponible en todos tus proyectos):

```bash
claude mcp add --scope user second-brain \
  --env BRAIN_VAULT=/ruta/a/tu/vault \
  -- npx -y second-brain-mcp
```

Con cualquier otro cliente MCP:

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

Y listo. La primera nota crea las carpetas que hagan falta. Si prefieres dejar
el vault montado desde el principio (carpetas + portada), hay andamiaje:

```bash
npx -y second-brain-mcp --init /ruta/a/tu/vault
```

Es idempotente: sobre un vault que ya existe no toca nada.

### Variables de entorno

| Variable | Qué hace | Por defecto |
|---|---|---|
| `BRAIN_VAULT` | La ruta de tu vault (obligatoria; también vale como primer argumento) | — |
| `BRAIN_MODO` | Motor de `resurgir`: `lexico` o `rag` | `lexico` |
| `BRAIN_RAG_UMBRAL` | A partir de cuántas notas puede sugerirse el modo rag | `50` |

## Las tres carpetas

```
tu-vault/
├── 40-Lecturas/     lo que entra: libros, artículos, vídeos, cursos
├── 50-Notas/        lo que queda: ideas permanentes, tuyas, con tu título
└── 60-Conceptos/    lo que conecta: cada tema es una nota real con backlinks
```

La regla de oro: **nada entra suelto**. Cada idea se enlaza a su origen, a los
conceptos que toca y —con moderación— a otras ideas. Y la moderación importa:
máximo 2-3 notas relacionadas, cada enlace con su porqué escrito. Un cajón con
doce enlaces no conecta nada; tres enlaces con motivo son un mapa.

## Qué sabe hacer

**Capturar** — `lectura_crear` abre la ficha de un libro o artículo;
`lectura_nota` guarda apuntes mientras lees («cap 3: ...»); cuando una idea es
tuya de verdad, `nota_permanente` la sube a `50-Notas/` con sus temas convertidos
en conceptos navegables. `nota_enlazar` une dos ideas y deja escrito *por qué*.

**Pensar** — `resurgir` es el corazón: le das un texto (una tarea, una duda, una
idea a medias) y te devuelve las notas más conectadas con él. Solo aparece cuando
hay solape real; si no hay nada, no inventa. `vault_buscar` es el grep de toda la
vida, acotado para no inundar (20 resultados y te avisa si hubo más).

**Podar** — los grafos se pudren en silencio. `jardin` te enseña las notas
huérfanas, los enlaces rotos, los conceptos que nadie definió, las notas
sobreconectadas y los conceptos duplicados («Hábito» y «Habitos» partiendo los
backlinks en dos). `concepto_fusionar` cose los nodos partidos.

**Taller por proyecto** — cualquier repo puede tener su `brain/` local con
apuntes crudos (`mini_nota`). `mini_listar` te dice cuáles se han ganado subir a
la biblioteca (resuenan fuerte con lo que ya tienes, o llevan una semana
madurando) y `mini_promover` los sube. Taller abajo, biblioteca arriba — y
promover siempre es decisión tuya.

## La ingesta: un solo gesto

No hace falta que te aprendas las tools. Dile a tu asistente:

> «añade esto **directo** a mi second brain»
> «añade **lo más importante** de esto»
> «apunta esto que estoy escribiendo»

y la ingesta se dispara según toque. El servidor trae el procedimiento escrito
(prompt MCP `ingerir` — en Claude Code aparece como comando
`/mcp__second-brain__ingerir`): clasifica el texto (¿lectura con fuente, idea
tuya, apunte de taller?), aplica el modo — `directo` guarda íntegro, `destilar`
extrae las 1-3 ideas fuertes *en tus palabras* y te las enseña antes de crear
nada, `auto` decide y te lo dice —, identifica 2-4 conceptos (prefiriendo los
que ya existen en tu grafo antes que inventar sinónimos), y teje. Las decisiones
son tuyas y están marcadas como tales: qué ideas entran y qué conexiones se
crean. Vale para un párrafo pegado, un capítulo, o ese documento de Word que
estás escribiendo — pégalo o pásale el fichero.

## Leer notas: resources

Cada nota del grafo es también un **resource MCP**, así que leerla entera no
gasta una tool call (y en Claude Code puedes adjuntarla con `@`):

```
vault://lectura/{titulo}
vault://nota/{titulo}
vault://concepto/{nombre}
```

El patrón que funciona: buscar barato (`vault_buscar`, `resurgir`), leer entero
solo lo que interesa (el resource).

## Cómo se lleva con Obsidian

Es su casa. Todo es Markdown plano con wikilinks nativos: graph view, backlinks
y hover preview funcionan sin plugins. El servidor relee siempre (nunca cachea)
y escribe de forma atómica, así que puedes editar en Obsidian con el servidor
corriendo sin que se pisen. El `jardin` juzga los enlaces como Obsidian: sin
distinguir mayúsculas.

Dos detalles útiles:

- Cada nota creada devuelve un enlace `abrir` (`obsidian://open?...`): un clic
  y estás en la nota dentro de la app.
- `temas` y `relacionadas` viven en las propiedades (frontmatter). Obsidian los
  trata como enlaces reales, pero para verlos en el graph view activa
  «Propiedades» en los ajustes del grafo.

## Modo lexico y modo rag

`resurgir` tiene dos motores, y el sistema te dice cuándo cambiar:

- **`lexico`** (por defecto) — puntúa coincidencias donde más significan:
  título ×3, temas ×2, cuerpo ×1. Directo y transparente; con un brain pequeño
  o mediano es todo lo que necesitas.
- **`rag`** — BM25 por *fragmentos* con stemming castellano: «hábito» encuentra
  «hábitos», y en vez de decirte solo *qué* nota conecta, te devuelve **el
  párrafo exacto que responde**, listo para usar como contexto. Pensado para
  cuando el brain crece y las notas son largas.

¿Cuál usar? No lo pienses: empieza en `lexico` y deja que el sistema te guíe.
La sugerencia de pasar a rag aparece **solo cuando toca** — cuando se dan las
dos cosas a la vez:

1. tu brain ya es un puñado grande de notas (50+, configurable con
   `BRAIN_RAG_UMBRAL`), **y**
2. la búsqueda que acabas de hacer volvió floja en léxico (sin resultados o por
   debajo del listón de conexión fuerte) — es decir, justo el momento en que el
   rag habría ayudado.

Y una sola vez por sesión: te lo dice, te explica el porqué, y no vuelve a
insistir. Si el léxico encuentra fuerte, no te interrumpe nadie. Probar es
gratis: repite la consulta con `modo: "rag"` y compara; si convence, se fija
con `BRAIN_MODO=rag`. Sin índices que reconstruir ni modelos que descargar:
los dos motores releen el vault al vuelo, así que puedes seguir editando en
Obsidian sin miedo.

## Los principios (por si te preguntas por qué es así)

- **La escasez es el significado.** Las sugerencias de conexión solo aparecen
  cuando son fuertes (y como mucho dos). Enlazarlo todo con todo es lo mismo que
  no enlazar nada.
- **Enlazar es decisión tuya.** El sistema sugiere; tú decides. Ninguna conexión
  se crea como efecto secundario.
- **El vault manda.** El servidor relee siempre y no cachea: edita a mano, usa
  Obsidian, sincroniza con lo que quieras. Escritura atómica y frontmatter
  editado línea a línea — tu formato no se toca.
- **El contexto se paga.** Respuestas en JSON compacto, búsquedas acotadas,
  diagnósticos con techo. Las tools de solo lectura van marcadas (`readOnlyHint`)
  y la única destructiva (`concepto_fusionar`) también, para que tu cliente pida
  confirmación donde toca.

## Desarrollo

```bash
npm install
npm test
```

## Licencia

MIT. Úsalo, cámbialo, hazlo tuyo.
