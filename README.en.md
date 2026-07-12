# second-brain-mcp

[Español](README.md) · **English**

![npm](https://img.shields.io/npm/v/%40toportal%2Fsecond-brain-mcp)
![tests](https://github.com/Portaltocoding/second-brain-mcp/actions/workflows/test.yml/badge.svg)
![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)

Your second brain, in your Obsidian vault, talking to your assistant.

This is an MCP server that turns a folder of Markdown into a real second brain:
you capture what you read, turn it into ideas in your own words, and those ideas
connect into a graph that thinks with you: when you work on something, the
related notes show up on their own.

> **Heads-up:** the tool names and their vocabulary are in Spanish, on purpose.
> This project was born in Spanish and keeps its voice; your assistant handles
> the language for you either way (ask in English, it calls `resurgir` just
> fine). This page translates everything else.

Everything lives in your files. No databases, no cloud, no magic you cannot
open with a text editor.

## How it feels

You tell your assistant:

> "I'm reading Atomic Habits, note this down: environment beats willpower"

and it creates the reading if it did not exist, saves the note, and when that
idea matures it becomes a permanent note linked to the `[[Hábitos]]` concept,
which in turn accumulates everything you have ever thought about the topic,
whatever book it came from.

Weeks later, working on something else, you ask about designing your morning
routine and the system brings back *"Environment decides for you"* with the
exact paragraph. That is the second brain: it remembers so you do not have to.

## The map

Each label reads `method / what it is`; the two main doors also show the phrase
that triggers them:

```
                              you + your assistant
                                   │      ▲
                ingerir / ingest   │      │ resurgir / recall
                  "add this"       ▼      │   "what do I know about this?"
                            ┌──────────────┐
                            │ second-brain │
                            └───────┬──────┘
                      classifies what comes in
       ┌────────────────────────────┼───────────────────────────┐
       │ lectura_crear / reading    │ nota_permanente / idea    │ mini_nota / rough note
       │ lectura_nota / notes       │                           │
       ▼                            ▼                           ▼
┌──────────────┐             ┌─────────────┐           ┌────────────────┐
│ 40-Lecturas/ │             │  50-Notas/  │           │ project/brain/ │
│ what comes in│             │ what stays  │           │ the workshop   │
└──────┬───────┘             └──────┬──────┘           └────────┬───────┘
       │                            │                           │
       │ nota_permanente /          │ topics                    │ mini_promover /
       │ the idea matures           │                           │ matured or resonates
       └───────────────────────────▶│───────────┐               │
                                    │           ▼               │
              nota_enlazar /        │   ┌───────────────┐       │
              link two ideas,       │   │ 60-Conceptos/ │◀──────┘
              with a reason         ▼   │ what connects │
                              other ideas└───────────────┘

     jardin / pruning "how is the garden?" · concepto_fusionar / merge split nodes
     vault_buscar / grep "find where I said X" · mini_listar / workshop harvest
```

## Install

### No terminal: double click and done

If you use **Claude Desktop** and want nothing to do with commands or JSON,
download
[`second-brain.mcpb`](https://github.com/Portaltocoding/second-brain-mcp/releases/latest/download/second-brain.mcpb)
and double-click it: Claude Desktop opens it, asks you to pick the folder
where your brain will live (your Obsidian vault if you have one, or any empty
folder) and that is it. No Node install, no config files. And if you also want
to see your brain drawn as a graph, install [Obsidian](https://obsidian.md)
and open that same folder as a vault.

### With a terminal

You need Node 18+ and a folder for the vault (your existing Obsidian vault
works: the server only writes into three subfolders and touches nothing else).

With **Claude Code**, at user scope (available in all your projects):

```bash
claude mcp add --scope user second-brain \
  --env BRAIN_VAULT=/path/to/your/vault \
  -- npx -y @toportal/second-brain-mcp
```

With any other MCP client:

```json
{
  "mcpServers": {
    "second-brain": {
      "command": "npx",
      "args": ["-y", "@toportal/second-brain-mcp"],
      "env": { "BRAIN_VAULT": "/path/to/your/vault" }
    }
  }
}
```

That is it. The first note creates whatever folders are missing. If you prefer
the vault scaffolded from the start (folders plus a home page):

```bash
npx -y @toportal/second-brain-mcp --init /path/to/your/vault
```

It is idempotent: on an existing vault it changes nothing.

### Environment variables

| Variable | What it does | Default |
|---|---|---|
| `BRAIN_VAULT` | Path to your vault (required; also works as first CLI argument) | none |
| `BRAIN_MODO` | `resurgir` engine: `lexico` or `rag` | `lexico` |
| `BRAIN_RAG_UMBRAL` | Note count from which rag mode may be suggested | `50` |

## Try it in 30 seconds

The repo ships a pre-woven example vault in `ejemplo/`, with two readings, four
ideas and four concepts all connected, so you can watch the graph work before
writing a single note of your own:

```bash
git clone https://github.com/Portaltocoding/second-brain-mcp
cd second-brain-mcp && npm install
claude mcp add second-brain --env BRAIN_VAULT=$PWD/ejemplo -- node src/server.js
```

Then ask your assistant something like "what do I know about willpower?". You
can also open the `ejemplo/` folder as a vault in Obsidian and see the graph
drawn out.

## A real session

This is what daily use looks like, without learning a single tool:

> **You:** add the key points of this to my second brain: *"for weeks now I've
> noticed that if I leave my phone in another room in the morning I get two
> hours of uninterrupted work, and if it sits next to me I work in ten-minute
> bursts between glances"*
>
> **Assistant:** this is your own digested thought, so it goes in as a
> permanent note in distill mode. The strong idea I see: **"Physical distance
> to the phone sets the depth of the work"**, with the concepts `Foco` and
> `Entorno`, which already exist in your graph. Create it like that?
>
> **You:** go
>
> **Assistant:** created. And it resonates strongly with **"El foco se diseña,
> no se invoca"** (score 8): both are about preparing the environment instead
> of trusting willpower. Link them with that reason?
>
> **You:** yes
>
> **Assistant:** linked, reason written into both notes. Here is the link to
> open it in Obsidian: `obsidian://open?vault=...`

Notice the order: the assistant proposes, you decide, and every connection
keeps its written reason. That is the whole system.

## The three folders

```
your-vault/
├── 40-Lecturas/     what comes in: books, articles, videos, courses
├── 50-Notas/        what stays: permanent ideas, yours, your title
└── 60-Conceptos/    what connects: each topic is a real note with backlinks
```

The golden rule: **nothing enters loose**. Every idea links to its source, to
the concepts it touches and, sparingly, to other ideas. Sparingly matters: at
most 2-3 related notes, each link with its written reason. A drawer with twelve
links connects nothing; three links with a reason are a map.

## What it can do

**Capture.** `lectura_crear` opens the card for a book or article;
`lectura_nota` saves notes while you read ("ch. 3: ..."); when an idea is truly
yours, `nota_permanente` promotes it to `50-Notas/` with its topics turned into
navigable concepts. `nota_enlazar` joins two ideas and writes down *why*.

**Think.** `resurgir` is the heart: give it a text (a task, a doubt, a
half-formed idea) and it returns your most connected notes. It only shows up
when there is real overlap; if there is nothing, it does not invent.
`vault_buscar` is plain grep, capped so it never floods (20 results and it
tells you if there were more).

**Prune.** Graphs rot in silence. `jardin` shows you orphan notes, broken
links, undefined concepts, overconnected notes and duplicate concepts.
`concepto_fusionar` stitches split nodes back together.

**Per-project workshop.** Any repo can have its local `brain/` with rough notes
(`mini_nota`). `mini_listar` tells you which ones earned their way up (they
resonate strongly with what you already have, or they matured for a week) and
`mini_promover` promotes them. Workshop below, library above: promoting is
always your call.

## Ingestion: a single gesture

You do not need to learn the tools. Tell your assistant:

> "add this **as is** to my second brain"
> "add **the key points** of this"
> "note down what I'm writing"

and ingestion fires accordingly. The server ships the written procedure (MCP
prompt `ingerir`; in Claude Code it appears as the
`/mcp__second-brain__ingerir` command): it classifies the text (reading with a
source? your own idea? workshop note?), applies the mode (`directo` stores it
whole, `destilar` extracts the 1-3 strongest ideas *in your words* and shows
them before creating anything, `auto` decides and tells you), picks 2-4
concepts (preferring ones that already exist in your graph over inventing
synonyms), and weaves. The decisions are yours and are marked as such: which
ideas enter and which links get created. Works for a pasted paragraph, a
chapter, or that Word document you are writing: paste it or hand over the file.

## Reading notes: resources

Every note in the graph is also a readable MCP resource, so reading a full note
costs no tool call (and in Claude Code you can attach them with `@`):

```
vault://lectura/{titulo}
vault://nota/{titulo}
vault://concepto/{nombre}
```

The pattern that works: search cheap (`vault_buscar`, `resurgir`), read in full
only what matters (the resource).

## How it gets along with Obsidian

It is home. Everything is plain Markdown with native wikilinks: graph view,
backlinks and hover preview work without plugins. The server always re-reads
(never caches) and writes atomically, so you can edit in Obsidian while the
server runs and nothing steps on anything. `jardin` judges links the way
Obsidian does: case-insensitive.

Two useful details:

- Every created note returns an `abrir` link (`obsidian://open?...`): one click
  and you are inside the note in the app.
- `temas` and `relacionadas` live in properties (frontmatter). Obsidian treats
  them as real links, but to see them in graph view enable "Properties" in the
  graph settings.

> **What about Notion?** No. This server works on local Markdown files, and
> that is the point: your data is yours, opens with any editor, and the graph
> runs at disk speed, not API speed. Obsidian is not required either (any `.md`
> folder works); it is just the best viewer. Coming from Notion: export your
> notes as Markdown and drop them into the vault, and that does work.

## lexico mode and rag mode

`resurgir` has two engines, and the system tells you when to switch:

- **`lexico`** (default): scores matches where they mean the most: title ×3,
  topics ×2, body ×1. Direct and transparent; with a small or medium brain it
  is all you need.
- **`rag`**: BM25 over *fragments* with Spanish stemming: "hábito" finds
  "hábitos", and instead of only telling you *which* note connects, it returns
  **the exact paragraph that answers**, ready to use as context. Built for when
  the brain grows and notes get long.

Which one? Do not think about it: start on `lexico` and let the system guide
you. The rag suggestion appears **only when it should**, when both things
happen at once:

1. your brain is already a big pile of notes (50+, configurable with
   `BRAIN_RAG_UMBRAL`), **and**
2. the search you just ran came back weak on lexico (no results or below the
   strong-connection bar); exactly the moment rag would have helped.

And only once per session: it tells you, explains why, and does not insist. If
lexico finds strong matches, nobody interrupts you. Trying is free: repeat the
query with `modo: "rag"` and compare; if it convinces you, set
`BRAIN_MODO=rag`. No indexes to rebuild, no models to download: both engines
re-read the vault on the fly, so you can keep editing in Obsidian without fear.

## The principles (in case you wonder why it is like this)

- **Scarcity is meaning.** Connection suggestions only appear when they are
  strong (two at most). Linking everything to everything is the same as linking
  nothing.
- **Linking is your decision.** The system suggests; you decide. No connection
  is ever created as a side effect.
- **The vault rules.** The server always re-reads and never caches: edit by
  hand, use Obsidian, sync however you like. Atomic writes and line-level
  frontmatter edits: your formatting is never touched.
- **Context is paid for.** Compact JSON responses, capped searches, bounded
  diagnostics. Read-only tools are flagged (`readOnlyHint`) and the single
  destructive one (`concepto_fusionar`) too, so your client asks for
  confirmation exactly where it should.

## Development

```bash
npm install
npm test
```

## License

MIT. Use it, change it, make it yours.
