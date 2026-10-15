import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasSize,
  centeredLayer,
  fitScale,
  focusFromOffset,
  insetRect,
  newPhoto,
  photoRectInCell,
  sliceWindows,
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

test("insetRect no invierte celdas pequeñas", () => {
  const r = insetRect({ x: 0, y: 0, width: 10, height: 10 }, 100);
  assert.ok(r.width >= 1 && r.height >= 1);
});

test("todas las plantillas generan celdas dentro del lienzo, sin solaparse", () => {
  for (const t of TEMPLATES) {
    for (const n of [1, 2, 3, 5]) {
      const ctx = { slideWidth: 1080, slideHeight: 1350, slideCount: n };
      const cells = templateCells(t, ctx, 0);
      assert.ok(cells.length > 0, `${t.id} n=${n}`);
      for (const c of cells) {
        assert.ok(c.x >= -1e-9 && c.y >= -1e-9, `${t.id} n=${n} origen`);
        assert.ok(c.x + c.width <= 1080 * n + 1e-9, `${t.id} n=${n} ancho`);
        assert.ok(c.y + c.height <= 1350 + 1e-9, `${t.id} n=${n} alto`);
      }
      // El área total sin espaciado debe igualar el lienzo: cobertura completa y sin solapes.
      const area = cells.reduce((s, c) => s + c.width * c.height, 0);
      assert.ok(Math.abs(area - 1080 * n * 1350) < 1e-6, `${t.id} n=${n} cobertura (${area})`);
    }
  }
});

test("la plantilla panorámica tiene una celda que cruza todos los cortes", () => {
  const t = TEMPLATES.find((x) => x.id === "panorama-strip")!;
  const cells = templateCells(t, { slideWidth: 1080, slideHeight: 1350, slideCount: 3 }, 0);
  assert.ok(cells.some((c) => c.x === 0 && c.width === 3240));
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
