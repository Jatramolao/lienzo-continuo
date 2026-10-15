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
];

export function templateCells(template: Template, ctx: TemplateContext, gap: number): Rect[] {
  return template.cells(ctx).map((r) => insetRect(r, gap / 2));
}
