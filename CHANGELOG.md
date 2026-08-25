# Changelog

## v0.1.3 (2026-08-26)

Instalar y empezar deja de tener letra pequeña, el servidor aprende a
presentarse, y dos correcciones de fondo en el motor de búsqueda.

### El servidor se presenta

- **`instructions` en el handshake MCP.** Hasta ahora el asistente recibía quince
  tools sueltas y ninguna idea de que formaban un sistema: todo dependía de que el
  usuario supiera pedir cada cosa por su nombre, y el onboarding guiado —los cinco
  minutos que convierten una instalación en un second brain plantado— no lo
  descubría nadie. Ahora el servidor le cuenta al modelo qué es esto, dónde vive el
  vault, los cuatro gestos del día a día y las reglas que evitan destrozos (no
  inventar contenido, no enlazar sin permiso, conceptos escasos, títulos que
  afirman).
- **`resurgir` por iniciativa propia.** El README prometía que las notas
  relacionadas aparecen solas, y no aparecían nunca: solo salían si el usuario
  preguntaba. Las instrucciones mandan ahora traer de vuelta lo que ya pensó, con
  su enlace, cuando la conversación toca un tema sobre el que pueda haber escrito.
- **Las tools de lectura se describen por cuándo usarlas**, no por lo que hacen por
  dentro. Al modelo no le sirve «appendea una línea a ## Notas».

### Distribución

- **La ficha del registro MCP deja de pedir `BRAIN_VAULT` como obligatorio** y
  cambia el listado de funciones por lo que uno se lleva. Es la boca del embudo:
  el 100% del tráfico entra por ahí, y decía que hacía falta configurar una
  variable justo en la versión en que ya no hace falta.
- **Un camino de vuelta.** 380 descargas y cero stars, cero issues. No hay
  analítica ni la va a haber —las notas no salen del disco de nadie—, así que la
  portada del vault y el final del onboarding dicen de dónde salió esto, en una
  línea y sin insistir.

### Los primeros sesenta segundos

- **Funciona sin configurar nada.** Antes, sin `BRAIN_VAULT` el proceso salía con
  código 1 y el cliente MCP lo pintaba como «server failed to start»; el mensaje
  que explicaba qué faltaba iba a stderr, donde nadie mira. Ahora hay vault por
  defecto en `~/second-brain`, andamiado al arrancar con sus tres carpetas y su
  portada. Instalar es una línea sin variables de entorno.
- **Una ruta mal escrita ya no se escribe a ciegas.** El fallo contrario, y
  silencioso: una ruta con un typo arrancaba igual y plantaba un vault entero en
  una carpeta fantasma mientras el usuario creía estar escribiendo en su Obsidian.
  Ahora, si la ruta no existe y su carpeta contenedora tampoco, el servidor
  arranca —para que el aviso se vea en la conversación y no en un log— y toda
  tool responde explicando qué ruta se pidió y cómo arreglarlo. Si el padre sí
  existe, la carpeta se crea sin preguntar: eso es lo que el usuario quería.
- **El enlace de Obsidian estaba roto justo en el camino nuevo.** Se construía como
  `obsidian://open?vault=<nombre de la carpeta>&file=<ruta relativa>`, que obliga a
  adivinar cómo se llama el vault dentro de la app. Fallaba en el vault por defecto
  —nadie lo ha dado de alta en Obsidian— y en un `BRAIN_VAULT` que apunte a una
  subcarpeta de un vault de verdad, que es justo lo que invita a hacer el README.
  Es decir: toda nota creada por la instalación de una línea devolvía un enlace
  muerto. Ahora va por ruta absoluta (`path=`) y es Obsidian quien resuelve a qué
  vault pertenece el fichero.
- **El bundle de doble clic tampoco pide carpeta.** El `.mcpb` la declaraba
  obligatoria: el mismo fallo que se acaba de quitar del registro, en el único
  camino de instalación sin terminal. Ahora es opcional y en blanco significa
  `~/second-brain`. Para que eso sea seguro, el servidor descarta como «no
  configurado» lo que llega vacío, en blancos, o como una plantilla `${...}` que
  el cliente no expandió —que es lo que manda un manifiesto cuando el usuario no
  elige nada—. Antes, tomar ese literal por una ruta habría plantado una carpeta
  con ese nombre allá donde el cliente tuviera el directorio de trabajo.
- README reordenado: primero la instalación de una línea, que es la que usa
  todo el mundo.

### Motor de búsqueda

Dos correcciones de fondo: `resurgir` era ciego a las siglas y dos
enlaces simultáneos podían dejar una nota incoherente.

- **`resurgir` encuentra siglas.** El tokenizador descartaba cualquier término de
  menos de cuatro letras, así que "RAG", "LLM", "MCP", "ML", "IA", "API" o "SQL"
  no encontraban nada — ni en modo `lexico` ni en modo `rag` — aunque fueran el
  título o el tema de la nota. Ahora el umbral es de dos caracteres y quien filtra
  es la lista de stopwords, que se ha ampliado con las palabras de función cortas.
- **Coincidencia anclada al inicio de palabra.** Consecuencia de lo anterior: con
  siglas de dos letras, buscar por substring habría hecho que "IA" casara dentro
  de "materia" o "experiencia". Los términos se anclan ahora al principio de
  palabra y siguen libres por el final, que es lo que da el plural gratis
  ("hábito" sigue encontrando "hábitos").
- **Las stopwords ya no llevan tilde.** Estaban escritas acentuadas y se
  consultaban después de normalizar, así que "más" o "qué" nunca se filtraban.
- **`nota_enlazar` en paralelo ya no corrompe la nota.** `agregarWikilinkALista`
  hacía leer-modificar-escribir sin pasar por `conLock`, al contrario que el resto
  de escrituras. Con varias llamadas simultáneas —el caso normal, porque
  `nota_permanente` devuelve hasta dos sugerencias de conexión y el asistente las
  encadena a la vez— se perdían enlaces y el frontmatter acababa diciendo una cosa
  y `## Conexiones` otra.
- **Temporales de escritura únicos.** El nombre del fichero temporal era
  `ruta.PID.milisegundo.tmp`, que colisiona con dos escrituras concurrentes dentro
  del mismo milisegundo: una renombraba y la otra fallaba con ENOENT.

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
