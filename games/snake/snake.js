/*
 * Snake - grid based, tick driven.
 *
 *  - Board:  pure rules (movement, input queue, collision, food). No DOM, easy to test.
 *  - Game:   state machine + fixed-timestep loop + input + rendering around a Board.
 *
 * The loop runs at a fixed 60 Hz; the snake itself advances on its own tick, whose interval
 * shrinks as the snake grows.
 */
(function () {
  'use strict';
  const kit = window.GameKit;

  const t = kit.i18n({
    en: {
      title: 'Snake',
      canvasLabel: 'Snake game board',
      readyText: "Eat, grow, and don't run into the walls or yourself.",
      hintKb: 'Arrow keys or WASD to steer · Space to start · P to pause · R to restart',
      hintTouch: 'Swipe anywhere to steer.',
      overText: 'Score {score} · Best {best}',
      wonTitle: 'You filled the board!',
      wonText: 'A perfect run — every square is yours. Score {score}.',
    },
    tr: {
      title: 'Yılan',
      canvasLabel: 'Yılan oyunu alanı',
      readyText: 'Yemleri ye, büyü; duvara ya da kendine çarpma.',
      hintKb: 'Yönlendirmek için ok tuşları veya WASD · Başlamak için Space · Duraklatmak için P · Yeniden başlatmak için R',
      hintTouch: 'Yönlendirmek için parmağını kaydır.',
      overText: 'Skor {score} · En iyi {best}',
      wonTitle: 'Tahtayı doldurdun!',
      wonText: 'Kusursuz bir oyun — tüm kareler senin. Skor {score}.',
    },
  });

  /* ---------------- Config ---------------- */

  const COLS = 20, ROWS = 20, CELL = 24;
  const W = COLS * CELL, H = ROWS * CELL;      // logical canvas size
  const START_LENGTH = 3;
  const TICK_START_MS = 150;                   // time between moves at the start...
  const TICK_MIN_MS = 62;                      // ...never faster than this...
  const TICK_STEP_MS = 3;                      // ...and 3 ms faster per segment grown.
  const POINTS_PER_FOOD = 10;
  const MAX_QUEUED_TURNS = 2;
  const RESTART_LOCKOUT_MS = 500;               // ignore Space/Enter/tap this long after a result screen appears
  const SWIPE_MIN_PX = 18;                     // CSS pixels of finger travel that count as a swipe

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const KEY_TO_DIR = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };

  /* ---------------- Board: the rules ---------------- */

  class Board {
    constructor(cols, rows, rng) {
      this.cols = cols;
      this.rows = rows;
      this.rng = rng || Math.random;
      this.dir = DIRS.right;
      this.queue = [];                          // buffered turns, applied one per tick
      this.foodEaten = 0;
      this.snake = [];                          // head first
      for (let i = 0; i < START_LENGTH; i++) this.snake.push({ x: Math.floor(cols / 3) - i, y: Math.floor(rows / 2) });
      this.food = this.spawnFood();
    }

    /** Milliseconds between moves; shrinks as the snake grows. */
    tickMs() {
      return Math.max(TICK_MIN_MS, TICK_START_MS - (this.snake.length - START_LENGTH) * TICK_STEP_MS);
    }

    /**
     * Buffer a turn (at most MAX_QUEUED_TURNS). It is validated against the last *queued*
     * direction, falling back to the current one, rather than only the current one. That is
     * what lets two quick turns (e.g. up then left) both register, and what makes a 180-degree
     * reversal impossible even when the opposite key arrives between two ticks.
     */
    steer(dir) {
      if (this.queue.length >= MAX_QUEUED_TURNS) return false;
      const ref = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      const same = dir.x === ref.x && dir.y === ref.y;
      const reverse = dir.x === -ref.x && dir.y === -ref.y;
      if (same || reverse) return false;
      this.queue.push(dir);
      return true;
    }

    /** Advance one cell. Returns 'move' | 'eat' | 'win' | 'wall' | 'self'. */
    step() {
      if (this.queue.length) this.dir = this.queue.shift();
      const head = this.snake[0];
      const next = { x: head.x + this.dir.x, y: head.y + this.dir.y };

      if (next.x < 0 || next.y < 0 || next.x >= this.cols || next.y >= this.rows) return 'wall';

      const eats = !!this.food && next.x === this.food.x && next.y === this.food.y;
      // The tail cell is vacated this tick unless we grow, so moving into it is legal.
      const solid = eats ? this.snake.length : this.snake.length - 1;
      for (let i = 0; i < solid; i++) {
        if (this.snake[i].x === next.x && this.snake[i].y === next.y) return 'self';
      }

      this.snake.unshift(next);
      if (!eats) { this.snake.pop(); return 'move'; }

      this.foodEaten++;
      this.food = this.spawnFood();
      return this.food ? 'eat' : 'win';         // no free cell left: the board is full
    }

    /** Pick uniformly among free cells, so food can never appear on the snake. */
    spawnFood() {
      const taken = new Set(this.snake.map((s) => s.y * this.cols + s.x));
      const free = [];
      for (let i = 0; i < this.cols * this.rows; i++) if (!taken.has(i)) free.push(i);
      if (!free.length) return null;
      const pick = free[Math.floor(this.rng() * free.length)];
      return { x: pick % this.cols, y: Math.floor(pick / this.cols) };
    }
  }

  /* ---------------- Game: state, loop, input, rendering ---------------- */

  const canvas = document.getElementById('board');
  const view = kit.fitCanvas(canvas, W, H);
  const ctx = view.ctx;
  const colors = kit.theme();
  const hud = kit.ui(t);
  const store = kit.storage('arcade.snake.best');
  const audio = kit.beeper();
  const fx = kit.particles();

  let board = new Board(COLS, ROWS);
  let tickAcc = 0;                              // ms accumulated towards the next snake move
  let score = 0;
  let best = store.get();
  let bestAtStart = best;

  const fsm = kit.machine(onStateChange);

  function onStateChange(state) {
    hud.syncState(state);
    if (state === 'playing') hud.hideOverlay();
    else if (state === 'paused') hud.showPaused();
    else if (state === 'ready') {
      hud.showOverlay({ title: t('title'), text: t('readyText'), button: t('play'), hint: hud.touch ? t('hintTouch') : t('hintKb') });
    } else {
      const won = state === 'won';
      const lines = [t('overText', { score, best })];
      if (score > bestAtStart) lines.push(t('newBest'));
      hud.showOverlay({
        title: won ? t('wonTitle') : t('gameOver'),
        text: won ? t('wonText', { score }) : lines.join(' — '),
        button: t('playAgain'),
      });
    }
  }

  function resetRound() {
    board = new Board(COLS, ROWS);
    tickAcc = 0;
    score = 0;
    bestAtStart = best;
    hud.setScore(0);
  }

  function startFresh() {
    if (!fsm.is('ready')) fsm.go('ready');
    resetRound();
    fsm.go('playing');
  }

  /* ----- actions shared by keyboard, buttons and overlay ----- */

  function primary() {
    if (fsm.is('gameover', 'won') && fsm.age() < RESTART_LOCKOUT_MS) return;   // don't skip the result screen by accident
    if (fsm.is('paused')) fsm.go('playing');
    else if (!fsm.is('playing')) startFresh();   // ready, gameover, won
  }
  function togglePause() {
    if (fsm.is('playing')) fsm.go('paused');
    else if (fsm.is('paused')) fsm.go('playing');
  }
  function toggleMute() {
    audio.setMuted(!audio.muted);
    hud.syncMute(audio.muted);
  }

  /* ----- input ----- */

  kit.keyboard((code) => {
    if (code in KEY_TO_DIR) { if (fsm.is('playing')) board.steer(DIRS[KEY_TO_DIR[code]]); return; }
    if (code === 'Space' || code === 'Enter') primary();
    else if (code === 'KeyP' || (code === 'Escape' && !kit.embedded)) togglePause();   // embedded: Esc closes the viewer
    else if (code === 'KeyR') startFresh();
    else if (code === 'KeyM') toggleMute();
  });

  // Swipe: once the finger has travelled far enough in one direction, steer and re-anchor,
  // so a continuous zig-zag gesture produces a sequence of turns.
  (function bindSwipe(el) {
    let anchor = null;
    el.addEventListener('pointerdown', (e) => {
      if (kit.isOverlay(e.target)) return;
      anchor = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!anchor || anchor.id !== e.pointerId || !fsm.is('playing')) return;
      const dx = e.clientX - anchor.x;
      const dy = e.clientY - anchor.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
      const name = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      board.steer(DIRS[name]);
      anchor.x = e.clientX;
      anchor.y = e.clientY;
    });
    const end = () => { anchor = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  })(hud.el.stage);

  hud.bind({ primary, pause: togglePause, mute: toggleMute });
  kit.onFocusLoss(() => { if (fsm.is('playing')) fsm.go('paused'); });

  /* ----- simulation (fixed 60 Hz) ----- */

  function addScore(points) {
    score += points;
    hud.setScore(score);
    if (score > best) { best = score; store.set(best); hud.setBest(best); }
  }

  function update(dt) {
    fx.update(dt);
    if (!fsm.is('playing')) return;

    tickAcc += dt * 1000;
    while (tickAcc >= board.tickMs()) {
      tickAcc -= board.tickMs();
      const result = board.step();
      const head = board.snake[0];
      const px = (head.x + 0.5) * CELL;
      const py = (head.y + 0.5) * CELL;

      if (result === 'eat' || result === 'win') {
        addScore(POINTS_PER_FOOD);
        fx.burst(px, py, colors.danger, 12, 150);
        audio.blip(520 + Math.min(board.foodEaten, 20) * 12, 0.07, 'square');
        if (result === 'win') { fsm.go('won'); return; }
      } else if (result === 'wall' || result === 'self') {
        fx.burst(px, py, colors.accent, 26, 220);
        audio.blip(180, 0.28, 'sawtooth', 0.04, 55);
        fsm.go('gameover');
        return;
      }
    }
  }

  /* ----- rendering ----- */

  function render() {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, W, H);

    // Subtle checkerboard so the grid is readable without lines.
    ctx.fillStyle = 'rgba(167, 139, 250, 0.035)';
    for (let y = 0; y < ROWS; y++) for (let x = (y + 1) % 2; x < COLS; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

    drawFood();
    drawSnake();
    fx.draw(ctx);
  }

  function drawFood() {
    if (!board.food) return;
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 180);
    const cx = (board.food.x + 0.5) * CELL;
    const cy = (board.food.y + 0.5) * CELL;
    ctx.save();
    ctx.shadowColor = colors.danger;
    ctx.shadowBlur = 14;
    ctx.fillStyle = colors.danger;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSnake() {
    const s = board.snake;
    const inset = 2;
    // Body: each pair of neighbouring cells is drawn as one rounded rect, which makes a
    // continuous body; colour fades from tail to head.
    for (let i = s.length - 2; i >= 0; i--) {
      const a = s[i], b = s[i + 1];
      const x = Math.min(a.x, b.x) * CELL + inset;
      const y = Math.min(a.y, b.y) * CELL + inset;
      const w = (Math.abs(a.x - b.x) + 1) * CELL - inset * 2;
      const h = (Math.abs(a.y - b.y) + 1) * CELL - inset * 2;
      ctx.globalAlpha = 0.5 + 0.5 * (1 - i / Math.max(1, s.length - 1));
      ctx.fillStyle = colors.accentStrong;
      kit.roundRect(ctx, x, y, w, h, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Head, with a soft glow and eyes that look where the snake is going.
    const hd = s[0];
    ctx.save();
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = colors.accent;
    kit.roundRect(ctx, hd.x * CELL + inset, hd.y * CELL + inset, CELL - inset * 2, CELL - inset * 2, 8);
    ctx.fill();
    ctx.restore();

    const d = board.dir;
    const cx = (hd.x + 0.5) * CELL, cy = (hd.y + 0.5) * CELL;
    ctx.fillStyle = colors.bg;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + d.x * 4 - d.y * 4.5 * side, cy + d.y * 4 + d.x * 4.5 * side, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ----- boot ----- */

  hud.setBest(best);
  hud.syncMute(audio.muted);
  onStateChange('ready');
  kit.loop({ hz: 60, update, render }).start();

  // Test seam for automated checks and debugging (reads and drives the model); not used by the game itself.
  window.__game = { Board, fsm, get board() { return board; }, get score() { return score; } };
})();
