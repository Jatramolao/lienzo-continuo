import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Group, Image as KImage, Layer as KLayer, Line, Rect as KRect, Shape, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import {
  MAX_CELL_ZOOM,
  PRESETS,
  canvasSize,
  centeredLayer,
  focusFromOffset,
  newPhoto,
  photoRectInCell,
  pointInPolygon,
  sliceWindows,
  tracePolygon,
  type Cell,
  type Layer,
  type Photo,
  type PresetId,
} from "./geometry.ts";
import { TEMPLATES, templateCells } from "./templates.ts";
import { downloadSlides, exportSlides, loadImage, shareSlides, type FilledCell } from "./export.ts";
import { FilmEdge, FormatPicker, Slider, Stepper, TemplatePicker, Wordmark } from "./ui.tsx";

/** Fondo del lienzo; forma parte de las imágenes exportadas. */
const BACKGROUND = "#f8fafc";
// Colores que dibuja Konva (no lee variables CSS). Ninguno se exporta salvo el fondo.
const CANVAS = {
  seam: "#F2A93B",
  seamUnder: "rgba(26, 21, 18, 0.28)",
  empty: "#E3E7E5",
  emptyMark: "#97A09C",
  outline: "rgba(26, 21, 18, 0.14)",
  select: "#FFFFFF",
  selectUnder: "rgba(26, 21, 18, 0.6)",
};
/** Margen lateral de la tira de película alrededor del lienzo, en px de pantalla. */
const FILM_INSET = 12;
const MAX_SLIDES = 20;

type Selection = { kind: "layer"; id: string } | { kind: "cell"; index: number } | null;

function useLoadedImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImage(null);
    let alive = true;
    loadImage(src).then((img) => alive && setImage(img));
    return () => {
      alive = false;
    };
  }, [src]);
  return image;
}

function CellNode({
  cell,
  radius,
  photo,
  selected,
  viewScale,
  onSelect,
  onPhotoChange,
}: {
  cell: Cell;
  radius: number;
  photo: Photo | undefined;
  selected: boolean;
  viewScale: number;
  onSelect: () => void;
  onPhotoChange: (patch: Partial<Photo>) => void;
}) {
  const rect = cell.bounds;
  const image = useLoadedImage(photo?.src);
  const p = photo ? photoRectInCell(rect, photo) : null;
  const trace = (ctx: Konva.Context) => tracePolygon(ctx, cell.points, radius, -rect.x, -rect.y);
  const outline = (ctx: Konva.Context, shape: Konva.Shape) => {
    trace(ctx);
    ctx.strokeShape(shape);
  };

  return (
    <Group x={rect.x} y={rect.y}>
      <Group clipFunc={trace}>
        <KRect
          width={rect.width}
          height={rect.height}
          fill={CANVAS.empty}
          onMouseDown={onSelect}
          onTouchStart={onSelect}
        />
        {photo && image && p && (
          <KImage
            image={image}
            x={p.x}
            y={p.y}
            width={p.width}
            height={p.height}
            draggable
            onMouseDown={onSelect}
            onTouchStart={onSelect}
            onDragMove={(e) => {
              const n = e.target;
              n.x(Math.min(0, Math.max(rect.width - p.width, n.x())));
              n.y(Math.min(0, Math.max(rect.height - p.height, n.y())));
            }}
            onDragEnd={(e) => {
              onPhotoChange(focusFromOffset(rect, { x: e.target.x(), y: e.target.y(), width: p.width, height: p.height }));
            }}
            onWheel={(e) => {
              e.evt.preventDefault();
              const factor = e.evt.deltaY < 0 ? 1.08 : 1 / 1.08;
              onPhotoChange({ zoom: Math.min(MAX_CELL_ZOOM, Math.max(1, photo.zoom * factor)) });
            }}
          />
        )}
      </Group>
      {!photo && (
        <Text
          text="+"
          width={rect.width}
          height={rect.height}
          align="center"
          verticalAlign="middle"
          fontSize={Math.min(rect.width, rect.height) * 0.22}
          fontStyle="300"
          fill={CANVAS.emptyMark}
          listening={false}
        />
      )}
      {selected ? (
        <>
          <Shape sceneFunc={outline} stroke={CANVAS.selectUnder} strokeWidth={6 / viewScale} listening={false} />
          <Shape sceneFunc={outline} stroke={CANVAS.select} strokeWidth={2.5 / viewScale} listening={false} />
        </>
      ) : (
        <Shape sceneFunc={outline} stroke={CANVAS.outline} strokeWidth={1 / viewScale} listening={false} />
      )}
    </Group>
  );
}

function LayerNode({
  layer,
  selected,
  onSelect,
  onChange,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Layer>) => void;
}) {
  const image = useLoadedImage(layer.src);
  const nodeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && nodeRef.current) {
      trRef.current.nodes([nodeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, image]);

  if (!image) return null;
  return (
    <>
      <KImage
        ref={nodeRef}
        image={image}
        x={layer.x}
        y={layer.y}
        width={layer.naturalWidth}
        height={layer.naturalHeight}
        scaleX={layer.scale}
        scaleY={layer.scale}
        rotation={layer.rotation}
        draggable
        onMouseDown={onSelect}
        onTouchStart={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={(e) => {
          const n = e.target;
          onChange({ x: n.x(), y: n.y(), scale: n.scaleX(), rotation: n.rotation() });
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          keepRatio
          rotateEnabled
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          borderStroke={CANVAS.select}
          borderStrokeWidth={2}
          anchorStroke={CANVAS.selectUnder}
          anchorFill={CANVAS.select}
          anchorSize={11}
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}

export function App() {
  const [preset, setPreset] = useState<PresetId>("portrait");
  const [slideCount, setSlideCount] = useState(3);
  const [templateId, setTemplateId] = useState<string>("grid-2x2");
  const [gap, setGap] = useState(16);
  const [radius, setRadius] = useState(0);
  const [photos, setPhotos] = useState<Record<number, Photo>>({});
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [wrapWidth, setWrapWidth] = useState(900);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  const canvas = useMemo(() => canvasSize(preset, slideCount), [preset, slideCount]);
  const windows = useMemo(() => sliceWindows(preset, slideCount), [preset, slideCount]);
  // El lienzo ocupa el ancho disponible sin pasar de ~58% del alto de la ventana (una sola
  // diapositiva vertical no debe obligar a desplazarse para ver los controles).
  const viewScale = Math.min((wrapWidth - FILM_INSET * 2) / canvas.width, Math.max(220, viewportHeight * 0.58) / canvas.height);
  const stageWidth = Math.floor(canvas.width * viewScale);
  const stageHeight = Math.floor(canvas.height * viewScale);
  const template = TEMPLATES.find((t) => t.id === templateId);
  const cells = useMemo(
    () =>
      template
        ? templateCells(template, { slideWidth: PRESETS[preset].width, slideHeight: PRESETS[preset].height, slideCount }, gap)
        : [],
    [template, preset, slideCount, gap],
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWrapWidth(el.clientWidth));
    ro.observe(el);
    setWrapWidth(el.clientWidth);
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Si la plantilla cambia y la celda seleccionada ya no existe, se deselecciona.
  useEffect(() => {
    setSelection((s) => (s?.kind === "cell" && s.index >= cells.length ? null : s));
  }, [cells.length]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): number => {
      const box = stageRef.current?.container().getBoundingClientRect();
      if (!box) return -1;
      const x = (clientX - box.left) / viewScale;
      const y = (clientY - box.top) / viewScale;
      return cells.findIndex((c) => pointInPolygon(c.points, x, y));
    },
    [cells, viewScale],
  );

  /** Reparte archivos: empieza en `startCell` y rellena las celdas vacías; el resto pasa a capas libres. */
  const addFiles = useCallback(
    async (files: FileList | File[], startCell?: number) => {
      const loaded: { src: string; w: number; h: number }[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const src = URL.createObjectURL(file);
        const img = await loadImage(src);
        loaded.push({ src, w: img.naturalWidth, h: img.naturalHeight });
      }
      if (!loaded.length) return;

      const nextPhotos: Record<number, Photo> = {};
      const rest: typeof loaded = [];
      const queue = [...loaded];
      let lastCell = -1;
      if (startCell !== undefined && startCell >= 0 && queue.length) {
        const f = queue.shift()!;
        nextPhotos[startCell] = newPhoto(f.src, f.w, f.h);
        lastCell = startCell;
      }
      const order = cells.map((_, i) => i);
      const from = startCell !== undefined && startCell >= 0 ? startCell : 0;
      const rotated = [...order.slice(from), ...order.slice(0, from)];
      for (const i of rotated) {
        if (!queue.length) break;
        if (photos[i] || nextPhotos[i]) continue;
        const f = queue.shift()!;
        nextPhotos[i] = newPhoto(f.src, f.w, f.h);
        lastCell = i;
      }
      rest.push(...queue);

      if (Object.keys(nextPhotos).length) {
        setPhotos((prev) => ({ ...prev, ...nextPhotos }));
        setSelection({ kind: "cell", index: lastCell });
      }
      if (rest.length) {
        const added = rest.map((f) => centeredLayer(crypto.randomUUID(), f.src, f.w, f.h, canvas));
        setLayers((prev) => [...prev, ...added]);
        setSelection({ kind: "layer", id: added[added.length - 1]!.id });
      }
    },
    [canvas, cells, photos],
  );

  const patchLayer = (id: string, patch: Partial<Layer>) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const patchPhoto = (index: number, patch: Partial<Photo>) =>
    setPhotos((prev) => (prev[index] ? { ...prev, [index]: { ...prev[index]!, ...patch } } : prev));

  const removeSelected = useCallback(() => {
    if (selection?.kind === "layer") {
      setLayers((prev) => prev.filter((l) => l.id !== selection.id));
      setSelection(null);
    } else if (selection?.kind === "cell") {
      setPhotos((prev) => {
        const { [selection.index]: _removed, ...rest } = prev;
        return rest;
      });
    }
  }, [selection]);

  const moveSelected = (dir: 1 | -1) => {
    if (selection?.kind !== "layer") return;
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === selection.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeSelected]);

  const selectedCellPhoto = selection?.kind === "cell" ? photos[selection.index] : undefined;
  const filledCells: FilledCell[] = cells.flatMap((cell, i) => (photos[i] ? [{ cell, photo: photos[i]! }] : []));
  const hasContent = filledCells.length > 0 || layers.length > 0;

  const run = async (mode: "download" | "share") => {
    setBusy(true);
    setMessage("");
    try {
      const slides = await exportSlides({
        layers,
        cells: filledCells,
        cellRadius: radius,
        preset,
        slideCount,
        background: BACKGROUND,
      });
      if (mode === "share") {
        const shared = await shareSlides(slides);
        if (!shared) {
          await downloadSlides(slides);
          setMessage(`Este navegador no puede compartir archivos: se descargaron las ${slides.length} imágenes.`);
        }
      } else {
        await downloadSlides(slides);
        setMessage(`${slides.length} ${slides.length === 1 ? "imagen descargada" : "imágenes descargadas"}.`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const selectedLabel =
    selection?.kind === "cell" ? `Celda ${selection.index + 1}` : selection?.kind === "layer" ? "Foto libre" : null;
  const contextHint =
    selection?.kind === "cell"
      ? selectedCellPhoto
        ? "Arrastra la foto para encuadrarla y ajusta el zoom."
        : "Las fotos que añadas empiezan en esta celda."
      : selection?.kind === "layer"
        ? "Arrastra para mover; usa los tiradores para escalar y girar."
        : cells.length
          ? "Suelta fotos sobre el lienzo o añádelas: se colocan en orden en las celdas vacías."
          : "Suelta fotos sobre el lienzo o añádelas: quedan sueltas para moverlas, escalarlas y girarlas.";

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Wordmark />
          <p className="tagline">Carruseles de Instagram que continúan de una diapositiva a la siguiente.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !hasContent}
            title={hasContent ? undefined : "Añade al menos una foto"}
            onClick={() => run("download")}
          >
            Descargar {slideCount} JPG
          </button>
          <button type="button" className="btn" disabled={busy || !hasContent} onClick={() => run("share")}>
            Compartir
          </button>
        </div>
      </header>

      <main className="work">
        <div
          ref={wrapRef}
          className="stage-area"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const target = cellAt(e.clientX, e.clientY);
            void addFiles(e.dataTransfer.files, target >= 0 ? target : undefined);
          }}
        >
          <div
            className={`film${dragging ? " is-drop" : ""}`}
            style={{ width: stageWidth + FILM_INSET * 2, paddingInline: FILM_INSET, "--inset": `${FILM_INSET}px` } as CSSProperties}
          >
            <FilmEdge side="top" preset={preset} slideCount={slideCount} canvasWidth={canvas.width} canvasHeight={canvas.height} slideWidthPx={stageWidth / slideCount} />
            <Stage
              ref={stageRef}
              className="stage"
              width={stageWidth}
              height={stageHeight}
              scaleX={viewScale}
              scaleY={viewScale}
              onMouseDown={(e) => e.target === e.target.getStage() && setSelection(null)}
            >
              <KLayer>
                <KRect x={0} y={0} width={canvas.width} height={canvas.height} fill={BACKGROUND} onMouseDown={() => setSelection(null)} />
                {cells.map((cell, i) => (
                  <CellNode
                    key={`${templateId}-${i}`}
                    cell={cell}
                    radius={radius}
                    photo={photos[i]}
                    selected={selection?.kind === "cell" && selection.index === i}
                    viewScale={viewScale}
                    onSelect={() => setSelection({ kind: "cell", index: i })}
                    onPhotoChange={(patch) => patchPhoto(i, patch)}
                  />
                ))}
                {layers.map((l) => (
                  <LayerNode
                    key={l.id}
                    layer={l}
                    selected={selection?.kind === "layer" && selection.id === l.id}
                    onSelect={() => setSelection({ kind: "layer", id: l.id })}
                    onChange={(patch) => patchLayer(l.id, patch)}
                  />
                ))}
              </KLayer>
              <KLayer listening={false}>
                {windows.slice(1).map((w) => (
                  <Group key={w.x}>
                    <Line points={[w.x, 0, w.x, canvas.height]} stroke={CANVAS.seamUnder} strokeWidth={4 / viewScale} />
                    <Line
                      points={[w.x, 0, w.x, canvas.height]}
                      stroke={CANVAS.seam}
                      strokeWidth={2 / viewScale}
                      dash={[7 / viewScale, 5 / viewScale]}
                    />
                  </Group>
                ))}
              </KLayer>
            </Stage>
            <FilmEdge side="bottom" preset={preset} slideCount={slideCount} canvasWidth={canvas.width} canvasHeight={canvas.height} slideWidthPx={stageWidth / slideCount} />
          </div>
        </div>

        <div className="context">
          <button type="button" className="btn" onClick={() => document.getElementById("file")?.click()}>
            Añadir fotos
          </button>
          {selectedLabel && <span className="context-tag">{selectedLabel}</span>}
          {(selection?.kind === "layer" || selectedCellPhoto) && (
            <button type="button" className="btn btn-quiet" onClick={removeSelected}>
              {selection?.kind === "cell" ? "Quitar foto" : "Eliminar"}
            </button>
          )}
          {selection?.kind === "layer" && (
            <>
              <button type="button" className="btn btn-quiet" title="Poner esta foto por delante de las demás" onClick={() => moveSelected(1)}>
                Adelante
              </button>
              <button type="button" className="btn btn-quiet" title="Poner esta foto por detrás de las demás" onClick={() => moveSelected(-1)}>
                Atrás
              </button>
            </>
          )}
          {selectedCellPhoto && selection?.kind === "cell" && (
            <Slider
              label="Zoom"
              min={1}
              max={MAX_CELL_ZOOM}
              step={0.01}
              value={selectedCellPhoto.zoom}
              format={(v) => `${v.toFixed(2)}×`}
              onChange={(v) => patchPhoto(selection.index, { zoom: v })}
            />
          )}
          <p className="context-hint">{contextHint}</p>
        </div>
        <p className="status" role="status" aria-live="polite">
          {message}
        </p>
      </main>

      <aside className="side">
        <section className="group" aria-labelledby="g-format">
          <h2 className="eyebrow" id="g-format">
            Formato
          </h2>
          <FormatPicker value={preset} onChange={setPreset} />
          <div className="row">
            <span className="row-label">Diapositivas</span>
            <Stepper value={slideCount} min={1} max={MAX_SLIDES} onChange={setSlideCount} />
          </div>
        </section>
        <section className="group" aria-labelledby="g-template">
          <h2 className="eyebrow" id="g-template">
            Plantilla
          </h2>
          <TemplatePicker value={templateId} preset={preset} slideCount={slideCount} onChange={setTemplateId} />
        </section>
        {template && (
          <section className="group" aria-labelledby="g-cells">
            <h2 className="eyebrow" id="g-cells">
              Celdas
            </h2>
            <Slider label="Espacio" min={0} max={80} value={gap} format={(v) => `${v} px`} onChange={setGap} />
            <Slider label="Esquinas" min={0} max={120} value={radius} format={(v) => `${v} px`} onChange={setRadius} />
          </section>
        )}
        <p className="privacy">Las fotos no salen de este dispositivo: todo se procesa en tu navegador.</p>
      </aside>

      <input
        type="file"
        accept="image/*"
        multiple
        hidden
        id="file"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files, selection?.kind === "cell" ? selection.index : undefined);
          e.target.value = "";
        }}
      />
    </div>
  );
}
