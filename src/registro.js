// Registro único de las tools del second brain. Cada entrada:
// { description, schema (shape de zod), annotations (hints MCP), ejecutar(vault, args) }.
// Las annotations permiten al cliente distinguir lectura de escritura sin adivinarlo:
// readOnlyHint (candidatas a auto-aprobación) y destructiveHint (pedir confirmación).
import { z } from 'zod';
import * as cerebro from './cerebro.js';

export const registro = {
  lectura_crear: {
    description: 'Crea una nota en 40-Lecturas/. Falla si ya existe una lectura con ese título.',
    schema: {
      titulo: z.string(),
      autor: z.string().optional(),
      formato: z.enum(['libro', 'articulo', 'video', 'curso']).optional(),
      temas: z.array(z.string()).optional(),
    },
    ejecutar: (vault, { titulo, autor, formato, temas } = {}) => cerebro.lecturaCrear(vault, { titulo, autor, formato, temas }),
  },
  lectura_nota: {
    description: 'Appendea una línea a ## Notas mientras leo de la lectura dada.',
    schema: {
      titulo: z.string(),
      texto: z.string(),
      ubicacion: z.string().optional().describe('p.ej. "cap 3" o "min 20"'),
    },
    ejecutar: (vault, { titulo, texto, ubicacion } = {}) => cerebro.lecturaNota(vault, { titulo, texto, ubicacion }),
  },
  lectura_actualizar: {
    description: 'Cambia estado (fija inicio/fin automáticamente en los cambios relevantes) y/o valoracion (1-5) de una lectura.',
    schema: {
      titulo: z.string(),
      estado: z.enum(['por-leer', 'leyendo', 'terminada', 'abandonada']).optional(),
      valoracion: z.number().optional(),
    },
    ejecutar: (vault, { titulo, estado, valoracion } = {}) => cerebro.lecturaActualizar(vault, { titulo, estado, valoracion }),
  },
  nota_permanente: {
    description:
      'Crea una nota en 50-Notas/ (second brain). Enlaza a su origen (y si es una lectura, la referencia de vuelta en sus Ideas extraídas), convierte cada tema en un nodo-concepto de 60-Conceptos/, y relaciona con otras notas. Falla si ya existe ese título. Devuelve `sugerencias` de conexión: propónselas al usuario, enlazar es decisión suya.',
    schema: {
      titulo: z.string().describe('una afirmación, como título'),
      contenido: z.string(),
      origen: z.string().optional().describe('título de la nota de origen (lectura u otra)'),
      temas: z.array(z.string()).optional().describe('conceptos; se crean como nodos [[..]] navegables'),
      relacionadas: z.array(z.string()).optional().describe('títulos de otras notas con las que enlazar'),
    },
    ejecutar: (vault, { titulo, contenido, origen, temas, relacionadas } = {}) =>
      cerebro.notaPermanente(vault, { titulo, contenido, origen, temas, relacionadas }),
  },
  nota_enlazar: {
    description:
      'Enlaza dos notas permanentes (relacionadas ↔, bidireccional por defecto). Pasa SIEMPRE un `motivo` de una frase: queda escrito en ## Conexiones de ambas — un enlace sin porqué se pudre. Idempotente.',
    schema: {
      titulo: z.string(),
      con: z.string().describe('título de la otra nota permanente'),
      bidireccional: z.boolean().optional(),
      motivo: z.string().optional().describe('por qué dialogan estas dos ideas, en una frase'),
    },
    ejecutar: (vault, { titulo, con, bidireccional, motivo } = {}) => cerebro.notaEnlazar(vault, { titulo, con, bidireccional, motivo }),
  },
  concepto_crear: {
    description: 'Crea o define un concepto (nodo de 60-Conceptos/), opcionalmente con definición y conceptos relacionados.',
    schema: {
      nombre: z.string(),
      definicion: z.string().optional(),
      relacionados: z.array(z.string()).optional(),
    },
    ejecutar: (vault, { nombre, definicion, relacionados } = {}) => cerebro.conceptoCrear(vault, { nombre, definicion, relacionados }),
  },
  concepto_fusionar: {
    description:
      'Fusiona dos conceptos duplicados: reescribe todos los wikilinks del vault hacia el canónico, vuelca definición/relacionados y borra el duplicado. Usar cuando jardin detecte conceptosDuplicados; el usuario elige cuál queda como canónico.',
    schema: {
      duplicado: z.string().describe('el concepto que desaparece'),
      canonico: z.string().describe('el concepto que se queda'),
    },
    annotations: { destructiveHint: true },
    ejecutar: (vault, { duplicado, canonico } = {}) => cerebro.conceptoFusionar(vault, { duplicado, canonico }),
  },
  resurgir: {
    description:
      'El motor de resurfacing del second brain: dado un texto (tarea, foco, idea a medias), devuelve las notas/lecturas/conceptos más conectados, puntuados (título×3, temas×2, cuerpo×1) y con los términos que casaron. Aparece solo cuando hay solape real.',
    schema: {
      texto: z.string(),
      limite: z.number().optional().describe('máximo de resultados, por defecto 3'),
    },
    annotations: { readOnlyHint: true },
    ejecutar: (vault, { texto, limite } = {}) => cerebro.resurgir(vault, { texto, limite }),
  },
  jardin: {
    description:
      'Salud del grafo del second brain: huérfanas, wikilinks rotos, conceptos sin definir, notas SOBRECONECTADAS (>5 relacionadas: cajón de sastre) y conceptos probablemente duplicados. Para podar con precisión.',
    schema: {},
    annotations: { readOnlyHint: true },
    ejecutar: (vault) => cerebro.jardin(vault),
  },
  vault_buscar: {
    description:
      'Grep estructurado sobre todo el vault: fichero, número de línea, línea y contexto. tipo filtra por frontmatter; limite (20 por defecto) acota la respuesta y truncado avisa si hubo más.',
    schema: {
      query: z.string(),
      tipo: z.string().optional().describe('p.ej. lectura, permanente, concepto'),
      limite: z.number().optional().describe('máximo de resultados, por defecto 20'),
    },
    annotations: { readOnlyHint: true },
    ejecutar: (vault, { query, tipo, limite } = {}) => cerebro.vaultBuscar(vault, { query, tipo, limite }),
  },
  mini_nota: {
    description:
      'Mini-brain del proyecto: apunte de taller en <dir>/brain/ (crudo, local al proyecto). Vive y muere con el proyecto salvo que califique y se promueva al brain principal.',
    schema: {
      dir: z.string().describe('raíz ABSOLUTA del proyecto (el cwd de la sesión)'),
      titulo: z.string(),
      contenido: z.string(),
      temas: z.array(z.string()).optional(),
    },
    ejecutar: (vault, { dir, titulo, contenido, temas } = {}) => cerebro.miniNota(vault, { dir, titulo, contenido, temas }),
  },
  mini_listar: {
    description:
      'Lista las mini-notas crudas del proyecto con su resonancia contra el brain principal y si CALIFICAN para promover (resonancia fuerte >=5, o 7+ días madurando).',
    schema: { dir: z.string().describe('raíz ABSOLUTA del proyecto') },
    annotations: { readOnlyHint: true },
    ejecutar: (vault, { dir } = {}) => cerebro.miniListar(vault, { dir }),
  },
  mini_promover: {
    description:
      'Sube una mini-nota al brain principal como nota permanente (temas → conceptos, sugerencias de conexión incluidas) y marca la local como promovida. La promoción es decisión del usuario.',
    schema: {
      dir: z.string().describe('raíz ABSOLUTA del proyecto'),
      titulo: z.string(),
      temas: z.array(z.string()).optional().describe('si se omite, usa los de la mini-nota'),
      relacionadas: z.array(z.string()).optional(),
    },
    ejecutar: (vault, { dir, titulo, temas, relacionadas } = {}) => cerebro.miniPromover(vault, { dir, titulo, temas, relacionadas }),
  },
};
