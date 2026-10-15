import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasSize,
  centeredLayer,
  fitScale,
  focusFromOffset,
  insetPolygon,
  newPhoto,
  photoRectInCell,
  pointInPolygon,
  polygonArea,
  polygonBounds,
  rectPoints,
  sliceWindows,
  tracePolygon,
  type Cell,
  type PathTarget,
  type Point,
} from "./geometry.ts";
import { TEMPLATES, templateCells } from "./templates.ts";

test("la foto siempre cubre la celda en cualquier foco y zoom", () => {
  const cell = { x: 0, y: 0, width: 400, height: 300 };
  for (const [nw, nh] of [[1000, 1000], [4000, 1000], [500, 3000]] as const) {
    for (const zoom of [1, 2.5, 4]) {
      for (const f of [0, 0.5, 1]) {
        const r = photoRectInCell(cell, { ...newPhoto("x", nw, nh), zoom, focusX: f, focusY: f });
        assert.ok(r.x <= 1e-9 && r.y <= 1e-9, "no deja hueco a la izquierda/arriba");
        assert.ok(r.x + r.width >= cell.width - 1e-9, "no deja hueco a la derecha");
        assert.ok(r.y + r.height >= cell.height - 1e-9, "no deja hueco abajo");
      }
    }
  }
});

test("el zoom por debajo de 1 se trata como 1", () => {
  const cell = { x: 0, y: 0, width: 400, height: 300 };
  const a = photoRectInCell(cell, { ...newPhoto("x", 800, 600), zoom: 0.2 });
  const b = photoRectInCell(cell, { ...newPhoto("x", 800, 600), zoom: 1 });
  assert.deepEqual(a, b);
});

test("focusFromOffset es la inversa de photoRectInCell", () => {
  const cell = { x: 0, y: 0, width: 400, height: 300 };
  const photo = { ...newPhoto("x", 1600, 900), zoom: 1.7, focusX: 0.25, focusY: 0.8 };
  const f = focusFromOffset(cell, photoRectInCell(cell, photo));
  assert.ok(Math.abs(f.focusX - 0.25) < 1e-9);
  assert.ok(Math.abs(f.focusY - 0.8) < 1e-9);
});

const square = (size: number): Point[] => rectPoints({ x: 0, y: 0, width: size, height: size });

test("insetPolygon no invierte ni anula polígonos pequeños", () => {
  const p = insetPolygon(square(10), 100);
  assert.ok(polygonArea(p) > 0);
  const b = polygonBounds(p);
  assert.ok(b.width > 0 && b.height > 0 && b.width < 10);
});

test("insetPolygon sobre un rectángulo equivale a encoger cada lado", () => {
  const b = polygonBounds(insetPolygon(rectPoints({ x: 100, y: 50, width: 400, height: 300 }), 10));
  assert.deepEqual([b.x, b.y, b.width, b.height].map((v) => Math.round(v * 1e6) / 1e6), [110, 60, 380, 280]);
});

test("insetPolygon mantiene las aristas diagonales paralelas y a la distancia pedida", () => {
  // Paralelogramo con lados inclinados: cada arista debe quedar exactamente `d` px más adentro.
  const para: Point[] = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 400, y: 200 }, { x: 100, y: 200 }];
  const inset = insetPolygon(para, 10);
  const dist = (p: Point, a: Point, b: Point) =>
    Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
  for (let i = 0; i < 4; i++) {
    const a = para[i]!;
    const b = para[(i + 1) % 4]!;
    assert.ok(Math.abs(dist(inset[i]!, a, b) - 10) < 1e-6, `arista ${i}`);
    assert.ok(Math.abs(dist(inset[(i + 1) % 4]!, a, b) - 10) < 1e-6, `arista ${i} (otro vértice)`);
  }
});

test("pointInPolygon distingue dentro y fuera en polígonos inclinados", () => {
  const tri: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
  assert.ok(pointInPolygon(tri, 10, 10));
  assert.ok(!pointInPolygon(tri, 80, 80));
});

test("tracePolygon sin radio traza líneas y con radio limita el arco a las aristas", () => {
  const calls: string[] = [];
  const radii: number[] = [];
  const rec: PathTarget = {
    beginPath: () => calls.push("begin"),
    moveTo: () => calls.push("move"),
    lineTo: () => calls.push("line"),
    arcTo: (_a, _b, _c, _d, r) => {
      calls.push("arc");
      radii.push(r);
    },
    closePath: () => calls.push("close"),
  };
  tracePolygon(rec, square(100), 0);
  assert.deepEqual(calls, ["begin", "move", "line", "line", "line", "close"]);
  calls.length = 0;
  tracePolygon(rec, square(100), 1000);
  assert.equal(calls.filter((c) => c === "arc").length, 4);
  assert.ok(radii.every((r) => Math.abs(r - 50) < 1e-9), "en un ángulo recto el radio máximo es la mitad de la arista");
  radii.length = 0;
  // En un ángulo agudo el arco debe ser menor que en uno recto.
  tracePolygon(rec, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }], 1000);
  assert.ok(Math.min(...radii) < 50);
});

const CTX = (n: number) => ({ slideWidth: 1080, slideHeight: 1350, slideCount: n });

test("todas las plantillas generan celdas convexas dentro del lienzo que lo cubren sin huecos ni solapes", () => {
  for (const t of TEMPLATES) {
    for (const n of [1, 2, 3, 5]) {
      const cells = templateCells(t, CTX(n), 0);
      assert.ok(cells.length > 0, `${t.id} n=${n}`);
      for (const c of cells) {
        assert.ok(c.bounds.x >= -1e-9 && c.bounds.y >= -1e-9, `${t.id} n=${n} origen`);
        assert.ok(c.bounds.x + c.bounds.width <= 1080 * n + 1e-9, `${t.id} n=${n} ancho`);
        assert.ok(c.bounds.y + c.bounds.height <= 1350 + 1e-9, `${t.id} n=${n} alto`);
        const signs = c.points.map((a, i) => {
          const b = c.points[(i + 1) % c.points.length]!;
          const d = c.points[(i + 2) % c.points.length]!;
          return Math.sign((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x));
        });
        assert.ok(signs.every((s) => s >= 0) || signs.every((s) => s <= 0), `${t.id} n=${n}: celda no convexa`);
      }
      const area = cells.reduce((s, c) => s + polygonArea(c.points), 0);
      assert.ok(Math.abs(area - 1080 * n * 1350) < 1e-3, `${t.id} n=${n} cobertura (${area})`);
      // Puntos de muestra: cada uno debe caer en exactamente una celda.
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 25; j++) {
          const x = ((i + 0.37) / 40) * 1080 * n;
          const y = ((j + 0.61) / 25) * 1350;
          const hits = cells.filter((c) => pointInPolygon(c.points, x, y)).length;
          assert.equal(hits, 1, `${t.id} n=${n}: el punto (${x.toFixed(1)}, ${y.toFixed(1)}) cae en ${hits} celdas`);
        }
      }
    }
  }
});

test("con espacio entre celdas, ningún punto cae en dos celdas y las celdas encogen", () => {
  for (const t of TEMPLATES) {
    const full = templateCells(t, CTX(3), 0);
    const gapped = templateCells(t, CTX(3), 32);
    assert.equal(gapped.length, full.length);
    gapped.forEach((c, i) => assert.ok(polygonArea(c.points) < polygonArea(full[i]!.points), `${t.id} celda ${i} encoge`));
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 25; j++) {
        const x = ((i + 0.37) / 40) * 3240;
        const y = ((j + 0.61) / 25) * 1350;
        assert.ok(gapped.filter((c: Cell) => pointInPolygon(c.points, x, y)).length <= 1, `${t.id}: solape en (${x}, ${y})`);
      }
    }
  }
});

test("las plantillas de cortes cruzados tienen celdas que cruzan cada corte y ninguna demasiado estrecha", () => {
  const crossing = [
    "staggered",
    "panorama-strip",
    "seam-portraits",
    "bridges",
    "brick",
    "staircase",
    "panorama-bands",
    "slanted-strips",
    "tilted-horizon",
  ];
  for (const id of crossing) {
    const t = TEMPLATES.find((x) => x.id === id);
    assert.ok(t, `${id} existe`);
    for (const n of [2, 3, 5]) {
      const cells = templateCells(t, CTX(n), 0);
      for (let seam = 1; seam < n; seam++) {
        const x = seam * 1080;
        assert.ok(
          cells.some((c) => c.bounds.x < x - 1e-9 && c.bounds.x + c.bounds.width > x + 1e-9),
          `${id} n=${n}: ninguna celda cruza el corte ${seam}`,
        );
      }
      for (const c of cells) {
        assert.ok(polygonArea(c.points) >= 200 * 200, `${id} n=${n}: celda demasiado pequeña (${polygonArea(c.points)})`);
      }
    }
  }
});

test("las plantillas diagonales tienen aristas que no son horizontales ni verticales", () => {
  for (const id of ["slanted-strips", "tilted-horizon"]) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    const cells = templateCells(t, CTX(3), 0);
    const slanted = cells.some((c) =>
      c.points.some((a, i) => {
        const b = c.points[(i + 1) % c.points.length]!;
        return Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1;
      }),
    );
    assert.ok(slanted, `${id} debe tener aristas diagonales`);
  }
});

test("los identificadores de plantilla son únicos", () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("la plantilla panorámica tiene una celda que cruza todos los cortes", () => {
  const t = TEMPLATES.find((x) => x.id === "panorama-strip")!;
  const cells = templateCells(t, { slideWidth: 1080, slideHeight: 1350, slideCount: 3 }, 0);
  assert.ok(cells.some((c) => c.bounds.x === 0 && c.bounds.width === 3240));
});

test("el lienzo mide N veces el ancho de la diapositiva", () => {
  assert.deepEqual(canvasSize("portrait", 3), { width: 3240, height: 1350 });
});

test("las ventanas son contiguas y cubren el lienzo sin huecos", () => {
  const w = sliceWindows("square", 4);
  assert.equal(w.length, 4);
  w.forEach((r, i) => assert.equal(r.x, i * 1080));
  assert.equal(w[3]!.x + w[3]!.width, canvasSize("square", 4).width);
});

test("cover llena el lienzo y contain cabe dentro", () => {
  const canvas = { width: 3240, height: 1350 };
  const img = { width: 4000, height: 3000 };
  assert.ok(img.width * fitScale(img, canvas, "cover") >= canvas.width);
  assert.ok(img.height * fitScale(img, canvas, "cover") >= canvas.height);
  assert.ok(img.width * fitScale(img, canvas, "contain") <= canvas.width + 1e-9);
  assert.ok(img.height * fitScale(img, canvas, "contain") <= canvas.height + 1e-9);
});

test("la capa nueva queda centrada", () => {
  const canvas = { width: 2160, height: 1080 };
  const l = centeredLayer("a", "x", 1000, 1000, canvas, "contain");
  assert.equal(l.x + (1000 * l.scale) / 2, canvas.width / 2);
  assert.equal(l.y + (1000 * l.scale) / 2, canvas.height / 2);
});
