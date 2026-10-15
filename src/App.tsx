import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Image as KImage, Layer as KLayer, Line, Rect as KRect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import {
  MAX_CELL_ZOOM,
  PRESETS,
  canvasSize,
  centeredLayer,
  focusFromOffset,
  newPhoto,
  photoRectInCell,
  sliceWindows,
  type Layer,
  type Photo,
  type PresetId,
  type Rect,
} from "./geometry.ts";
import { TEMPLATES, templateCells } from "./templates.ts";
import { downloadSlides, exportSlides, loadImage, shareSlides, type FilledCell } from "./export.ts";

const BACKGROUND = "#f8fafc";
const ACCENT = "#2563eb";

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

function roundedClip(ctx: Konva.Context, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

function CellNode({
  rect,
  radius,
  photo,
  selected,
  viewScale,
  onSelect,
  onPhotoChange,
}: {
  rect: Rect;
  radius: number;
  photo: Photo | undefined;
  selected: boolean;
  viewScale: number;
  onSelect: () => void;
  onPhotoChange: (patch: Partial<Photo>) => void;
}) {
  const image = useLoadedImage(photo?.src);
  const p = photo ? photoRectInCell(rect, photo) : null;

  return (
    <Group x={rect.x} y={rect.y}>
      <Group clipFunc={(ctx) => roundedClip(ctx, rect.width, rect.height, radius)}>
        <KRect
          width={rect.width}
          height={rect.height}
          fill={photo ? "#d4d4d8" : "#e4e4e7"}
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
          fontSize={Math.min(rect.width, rect.height) * 0.25}
          fill="#a1a1aa"
          listening={false}
        />
      )}
      <KRect
        width={rect.width}
        height={rect.height}
        cornerRadius={radius}
        stroke={selected ? ACCENT : "rgba(0,0,0,0.12)"}
        strokeWidth={(selected ? 3 : 1) / viewScale}
        listening={false}
      />
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
        <Transformer ref={trRef} keepRatio rotateEnabled enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} />
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

  const canvas = useMemo(() => canvasSize(preset, slideCount), [preset, slideCount]);
  const windows = useMemo(() => sliceWindows(preset, slideCount), [preset, slideCount]);
  const viewScale = (wrapWidth - 24) / canvas.width;
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
    return () => ro.disconnect();
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
      return cells.findIndex((c) => x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height);
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
  const filledCells: FilledCell[] = cells.flatMap((rect, i) => (photos[i] ? [{ rect, photo: photos[i]! }] : []));
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
          setMessage("Este navegador no puede compartir archivos; se descargaron las imágenes.");
        }
      } else {
        await downloadSlides(slides);
        setMessage(`${slides.length} imágenes exportadas.`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="bar">
        <label>
          Formato
          <select value={preset} onChange={(e) => setPreset(e.target.value as PresetId)}>
            {Object.entries(PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label} · {p.width}×{p.height}
              </option>
            ))}
          </select>
        </label>
        <label>
          Diapositivas
          <input
            type="number"
            min={1}
            max={20}
            value={slideCount}
            onChange={(e) => setSlideCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <label>
          Plantilla
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} title={template?.description}>
            <option value="">Sin plantilla (libre)</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Espacio
          <input type="range" min={0} max={80} value={gap} onChange={(e) => setGap(Number(e.target.value))} />
          {gap}px
        </label>
        <label>
          Esquinas
          <input type="range" min={0} max={120} value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          {radius}px
        </label>
      </div>
      <div className="bar">
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
        <button className="ghost" onClick={() => document.getElementById("file")?.click()}>
          Añadir fotos
        </button>
        {selectedCellPhoto && selection?.kind === "cell" && (
          <label>
            Zoom
            <input
              type="range"
              min={1}
              max={MAX_CELL_ZOOM}
              step={0.01}
              value={selectedCellPhoto.zoom}
              onChange={(e) => patchPhoto(selection.index, { zoom: Number(e.target.value) })}
            />
            {selectedCellPhoto.zoom.toFixed(2)}×
          </label>
        )}
        <button className="ghost" disabled={selection?.kind !== "layer"} onClick={() => moveSelected(1)}>
          Subir
        </button>
        <button className="ghost" disabled={selection?.kind !== "layer"} onClick={() => moveSelected(-1)}>
          Bajar
        </button>
        <button className="ghost" disabled={!selection || (selection.kind === "cell" && !selectedCellPhoto)} onClick={removeSelected}>
          {selection?.kind === "cell" ? "Quitar foto" : "Eliminar"}
        </button>
        <span className="spacer" />
        <button disabled={busy || !hasContent} onClick={() => run("download")}>
          Exportar JPG
        </button>
        <button className="ghost" disabled={busy || !hasContent} onClick={() => run("share")}>
          Compartir
        </button>
      </div>

      <div
        ref={wrapRef}
        className={`stage-wrap${dragging ? " drag" : ""}`}
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
        <Stage
          ref={stageRef}
          width={canvas.width * viewScale}
          height={canvas.height * viewScale}
          scaleX={viewScale}
          scaleY={viewScale}
          onMouseDown={(e) => e.target === e.target.getStage() && setSelection(null)}
        >
          <KLayer>
            <KRect x={0} y={0} width={canvas.width} height={canvas.height} fill={BACKGROUND} onMouseDown={() => setSelection(null)} />
            {cells.map((rect, i) => (
              <CellNode
                key={`${templateId}-${i}`}
                rect={rect}
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
              <Line key={w.x} points={[w.x, 0, w.x, canvas.height]} stroke={ACCENT} strokeWidth={2 / viewScale} dash={[10 / viewScale, 8 / viewScale]} />
            ))}
          </KLayer>
        </Stage>
      </div>

      <div className="hint">
        {message ||
          `Lienzo de ${canvas.width}×${canvas.height}px. Las líneas azules son los cortes de cada diapositiva. Pulsa una celda y añade fotos (o suéltalas encima); arrastra la foto para encuadrarla y usa la rueda o el control de zoom. Las celdas que cruzan una línea azul dan la continuidad.`}
      </div>
      <div className="hint">Tus fotos se procesan en este dispositivo y no se suben a ningún servidor.</div>
    </div>
  );
}
