/*
 * Breakout - fixed 60 Hz simulation, explicit state machine.
 *
 * Collision strategy: the ball is moved in sub-steps of at most half its radius, and each
 * sub-step is resolved against walls, paddle and bricks. Nothing can move further than the
 * ball's radius between two checks, so even at maximum speed it cannot tunnel through a brick.
 * Brick hits are resolved on the axis of the contact normal (circle vs. AABB closest point).
 */
(function () {
  'use strict';
  const kit = window.GameKit;

  const t = kit.i18n({
    en: {
      title: 'Breakout',
      canvasLabel: 'Breakout playfield',
      readyText: "Break every brick. Don't let the ball fall.",
      hintKb: 'Move with ← → or the mouse · Space to launch · P to pause · R to restart',
      hintTouch: 'Drag to move the paddle, tap to launch.',
      level: 'Level {n}',
      lives: 'Lives',
      launchKb: 'Space or click to launch',
      launchTouch: 'Tap to launch',
      overText: 'Score {score} · Best {best}',
      wonTitle: 'All layouts cleared!',
      wonText: 'Score {score}. The bricks come back faster.',
      keepGoing: 'Keep going',
    },
    tr: {
      title: 'Tuğla Kırma',
      canvasLabel: 'Tuğla Kırma oyun alanı',
      readyText: 'Tüm tuğlaları kır, topu düşürme.',
      hintKb: 'Hareket için ← → veya fare · Fırlatmak için Space · Duraklatmak için P · Yeniden başlatmak için R',
      hintTouch: 'Raketi sürükleyerek hareket ettir, fırlatmak için dokun.',
      level: 'Seviye {n}',
      lives: 'Can',
      launchKb: 'Fırlatmak için Space’e bas ya da tıkla',
      launchTouch: 'Fırlatmak için dokun',
      overText: 'Skor {score} · En iyi {best}',
      wonTitle: 'Tüm bölümler bitti!',
      wonText: 'Skor {score}. Tuğlalar daha hızlı geri geliyor.',
      keepGoing: 'Devam et',
    },
  });

  /* ---------------- Config ---------------- */

  const W = 480, H = 640;                       // logical canvas size
  const TOP = 36;                               // status strip; also the ceiling the ball bounces off
  const PADDLE = { w: 88, h: 12, y: H - 44, speed: 560 };   // speed: keyboard, px/s
  const POINTER_SPEED = 2200;                   // how fast the paddle chases the mouse / finger
  const BALL_R = 7;
  const MAX_STEP = BALL_R / 2;                  // largest distance the ball moves between collision checks
  const MAX_BOUNCE = 1.08;                      // rad (~62 deg): bounce angle at the very edge of the paddle
  const MIN_VERTICAL = 0.28;                    // keep |vy| >= 28% of speed so the ball never goes flat
  const LIVES = 3;
  const BASE_SPEED = 330, MAX_SPEED = 640;      // px/s
  const SPEEDUP_PER_BRICK = 1.008;
  const SPEEDUP_PER_LEVEL = 0.07;               // levels beyond the first start 7% faster each (so loops are faster)
  const LEVEL_BONUS = 100;
  const RESTART_LOCKOUT_MS = 500;               // ignore Space/Enter/tap this long after a result screen appears

  const BRICK = { cols: 10, w: 42, h: 18, gap: 4, top: 80 };
  const BRICK_X0 = (W - (BRICK.cols * BRICK.w + (BRICK.cols - 1) * BRICK.gap)) / 2;
  // Digit = row tier: colour and points (tier x 10). '.' = empty.
  const LAYOUTS = [
    ['5555555555', '4444444444', '3333333333', '2222222222', '1111111111'],                                   // classic
    ['....55....', '...4444...', '..333333..', '.22222222.', '..333333..', '...4444...', '....11....'],       // diamond
    ['5.5.5.5.5.', '.4.4.4.4.4', '3.3.3.3.3.', '.2.2.2.2.2', '1111111111', '1111111111'],                   // checkerboard
  ];
  const TIER_COLORS = { 1: '#7c8cf8', 2: '#a78bfa', 3: '#6ee7b7', 4: '#fbbf24', 5: '#fb7185' };

  const levelSpeed = (level) => Math.min(MAX_SPEED, BASE_SPEED * (1 + SPEEDUP_PER_LEVEL * (level - 1)));

  /* ---------------- Setup ---------------- */

  const canvas = document.getElementById('board');
  const view = kit.fitCanvas(canvas, W, H);
  const ctx = view.ctx;
  const colors = kit.theme();
  const hud = kit.ui(t);
  const store = kit.storage('arcade.breakout.best');
  const audio = kit.beeper();
  const fx = kit.particles();

  let level, lives, score, bricks, bricksLeft, speed, banner;
  let best = store.get();
  let bestAtStart = best;
  const paddle = { x: (W - PADDLE.w) / 2, px: 0 };
  const ball = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, stuck: true };
  let pointerTarget = null;                     // paddle centre requested by mouse / touch, or null

  const fsm = kit.machine(onStateChange);

  /* ---------------- State machine ---------------- */

  function onStateChange(state) {
    hud.syncState(state);
    if (state === 'playing') hud.hideOverlay();
    else if (state === 'paused') hud.showPaused();
    else if (state === 'ready') {
      hud.showOverlay({ title: t('title'), text: t('readyText'), button: t('play'), hint: hud.touch ? t('hintTouch') : t('hintKb') });
    } else if (state === 'won') {
      hud.showOverlay({ title: t('wonTitle'), text: t('wonText', { score }), button: t('keepGoing') });
    } else {
      const lines = [t('overText', { score, best })];
      if (score > bestAtStart) lines.push(t('newBest'));
      hud.showOverlay({ title: t('gameOver'), text: lines.join(' — '), button: t('playAgain') });
    }
  }

  function newGame() {
    level = 1;
    lives = LIVES;
    score = 0;
    bestAtStart = best;
    hud.setScore(0);
    loadLevel();
  }

  function startFresh() {
    if (!fsm.is('ready')) fsm.go('ready');
    newGame();
    fsm.go('playing');
  }

  /** After the 'won' screen: keep score and lives, carry on with the (already loaded) next level. */
  function continueRun() {
    fsm.go('ready');
    fsm.go('playing');
  }

  function primary() {
    if (fsm.is('gameover', 'won') && fsm.age() < RESTART_LOCKOUT_MS) return;   // don't skip the result screen by accident
    if (fsm.is('paused')) fsm.go('playing');
    else if (fsm.is('playing')) launch();
    else if (fsm.is('won')) continueRun();
    else startFresh();                           // ready, gameover
  }
  function togglePause() {
    if (fsm.is('playing')) fsm.go('paused');
    else if (fsm.is('paused')) fsm.go('playing');
  }
  function toggleMute() {
    audio.setMuted(!audio.muted);
    hud.syncMute(audio.muted);
  }

  /* ---------------- Level / ball helpers ---------------- */

  function loadLevel() {
    const layout = LAYOUTS[(level - 1) % LAYOUTS.length];
    bricks = [];
    layout.forEach((row, r) => {
      for (let c = 0; c < BRICK.cols; c++) {
        if (row[c] === '.') continue;
        bricks.push({
          x: BRICK_X0 + c * (BRICK.w + BRICK.gap), y: BRICK.top + r * (BRICK.h + BRICK.gap),
          w: BRICK.w, h: BRICK.h, tier: Number(row[c]), alive: true,
        });
      }
    });
    bricksLeft = bricks.length;
    banner = { text: t('level', { n: level }), age: 0 };
    attachBall();
  }

  function attachBall() {
    speed = levelSpeed(level);
    ball.stuck = true;
    ball.vx = ball.vy = 0;
    ball.x = paddle.x + PADDLE.w / 2;
    ball.y = PADDLE.y - BALL_R;
    snapshot();
  }

  /** Remember current positions so rendering can interpolate from them. */
  function snapshot() {
    paddle.px = paddle.x;
    ball.px = ball.x;
    ball.py = ball.y;
  }

  /** Give the ball velocity of magnitude `speed` at `angle` radians from straight up. */
  function aim(angle) {
    ball.vx = speed * Math.sin(angle);
    ball.vy = -speed * Math.cos(angle);
  }

  function setSpeed(next) {
    const k = next / Math.hypot(ball.vx, ball.vy);
    ball.vx *= k;
    ball.vy *= k;
    speed = next;
  }

  /** Stops long, almost-horizontal rallies: keep at least MIN_VERTICAL of the speed vertical. */
  function keepSteep() {
    const minVy = speed * MIN_VERTICAL;
    if (Math.abs(ball.vy) >= minVy) return;
    ball.vy = (ball.vy < 0 ? -1 : 1) * minVy;
    ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(speed * speed - minVy * minVy);
  }

  function launch() {
    if (!fsm.is('playing') || !ball.stuck) return;
    ball.stuck = false;
    aim((Math.random() * 2 - 1) * 0.35);
    audio.blip(330, 0.06, 'triangle');
  }

  function addScore(points) {
    score += points;
    hud.setScore(score);
    if (score > best) { best = score; store.set(best); hud.setBest(best); }
  }

  /* ---------------- Input ---------------- */

  const input = kit.keyboard((code) => {
    if (code === 'Space' || code === 'Enter') primary();
    else if (code === 'KeyP' || (code === 'Escape' && !kit.embedded)) togglePause();   // embedded: Esc closes the viewer
    else if (code === 'KeyR') startFresh();
    else if (code === 'KeyM') toggleMute();
  });

  kit.dragAxis(hud.el.stage, view, 'x', {
    value: () => paddle.x + PADDLE.w / 2,
    onMove: (centre) => { if (fsm.is('playing')) pointerTarget = centre; },
    onTap: launch,
  });

  hud.bind({ primary, pause: togglePause, mute: toggleMute });
  kit.onFocusLoss(() => { if (fsm.is('playing')) fsm.go('paused'); });

  /* ---------------- Simulation (fixed 60 Hz) ---------------- */

  function update(dt) {
    fx.update(dt);
    if (!fsm.is('playing')) { snapshot(); return; }

    snapshot();
    if (banner) { banner.age += dt; if (banner.age > 1.6) banner = null; }
    movePaddle(dt);
    if (ball.stuck) {
      ball.x = paddle.x + PADDLE.w / 2;
      return;
    }
    moveBall(dt);
  }

  function movePaddle(dt) {
    const dir = (input.isDown('ArrowRight') || input.isDown('KeyD') ? 1 : 0) - (input.isDown('ArrowLeft') || input.isDown('KeyA') ? 1 : 0);
    if (dir) {
      paddle.x += dir * PADDLE.speed * dt;
      pointerTarget = null;                      // keyboard takes over from a stale pointer target
    } else if (pointerTarget !== null) {
      const d = pointerTarget - PADDLE.w / 2 - paddle.x;
      const step = POINTER_SPEED * dt;
      paddle.x += kit.clamp(d, -step, step);
    }
    paddle.x = kit.clamp(paddle.x, 0, W - PADDLE.w);
  }

  /** Advance the ball by dt in sub-steps; resolve collisions after each one. */
  function moveBall(dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / MAX_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      collideWalls();
      collidePaddle();
      collideBricks();
      if (bricksLeft === 0) { levelCleared(); return; }
      if (ball.y - BALL_R > H) { loseLife(); return; }
    }
  }

  function collideWalls() {
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); audio.blip(260, 0.04, 'square'); }
    else if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); audio.blip(260, 0.04, 'square'); }
    if (ball.y < TOP + BALL_R) { ball.y = TOP + BALL_R; ball.vy = Math.abs(ball.vy); keepSteep(); audio.blip(260, 0.04, 'square'); }
  }

  function collidePaddle() {
    const top = PADDLE.y;
    // Only a falling ball, whose centre is still above the paddle's mid-line, can hit its top face.
    if (ball.vy <= 0 || ball.y + BALL_R < top || ball.y > top + PADDLE.h / 2) return;
    if (ball.x < paddle.x - BALL_R || ball.x > paddle.x + PADDLE.w + BALL_R) return;

    // Where on the paddle we landed (-1 left edge .. +1 right edge) sets the outgoing angle.
    const offset = kit.clamp((ball.x - (paddle.x + PADDLE.w / 2)) / (PADDLE.w / 2), -1, 1);
    ball.y = top - BALL_R;
    aim(offset * MAX_BOUNCE);
    audio.blip(440, 0.05, 'triangle');
    fx.burst(ball.x, top, colors.accent, 5, 90);
  }

  /** Circle vs. rectangle against the closest brick; reflect along the dominant contact axis. */
  function collideBricks() {
    let hit = null, hx = 0, hy = 0, bestD2 = BALL_R * BALL_R;
    for (const b of bricks) {
      if (!b.alive) continue;
      const dx = ball.x - kit.clamp(ball.x, b.x, b.x + b.w);   // vector from the closest point on the brick
      const dy = ball.y - kit.clamp(ball.y, b.y, b.y + b.h);   // to the ball centre
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; hit = b; hx = dx; hy = dy; }
    }
    if (!hit) return;

    if (hx === 0 && hy === 0) {
      ball.vy = -ball.vy;                        // centre is inside the brick (practically unreachable)
    } else {
      // Setting the velocity sign (rather than negating) avoids double-flips on consecutive sub-steps.
      if (Math.abs(hx) > Math.abs(hy)) ball.vx = (hx > 0 ? 1 : -1) * Math.abs(ball.vx);
      else ball.vy = (hy > 0 ? 1 : -1) * Math.abs(ball.vy);
      const d = Math.sqrt(bestD2);               // push the ball out along the contact normal
      ball.x += hx / d * (BALL_R - d);
      ball.y += hy / d * (BALL_R - d);
    }

    hit.alive = false;
    bricksLeft--;
    addScore(hit.tier * 10);
    setSpeed(Math.min(MAX_SPEED, speed * SPEEDUP_PER_BRICK));
    keepSteep();
    fx.burst(hit.x + hit.w / 2, hit.y + hit.h / 2, TIER_COLORS[hit.tier], 8, 130);
    audio.blip(300 + hit.tier * 90, 0.05, 'square');
  }

  function loseLife() {
    lives--;
    audio.blip(200, 0.25, 'sawtooth', 0.04, 60);
    fx.burst(ball.x, H - 6, colors.danger, 16, 160);
    if (lives <= 0) {
      fsm.go('gameover');
      return;
    }
    attachBall();
  }

  function levelCleared() {
    addScore(LEVEL_BONUS);
    const finishedCycle = level % LAYOUTS.length === 0;
    level++;
    loadLevel();                                  // also re-attaches the ball to the paddle
    audio.blip(660, 0.18, 'triangle', 0.04, 990);
    if (finishedCycle) fsm.go('won');
  }

  /* ---------------- Rendering ---------------- */

  const lerp = (a, b, k) => a + (b - a) * k;

  function render(alpha) {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, W, H);
    drawStatusStrip();
    drawBricks();

    const px = lerp(paddle.px, paddle.x, alpha);
    drawPaddle(px);

    const bx = lerp(ball.px, ball.x, alpha), by = lerp(ball.py, ball.y, alpha);
    ctx.save();
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    fx.draw(ctx);
    drawMessages();
  }

  function drawStatusStrip() {
    ctx.fillStyle = colors.surface2;
    ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, TOP - 1, W, 1);

    ctx.font = '600 15px ' + colors.ui;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.muted;
    ctx.fillText(t('level', { n: level }), 16, TOP / 2);

    ctx.textAlign = 'right';
    ctx.fillText(t('lives'), W - 16 - LIVES * 18 - 4, TOP / 2);
    for (let i = 0; i < LIVES; i++) {
      ctx.beginPath();
      ctx.arc(W - 16 - 5 - i * 18, TOP / 2, 5, 0, Math.PI * 2);
      if (i < lives) { ctx.fillStyle = colors.accent; ctx.fill(); }
      else { ctx.strokeStyle = colors.border; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  function drawBricks() {
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = TIER_COLORS[b.tier];
      kit.roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';       // soft top highlight
      kit.roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, 4, 2);
      ctx.fill();
    }
  }

  function drawPaddle(x) {
    ctx.save();
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(x, 0, x + PADDLE.w, 0);
    g.addColorStop(0, colors.accentStrong);
    g.addColorStop(0.5, colors.accent);
    g.addColorStop(1, colors.accentStrong);
    ctx.fillStyle = g;
    kit.roundRect(ctx, x, PADDLE.y, PADDLE.w, PADDLE.h, 6);
    ctx.fill();
    ctx.restore();
  }

  function drawMessages() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (fsm.is('playing') && banner) {
      const fade = Math.min(1, (1.6 - banner.age) * 2.5);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = colors.text;
      ctx.font = '700 34px ' + colors.ui;
      ctx.fillText(banner.text, W / 2, H * 0.5);
      ctx.globalAlpha = 1;
    }
    if (fsm.is('playing') && ball.stuck) {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(performance.now() / 260);
      ctx.fillStyle = colors.muted;
      ctx.font = '600 16px ' + colors.ui;
      ctx.fillText(t(hud.touch ? 'launchTouch' : 'launchKb'), W / 2, PADDLE.y - 46);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- Boot ---------------- */

  newGame();
  hud.setBest(best);
  hud.syncMute(audio.muted);
  onStateChange('ready');
  kit.loop({ hz: 60, update, render }).start();

  // Test seam for automated checks and debugging (reads and drives the simulation); not used by the game itself.
  window.__game = {
    fsm, ball, paddle, MAX_SPEED, BALL_R, W, H,
    get bricks() { return bricks; }, get lives() { return lives; }, get score() { return score; }, get level() { return level; },
    loadLevel, moveBall, setSpeed, launch,
  };
})();
