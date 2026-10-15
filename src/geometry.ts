// Modelo de coordenadas: un único lienzo continuo; cada diapositiva es una
// ventana de recorte sobre él. Vista previa y exportación comparten estas funciones.

export type PresetId = "square" | "portrait" | "landscape";

export interface SlideSize {
  width: number;
  height: number;
  label: string;
}

export const PRESETS: Record<PresetId, SlideSize> = {
  square: { width: 1080, height: 1080, label: "Cuadrado 1:1" },
  portrait: { width: 1080, height: 1350, label: "Vertical 4:5" },
  landscape: { width: 1080, height: 566, label: "Horizontal 16:9" },
};

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Capa de imagen en coordenadas del lienzo continuo. La rotación es en grados, alrededor de (x, y). */
export interface Layer {
  id: string;
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export function canvasSize(preset: PresetId, slideCount: number): { width: number; height: number } {
  const s = PRESETS[preset];
  return { width: s.width * slideCount, height: s.height };
}

/** Ventana de recorte de la diapositiva `index` en coordenadas del lienzo. */
export function sliceWindow(preset: PresetId, index: number): Rect {
  const s = PRESETS[preset];
  return { x: index * s.width, y: 0, width: s.width, height: s.height };
}

export function sliceWindows(preset: PresetId, slideCount: number): Rect[] {
  return Array.from({ length: slideCount }, (_, i) => sliceWindow(preset, i));
}

/** Escala que hace que la imagen cubra (cover) o quepa en (contain) el lienzo continuo. */
export function fitScale(
  image: { width: number; height: number },
  canvas: { width: number; height: number },
  mode: "cover" | "contain",
): number {
  const sx = canvas.width / image.width;
  const sy = canvas.height / image.height;
  return mode === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
}

/** Capa nueva centrada en el lienzo, ajustada en modo contain. */
export function centeredLayer(
  id: string,
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  canvas: { width: number; height: number },
  mode: "cover" | "contain" = "contain",
): Layer {
  const scale = fitScale({ width: naturalWidth, height: naturalHeight }, canvas, mode);
  return {
    id,
    src,
    naturalWidth,
    naturalHeight,
    scale,
    rotation: 0,
    x: (canvas.width - naturalWidth * scale) / 2,
    y: (canvas.height - naturalHeight * scale) / 2,
  };
}

/** Dibuja una capa dentro de la ventana de recorte `window` (desplazando el origen). */
export function drawLayerInWindow(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  image: CanvasImageSource,
  window: Rect,
): void {
  ctx.save();
  ctx.translate(layer.x - window.x, layer.y - window.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);
  ctx.drawImage(image, 0, 0, layer.naturalWidth, layer.naturalHeight);
  ctx.restore();
}

// ---- Celdas de plantilla ----------------------------------------------------
// Una celda es un rectángulo en el lienzo continuo que recorta una foto. El encuadre
// de la foto se guarda como valores relativos (zoom y foco 0..1), de modo que sobrevive
// a cambios de plantilla, formato o número de diapositivas.

export interface Photo {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Zoom sobre el ajuste cover; mínimo 1 para que la celda quede siempre cubierta. */
  zoom: number;
  /** Fracción del sobrante horizontal que queda a la izquierda (0 = alineada a la izquierda). */
  focusX: number;
  focusY: number;
}

export const MAX_CELL_ZOOM = 4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function newPhoto(src: string, naturalWidth: number, naturalHeight: number): Photo {
  return { src, naturalWidth, naturalHeight, zoom: 1, focusX: 0.5, focusY: 0.5 };
}

/** Rectángulo donde se dibuja la foto, relativo a la esquina superior izquierda de la celda. */
export function photoRectInCell(cell: Rect, photo: Photo): Rect {
  const zoom = Math.min(MAX_CELL_ZOOM, Math.max(1, photo.zoom));
  const s = Math.max(cell.width / photo.naturalWidth, cell.height / photo.naturalHeight) * zoom;
  const width = photo.naturalWidth * s;
  const height = photo.naturalHeight * s;
  return {
    x: -(width - cell.width) * clamp01(photo.focusX),
    y: -(height - cell.height) * clamp01(photo.focusY),
    width,
    height,
  };
}

/** Foco (0..1) que corresponde a una posición x/y de la foto dentro de la celda. */
export function focusFromOffset(cell: Rect, photoRect: Rect): { focusX: number; focusY: number } {
  const ox = photoRect.width - cell.width;
  const oy = photoRect.height - cell.height;
  return {
    focusX: ox > 1e-9 ? clamp01(-photoRect.x / ox) : 0.5,
    focusY: oy > 1e-9 ? clamp01(-photoRect.y / oy) : 0.5,
  };
}

// ---- Polígonos --------------------------------------------------------------
// Las celdas son polígonos convexos (un rectángulo es el caso particular de cuatro vértices),
// de modo que los cortes pueden ser diagonales. Todas las celdas del lienzo comparten estas
// funciones: la plantilla las genera, el editor y la exportación las trazan y recortan.

export interface Point {
  x: number;
  y: number;
}

/** Celda en coordenadas del lienzo continuo: su polígono y la caja que lo contiene. */
export interface Cell {
  points: Point[];
  bounds: Rect;
}

export function rectPoints(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

export function polygonBounds(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function cellFromPoints(points: Point[]): Cell {
  return { points, bounds: polygonBounds(points) };
}

/** Área con signo positivo o negativo según la orientación; se usa el valor absoluto. */
export function polygonArea(points: Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function centroidOfVertices(points: Point[]): Point {
  const n = points.length;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

/** Normal unitaria de la arista a→b que apunta hacia `inside`. */
function inwardNormal(a: Point, b: Point, inside: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let n = { x: dy / len, y: -dx / len };
  if (n.x * (inside.x - a.x) + n.y * (inside.y - a.y) < 0) n = { x: -n.x, y: -n.y };
  return n;
}

/** Punto (x, y) pertenece al polígono convexo (con tolerancia de borde). */
export function pointInPolygon(points: Point[], x: number, y: number): boolean {
  const c = centroidOfVertices(points);
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const n = inwardNormal(a, b, c);
    if (n.x * (x - a.x) + n.y * (y - a.y) < -1e-9) return false;
  }
  return true;
}

/**
 * Desplaza cada arista `distance` px hacia dentro (polígono convexo) y recalcula los vértices.
 * La distancia se limita para que la celda nunca se invierta ni desaparezca.
 */
export function insetPolygon(points: Point[], distance: number): Point[] {
  const n = points.length;
  const c = centroidOfVertices(points);
  const normals = points.map((a, i) => inwardNormal(a, points[(i + 1) % n]!, c));
  const reach = Math.min(...points.map((a, i) => {
    const m = normals[i]!;
    return m.x * (c.x - a.x) + m.y * (c.y - a.y);
  }));
  const d = Math.max(0, Math.min(distance, reach * 0.45));
  if (d === 0) return points.map((p) => ({ ...p }));

  // Arista i desplazada: pasa por points[i] + normal*d con la dirección de la arista.
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n]!;
    const m = normals[i]!;
    return { p: { x: a.x + m.x * d, y: a.y + m.y * d }, dir: { x: b.x - a.x, y: b.y - a.y } };
  });
  return points.map((v, i) => {
    const prev = lines[(i + n - 1) % n]!;
    const next = lines[i]!;
    const det = prev.dir.x * next.dir.y - prev.dir.y * next.dir.x;
    if (Math.abs(det) < 1e-9) {
      const m = normals[i]!;
      return { x: v.x + m.x * d, y: v.y + m.y * d };
    }
    const t = ((next.p.x - prev.p.x) * next.dir.y - (next.p.y - prev.p.y) * next.dir.x) / det;
    return { x: prev.p.x + prev.dir.x * t, y: prev.p.y + prev.dir.y * t };
  });
}

/** Lo mínimo que necesita el trazado: lo cumplen CanvasRenderingContext2D y el contexto de Konva. */
export interface PathTarget {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
}

/**
 * Traza el polígono con las esquinas redondeadas, desplazado `(offsetX, offsetY)`. El radio de
 * cada vértice se limita para que el arco quepa en las aristas vecinas, de modo que ángulos
 * agudos redondean menos que los rectos.
 */
export function tracePolygon(ctx: PathTarget, points: Point[], radius: number, offsetX = 0, offsetY = 0): void {
  const n = points.length;
  const P = points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
  ctx.beginPath();
  if (radius <= 0) {
    ctx.moveTo(P[0]!.x, P[0]!.y);
    for (let i = 1; i < n; i++) ctx.lineTo(P[i]!.x, P[i]!.y);
    ctx.closePath();
    return;
  }
  const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(P[n - 1]!, P[0]!);
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const prev = P[(i + n - 1) % n]!;
    const v = P[i]!;
    const next = P[(i + 1) % n]!;
    const a = Math.atan2(prev.y - v.y, prev.x - v.x);
    const b = Math.atan2(next.y - v.y, next.x - v.x);
    let interior = Math.abs(a - b);
    if (interior > Math.PI) interior = 2 * Math.PI - interior;
    const reach = (Math.min(Math.hypot(prev.x - v.x, prev.y - v.y), Math.hypot(next.x - v.x, next.y - v.y)) / 2) * Math.tan(interior / 2);
    const m = mid(v, next);
    ctx.arcTo(v.x, v.y, m.x, m.y, Math.max(0, Math.min(radius, reach)));
  }
  ctx.closePath();
}

/** Dibuja una celda con su foto, recortada, dentro de la ventana de una diapositiva. */
export function drawCellInWindow(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  radius: number,
  photo: Photo,
  image: CanvasImageSource,
  window: Rect,
): void {
  const b = cell.bounds;
  if (b.x >= window.x + window.width || b.x + b.width <= window.x) return;
  const p = photoRectInCell(b, photo);
  ctx.save();
  tracePolygon(ctx, cell.points, radius, -window.x, -window.y);
  ctx.clip();
  ctx.drawImage(image, b.x - window.x + p.x, b.y - window.y + p.y, p.width, p.height);
  ctx.restore();
}
