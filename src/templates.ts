// Plantillas de celdas. Cada plantilla es una función pura: dado el tamaño de la
// diapositiva y su número, devuelve los rectángulos (en px del lienzo continuo) antes de
// aplicar el espaciado. Algunas celdas cruzan los cortes a propósito para dar continuidad.

import { insetRect, type Rect } from "./geometry.ts";

export interface TemplateContext {
  slideWidth: number;
  slideHeight: number;
  slideCount: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  cells(ctx: TemplateContext): Rect[];
}

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

// Plantillas por franjas: cada franja es una fila de altura relativa `h` (la suma de alturas es 1)
// partida en columnas por `xs`, posiciones en unidades de diapositiva (0 = borde izquierdo, n = borde
// derecho). Que xs empiece en 0 y acabe en n garantiza la cobertura completa sin huecos ni solapes.
interface Band {
  h: number;
  xs: number[];
}

function bandCells({ slideWidth: w, slideHeight: H }: TemplateContext, bands: Band[]): Rect[] {
  const out: Rect[] = [];
  let y = 0;
  for (const { h, xs } of bands) {
    for (let i = 0; i < xs.length - 1; i++) out.push(rect(xs[i]! * w, y * H, (xs[i + 1]! - xs[i]!) * w, h * H));
    y += h;
  }
  return out;
}

/** Cortes en k + offset para cada diapositiva: con offset 0 caen en los bordes; con otro valor cruzan los cortes. */
function offsetXs(n: number, offset: number): number[] {
  const xs = [0];
  for (let k = 0; k < n; k++) {
    const x = k + offset;
    if (x > 0 && x < n && x !== xs[xs.length - 1]) xs.push(x);
  }
  xs.push(n);
  return xs;
}

/** Puentes de media diapositiva centrados en cada corte, separados por rellenos de media diapositiva. */
function bridgeXs(n: number): number[] {
  const xs = [0];
  for (let k = 1; k < n; k++) xs.push(k - 0.25, k + 0.25);
  xs.push(n);
  return xs;
}

export const TEMPLATES: Template[] = [
  {
    id: "one-per-slide",
    name: "Una por diapositiva",
    description: "Una celda del tamaño de cada diapositiva.",
    cells: ({ slideWidth: w, slideHeight: h, slideCount: n }) =>
      Array.from({ length: n }, (_, i) => rect(i * w, 0, w, h)),
  },
  {
    id: "grid-2x2",
    name: "Cuadrícula 2×2",
    description: "Cuatro celdas por diapositiva.",
    cells: ({ slideWidth: w, slideHeight: h, slideCount: n }) =>
      Array.from({ length: n }, (_, i) =>
        [0, 1].flatMap((r) => [0, 1].map((c) => rect(i * w + (c * w) / 2, (r * h) / 2, w / 2, h / 2))),
      ).flat(),
  },
  {
    id: "panorama-strip",
    name: "Panorámica + detalles",
    description: "Una celda panorámica que cruza todos los cortes y una fila de detalles.",
    cells: ({ slideWidth: w, slideHeight: h, slideCount: n }) => [
      rect(0, 0, w * n, h * 0.6),
      ...Array.from({ length: n * 2 }, (_, i) => rect((i * w) / 2, h * 0.6, w / 2, h * 0.4)),
    ],
  },
  {
    id: "staggered",
    name: "Escalonado cruzado",
    description: "Celdas de media diapositiva desplazadas, que enlazan una diapositiva con la siguiente.",
    cells: ({ slideWidth: w, slideHeight: h, slideCount: n }) => {
      const out: Rect[] = [];
      for (let i = 0; i < n; i++) {
        out.push(rect(i * w, 0, w * 0.5, h * 0.5));
        out.push(rect(i * w + w * 0.5, 0, w * 0.5, h * 0.5));
      }
      // Fila inferior: celdas anchas desplazadas media diapositiva, que cruzan los cortes.
      out.push(rect(0, h * 0.5, w * 0.5, h * 0.5));
      for (let i = 0; i < n - 1; i++) out.push(rect(i * w + w * 0.5, h * 0.5, w, h * 0.5));
      out.push(rect(n * w - w * 0.5, h * 0.5, w * 0.5, h * 0.5));
      return out;
    },
  },
  {
    id: "seam-portraits",
    name: "Retratos en los cortes",
    description: "Una celda alta centrada en cada corte: cada foto se reparte entre dos diapositivas.",
    cells: (ctx) => bandCells(ctx, [{ h: 1, xs: offsetXs(ctx.slideCount, 0.5) }]),
  },
  {
    id: "bridges",
    name: "Puentes",
    description: "Fila superior con puentes sobre cada corte y fila inferior desfasada.",
    cells: (ctx) =>
      bandCells(ctx, [
        { h: 0.5, xs: bridgeXs(ctx.slideCount) },
        { h: 0.5, xs: offsetXs(ctx.slideCount, 0.5) },
      ]),
  },
  {
    id: "brick",
    name: "Ladrillo",
    description: "Tres filas desfasadas: la central coincide con las diapositivas y las otras cruzan los cortes.",
    cells: (ctx) =>
      bandCells(ctx, [
        { h: 1 / 3, xs: offsetXs(ctx.slideCount, 0.5) },
        { h: 1 / 3, xs: offsetXs(ctx.slideCount, 0) },
        { h: 1 / 3, xs: offsetXs(ctx.slideCount, 0.5) },
      ]),
  },
  {
    id: "staircase",
    name: "Escalera",
    description: "Cuatro filas con desfase creciente: los cortes de las celdas bajan en diagonal.",
    cells: (ctx) => bandCells(ctx, [0, 0.25, 0.5, 0.75].map((offset) => ({ h: 0.25, xs: offsetXs(ctx.slideCount, offset) }))),
  },
  {
    id: "panorama-bands",
    name: "Franjas panorámicas",
    description: "Dos panorámicas que cruzan todos los cortes y, entre ellas, una fila de detalles desfasada.",
    cells: (ctx) =>
      bandCells(ctx, [
        { h: 0.4, xs: [0, ctx.slideCount] },
        { h: 0.2, xs: offsetXs(ctx.slideCount, 0.5) },
        { h: 0.4, xs: [0, ctx.slideCount] },
      ]),
  },
];

export function templateCells(template: Template, ctx: TemplateContext, gap: number): Rect[] {
  return template.cells(ctx).map((r) => insetRect(r, gap / 2));
}
