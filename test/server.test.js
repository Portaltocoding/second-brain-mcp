import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
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

test('el servidor exige BRAIN_VAULT (o el vault como argumento) para arrancar', async () => {
  const { spawn } = await import('node:child_process');
  const env = { ...process.env };
  delete env.BRAIN_VAULT;
  const salida = await new Promise((resolve) => {
    const p = spawn(process.execPath, [SERVER], { env });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('exit', (code) => resolve({ code, err }));
  });
  assert.equal(salida.code, 1);
  assert.match(salida.err, /BRAIN_VAULT/);
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
