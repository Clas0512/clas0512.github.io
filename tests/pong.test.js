'use strict';
// Pong paddle collision: no skipping a paddle at top speed, no "ghost saves" from behind it.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

let env, page;
before(async () => { env = await setup(); page = await env.open('/games/pong/'); });
after(() => env.close());

for (const side of ['player', 'cpu']) {
  test(`at top speed, a 50 ms jump past the ${side} paddle still bounces off it`, async () => {
    const r = await page.evaluate((side) => {
      const g = window.__game, ball = g.ball, p = g[side], R = 7, PW = 12;
      const dir = side === 'player' ? -1 : 1;              // direction of travel towards this paddle
      const before = { ...g.scores };
      p.y = g.H / 2;
      ball.y = g.H / 2;
      ball.x = side === 'player' ? p.x + PW + R + 10 : p.x - R - 10;
      ball.vx = dir * g.BALL_MAX; ball.vy = 0;
      const jump = g.BALL_MAX * 0.05;
      g.moveBall(0.05);
      return {
        jumpSkipsPaddle: jump > 10 + PW + 2 * R,
        reflected: Math.sign(ball.vx) === -dir,
        scoresUnchanged: g.scores.player === before.player && g.scores.cpu === before.cpu,
      };
    }, side);
    assert.deepEqual(r, { jumpSkipsPaddle: true, reflected: true, scoresUnchanged: true });
  });
}

test('a ball whose centre is already behind the paddle is a miss, not a save', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, ball = g.ball, p = g.player;
    p.y = g.H / 2; ball.y = g.H / 2;
    ball.x = p.x - 1; ball.vx = -300; ball.vy = 0;          // overlapping the paddle, but from behind
    g.moveBall(1 / 60);
    return ball.vx < 0;
  });
  assert.equal(r, true);
});

test('a missed ball scores for the other side and is served again', async () => {
  const r = await page.evaluate(() => {
    const g = window.__game, ball = g.ball;
    const cpuBefore = g.scores.cpu;
    g.player.y = 40;                                      // paddle far from the ball
    ball.x = 30; ball.y = g.H - 40; ball.vx = -600; ball.vy = 0;
    for (let i = 0; i < 30 && g.scores.cpu === cpuBefore; i++) g.moveBall(1 / 60);
    return { scored: g.scores.cpu - cpuBefore, served: ball.x === g.W / 2 && ball.y === g.H / 2 };
  });
  assert.deepEqual(r, { scored: 1, served: true });
});
