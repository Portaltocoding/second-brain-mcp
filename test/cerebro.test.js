import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as c from '../src/cerebro.js';
import * as store from '../src/store.js';

async function vaultVacio() {
  return mkdtemp(join(tmpdir(), 'vida-vault-cerebro-'));
}

test('lectura_crear escribe el frontmatter esperado y evita duplicados', async () => {
  const vault = await vaultVacio();
  const r = await c.lecturaCrear(vault, { titulo: 'Clean Architecture', autor: 'Robert C. Martin', temas: ['software', 'arquitectura'] });
  assert.equal(r.creado, true);

  const texto = await readFile(r.ruta, 'utf8');
  assert.match(texto, /^tipo: lectura$/m);
  assert.match(texto, /^estado: por-leer$/m);
  assert.match(texto, /^formato: libro$/m);
  assert.match(texto, /^temas: \["\[\[Software\]\]", "\[\[Arquitectura\]\]"\]$/m);

  // cada tema se materializa como nodo-concepto navegable
  assert.match(await readFile(join(vault, '60-Conceptos', 'Software.md'), 'utf8'), /^tipo: concepto$/m);
  assert.match(await readFile(join(vault, '60-Conceptos', 'Arquitectura.md'), 'utf8'), /^tipo: concepto$/m);

  await assert.rejects(() => c.lecturaCrear(vault, { titulo: 'Clean Architecture' }), /ya existe una lectura/);
});

test('lectura_crear exige titulo y valida formato', async () => {
  const vault = await vaultVacio();
  await assert.rejects(() => c.lecturaCrear(vault, {}), /exige "titulo"/);
  await assert.rejects(() => c.lecturaCrear(vault, { titulo: 'x', formato: 'podcast' }), /formato debe ser una de/);
});

test('lectura_nota appendea a ## Notas mientras leo, con y sin ubicación', async () => {
  const vault = await vaultVacio();
  const r = await c.lecturaCrear(vault, { titulo: 'X' });
  await c.lecturaNota(vault, { titulo: 'X', texto: 'idea con ubicacion', ubicacion: 'cap 3' });
  await c.lecturaNota(vault, { titulo: 'X', texto: 'idea sin ubicacion' });

  const texto = await readFile(r.ruta, 'utf8');
  assert.match(texto, /## Notas mientras leo\n- \(cap 3\) idea con ubicacion\n- idea sin ubicacion/);
});

test('lectura_nota falla si la lectura no existe', async () => {
  const vault = await vaultVacio();
  await assert.rejects(() => c.lecturaNota(vault, { titulo: 'no existe', texto: 'x' }), /usa lectura_crear primero/);
});

test('lectura_actualizar fija inicio al pasar a leyendo y fin al terminar; valida rango de valoracion', async () => {
  const vault = await vaultVacio();
  const r = await c.lecturaCrear(vault, { titulo: 'X' });

  await c.lecturaActualizar(vault, { titulo: 'X', estado: 'leyendo' });
  let texto = await readFile(r.ruta, 'utf8');
  assert.match(texto, /^estado: leyendo$/m);
  assert.match(texto, /^inicio: "\d{4}-\d{2}-\d{2}"$/m);
  assert.match(texto, /^fin:\s*$/m); // fin sigue vacío

  await c.lecturaActualizar(vault, { titulo: 'X', estado: 'terminada', valoracion: 4 });
  texto = await readFile(r.ruta, 'utf8');
  assert.match(texto, /^estado: terminada$/m);
  assert.match(texto, /^fin: "\d{4}-\d{2}-\d{2}"$/m);
  assert.match(texto, /^valoracion: 4$/m);

  await assert.rejects(() => c.lecturaActualizar(vault, { titulo: 'X', estado: 'pausada' }), /estado debe ser una de/);
  await assert.rejects(() => c.lecturaActualizar(vault, { titulo: 'X', valoracion: 9 }), /valoracion debe estar entre/);
});

test('nota_permanente enlaza origen, materializa temas y referencia de vuelta la lectura', async () => {
  const vault = await vaultVacio();
  await c.lecturaCrear(vault, { titulo: 'Clean Architecture', temas: ['arquitectura'] });
  const r = await c.notaPermanente(vault, {
    titulo: 'La regla de dependencia protege el dominio',
    contenido: 'Las dependencias solo apuntan hacia adentro.',
    origen: 'Clean Architecture',
    temas: ['arquitectura', 'diseño'],
  });
  assert.equal(r.creado, true);
  const texto = await readFile(r.ruta, 'utf8');
  assert.match(texto, /^tipo: permanente$/m);
  assert.match(texto, /^origen: "\[\[Clean Architecture\]\]"$/m);
  assert.match(texto, /^temas: \["\[\[Arquitectura\]\]", "\[\[Diseño\]\]"\]$/m);
  assert.match(texto, /^relacionadas: \[\]$/m);
  assert.match(texto, /Las dependencias solo apuntan hacia adentro\./);

  // la lectura de origen queda enlazada DE VUELTA a la idea en sus Ideas extraídas
  const lectura = await readFile(join(vault, '40-Lecturas', 'Clean Architecture.md'), 'utf8');
  assert.match(lectura, /## Ideas extraídas\n- \[\[La regla de dependencia protege el dominio\]\]/);

  await assert.rejects(
    () => c.notaPermanente(vault, { titulo: 'La regla de dependencia protege el dominio', contenido: 'x' }),
    /ya existe una nota permanente/,
  );
});

test('vault_buscar encuentra coincidencias con fichero/línea/contexto y filtra por tipo', async () => {
  const vault = await vaultVacio();
  await c.lecturaCrear(vault, { titulo: 'Clean Architecture', temas: ['arquitectura'] });
  await c.notaPermanente(vault, { titulo: 'Nota sobre arquitectura', contenido: 'algo sobre arquitectura limpia' });

  const sinFiltro = await c.vaultBuscar(vault, { query: 'arquitectura' });
  const ficheros = sinFiltro.resultados.map((r) => r.fichero).sort();
  assert.deepEqual(ficheros, [
    '40-Lecturas/Clean Architecture.md',
    '50-Notas/Nota sobre arquitectura.md',
    '60-Conceptos/Arquitectura.md',
  ]);
  assert.ok(sinFiltro.resultados[0].contexto.length > 0);
  assert.ok(typeof sinFiltro.resultados[0].numeroLinea === 'number');

  const soloPermanentes = await c.vaultBuscar(vault, { query: 'arquitectura', tipo: 'permanente' });
  assert.deepEqual(
    soloPermanentes.resultados.map((r) => r.fichero),
    ['50-Notas/Nota sobre arquitectura.md'],
  );
});

test('vault_buscar exige query y no falla en un vault vacío', async () => {
  const vault = await vaultVacio();
  await assert.rejects(() => c.vaultBuscar(vault, {}), /exige "query"/);
  const r = await c.vaultBuscar(vault, { query: 'nada' });
  assert.deepEqual(r.resultados, []);
});

test('nota_enlazar conecta dos notas permanentes en ambos sentidos y es idempotente', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Idea A', contenido: 'a' });
  await c.notaPermanente(vault, { titulo: 'Idea B', contenido: 'b' });
  await c.notaEnlazar(vault, { titulo: 'Idea A', con: 'Idea B' });

  const a = await readFile(join(vault, '50-Notas', 'Idea A.md'), 'utf8');
  const b = await readFile(join(vault, '50-Notas', 'Idea B.md'), 'utf8');
  assert.match(a, /^relacionadas: \["\[\[Idea B\]\]"\]$/m);
  assert.match(b, /^relacionadas: \["\[\[Idea A\]\]"\]$/m);

  await c.notaEnlazar(vault, { titulo: 'Idea A', con: 'Idea B' }); // no duplica
  assert.match(await readFile(join(vault, '50-Notas', 'Idea A.md'), 'utf8'), /^relacionadas: \["\[\[Idea B\]\]"\]$/m);

  await assert.rejects(() => c.notaEnlazar(vault, { titulo: 'Idea A', con: 'no existe' }), /no existe la nota permanente/);
});

test('concepto_crear define el concepto y enlaza (asegurando) los relacionados', async () => {
  const vault = await vaultVacio();
  await c.conceptoCrear(vault, { nombre: 'hábitos', definicion: 'conductas automatizadas por repetición', relacionados: ['disciplina'] });

  const concepto = await readFile(join(vault, '60-Conceptos', 'Hábitos.md'), 'utf8');
  assert.match(concepto, /^tipo: concepto$/m);
  assert.match(concepto, /## Qué es\nconductas automatizadas por repetición/);
  assert.match(concepto, /## Relacionados\n- \[\[Disciplina\]\]/);
  // el concepto relacionado también se materializa como nodo
  assert.match(await readFile(join(vault, '60-Conceptos', 'Disciplina.md'), 'utf8'), /^tipo: concepto$/m);
});

test('resurgir puntúa título > temas > cuerpo y devuelve los términos que casaron', async () => {
  const vault = await vaultVacio();
  await c.lecturaCrear(vault, { titulo: 'Atomic Habits', temas: ['hábitos'] });
  await c.notaPermanente(vault, { titulo: 'Los sistemas ganan a las metas', contenido: 'no subes al nivel de tus metas', temas: ['hábitos', 'sistemas'] });
  await c.notaPermanente(vault, { titulo: 'Nota irrelevante', contenido: 'sobre jardinería japonesa' });

  const r = await c.resurgir(vault, { texto: 'diseñar sistemas de hábitos diarios' });
  assert.ok(r.resultados.length >= 2);
  // la nota con 'sistemas' en el TÍTULO y 'hábitos' en temas debe ganar
  assert.equal(r.resultados[0].titulo, 'Los sistemas ganan a las metas');
  assert.ok(r.resultados[0].score > r.resultados[1].score);
  assert.ok(r.resultados[0].terminos.includes('sistemas'));
  // la irrelevante no aparece
  assert.ok(!r.resultados.some((x) => x.titulo === 'Nota irrelevante'));
});

test('resurgir sin solape devuelve vacío, no ruido', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Algo', contenido: 'cualquier cosa' });
  const r = await c.resurgir(vault, { texto: 'astrofísica cuántica relativista' });
  assert.deepEqual(r.resultados, []);
});

test('jardin detecta huérfanas, wikilinks rotos y conceptos vacíos', async () => {
  const vault = await vaultVacio();
  // conectada: lectura + nota con origen (backlink real)
  await c.lecturaCrear(vault, { titulo: 'Libro A', temas: ['tema'] });
  await c.notaPermanente(vault, { titulo: 'Idea conectada', contenido: 'x', origen: 'Libro A' });
  // huérfana: nota suelta sin enlaces en ningún sentido
  await c.notaPermanente(vault, { titulo: 'Idea suelta', contenido: 'sin conexión ninguna' });
  // rota: nota que enlaza a algo inexistente
  await c.notaPermanente(vault, { titulo: 'Idea con enlace roto', contenido: 'ver [[Nota Que No Existe]]' });
  // concepto vacío: materializado por el tema pero sin definición
  const j = await c.jardin(vault);
  assert.ok(j.huerfanas.includes('50-Notas/Idea suelta.md'), `huérfanas: ${j.huerfanas}`);
  assert.ok(j.rotos.some((r) => r.destino === 'Nota Que No Existe'));
  assert.ok(j.conceptosVacios.includes('60-Conceptos/Tema.md'));
  assert.equal(j.totales.lecturas, 1);
  assert.equal(j.totales.notas, 3);
});

test('nota_permanente sin relacionadas devuelve sugerencias de conexión (nunca enlaza sola)', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Los sistemas ganan a las metas', contenido: 'sistemas y hábitos', temas: ['sistemas'] });
  const r = await c.notaPermanente(vault, { titulo: 'Diseñar sistemas pequeños', contenido: 'los sistemas pequeños sobreviven' });
  assert.ok(r.sugerencias.length >= 1, 'debe sugerir la nota afín');
  assert.equal(r.sugerencias[0].titulo, 'Los sistemas ganan a las metas');
  // pero NO la enlazó sola:
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const cruda = await readFile(join(vault, '50-Notas', 'Diseñar sistemas pequeños.md'), 'utf8');
  assert.match(cruda, /^relacionadas: \[\]$/m);
});

test('mini-brain: nota cruda local, califica por resonancia, y la promoción sube al brain y marca la local', async () => {
  const vault = await vaultVacio();
  const proyecto = await mkdtemp(join(tmpdir(), 'proyecto-cuantica-'));

  // brain principal con algo que resuene
  await c.notaPermanente(vault, { titulo: 'El colapso decide la realidad', contenido: 'medir colapsa posibilidades cuanticas', temas: ['cuántica'] });

  // apunte de taller en el proyecto
  const r = await c.miniNota(vault, { dir: proyecto, titulo: 'Superposicion como potencia', contenido: 'la superposicion cuantica es potencia pura hasta medir', temas: ['cuántica'] });
  assert.equal(r.creado, true);
  const cruda = await readFile(join(proyecto, 'brain', 'Superposicion como potencia.md'), 'utf8');
  assert.match(cruda, /^tipo: mini$/m);
  assert.match(cruda, /^estado: cruda$/m);

  // lista: resuena con el brain y califica
  const lista = await c.miniListar(vault, { dir: proyecto });
  assert.equal(lista.notas.length, 1);
  assert.equal(lista.notas[0].titulo, 'Superposicion como potencia');
  assert.ok(lista.notas[0].resuena, 'debe resonar con el brain principal');
  assert.equal(lista.notas[0].califica, true);

  // promover: nota permanente en el vault + local marcada
  const p = await c.miniPromover(vault, { dir: proyecto, titulo: 'Superposicion como potencia' });
  assert.equal(p.promovida, true);
  const enVault = await readFile(join(vault, '50-Notas', 'Superposicion como potencia.md'), 'utf8');
  assert.match(enVault, /^tipo: permanente$/m);
  assert.match(enVault, /del taller de proyecto-cuantica/);
  const local = await readFile(join(proyecto, 'brain', 'Superposicion como potencia.md'), 'utf8');
  assert.match(local, /^estado: promovida$/m);

  // ya no aparece como cruda ni se puede re-promover
  assert.equal((await c.miniListar(vault, { dir: proyecto })).notas.length, 0);
  await assert.rejects(() => c.miniPromover(vault, { dir: proyecto, titulo: 'Superposicion como potencia' }), /ya está promovida/);
});

test('mini-brain exige dir absoluto y proyecto sin brain/ devuelve lista vacía', async () => {
  const vault = await vaultVacio();
  await assert.rejects(() => c.miniNota(vault, { dir: 'relativo', titulo: 'x', contenido: 'y' }), /absoluto/);
  const proyecto = await mkdtemp(join(tmpdir(), 'proyecto-vacio-'));
  assert.deepEqual((await c.miniListar(vault, { dir: proyecto })).notas, []);
});

test('precisión: las sugerencias solo traen conexiones fuertes (score>=5, máx 2)', async () => {
  const vault = await vaultVacio();
  // afín débil: una sola palabra suelta en el cuerpo → score < 5 → NO debe sugerirse
  await c.notaPermanente(vault, { titulo: 'Nota lejana', contenido: 'menciona sistemas una vez' });
  const r1 = await c.notaPermanente(vault, { titulo: 'Idea nueva cualquiera', contenido: 'los sistemas pequeños' });
  assert.deepEqual(r1.sugerencias, [], 'una coincidencia floja no es una sugerencia');
  // afín fuerte: término en TÍTULO y cuerpo → sí
  await c.notaPermanente(vault, { titulo: 'Los sistemas ganan a las metas', contenido: 'sistemas sistemas sistemas', temas: ['sistemas'] });
  const r2 = await c.notaPermanente(vault, { titulo: 'Sistemas que sobreviven solos', contenido: 'un sistema pequeño sobrevive' });
  assert.ok(r2.sugerencias.length >= 1 && r2.sugerencias.length <= 2);
  assert.ok(r2.sugerencias[0].score >= 5);
});

test('nota_enlazar con motivo lo escribe en ## Conexiones de ambas, y repetir no duplica', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Idea A', contenido: 'a' });
  await c.notaPermanente(vault, { titulo: 'Idea B', contenido: 'b' });
  const r = await c.notaEnlazar(vault, { titulo: 'Idea A', con: 'Idea B', motivo: 'ambas hablan del límite' });
  assert.equal(r.nuevo, true);
  const a = await readFile(join(vault, '50-Notas', 'Idea A.md'), 'utf8');
  const b = await readFile(join(vault, '50-Notas', 'Idea B.md'), 'utf8');
  assert.match(a, /## Conexiones\n- \[\[Idea B\]\]: ambas hablan del límite/);
  assert.match(b, /## Conexiones\n- \[\[Idea A\]\]: ambas hablan del límite/);
  // repetir: idempotente, sin línea duplicada
  const r2 = await c.notaEnlazar(vault, { titulo: 'Idea A', con: 'Idea B', motivo: 'ambas hablan del límite' });
  assert.equal(r2.nuevo, false);
  const a2 = await readFile(join(vault, '50-Notas', 'Idea A.md'), 'utf8');
  assert.equal((a2.match(/ambas hablan del límite/g) || []).length, 1);
});

test('jardin detecta sobreconectadas (>5 relacionadas) y conceptos duplicados', async () => {
  const vault = await vaultVacio();
  const titulos = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'];
  await c.notaPermanente(vault, { titulo: 'Cajón de sastre', contenido: 'x' });
  for (const t of titulos) {
    await c.notaPermanente(vault, { titulo: t, contenido: 'y' });
    await c.notaEnlazar(vault, { titulo: 'Cajón de sastre', con: t });
  }
  await c.conceptoCrear(vault, { nombre: 'Hábito' });
  await c.conceptoCrear(vault, { nombre: 'Habitos' });
  const j = await c.jardin(vault);
  assert.ok(j.sobreconectadas.some((s) => s.nota === '50-Notas/Cajón de sastre.md' && s.enlaces === 6));
  assert.ok(j.conceptosDuplicados.some((g) => g.includes('Hábito') && g.includes('Habitos')));
});

test('concepto_fusionar reescribe wikilinks en todo el vault, vuelca contenido y borra el duplicado', async () => {
  const vault = await vaultVacio();
  await c.conceptoCrear(vault, { nombre: 'Hábito', definicion: 'la definición buena' });
  await c.conceptoCrear(vault, { nombre: 'Habitos', definicion: 'apunte del duplicado', relacionados: ['Disciplina'] });
  await c.notaPermanente(vault, { titulo: 'Idea con dup', contenido: 'ver [[Habitos]] a fondo', temas: [] });

  const r = await c.conceptoFusionar(vault, { duplicado: 'Habitos', canonico: 'Hábito' });
  assert.equal(r.fusionado, true);
  assert.ok(r.reemplazos >= 1);

  const idea = await readFile(join(vault, '50-Notas', 'Idea con dup.md'), 'utf8');
  assert.match(idea, /\[\[Hábito\]\]/);
  assert.doesNotMatch(idea, /\[\[Habitos\]\]/);

  const canon = await readFile(join(vault, '60-Conceptos', 'Hábito.md'), 'utf8');
  assert.match(canon, /apunte del duplicado/);
  assert.match(canon, /\[\[Disciplina\]\]/);

  const { existeArchivo } = await import('../src/store.js');
  assert.equal(await existeArchivo(join(vault, '60-Conceptos', 'Habitos.md')), false, 'el duplicado debe desaparecer');
  // y el jardín ya no ve duplicados
  const j = await c.jardin(vault);
  assert.deepEqual(j.conceptosDuplicados, []);
});

test('vault_buscar respeta limite y marca truncado', async () => {
  const vault = await vaultVacio();
  for (let i = 0; i < 5; i++) {
    await c.notaPermanente(vault, { titulo: `Nota repetida ${i}`, contenido: 'palabra-unica aquí' });
  }
  const r = await c.vaultBuscar(vault, { query: 'palabra-unica', limite: 2 });
  assert.equal(r.resultados.length, 2);
  assert.equal(r.total, 5);
  assert.equal(r.truncado, true);
  const completo = await c.vaultBuscar(vault, { query: 'palabra-unica' });
  assert.equal(completo.truncado, false);
  assert.equal(completo.total, 5);
});

test('jardin acota cada lista a 30 y cuenta los omitidos', async () => {
  const vault = await vaultVacio();
  for (let i = 0; i < 33; i++) {
    await c.notaPermanente(vault, { titulo: `Huerfana ${i}`, contenido: `contenido aislado ${i} zzz${i}` });
  }
  const r = await c.jardin(vault);
  assert.equal(r.totales.notas, 33);
  assert.equal(r.huerfanas.length, 30);
  assert.equal(r.omitidos.huerfanas, 3);
});

test('jardin juzga los wikilinks como Obsidian: sin distinguir mayúsculas', async () => {
  const vault = await vaultVacio();
  await c.conceptoCrear(vault, { nombre: 'Foco' });
  // [[foco]] en minúsculas: Obsidian lo resuelve a Foco.md, el jardín no debe marcarlo roto
  await c.notaPermanente(vault, { titulo: 'El foco se diseña', contenido: 'Idea que menciona [[foco]] en el cuerpo.' });
  const r = await c.jardin(vault);
  assert.deepEqual(r.rotos, []);
  // y Foco no es huérfana: la nota la enlaza, aunque sea en minúsculas
  assert.ok(!r.huerfanas.includes('60-Conceptos/Foco.md'));
});

test('las creaciones devuelven el enlace obsidian:// para abrir la nota', async () => {
  const vault = await vaultVacio();
  const nota = await c.notaPermanente(vault, { titulo: 'Con enlace', contenido: 'idea' });
  assert.match(nota.abrir, /^obsidian:\/\/open\?vault=.+&file=50-Notas%2FCon%20enlace$/);
  const lectura = await c.lecturaCrear(vault, { titulo: 'Libro X' });
  assert.match(lectura.abrir, /^obsidian:\/\/open\?vault=/);
  const concepto = await c.conceptoCrear(vault, { nombre: 'Nodo' });
  assert.match(concepto.abrir, /file=60-Conceptos%2FNodo$/);
});

test('resurgir encuentra siglas de 2-3 letras (RAG, LLM) en título y en temas', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, {
    titulo: 'El RAG mejora con reranking',
    contenido: 'Un pipeline RAG puro pierde precisión; el reranker recupera lo que el retriever ordena mal.',
    temas: ['RAG', 'LLM'],
  });

  // el término está en el título y en el cuerpo
  const rag = await c.resurgir(vault, { texto: 'RAG' });
  assert.ok(rag.resultados.length >= 1, 'RAG debe encontrar la nota');
  assert.equal(rag.resultados[0].titulo, 'El RAG mejora con reranking');

  // LLM solo vive en temas: el peso ×2 del frontmatter tiene que bastar
  const llm = await c.resurgir(vault, { texto: 'LLM' });
  assert.ok(llm.resultados.some((r) => r.fichero === '50-Notas/El RAG mejora con reranking.md'));
});

test('resurgir ancla al inicio de palabra: una sigla no casa dentro de otra palabra', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, {
    titulo: 'La experiencia de la materia',
    contenido: 'Hablo de familia, materia y experiencia: ni una sola sigla por aquí.',
  });
  // "ia" como substring aparece en materia/familia/experiencia; como PALABRA, no
  const r = await c.resurgir(vault, { texto: 'IA' });
  assert.deepEqual(r.resultados, [], 'IA no debe casar dentro de "materia" ni "experiencia"');
});

test('resurgir sigue casando plurales tras anclar el inicio de palabra', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Los hábitos atómicos crean sistemas', contenido: 'Un hábito pequeño repetido vence a la fuerza de voluntad.' });
  const singular = await c.resurgir(vault, { texto: 'hábito' });
  const plural = await c.resurgir(vault, { texto: 'hábitos' });
  assert.equal(singular.resultados[0]?.titulo, 'Los hábitos atómicos crean sistemas');
  assert.equal(plural.resultados[0]?.titulo, 'Los hábitos atómicos crean sistemas');
});

test('las stopwords se filtran ya normalizadas (sin tilde) y no generan ruido', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Una idea cualquiera', contenido: 'Texto con más palabras que las que hacen falta.' });
  for (const ruido of ['la', 'es', 'más', 'qué']) {
    const r = await c.resurgir(vault, { texto: ruido });
    assert.deepEqual(r.resultados, [], `"${ruido}" es stopword y no debe puntuar`);
  }
});

test('nota_enlazar en paralelo: ni pierde enlaces ni deja la nota incoherente', async () => {
  const vault = await vaultVacio();
  await c.notaPermanente(vault, { titulo: 'Ancla', contenido: 'la nota que recibe los enlaces' });
  for (let i = 0; i < 4; i += 1) await c.notaPermanente(vault, { titulo: `Idea ${i}`, contenido: `cuerpo ${i}` });

  // El caso real: nota_permanente devuelve hasta 2 sugerencias y el asistente
  // encadena varias nota_enlazar a la vez sobre la MISMA nota.
  const res = await Promise.allSettled(
    [0, 1, 2, 3].map((i) => c.notaEnlazar(vault, { titulo: 'Ancla', con: `Idea ${i}`, motivo: `motivo ${i}` })),
  );
  assert.equal(res.filter((r) => r.status === 'rejected').length, 0, 'ninguna llamada debe fallar');

  const texto = await readFile(join(vault, '50-Notas', 'Ancla.md'), 'utf8');
  const frontmatter = texto.split('\n').find((l) => l.startsWith('relacionadas:'));
  const enFrontmatter = (frontmatter.match(/\[\[Idea \d\]\]/g) || []).length;
  const enConexiones = (texto.split('## Conexiones')[1] || '').trim().split('\n').filter(Boolean).length;
  assert.equal(enFrontmatter, 4, 'los cuatro enlaces deben quedar en relacionadas');
  assert.equal(enConexiones, 4, '## Conexiones debe decir lo mismo que el frontmatter');
});

test('escrituras atómicas concurrentes al mismo fichero no colisionan en el temporal', async () => {
  const vault = await vaultVacio();
  const ruta = join(vault, 'concurrente.md');
  const res = await Promise.allSettled([
    store.escribirAtomica(ruta, 'A'),
    store.escribirAtomica(ruta, 'B'),
    store.escribirAtomica(ruta, 'C'),
  ]);
  assert.equal(res.filter((r) => r.status === 'rejected').length, 0, 'el nombre del tmp lleva contador: nadie pisa a nadie');
  assert.match(await readFile(ruta, 'utf8'), /^[ABC]$/);
});
