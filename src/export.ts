import {
  canvasSize,
  drawCellInWindow,
  drawLayerInWindow,
  layerBounds,
  photoRectInCell,
  sliceWindows,
  type Cell,
  type Layer,
  type Photo,
  type PresetId,
  type Rect,
} from "./geometry.ts";
import { decodeOriginal } from "./images.ts";

export interface ExportedSlide {
  blob: Blob;
  filename: string;
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

const intersectsX = (a: Rect, window: Rect) => a.x < window.x + window.width && a.x + a.width > window.x;

/**
 * Renderiza cada diapositiva a su tamaño final: primero las celdas y luego las capas libres,
 * cada una desplazada a su ventana. Las diapositivas se preparan todas a la vez y cada original
 * se decodifica una sola vez, se dibuja en las que toca y se libera: nunca hay dos originales
 * decodificados a la vez, aunque una foto panorámica cruce muchos cortes.
 */
export async function exportSlides(input: ExportInput): Promise<ExportedSlide[]> {
  const { layers, cells, cellRadius, preset, slideCount, background } = input;
  const { height } = canvasSize(preset, slideCount);
  const windows = sliceWindows(preset, slideCount);

  const canvases = windows.map((win) => {
    const canvas = document.createElement("canvas");
    canvas.width = win.width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  });

  // Mismo orden que en pantalla: celdas primero y capas libres encima.
  // `size` es el tamaño en px del lienzo al que se dibuja la foto: se decodifica a ese tamaño.
  const items = [
    ...cells.map((c) => {
      const p = photoRectInCell(c.cell.bounds, c.photo);
      return {
        imageId: c.photo.imageId,
        bounds: c.cell.bounds,
        size: { width: p.width, height: p.height },
        draw: (ctx: CanvasRenderingContext2D, image: ImageBitmap, win: Rect) =>
          drawCellInWindow(ctx, c.cell, cellRadius, c.photo, image, win),
      };
    }),
    ...layers.map((layer) => ({
      imageId: layer.imageId,
      bounds: layerBounds(layer),
      size: { width: layer.naturalWidth * layer.scale, height: layer.naturalHeight * layer.scale },
      draw: (ctx: CanvasRenderingContext2D, image: ImageBitmap, win: Rect) => drawLayerInWindow(ctx, layer, image, win),
    })),
  ];

  try {
    for (const item of items) {
      const touched = windows.flatMap((win, i) => (intersectsX(item.bounds, win) ? [i] : []));
      if (!touched.length) continue;
      const original = await decodeOriginal(item.imageId, item.size);
      try {
        for (const i of touched) item.draw(canvases[i]!.ctx, original, windows[i]!);
      } finally {
        original.close();
      }
    }

    const out: ExportedSlide[] = [];
    for (const [i, { canvas }] of canvases.entries()) {
      out.push({
        blob: await canvasToBlob(canvas, "image/jpeg", 0.95),
        filename: `lienzo_${String(i + 1).padStart(2, "0")}.jpg`,
      });
      canvas.width = 0; // libera la memoria de la diapositiva ya codificada
    }
    return out;
  } finally {
    for (const { canvas } of canvases) canvas.width = 0;
  }
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
