/*
 * Pong - you against the computer, first to 7.
 *
 * Fixed 60 Hz simulation, explicit state machine. The simulation always runs on a horizontal
 * court (you on the left, the computer on the right). When the stage is clearly taller than wide
 * the same court is drawn rotated (you at the bottom, the computer at the top) and pointer and
 * keyboard input are rotated back, so only the fitting, input and rendering code knows about
 * orientation. A change of orientation mid-game pauses the game. The ball moves in sub-steps no longer than
 * half its radius, so it cannot skip over a paddle even at top speed. The computer opponent
 * is deliberately imperfect: it only "looks" at the ball a few times per second, aims with a
 * random error, and has a capped paddle speed, which makes steep returns hard for it to reach.
 */
(function () {
  'use strict';
  const kit = window.GameKit;

  const t = kit.i18n({
    en: {
      title: 'Pong',
      canvasLabel: 'Pong court',
      bestMargin: 'Best margin',
      readyText: 'First to 7 points wins.',
      hintKb: 'W / S or ↑ / ↓ to move · Space to start · P to pause · R to restart',
      hintKbPortrait: '← → or A / D to move · Space to start · P to pause · R to restart',
      hintTouch: 'Drag up and down to move your paddle.',
      hintTouchPortrait: 'Drag left and right to move your paddle.',
      you: 'You',
      cpu: 'CPU',
      winTitle: 'You win!',
      winText: '{you}–{cpu} · win margin +{margin}',
      loseTitle: 'You lose',
      loseText: 'The computer takes it {cpu}–{you}. Try again!',
    },
    tr: {
      title: 'Pong',
      canvasLabel: 'Pong sahası',
      bestMargin: 'En iyi fark',
      readyText: 'İlk 7 sayıyı alan kazanır.',
      hintKb: 'Hareket için W / S veya ↑ / ↓ · Başlamak için Space · Duraklatmak için P · Yeniden başlatmak için R',
      hintKbPortrait: 'Hareket için ← → veya A / D · Başlamak için Space · Duraklatmak için P · Yeniden başlatmak için R',
      hintTouch: 'Raketini yukarı aşağı sürükleyerek hareket ettir.',
      hintTouchPortrait: 'Raketini sağa sola sürükleyerek hareket ettir.',
      you: 'Sen',
      cpu: 'Bilgisayar',
      winTitle: 'Kazandın!',
      winText: '{you}–{cpu} · fark +{margin}',
      loseTitle: 'Kaybettin',
      loseText: 'Bilgisayar {cpu}–{you} kazandı. Tekrar dene!',
    },
  });

  /* ---------------- Config ---------------- */

  const W = 640, H = 400;                       // court size in simulation units (always horizontal)
  const PORTRAIT_RATIO = 1.15;                  // stage at least this much taller than wide -> vertical court
  const PADDLE = { w: 12, h: 76, margin: 24, speed: 480 };   // speed: keyboard, px/s
  const POINTER_SPEED = 1800;                   // how fast the paddle chases the mouse / finger
  const BALL_R = 7;
  const MAX_STEP = BALL_R / 2;
  const BALL_START = 340, BALL_MAX = 780;       // px/s
  const RALLY_SPEEDUP = 1.055;                  // per paddle hit
  const MAX_BOUNCE = 0.95;                      // rad (~54 deg) at the very edge of a paddle
  const WIN_SCORE = 7;
  const RESTART_LOCKOUT_MS = 500;               // ignore Space/Enter/tap this long after a result screen appears
  const SERVE_DELAY = 0.9;                      // seconds the ball rests before each serve
  const AI = { speed: 300, reaction: 0.12, error: 34, deadzone: 8 };   // px/s, s, px, px

  /* ---------------- Setup ---------------- */

  const canvas = document.getElementById('board');
  let portrait = false;                         // court drawn vertically (you at the bottom)?
  let booted = false;
  // Pick the court orientation from the free stage size on every fit; the canvas is H x W when vertical.
  const view = kit.fitCanvas(canvas, W, H, undefined, (availW, availH) => {
    const next = availH > availW * PORTRAIT_RATIO;
    if (next !== portrait) { portrait = next; if (booted) orientationChanged(); }
    return portrait ? [H, W] : [W, H];
  });
  const ctx = view.ctx;
  const colors = kit.theme();
  const hud = kit.ui(t);
  const store = kit.storage('arcade.pong.bestMargin');
  const audio = kit.beeper();
  const fx = kit.particles();

  // y is the paddle centre; py is last step's y, for render interpolation.
  const player = { x: PADDLE.margin, y: H / 2, py: H / 2 };
  const cpu = { x: W - PADDLE.margin - PADDLE.w, y: H / 2, py: H / 2, targetY: H / 2, timer: 0, error: 0 };
  const ball = { x: W / 2, y: H / 2, px: W / 2, py: H / 2, vx: 0, vy: 0 };
  const scores = { player: 0, cpu: 0 };
  let speed = BALL_START;
  let serveTimer = 0;
  let pointerTarget = null;                     // player paddle centre requested by mouse / touch, or null
  let best = store.get();                       // best win margin, 0 = no win yet
  let bestAtStart = best;

  const fsm = kit.machine(onStateChange);

  /* ---------------- State machine ---------------- */

  const bestText = () => (best > 0 ? '+' + best : '–');
  const scoreText = () => scores.player + ' : ' + scores.cpu;

  function onStateChange(state) {
    hud.syncState(state);
    if (state === 'playing') hud.hideOverlay();
    else if (state === 'paused') hud.showPaused();
    else if (state === 'ready') {
      const hint = (hud.touch ? 'hintTouch' : 'hintKb') + (portrait ? 'Portrait' : '');
      hud.showOverlay({ title: t('title'), text: t('readyText'), button: t('play'), hint: t(hint) });
    } else if (state === 'won') {
      const margin = scores.player - scores.cpu;
      const lines = [t('winText', { you: scores.player, cpu: scores.cpu, margin })];
      if (best > bestAtStart) lines.push(t('newBest'));
      hud.showOverlay({ title: t('winTitle'), text: lines.join(' — '), button: t('playAgain') });
    } else {
      hud.showOverlay({ title: t('loseTitle'), text: t('loseText', { you: scores.player, cpu: scores.cpu }), button: t('playAgain') });
    }
  }

  function newGame() {
    scores.player = scores.cpu = 0;
    player.y = cpu.y = cpu.targetY = H / 2;
    pointerTarget = null;
    bestAtStart = best;
    hud.setScore(scoreText());
    serve(Math.random() < 0.5 ? 1 : -1);
    snapshot();
  }

  function startFresh() {
    if (!fsm.is('ready')) fsm.go('ready');
    newGame();
    fsm.go('playing');
  }

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

  /** The court was rotated (phone turned, window resized): pause, and drop input meant for the old layout. */
  function orientationChanged() {
    input.clear();
    pointerTarget = null;
    if (fsm.is('playing')) fsm.go('paused');
    else if (fsm.is('ready')) onStateChange('ready');   // the control hint depends on the orientation
  }

  /* ---------------- Input ---------------- */

  const input = kit.keyboard((code) => {
    if (code === 'Space' || code === 'Enter') primary();
    else if (code === 'KeyP' || (code === 'Escape' && !kit.embedded)) togglePause();   // embedded: Esc closes the viewer
    else if (code === 'KeyR') startFresh();
    else if (code === 'KeyM') toggleMute();
  });

  // Pointer positions arrive in canvas units; on the vertical court rotate them back into court
  // units (inverse of the render transform below), so the paddle always moves along court y.
  const courtView = {
    toLogical(clientX, clientY) {
      const p = view.toLogical(clientX, clientY);
      return portrait ? { x: W - p.y, y: p.x } : p;
    },
  };
  kit.dragAxis(hud.el.stage, courtView, 'y', {
    value: () => player.y,
    onMove: (centre) => { if (fsm.is('playing')) pointerTarget = centre; },
  });

  hud.bind({ primary, pause: togglePause, mute: toggleMute });
  kit.onFocusLoss(() => { if (fsm.is('playing')) fsm.go('paused'); });

  /* ---------------- Simulation (fixed 60 Hz) ---------------- */

  function snapshot() {
    player.py = player.y;
    cpu.py = cpu.y;
    ball.px = ball.x;
    ball.py = ball.y;
  }

  /** Put the ball in the centre and send it towards `dir` (+1 = right/CPU, -1 = left/player). */
  function serve(dir) {
    speed = BALL_START;
    const angle = (Math.random() * 2 - 1) * 0.45;
    ball.x = W / 2;
    ball.y = H / 2;
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    serveTimer = SERVE_DELAY;
  }

  function update(dt) {
    fx.update(dt);
    if (!fsm.is('playing')) { snapshot(); return; }

    snapshot();
    movePlayer(dt);
    moveCpu(dt);
    if (serveTimer > 0) { serveTimer -= dt; return; }
    moveBall(dt);
  }

  const held = (a, b) => (input.isDown(a) || input.isDown(b) ? 1 : 0);

  function movePlayer(dt) {
    // Court +y is screen down on the horizontal court and screen right on the vertical one.
    const dir = portrait
      ? held('ArrowRight', 'KeyD') - held('ArrowLeft', 'KeyA')
      : held('ArrowDown', 'KeyS') - held('ArrowUp', 'KeyW');
    if (dir) {
      player.y += dir * PADDLE.speed * dt;
      pointerTarget = null;
    } else if (pointerTarget !== null) {
      const step = POINTER_SPEED * dt;
      player.y += kit.clamp(pointerTarget - player.y, -step, step);
    }
    player.y = kit.clamp(player.y, PADDLE.h / 2, H - PADDLE.h / 2);
  }

  /**
   * CPU: every AI.reaction seconds it samples the ball's y (so it works from slightly stale
   * information), adds the current aiming error, and chases that target at a capped speed.
   * While the ball travels away it drifts back to the centre.
   */
  function moveCpu(dt) {
    cpu.timer -= dt;
    if (cpu.timer <= 0) {
      cpu.timer += AI.reaction;
      cpu.targetY = ball.vx > 0 && serveTimer <= 0 ? ball.y + cpu.error : H / 2;
    }
    const d = cpu.targetY - cpu.y;
    if (Math.abs(d) > AI.deadzone) cpu.y += kit.clamp(d, -AI.speed * dt, AI.speed * dt);
    cpu.y = kit.clamp(cpu.y, PADDLE.h / 2, H - PADDLE.h / 2);
  }

  function moveBall(dt) {
    const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / MAX_STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;

      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); audio.blip(240, 0.03, 'square'); }
      else if (ball.y > H - BALL_R) { ball.y = H - BALL_R; ball.vy = -Math.abs(ball.vy); audio.blip(240, 0.03, 'square'); }

      collidePaddle(player, 1);
      collidePaddle(cpu, -1);

      if (ball.x + BALL_R < 0) { point('cpu'); return; }
      if (ball.x - BALL_R > W) { point('player'); return; }
    }
  }

  /** `outDir` is the direction the ball leaves this paddle in (+1 for the left paddle). */
  function collidePaddle(p, outDir) {
    if (Math.sign(ball.vx) === outDir) return;                       // already travelling away
    const left = p.x, right = p.x + PADDLE.w;
    if (ball.y < p.y - PADDLE.h / 2 - BALL_R || ball.y > p.y + PADDLE.h / 2 + BALL_R) return;
    if (ball.x + BALL_R < left || ball.x - BALL_R > right) return;
    if (outDir === 1 ? ball.x < left : ball.x > right) return;      // centre already behind the paddle: missed

    // Hit position (-1 top edge .. +1 bottom edge) decides the outgoing angle.
    const offset = kit.clamp((ball.y - p.y) / (PADDLE.h / 2 + BALL_R), -1, 1);
    const angle = offset * MAX_BOUNCE;
    speed = Math.min(BALL_MAX, speed * RALLY_SPEEDUP);
    ball.vx = outDir * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
    ball.x = outDir === 1 ? right + BALL_R : left - BALL_R;

    if (outDir === 1) cpu.error = (Math.random() * 2 - 1) * AI.error;   // new aiming error for the CPU's next return
    fx.burst(ball.x, ball.y, outDir === 1 ? colors.accent : colors.muted, 6, 110);
    audio.blip(outDir === 1 ? 420 : 340, 0.05, 'square');
  }

  function point(winner) {
    scores[winner]++;
    hud.setScore(scoreText());
    const edgeX = winner === 'player' ? W : 0;
    fx.burst(edgeX, kit.clamp(ball.y, 0, H), winner === 'player' ? colors.ok : colors.danger, 18, 190);
    audio.blip(winner === 'player' ? 620 : 160, 0.16, 'triangle');

    if (scores[winner] < WIN_SCORE) {
      serve(winner === 'player' ? 1 : -1);        // the side that conceded receives the serve
      return;
    }
    if (winner === 'player') {
      const margin = scores.player - scores.cpu;
      if (margin > best) { best = margin; store.set(best); hud.setBest(bestText()); }
      fsm.go('won');
    } else {
      fsm.go('gameover');
    }
  }

  /* ---------------- Rendering ---------------- */

  const lerp = (a, b, k) => a + (b - a) * k;

  function render(alpha) {
    ctx.fillStyle = colors.surface;
    ctx.fillRect(0, 0, view.W, view.H);
    drawScores();
    ctx.save();
    // Vertical court: court x runs up the screen and court y to the right, so you are at the bottom.
    if (portrait) ctx.transform(0, -1, 1, 0, 0, W);
    drawCourt();
    drawPaddle(player.x, lerp(player.py, player.y, alpha), colors.accent, colors.accentStrong);
    drawPaddle(cpu.x, lerp(cpu.py, cpu.y, alpha), colors.muted, colors.border);

    // The resting ball blinks during the serve delay so it's clear a serve is coming.
    const blink = serveTimer > 0 && fsm.is('playing') ? 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 110)) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.arc(lerp(ball.px, ball.x, alpha), lerp(ball.py, ball.y, alpha), BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    fx.draw(ctx);
    ctx.restore();
  }

  /** Centre line, in court units (rotated with the court). */
  function drawCourt() {
    ctx.fillStyle = colors.border;
    for (let y = 8; y < H; y += 24) ctx.fillRect(W / 2 - 1.5, y, 3, 12);
  }

  /** Scores and labels, in canvas units so the text is never rotated: one per half of the court. */
  function drawScores() {
    // Horizontal: you left, CPU right, near the top. Vertical: CPU top half, you bottom half.
    const you = portrait ? [view.W / 2, view.H * 0.75 - 6] : [W / 4, 84];
    const cpuAt = portrait ? [view.W / 2, view.H * 0.25 - 6] : [(3 * W) / 4, 84];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 64px ' + colors.mono;
    ctx.fillStyle = 'rgba(233, 230, 245, 0.16)';
    ctx.fillText(String(scores.player), you[0], you[1]);
    ctx.fillText(String(scores.cpu), cpuAt[0], cpuAt[1]);

    ctx.font = '600 15px ' + colors.ui;
    ctx.fillStyle = colors.muted;
    ctx.fillText(t('you'), you[0], you[1] + 28);
    ctx.fillText(t('cpu'), cpuAt[0], cpuAt[1] + 28);
  }

  function drawPaddle(x, centreY, light, dark) {
    ctx.save();
    ctx.shadowColor = light;
    ctx.shadowBlur = 14;
    const g = ctx.createLinearGradient(0, centreY - PADDLE.h / 2, 0, centreY + PADDLE.h / 2);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    kit.roundRect(ctx, x, centreY - PADDLE.h / 2, PADDLE.w, PADDLE.h, 6);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- Boot ---------------- */

  newGame();
  hud.setBest(bestText());
  hud.syncMute(audio.muted);
  onStateChange('ready');
  booted = true;
  kit.loop({ hz: 60, update, render }).start();

  // Test seam for automated checks and debugging (reads and drives the simulation); not used by the game itself.
  window.__game = {
    fsm, ball, player, cpu, scores, AI, BALL_MAX, W, H,
    get speed() { return speed; }, get portrait() { return portrait; }, serve, moveBall,
  };
})();
