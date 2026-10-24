// Piezas de interfaz sin estado propio: marca, bordes de película, selector de plantillas,
// controles de formato y número de diapositivas. Todo el estado vive en App.

import { PRESETS, type PresetId } from "./geometry.ts";
import { TEMPLATES, templateCells, type Template } from "./templates.ts";

/** Nombre de la herramienta, con un corte de diapositiva que atraviesa la palabra "continuo". */
export function Wordmark() {
  return (
    <h1 className="mark">
      lienzo{" "}
      <span className="mark-word">
        conti
        <span className="mark-seam" aria-hidden="true" />
        nuo
      </span>
    </h1>
  );
}

/**
 * Rótulos del borde de la película, alineados con el lienzo: número de fotograma en el centro
 * de cada diapositiva y, como en un negativo real, el número con "A" en cada línea entre fotogramas.
 */
export function FilmEdge({
  side,
  preset,
  slideCount,
  canvasWidth,
  canvasHeight,
  slideWidthPx,
}: {
  side: "top" | "bottom";
  preset: PresetId;
  slideCount: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Ancho en pantalla de cada diapositiva: con carruseles largos se omiten rótulos que no caben. */
  slideWidthPx: number;
}) {
  const p = PRESETS[preset];
  const showSeams = slideWidthPx >= 72;
  const showFrames = slideWidthPx >= 24;
  if (side === "bottom") {
    return (
      <div className="edge edge-bottom" aria-hidden="true">
        <span className="edge-code edge-start">
          {p.ratio} · {p.width}×{p.height}
        </span>
        <span className="edge-code edge-end">
          lienzo {canvasWidth}×{canvasHeight}
        </span>
      </div>
    );
  }
  return (
    <div className="edge edge-top" aria-hidden="true">
      {showFrames &&
        Array.from({ length: slideCount }, (_, i) => (
          <span key={`f${i}`} className="edge-frame" style={{ left: `${((i + 0.5) / slideCount) * 100}%` }}>
            {i + 1}
          </span>
        ))}
      {showSeams &&
        Array.from({ length: slideCount - 1 }, (_, k) => (
        <span key={`s${k}`} className="edge-seam" style={{ left: `${((k + 1) / slideCount) * 100}%` }}>
          ▸{k + 1}A
        </span>
      ))}
    </div>
  );
}

export function FormatPicker({ value, onChange }: { value: PresetId; onChange: (id: PresetId) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Formato de cada diapositiva">
      {(Object.entries(PRESETS) as [PresetId, (typeof PRESETS)[PresetId]][]).map(([id, p]) => (
        <button
          key={id}
          type="button"
          className="segment"
          aria-pressed={value === id}
          title={`${p.label} · ${p.width}×${p.height}`}
          onClick={() => onChange(id)}
        >
          <span className="segment-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} aria-hidden="true" />
          <span className="segment-label">{p.ratio}</span>
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper" role="group" aria-label="Número de diapositivas">
      <button type="button" className="step" aria-label="Quitar una diapositiva" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output className="step-value" aria-live="polite">
        {value}
      </output>
      <button type="button" className="step" aria-label="Añadir una diapositiva" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

// Las miniaturas muestran como mucho 4 diapositivas para que sigan siendo legibles con carruseles largos.
const THUMB_MAX_SLIDES = 4;
const THUMB_GAP = 60;

function Thumb({ template, preset, slideCount }: { template: Template | undefined; preset: PresetId; slideCount: number }) {
  const n = Math.min(slideCount, THUMB_MAX_SLIDES);
  const { width: w, height: h } = PRESETS[preset];
  const W = w * n;
  const cells = template ? templateCells(template, { slideWidth: w, slideHeight: h, slideCount: n }, THUMB_GAP) : [];
  return (
    <svg className="thumb-svg" viewBox={`0 0 ${W} ${h}`} aria-hidden="true">
      <rect className="thumb-paper" width={W} height={h} />
      {cells.map((c, i) => (
        <polygon key={i} className="thumb-cell" points={c.points.map((p) => `${p.x},${p.y}`).join(" ")} />
      ))}
      {!template && (
        <rect
          className="thumb-cell"
          x={W * 0.32}
          y={h * 0.22}
          width={W * 0.36}
          height={h * 0.56}
          transform={`rotate(-6 ${W / 2} ${h / 2})`}
        />
      )}
      {Array.from({ length: n - 1 }, (_, k) => (
        <line
          key={k}
          className="thumb-seam"
          x1={(k + 1) * w}
          x2={(k + 1) * w}
          y1={0}
          y2={h}
          strokeWidth={h * 0.016}
          strokeDasharray={`${h * 0.07} ${h * 0.05}`}
        />
      ))}
    </svg>
  );
}

export function TemplatePicker({
  value,
  preset,
  slideCount,
  onChange,
}: {
  value: string;
  preset: PresetId;
  slideCount: number;
  onChange: (id: string) => void;
}) {
  const options: { id: string; name: string; description: string; template?: Template }[] = [
    { id: "", name: "Libre", description: "Sin celdas: mueve, escala y gira cada foto." },
    ...TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, template: t })),
  ];
  return (
    <div className="templates" role="group" aria-label="Plantilla">
      {options.map((o) => (
        <button
          key={o.id || "free"}
          type="button"
          className="template"
          aria-pressed={value === o.id}
          title={o.description}
          onClick={() => onChange(o.id)}
        >
          <Thumb template={o.template} preset={preset} slideCount={slideCount} />
          <span className="template-name">{o.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="slider-value">{format(value)}</span>
    </label>
  );
}
