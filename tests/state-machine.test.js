'use strict';
// The shared game state machine: illegal transitions are refused, and focus loss pauses play.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

let env;
before(async () => { env = await setup(); });
after(() => env.close());

const ALL = ['ready', 'playing', 'paused', 'gameover', 'won'];
const LEGAL = {
  ready: ['playing'],
  playing: ['paused', 'gameover', 'won', 'ready'],
  paused: ['playing', 'ready'],
  gameover: ['ready'],
  won: ['ready'],
};
// Shortest legal path from "ready" to each state, used to set up each case.
const PATH = { ready: [], playing: ['playing'], paused: ['playing', 'paused'], gameover: ['playing', 'gameover'], won: ['playing', 'won'] };

test('every transition matches the table; refused ones leave the state unchanged', async () => {
  const page = await env.open('/games/breakout/');
  const results = await page.evaluate(({ ALL, PATH }) => {
    const fsm = window.__game.fsm, out = [];
    const reset = () => { if (fsm.state !== 'ready') fsm.go('ready'); };
    for (const from of ALL) {
      for (const to of ALL) {
        reset();
        for (const s of PATH[from]) fsm.go(s);
        const ok = fsm.go(to);
        out.push({ from, to, ok, state: fsm.state });
      }
    }
    reset();
    return out;
  }, { ALL, PATH });
  for (const { from, to, ok, state } of results) {
    const legal = LEGAL[from].includes(to);
    assert.equal(ok, legal, `${from} -> ${to} should be ${legal ? 'allowed' : 'refused'}`);
    assert.equal(state, legal ? to : from, `${from} -> ${to} left the machine in ${state}`);
  }
});

for (const game of ['snake', 'breakout', 'pong']) {
  test(`${game}: losing window focus while playing pauses the game`, async () => {
    const page = await env.open(`/games/${game}/`);
    const state = await page.evaluate(() => {
      const fsm = window.__game.fsm;
      fsm.go('playing');
      window.dispatchEvent(new Event('blur'));
      return fsm.state;
    });
    assert.equal(state, 'paused');
    assert.deepEqual(page.errors, []);
  });
}
