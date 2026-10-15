// Plantillas de celdas. Cada plantilla es una función pura: dado el tamaño de la
// diapositiva y su número, devuelve los polígonos (en px del lienzo continuo) antes de
// aplicar el espaciado. Algunas celdas cruzan los cortes a propósito para dar continuidad,
// y otras tienen lados diagonales.

import { cellFromPoints, insetPolygon, rectPoints, type Cell, type Point } from "./geometry.ts";

export interface TemplateContext {
  slideWidth: number;
  slideHeight: number;
  slideCount: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  cells(ctx: TemplateContext): Point[][];
}

const rect = (x: number, y: number, width: number, height: number): Point[] => rectPoints({ x, y, width, height });

/** Recta que cruza todo el lienzo; `left` y `right` son la altura (fracción de la diapositiva) en cada borde. */
interface Line {
  left: number;
  right: number;
}

const flat = (y: number): Line => ({ left: y, right: y });

/**
 * Franja entre dos rectas, partida en columnas por `xs` (posiciones en unidades de diapositiva,
 * de 0 a n). Los cortes interiores se inclinan `slant` diapositivas entre el borde superior y el
 * inferior; los bordes del lienzo siempre quedan verticales. Que xs empiece en 0 y acabe en n, y
 * que franjas vecinas compartan recta, garantiza la cobertura completa sin huecos ni solapes.
 */
interface Band {
  top: Line;
  bottom: Line;
  xs: number[];
  slant?: number;
}

function bandPolygons({ slideWidth: w, slideHeight: H, slideCount: n }: TemplateContext, bands: Band[]): Point[][] {
  const out: Point[][] = [];
  const yOn = (line: Line, x: number) => (line.left + ((line.right - line.left) * x) / (n * w)) * H;
  for (const { top, bottom, xs, slant = 0 } of bands) {
    const topX = xs.map((u) => u * w);
    const bottomX = xs.map((u, i) => (i > 0 && i < xs.length - 1 ? (u + slant) * w : u * w));
    for (let i = 0; i < xs.length - 1; i++) {
      out.push([
        { x: topX[i]!, y: yOn(top, topX[i]!) },
        { x: topX[i + 1]!, y: yOn(top, topX[i + 1]!) },
        { x: bottomX[i + 1]!, y: yOn(bottom, bottomX[i + 1]!) },
        { x: bottomX[i]!, y: yOn(bottom, bottomX[i]!) },
      ]);
    }
  }
  return out;
}

/** Franjas horizontales de altura relativa `h` (la suma es 1), con cortes verticales en `xs`. */
function bandCells(ctx: TemplateContext, bands: { h: number; xs: number[] }[]): Point[][] {
  let y = 0;
  return bandPolygons(
    ctx,
    bands.map(({ h, xs }) => {
      const band: Band = { top: flat(y), bottom: flat(y + h), xs };
      y += h;
      return band;
    }),
  );
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
      const out: Point[][] = [];
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
  {
    id: "slanted-strips",
    name: "Tiras inclinadas",
    description: "Tiras de alto completo con cortes diagonales; cada una cruza un corte de diapositiva.",
    cells: (ctx) => bandPolygons(ctx, [{ top: flat(0), bottom: flat(1), xs: offsetXs(ctx.slideCount, 0.5), slant: 0.3 }]),
  },
  {
    id: "tilted-horizon",
    name: "Horizonte inclinado",
    description: "Una diagonal suave cruza todo el lienzo; arriba, columnas sobre los cortes; abajo, una por diapositiva.",
    cells: (ctx) => {
      const r = Math.min(0.2, 0.1 * ctx.slideCount);
      const horizon: Line = { left: 0.5 + r, right: 0.5 - r };
      return bandPolygons(ctx, [
        { top: flat(0), bottom: horizon, xs: offsetXs(ctx.slideCount, 0.5) },
        { top: horizon, bottom: flat(1), xs: offsetXs(ctx.slideCount, 0) },
      ]);
    },
  },
];

/** Celdas de la plantilla con el espacio entre ellas ya aplicado (`gap` px entre celdas vecinas). */
export function templateCells(template: Template, ctx: TemplateContext, gap: number): Cell[] {
  return template.cells(ctx).map((points) => cellFromPoints(insetPolygon(points, gap / 2)));
}
