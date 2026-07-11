import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as c from '../src/cerebro.js';
import { stem, tokenizarRag } from '../src/rag.js';

async function vaultVacio() {
  return mkdtemp(join(tmpdir(), 'second-brain-rag-'));
}

test('stem: plurales y sufijos frecuentes, sin pasarse', () => {
  assert.equal(stem('habitos'), stem('habito'));
  assert.equal(stem('notas'), stem('nota'));
  assert.equal(stem('papeles'), stem('papel'));
  assert.equal(stem('conexiones'), stem('conexion'));
  // conservador: palabras distintas no se fusionan
  assert.notEqual(stem('carta'), stem('cartel'));
});

test('tokenizarRag normaliza tildes y aplica stemming', () => {
  const stems = tokenizarRag('Los hábitos atómicos crean sistemas');
  assert.ok(stems.includes(stem('habito')));
  assert.ok(stems.includes(stem('sistema')));
});

test('resurgir modo rag devuelve el fragmento que responde, no la nota entera', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, {
    titulo: 'El entorno decide por ti',
    contenido: 'Primer párrafo sobre otra cosa cualquiera.\n\nDiseñar el entorno vence a la fuerza de voluntad: esconde el móvil y aparece el foco.\n\nTercer párrafo de relleno.',
  });
  await c.notaPermanente(vault, { titulo: 'Nota sin relación', contenido: 'Habla de cocina y recetas.' });

  const r = await c.resurgir(vault, { texto: 'fuerza de voluntad y entorno', modo: 'rag' });
  assert.equal(r.modo, 'rag');
  assert.equal(r.resultados[0].titulo, 'El entorno decide por ti');
  assert.match(r.resultados[0].fragmento, /vence a la fuerza de voluntad/);
  assert.ok(!r.resultados[0].fragmento.includes('cocina'));
});

test('modo rag casa singular/plural vía stemming ("hábito" encuentra "hábitos")', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, {
    titulo: 'Los habitos se apilan',
    contenido: 'Cada hábito nuevo se ancla a uno existente.',
  });
  const r = await c.resurgir(vault, { texto: 'construir un hábito', modo: 'rag' });
  assert.equal(r.resultados[0].titulo, 'Los habitos se apilan');
});

test('un fragmento por nota: la misma nota no acapara el ranking', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, {
    titulo: 'Nota repetitiva',
    contenido: 'El foco importa.\n\nEl foco importa mucho.\n\nEl foco lo es todo.',
  });
  await c.notaPermanente(vault, { titulo: 'Otra sobre foco', contenido: 'El foco también vive aquí.' });
  const r = await c.resurgir(vault, { texto: 'el foco', modo: 'rag', limite: 3 });
  const ficheros = r.resultados.map((x) => x.fichero);
  assert.equal(new Set(ficheros).size, ficheros.length);
});

test('BRAIN_MODO=rag cambia el motor por defecto y modo inválido falla', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Una idea', contenido: 'Texto de la idea sobre grafos.' });
  process.env.BRAIN_MODO = 'rag';
  try {
    const r = await c.resurgir(vault, { texto: 'grafos' });
    assert.equal(r.modo, 'rag');
  } finally {
    delete process.env.BRAIN_MODO;
  }
  await assert.rejects(() => c.resurgir(vault, { texto: 'grafos', modo: 'turbo' }), /modo debe ser/);
});

test('la guía hacia rag sale solo cuando toca: brain grande + búsqueda floja, y una vez por sesión', async () => {
  const vault = await vaultVacio();
  // Una nota cuyo TÍTULO casa fuerte (score >= 5) y varias de relleno.
  await c.notaPermanente(vault, { titulo: 'Grafos de conocimiento grafos', contenido: 'grafos por todas partes: grafos, grafos.' });
  for (let i = 0; i < 4; i++) {
    await c.notaPermanente(vault, { titulo: `Relleno numero ${i}`, contenido: `apunte cualquiera ${i}` });
  }
  process.env.BRAIN_RAG_UMBRAL = '3';
  try {
    // Búsqueda FUERTE por encima del umbral: no se molesta con sugerencias.
    const fuerte = await c.resurgir(vault, { texto: 'grafos de conocimiento' });
    assert.ok(fuerte.resultados[0].score >= 5);
    assert.equal(fuerte.sugerencia, undefined);

    // Búsqueda FLOJA por encima del umbral: guía hacia rag, con el porqué.
    const floja = await c.resurgir(vault, { texto: 'apunte cualquiera' });
    assert.ok((floja.resultados[0]?.score ?? 0) < 5);
    assert.match(floja.sugerencia, /modo: "rag"/);

    // Y no insiste: la siguiente búsqueda floja de la misma sesión va limpia.
    const repite = await c.resurgir(vault, { texto: 'apunte cualquiera' });
    assert.equal(repite.sugerencia, undefined);

    // En modo rag no hay nada que sugerir.
    const rag = await c.resurgir(vault, { texto: 'apunte cualquiera', modo: 'rag' });
    assert.equal(rag.sugerencia, undefined);
  } finally {
    delete process.env.BRAIN_RAG_UMBRAL;
  }
});
