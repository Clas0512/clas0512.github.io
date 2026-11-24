'use strict';
// Verlet sandbox stability: after 30 s of simulated time with many bodies, nothing is NaN,
// nothing has escaped the walls, overlaps stay shallow and no body is lost. The sandbox has a
// ball cap: past it, each new ball recycles the oldest one, so the count levels off.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

let env, page;
before(async () => {
  env = await setup();
  page = await env.open('/tests/fixtures/lab.html', { fakeClock: true });   // time moves only via page.clock
  await page.evaluate(() => {
    window.demo = window.LabDemos.verlet.mount(document.getElementById('c'), {});
    window.demo.start();
  });
});
after(() => env.close());

test('60 dropped balls, then 30 s simulated: no NaN, no escapes, shallow overlaps, nothing lost', async () => {
  const start = await page.evaluate(() => window.demo.inspect());
  await page.focus('#c');
  const counts = [];
  for (let i = 0; i < 60; i++) {                          // drop a ball every 250 ms
    await page.keyboard.press('Space');
    await page.clock.runFor(250);
    counts.push((await page.evaluate(() => window.demo.inspect())).balls);
  }
  const peak = Math.max(...counts);
  assert.ok(peak > start.balls + 20, `drops added balls (${start.balls} -> ${peak})`);
  assert.ok(counts.every((c, i) => i === 0 || c >= counts[i - 1]), 'the ball count never drops while balls are added');
  let worst = { nan: 0, outside: 0, maxOverlap: 0, maxSpeed: 0 }, last;
  for (let s = 0; s < 30; s++) {                          // then sample once per simulated second
    await page.clock.runFor(1000);
    last = await page.evaluate(() => window.demo.inspect());
    worst = {
      nan: Math.max(worst.nan, last.nan), outside: Math.max(worst.outside, last.outside),
      maxOverlap: Math.max(worst.maxOverlap, last.maxOverlap), maxSpeed: Math.max(worst.maxSpeed, last.maxSpeed),
    };
  }
  assert.equal(last.balls, peak, 'no ball is lost while the scene settles');
  assert.equal(worst.nan, 0, 'no non-finite positions');
  assert.equal(worst.outside, 0, 'no point outside the walls');
  assert.ok(worst.maxOverlap < 0.5, `deepest overlap ${worst.maxOverlap.toFixed(3)} world units`);
  assert.ok(worst.maxSpeed <= 320 + 1e-6, `top speed ${worst.maxSpeed.toFixed(1)} is within the cap`);
  assert.ok(last.stepRate > 0, 'the fixed-step simulation is running');
  assert.deepEqual(page.errors, []);
});
