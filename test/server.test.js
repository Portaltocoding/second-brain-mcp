import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVER = join(AQUI, '..', 'src', 'server.js');

test('second-brain expone las 13 tools del grafo y funciona extremo a extremo', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'second-brain-server-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, BRAIN_VAULT: vault },
  });
  const client = new Client({ name: 'test', version: '0.0.1' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'concepto_crear',
      'concepto_fusionar',
      'jardin',
      'mini_listar',
      'mini_nota',
      'mini_promover',
      'lectura_crear',
      'lectura_actualizar',
      'lectura_nota',
      'nota_enlazar',
      'nota_permanente',
      'resurgir',
      'vault_buscar',
    ].sort());

    // annotations: las tools de lectura se declaran readOnly; fusionar, destructiva
    const porNombre = new Map(tools.map((t) => [t.name, t]));
    for (const lectura of ['resurgir', 'jardin', 'vault_buscar', 'mini_listar']) {
      assert.equal(porNombre.get(lectura).annotations?.readOnlyHint, true, `${lectura} debería ser readOnly`);
    }
    assert.equal(porNombre.get('concepto_fusionar').annotations?.destructiveHint, true);

    // y funciona de verdad: crear una idea y resurgirla
    await client.callTool({ name: 'nota_permanente', arguments: { titulo: 'Idea brain', contenido: 'sistemas y hábitos' } });
    const r = await client.callTool({ name: 'resurgir', arguments: { texto: 'diseñar sistemas' } });
    const datos = JSON.parse(r.content[0].text);
    assert.equal(datos.resultados[0].titulo, 'Idea brain');
  } finally {
    await client.close();
  }
});

test('sin BRAIN_VAULT el servidor NO se muere: andamia el vault por defecto en ~/second-brain', async () => {
  // Antes salía con código 1 y el cliente MCP lo pintaba como «failed to start».
  // Ahora el producto funciona sin configurar nada.
  const casa = await mkdtemp(join(tmpdir(), 'second-brain-home-'));
  const env = { ...process.env, HOME: casa, USERPROFILE: casa };
  delete env.BRAIN_VAULT;

  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  const r = await client.callTool({ name: 'nota_permanente', arguments: { titulo: 'Primera sin configurar', contenido: 'funciona a la primera' } });
  await client.close();

  assert.equal(r.isError, undefined, 'la escritura debe funcionar sin configuración alguna');
  const escrita = join(casa, 'second-brain', '50-Notas', 'Primera sin configurar.md');
  assert.match(await readFile(escrita, 'utf8'), /funciona a la primera/);
  // y el andamiaje queda listo para abrirlo con Obsidian
  assert.match(await readFile(join(casa, 'second-brain', 'Inicio.md'), 'utf8'), /Segundo cerebro/);
});

test('una ruta mal escrita no se escribe a ciegas: el aviso llega al chat, no a un log', async () => {
  // El fallo silencioso: antes arrancaba y plantaba el vault en una carpeta
  // fantasma mientras el usuario creía escribir en su Obsidian.
  const casa = await mkdtemp(join(tmpdir(), 'second-brain-typo-'));
  const typo = join(casa, 'Obsidiam', 'Bault'); // ni la carpeta ni su padre existen

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, HOME: casa, USERPROFILE: casa, BRAIN_VAULT: typo },
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport); // arranca igual: el aviso tiene que verse en el chat
  const r = await client.callTool({ name: 'nota_permanente', arguments: { titulo: 'No debe existir', contenido: 'x' } });
  await client.close();

  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /no existe y su carpeta contenedora tampoco/);
  await assert.rejects(() => readFile(join(typo, '50-Notas', 'No debe existir.md'), 'utf8'), /ENOENT/);
});

test('una ruta nueva cuyo padre SÍ existe se crea sin rechistar: es lo que el usuario quería', async () => {
  const casa = await mkdtemp(join(tmpdir(), 'second-brain-nuevo-'));
  const destino = join(casa, 'cerebro'); // casa existe, cerebro no

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, HOME: casa, USERPROFILE: casa, BRAIN_VAULT: destino },
  });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  const r = await client.callTool({ name: 'nota_permanente', arguments: { titulo: 'Idea', contenido: 'contenido' } });
  await client.close();

  assert.equal(r.isError, undefined);
  assert.match(await readFile(join(destino, '50-Notas', 'Idea.md'), 'utf8'), /contenido/);
});

test('resources: las notas se listan y se leen como Markdown completo', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'second-brain-resources-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, BRAIN_VAULT: vault },
  });
  const client = new Client({ name: 'test', version: '0.0.1' });
  await client.connect(transport);
  try {
    await client.callTool({
      name: 'nota_permanente',
      arguments: { titulo: 'La escasez es el significado', contenido: 'Un enlace vale por su porqué.', temas: ['grafos'] },
    });

    const { resources } = await client.listResources();
    const nombres = resources.map((r) => r.name);
    assert.ok(nombres.includes('La escasez es el significado'));
    assert.ok(nombres.includes('Grafos')); // el tema materializado como concepto

    const nota = resources.find((r) => r.name === 'La escasez es el significado');
    const leida = await client.readResource({ uri: nota.uri });
    assert.equal(leida.contents[0].mimeType, 'text/markdown');
    assert.match(leida.contents[0].text, /tipo: permanente/);
    assert.match(leida.contents[0].text, /Un enlace vale por su porqué\./);

    // traversal: un titulo con ../ no puede salir del vault
    await assert.rejects(() => client.readResource({ uri: 'vault://nota/..%2F..%2Fetc%2Fpasswd' }));
  } finally {
    await client.close();
  }
});

test('--init crea las tres carpetas y la portada, y es idempotente', async () => {
  const { spawn } = await import('node:child_process');
  const { readFile: leer, writeFile: escribir, access } = await import('node:fs/promises');
  const destino = await mkdtemp(join(tmpdir(), 'second-brain-init-'));
  const correr = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [SERVER, '--init', destino]);
    p.on('exit', (code) => resolve(code));
  });
  assert.equal(await correr(), 0);
  for (const d of ['40-Lecturas', '50-Notas', '60-Conceptos']) {
    await access(join(destino, d)); // lanza si no existe
  }
  assert.match(await leer(join(destino, 'Inicio.md'), 'utf8'), /Segundo cerebro/);

  // idempotente: una portada editada a mano sobrevive a un segundo --init
  await escribir(join(destino, 'Inicio.md'), 'mi portada propia\n');
  assert.equal(await correr(), 0);
  assert.equal(await leer(join(destino, 'Inicio.md'), 'utf8'), 'mi portada propia\n');
});

test('el prompt ingerir existe y devuelve el procedimiento con el texto y el modo', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'second-brain-prompt-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, BRAIN_VAULT: vault },
  });
  const client = new Client({ name: 'test', version: '0.0.1' });
  await client.connect(transport);
  try {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ['empezar', 'ingerir', 'ingest', 'start']);

    const r = await client.getPrompt({
      name: 'ingerir',
      arguments: { texto: 'El entorno decide más que la voluntad.', modo: 'directo', fuente: 'Hábitos Atómicos' },
    });
    const cuerpo = r.messages[0].content.text;
    assert.match(cuerpo, /MODO: directo/);
    assert.match(cuerpo, /FUENTE: Hábitos Atómicos/);
    assert.match(cuerpo, /El entorno decide más que la voluntad\./);
    assert.match(cuerpo, /DECISIÓN/); // los pasos que son del usuario están marcados

    // sin modo ni fuente: auto y ninguna declarada
    const auto = await client.getPrompt({ name: 'ingerir', arguments: { texto: 'algo' } });
    assert.match(auto.messages[0].content.text, /MODO: auto/);
    assert.match(auto.messages[0].content.text, /FUENTE: ninguna declarada/);

    // el onboarding: guiado, con decisiones del usuario marcadas y los tres gestos
    const onboarding = await client.getPrompt({ name: 'empezar', arguments: { contexto: 'está leyendo Deep Work' } });
    const guia = onboarding.messages[0].content.text;
    assert.match(guia, /CONTEXTO QUE YA SABES: está leyendo Deep Work/);
    assert.match(guia, /DECISIÓN/);
    assert.match(guia, /jardin/);
    const sinContexto = await client.getPrompt({ name: 'empezar', arguments: {} });
    assert.doesNotMatch(sinContexto.messages[0].content.text, /CONTEXTO QUE YA SABES/);
    assert.match(sinContexto.messages[0].content.text, /Lecturas.*Ideas.*Conceptos/s); // el diagrama del paso 1

    // los alias ingleses devuelven el mismo procedimiento
    const alias = await client.getPrompt({ name: 'start', arguments: {} });
    assert.equal(alias.messages[0].content.text, sinContexto.messages[0].content.text);
    const aliasIngesta = await client.getPrompt({ name: 'ingest', arguments: { texto: 'algo' } });
    assert.match(aliasIngesta.messages[0].content.text, /MODO: auto/);
  } finally {
    await client.close();
  }
});

test('el cliente recibe instructions: el asistente sabe qué es esto sin que le nombren una tool', async () => {
  // Sin esto el modelo ve quince tools sueltas y el onboarding no lo descubre nadie.
  const vault = await mkdtemp(join(tmpdir(), 'second-brain-instr-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { ...process.env, BRAIN_VAULT: vault },
  });
  const client = new Client({ name: 'test', version: '0.0.1' });
  await client.connect(transport);
  try {
    const instrucciones = client.getInstructions();
    assert.ok(instrucciones, 'el servidor debe declarar instructions');
    assert.ok(instrucciones.includes(vault), 'las instrucciones dicen dónde vive el vault');
    // lo que convierte una instalación en un second brain vivo
    assert.match(instrucciones, /empezar/, 'ofrecen el onboarding sobre vault vacío');
    assert.match(instrucciones, /INICIATIVA PROPIA/, 'mandan usar resurgir sin que se lo pidan');
  } finally {
    await client.close();
  }
});

test('BRAIN_VAULT vacío o sin expandir no es una ruta: se crea el vault por defecto', async () => {
  // El manifiesto del .mcpb declara env BRAIN_VAULT: "${user_config.vault}" y esa
  // carpeta es opcional. Si el usuario no elige ninguna, aquí llega "" o el literal
  // sin resolver; tomarlo por ruta plantaría una carpeta llamada así en el cwd.
  for (const valor of ['', '   ', '${user_config.vault}']) {
    const casa = await mkdtemp(join(tmpdir(), 'second-brain-vacio-'));
    const cwd = await mkdtemp(join(tmpdir(), 'second-brain-cwd-'));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER],
      cwd,
      env: { ...process.env, HOME: casa, USERPROFILE: casa, BRAIN_VAULT: valor },
    });
    const client = new Client({ name: 'test', version: '0.0.1' });
    await client.connect(transport);
    try {
      const r = await client.callTool({ name: 'nota_permanente', arguments: { titulo: 'Va al de casa', contenido: 'x' } });
      assert.equal(r.isError, undefined, `con BRAIN_VAULT=${JSON.stringify(valor)} debería funcionar`);
      const datos = JSON.parse(r.content[0].text);
      assert.equal(datos.ruta, join(casa, 'second-brain', '50-Notas', 'Va al de casa.md'));
      // y NO ha plantado una carpeta con el nombre del placeholder donde estuviera el cwd
      assert.deepEqual(await readdir(cwd), [], 'el directorio de trabajo queda intacto');
    } finally {
      await client.close();
    }
  }
});
