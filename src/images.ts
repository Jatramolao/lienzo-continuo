// Registro de imágenes. Dueño de la decodificación y de la vida de cada foto.
//
// El editor trabaja con una copia reducida (`preview`) y el original (`file`) solo se decodifica al
// exportar, de uno en uno. Así la memoria de píxeles que mantiene el editor no depende de la
// resolución de la cámara: una foto de 12 Mpx ocuparía ~48 MB decodificada, y su copia de edición
// unos 11 MB. Las dimensiones que usa el resto de la app (`naturalWidth/Height`) son siempre las del
// original; la copia reducida conserva la proporción, así que se dibuja con el mismo encuadre.

/** Lado mayor, en px, de la copia de edición. Solo afecta a la vista previa, no a la exportación. */
export const EDIT_MAX_SIDE = 1920;

/** Tamaño de la copia de edición: reduce a `maxSide` el lado mayor, sin ampliar nunca. */
export function editSize(width: number, height: number, maxSide: number = EDIT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface ImageEntry {
  id: string;
  /** Archivo original; no se decodifica hasta exportar. */
  file: File;
  /** Copia reducida para editar. */
  preview: ImageBitmap;
  /** Dimensiones del original, con la orientación EXIF ya aplicada. */
  naturalWidth: number;
  naturalHeight: number;
  /** Hasta que el estado de la app la referencia, `retainOnly` no la libera. */
  claimed: boolean;
}

const entries = new Map<string, ImageEntry>();

export function getImage(id: string): ImageEntry | undefined {
  return entries.get(id);
}

/** Abre un archivo: lo decodifica una vez, guarda una copia reducida y descarta la decodificación completa. */
export async function importImage(file: File): Promise<ImageEntry> {
  const full = await createImageBitmap(file, { imageOrientation: "from-image" });
  // Se leen antes de cerrar: un ImageBitmap cerrado informa 0×0.
  const naturalWidth = full.width;
  const naturalHeight = full.height;
  const { width, height } = editSize(naturalWidth, naturalHeight);
  const reduce = width !== naturalWidth || height !== naturalHeight;
  let preview = full;
  try {
    if (reduce) preview = await createImageBitmap(full, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
  } finally {
    // Si ya era pequeña, la decodificación completa es la propia copia de edición y se conserva.
    if (reduce) full.close();
  }
  const entry: ImageEntry = {
    id: crypto.randomUUID(),
    file,
    preview,
    naturalWidth,
    naturalHeight,
    claimed: false,
  };
  entries.set(entry.id, entry);
  return entry;
}

/** Marca imágenes como referenciadas por el estado: desde ahí `retainOnly` puede liberarlas. */
export function claimImages(ids: Iterable<string>): void {
  for (const id of ids) {
    const e = entries.get(id);
    if (e) e.claimed = true;
  }
}

/** Libera las imágenes ya reclamadas que el estado dejó de referenciar. */
export function retainOnly(used: ReadonlySet<string>): void {
  for (const [id, e] of entries) {
    if (e.claimed && !used.has(id)) {
      e.preview.close();
      entries.delete(id);
    }
  }
}

/** Libera imágenes importadas que no llegaron a usarse (por ejemplo, si la operación falló a medias). */
export function discardImages(ids: Iterable<string>): void {
  for (const id of ids) {
    const e = entries.get(id);
    if (e && !e.claimed) {
      e.preview.close();
      entries.delete(id);
    }
  }
}

/**
 * Decodifica el original. Si se indica `size` y es menor que el original, se reduce al decodificar
 * (con remuestreo de calidad alta) a ese tamaño en px: la exportación pide exactamente lo que va a
 * dibujar, así no decodifica ni retiene píxeles que descartaría después. El tamaño se expresa con la
 * orientación EXIF ya aplicada y debe conservar la proporción del original.
 * Quien lo llama debe cerrar el bitmap al terminar.
 */
export async function decodeOriginal(id: string, size?: { width: number; height: number }): Promise<ImageBitmap> {
  const e = entries.get(id);
  if (!e) throw new Error("La foto ya no está disponible");
  const options: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (size && size.width < e.naturalWidth && size.height < e.naturalHeight) {
    options.resizeWidth = Math.max(1, Math.ceil(size.width));
    options.resizeHeight = Math.max(1, Math.ceil(size.height));
    options.resizeQuality = "high";
  }
  return createImageBitmap(e.file, options);
}
