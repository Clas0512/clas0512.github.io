'use strict';
// Snake rules, checked on the DOM-free Board model exposed as window.__game.Board.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

let env, page;
before(async () => { env = await setup(); page = await env.open('/games/snake/'); });
after(() => env.close());

// Run fn(Board, makeRng) in the page; makeRng is a seeded LCG so runs are repeatable.
const run = (fn) => page.evaluate(`(${fn})(window.__game.Board, (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)`);

test('a 180-degree reversal is refused, even against a turn that is still queued', async () => {
  const r = await run((Board, rng) => {
    const b = new Board(20, 20, rng(1));                 // starts moving right
    const direct = b.steer({ x: -1, y: 0 });             // straight back: refused
    const up = b.steer({ x: 0, y: -1 });                 // queued, not applied yet
    const down = b.steer({ x: 0, y: 1 });                // reverses the queued turn: refused
    return { direct, up, down, queue: b.queue.length };
  });
  assert.deepEqual(r, { direct: false, up: true, down: false, queue: 1 });
});

test('two quick turns between ticks both register, one per tick', async () => {
  const r = await run((Board, rng) => {
    const b = new Board(20, 20, rng(2));
    b.food = { x: 0, y: 0 };
    b.steer({ x: 0, y: -1 }); b.steer({ x: -1, y: 0 });  // up, then left, before the next tick
    const head0 = { ...b.snake[0] };
    b.step(); const afterUp = { ...b.snake[0] };
    b.step(); const afterLeft = { ...b.snake[0] };
    return { dy: afterUp.y - head0.y, dx: afterLeft.x - afterUp.x };
  });
  assert.deepEqual(r, { dy: -1, dx: -1 });
});

test('moving into the cell the tail is leaving is legal; any other body cell is a collision', async () => {
  const r = await run((Board, rng) => {
    const b = new Board(6, 6, rng(3));
    b.food = { x: 5, y: 5 };
    // A 2x2 loop: head (2,1) moving left into the tail cell (1,1).
    b.snake = [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }];
    b.dir = { x: -1, y: 0 }; b.queue = [];
    const tail = b.step();
    // Same loop plus one more segment, so (1,1) is no longer the tail.
    b.snake = [{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    b.dir = { x: -1, y: 0 }; b.queue = [];
    const body = b.step();
    return { tail, body };
  });
  assert.deepEqual(r, { tail: 'move', body: 'self' });
});

test('leaving the board is a wall collision', async () => {
  const r = await run((Board, rng) => {
    const b = new Board(5, 5, rng(4));
    b.snake = [{ x: 4, y: 2 }, { x: 3, y: 2 }]; b.dir = { x: 1, y: 0 }; b.queue = []; b.food = { x: 0, y: 0 };
    return b.step();
  });
  assert.equal(r, 'wall');
});

test('eating the last free cell ends the game as a win', async () => {
  const r = await run((Board, rng) => {
    const b = new Board(3, 1, rng(5));
    b.snake = [{ x: 1, y: 0 }, { x: 0, y: 0 }]; b.dir = { x: 1, y: 0 }; b.queue = []; b.food = { x: 2, y: 0 };
    return { result: b.step(), food: b.food, length: b.snake.length };
  });
  assert.deepEqual(r, { result: 'win', food: null, length: 3 });
});

test('food always spawns inside the board and never on the snake', async () => {
  const bad = await run((Board, rng) => {
    const b = new Board(12, 12, rng(6));
    const out = [];
    for (let len = 3; len < 140; len++) {
      // Fill the board row by row with a snake of this length, then spawn food.
      b.snake = Array.from({ length: len }, (_, i) => ({ x: i % 12, y: Math.floor(i / 12) }));
      for (let k = 0; k < 20; k++) {
        const f = b.spawnFood();
        const onSnake = b.snake.some((s) => s.x === f.x && s.y === f.y);
        if (onSnake || f.x < 0 || f.y < 0 || f.x >= 12 || f.y >= 12) out.push({ len, f });
      }
    }
    return out;
  });
  assert.deepEqual(bad, []);
});
