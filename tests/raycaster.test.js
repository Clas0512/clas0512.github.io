'use strict';
// Raycaster movement: the player's collision square never enters a wall cell, whether the
// autopilot drives or a "player" holds forward while turning into walls.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, ROOT } = require('./helpers');

// Read the map and collision radius from the source, so the check follows any change to them.
const src = fs.readFileSync(path.join(ROOT, 'lab/raycaster.js'), 'utf8');
const MAP = src.match(/var MAP = \[([\s\S]*?)\];/)[1].match(/'([^']*)'/g).map((s) => s.slice(1, -1));
const RADIUS = Number(src.match(/var RADIUS = ([\d.]+);/)[1]);

const wall = (cx, cy) => cy < 0 || cy >= MAP.length || cx < 0 || cx >= MAP[cy].length || MAP[cy][cx] === '1';
/** Does the square of half-size r around (x, y) overlap a wall cell? */
function hitsWall(x, y, r) {
  for (let cy = Math.floor(y - r); cy <= Math.floor(y + r); cy++)
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
      if (wall(cx, cy)) return true;
  return false;
}

let env, page;
before(async () => {
  env = await setup();
  page = await env.open('/tests/fixtures/lab.html', { fakeClock: true });
  await page.evaluate(() => {
    window.demo = window.LabDemos.raycaster.mount(document.getElementById('c'), {});
    window.demo.start();
  });
});
after(() => env.close());

/** Advance `seconds` in 50 ms slices, calling between(i) before each one; returns every sampled position. */
async function sample(seconds, between) {
  const out = [];
  for (let i = 0; i < seconds * 20; i++) {
    if (between) await between(i);
    await page.clock.runFor(50);
    out.push(await page.evaluate(() => window.demo.inspect()));
  }
  return out;
}

test('autopilot: 60 s of driving never puts the player inside a wall', async () => {
  const samples = await sample(60);
  assert.ok(samples.every((s) => s.auto), 'autopilot stayed in control');
  const moved = Math.hypot(samples.at(-1).x - samples[0].x, samples.at(-1).y - samples[0].y) > 0 || samples.some((s, i) => i && s.x !== samples[i - 1].x);
  assert.ok(moved, 'the player moved');
  const bad = samples.filter((s) => hitsWall(s.x, s.y, RADIUS));
  assert.deepEqual(bad, []);
});

test('manual: holding W while turning into walls slides along them and never enters one', async () => {
  await page.focus('#c');
  await page.keyboard.down('KeyW');
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  let turning = null;
  const samples = await sample(30, async (i) => {
    if (i % 8) return;                                     // every 400 ms pick a new turn: left, right or none
    if (turning) await page.keyboard.up(turning);
    const r = rnd();
    turning = r < 0.35 ? 'ArrowLeft' : r < 0.7 ? 'ArrowRight' : null;
    if (turning) await page.keyboard.down(turning);
  });
  if (turning) await page.keyboard.up(turning);
  await page.keyboard.up('KeyW');

  assert.ok(samples.every((s) => !s.auto), 'the keyboard, not the autopilot, was driving');
  const touches = samples.filter((s) => hitsWall(s.x, s.y, RADIUS + 0.02)).length;
  assert.ok(touches > 0, 'the run pressed the player against walls at least once');
  const bad = samples.filter((s) => hitsWall(s.x, s.y, RADIUS));
  assert.deepEqual(bad, []);
  assert.deepEqual(page.errors, []);
});
