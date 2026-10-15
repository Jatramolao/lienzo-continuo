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

/** Encoge el rectángulo `inset` px por cada lado (mínimo 1 px de lado). */
export function insetRect(r: Rect, inset: number): Rect {
  const i = Math.min(inset, r.width / 2 - 0.5, r.height / 2 - 0.5);
  return { x: r.x + i, y: r.y + i, width: r.width - 2 * i, height: r.height - 2 * i };
}

export function roundedRectPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.width, r.height, rad);
}

/** Dibuja una celda con su foto, recortada, dentro de la ventana de una diapositiva. */
export function drawCellInWindow(
  ctx: CanvasRenderingContext2D,
  cell: Rect,
  radius: number,
  photo: Photo,
  image: CanvasImageSource,
  window: Rect,
): void {
  const local: Rect = { x: cell.x - window.x, y: cell.y - window.y, width: cell.width, height: cell.height };
  if (local.x >= window.width || local.x + local.width <= 0) return;
  const p = photoRectInCell(cell, photo);
  ctx.save();
  roundedRectPath(ctx, local, radius);
  ctx.clip();
  ctx.drawImage(image, local.x + p.x, local.y + p.y, p.width, p.height);
  ctx.restore();
}
