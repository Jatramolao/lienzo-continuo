import {
  canvasSize,
  drawCellInWindow,
  drawLayerInWindow,
  sliceWindows,
  type Cell,
  type Layer,
  type Photo,
  type PresetId,
} from "./geometry.ts";

export interface ExportedSlide {
  blob: Blob;
  filename: string;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob devolvió null"))), type, quality),
  );
}

export interface FilledCell {
  cell: Cell;
  photo: Photo;
}

export interface ExportInput {
  layers: Layer[];
  /** Celdas de plantilla con foto; las vacías no se incluyen. */
  cells: FilledCell[];
  cellRadius: number;
  preset: PresetId;
  slideCount: number;
  background: string;
}

/** Renderiza cada diapositiva a su tamaño final: primero las celdas y luego las capas libres, desplazadas a su ventana. */
export async function exportSlides(input: ExportInput): Promise<ExportedSlide[]> {
  const { layers, cells, cellRadius, preset, slideCount, background } = input;
  const images = await Promise.all(layers.map((l) => loadImage(l.src)));
  const cellImages = await Promise.all(cells.map((c) => loadImage(c.photo.src)));
  const { height } = canvasSize(preset, slideCount);
  const out: ExportedSlide[] = [];
  for (const [i, win] of sliceWindows(preset, slideCount).entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = win.width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    cells.forEach((c, k) => drawCellInWindow(ctx, c.cell, cellRadius, c.photo, cellImages[k]!, win));
    layers.forEach((layer, k) => drawLayerInWindow(ctx, layer, images[k]!, win));
    out.push({
      blob: await canvasToBlob(canvas, "image/jpeg", 0.95),
      filename: `lienzo_${String(i + 1).padStart(2, "0")}.jpg`,
    });
  }
  return out;
}

export async function downloadSlides(slides: ExportedSlide[]): Promise<void> {
  for (const [i, s] of slides.entries()) {
    const url = URL.createObjectURL(s.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = s.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (i < slides.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
}

/** Devuelve true si el navegador pudo abrir la hoja de compartir con los archivos. */
export async function shareSlides(slides: ExportedSlide[]): Promise<boolean> {
  const files = slides.map((s) => new File([s.blob], s.filename, { type: s.blob.type }));
  if (!navigator.canShare?.({ files })) return false;
  await navigator.share({ files });
  return true;
}
