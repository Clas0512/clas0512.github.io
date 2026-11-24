'use strict';
// Breakout collision: the ball must never tunnel through a brick, even at top speed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

let env, page;
before(async () => { env = await setup(); page = await env.open('/games/breakout/'); });
after(() => env.close());

test('at top speed, a 100 ms jump that would skip a brick still hits it and bounces back', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, ball = g.ball;               // game is in "ready", so only the test moves the ball
    g.loadLevel();
    const lowest = Math.max(...g.bricks.map((b) => b.y));
    const brick = g.bricks.filter((b) => b.y === lowest)[4];
    ball.stuck = false;
    ball.x = brick.x + brick.w / 2;
    ball.y = brick.y + brick.h + g.BALL_R + 20;           // 20 px below the brick, heading straight up
    ball.vx = 0; ball.vy = -1;
    g.setSpeed(g.MAX_SPEED);
    const jump = g.MAX_SPEED * 0.1;
    g.moveBall(0.1);
    return {
      jumpSkipsBrick: jump > 20 + brick.h + 2 * g.BALL_R,  // a single unchecked move would land above it
      brickAlive: brick.alive, movingDown: ball.vy > 0,
      belowBrick: ball.y >= brick.y + brick.h + g.BALL_R - 1e-6,
    };
  });
  assert.deepEqual(r, { jumpSkipsBrick: true, brickAlive: false, movingDown: true, belowBrick: true });
});

test('300 random shots at top speed: the ball centre is never inside a live brick or a wall', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, ball = g.ball, R = g.BALL_R;
    let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const violations = []; let hits = 0;
    for (let trial = 0; trial < 300; trial++) {
      g.loadLevel();
      const floor = Math.max(...g.bricks.map((b) => b.y + b.h));
      const total = g.bricks.length;
      const a = (rnd() * 2 - 1) * 1.0;                     // up to ~57 degrees from vertical
      ball.stuck = false;
      ball.x = R + rnd() * (g.W - 2 * R);
      ball.y = floor + R + 5 + rnd() * 120;
      ball.vx = Math.sin(a); ball.vy = -Math.cos(a);
      g.setSpeed(g.MAX_SPEED);
      for (let f = 0; f < 120; f++) {
        g.moveBall(1 / 60);
        for (const b of g.bricks) {
          if (b.alive && ball.x > b.x && ball.x < b.x + b.w && ball.y > b.y && ball.y < b.y + b.h) violations.push({ trial, f, kind: 'brick' });
        }
        if (ball.x < R - 1e-6 || ball.x > g.W - R + 1e-6) violations.push({ trial, f, kind: 'wall' });
        if (ball.vy > 0 && ball.y > floor + 160) break;     // heading for the paddle: trial over
      }
      hits += total - g.bricks.filter((b) => b.alive).length;
    }
    return { violations: violations.slice(0, 5), hits };
  });
  assert.deepEqual(r.violations, []);
  assert.ok(r.hits > 300, `expected the shots to hit bricks, got ${r.hits} hits`);
});
