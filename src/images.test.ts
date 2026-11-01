import { test } from "node:test";
import assert from "node:assert/strict";
import { EDIT_MAX_SIDE, editSize } from "./images.ts";

test("editSize reduce el lado mayor al máximo y conserva la proporción", () => {
  const s = editSize(4000, 3000);
  assert.equal(Math.max(s.width, s.height), EDIT_MAX_SIDE);
  assert.ok(Math.abs(s.width / s.height - 4000 / 3000) < 0.002);
  const tall = editSize(3000, 4000);
  assert.equal(tall.height, EDIT_MAX_SIDE);
  assert.ok(Math.abs(tall.width / tall.height - 0.75) < 0.002);
});

test("editSize nunca amplía una foto pequeña", () => {
  assert.deepEqual(editSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(editSize(EDIT_MAX_SIDE, 100), { width: EDIT_MAX_SIDE, height: 100 });
});

test("editSize no produce lados de cero píxeles en panorámicas extremas", () => {
  const s = editSize(40000, 10);
  assert.equal(s.width, EDIT_MAX_SIDE);
  assert.ok(s.height >= 1);
});

test("la copia de edición ocupa mucho menos memoria que el original", () => {
  const original = 4000 * 3000 * 4;
  const s = editSize(4000, 3000);
  const preview = s.width * s.height * 4;
  assert.ok(preview < original * 0.25, `copia ${preview} vs original ${original}`);
});
