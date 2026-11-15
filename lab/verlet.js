/*
 * verlet.js - 2D position-based Verlet physics sandbox.
 *
 * Every body is made of points. A point stores its current position (x, y) and its
 * previous position (px, py); velocity is implicit: v = x - px. One step does
 *
 *   1. integrate:  x' = x + (x - px) * damping + g * h^2,   px = x
 *   2. relax (ITERATIONS times): distance constraints, circle-circle contacts,
 *      point-vs-box contacts, wall clamping - each fixes positions directly
 *   3. walls: bounce + friction, by editing px (i.e. the implicit velocity)
 *
 * Because constraints only move positions, the velocity change that a correction implies
 * is picked up automatically on the next step, which is what makes Verlet so stable.
 * The step is fixed (120 Hz) and driven by an accumulator, so the simulation behaves the
 * same at 30, 60 or 144 fps; rendering interpolates between the last two steps.
 *
 * Bodies: loose balls (single points), a chain hanging from a draggable pin (points +
 * distance constraints), and boxes (4 corner points, 4 edges + 2 diagonals so they cannot
 * shear). Drag anything; release to throw it; click or tap empty space to add a ball.
 * With keyboard focus on the canvas, Space or Enter drops a ball near the top and R resets
 * the scene.
 *
 * Usage:  var demo = LabDemos.verlet.mount(canvas, { accent, onStats, lang });
 *         demo.start(); demo.stop(); demo.destroy();
 *         demo.setLang('tr');   // switch strings in place; the simulation is kept
 */
(function () {
  'use strict';

  // ------------------------------------------------------------ tunables ----
  var WORLD_W = 160;            // world width in units; height follows the canvas aspect
  var STEP_HZ = 120;            // fixed simulation rate
  var STEP = 1 / STEP_HZ;
  var MAX_STEPS_PER_FRAME = 8;  // after a long frame, drop time instead of spiralling
  var MAX_DT = 0.1;             // clamp for long frames (tab switches)
  var ITERATIONS = 8;           // constraint relaxation passes per step
  var GRAVITY = 240;            // units / s^2
  var DAMPING = 0.9993;         // velocity kept per step (air drag)
  var MAX_SPEED = 320;          // units / s, hard cap to keep things sane
  var RESTITUTION = 0.35;       // wall bounciness
  var BOUNCE_MIN = 20;          // units / s; slower impacts do not bounce (no resting jitter)
  var WALL_FRICTION = 0.04;     // fraction of tangential velocity lost per step in contact
  var CONTACT_FRICTION = 0.25;  // same, for body-body contacts (lets piles come to rest)
  var CONTACT_SLOP = 0.02;      // touching within this gap still counts as a contact for friction
  var EDGE_R = 0.8;             // half thickness of box edges (and corner radius)
  var MAX_BODIES = 48;          // rope + boxes + loose balls
  var THROW_WINDOW = 0.08;      // seconds of pointer history used for the throw velocity

  var ROPE_LINKS = 14, ROPE_SPACING = 3, BEAD_R = 1.3, PIN_R = 1.6, BOB_R = 4.2;
  var KIND_BALL = 0, KIND_BEAD = 1, KIND_CORNER = 2;

  var BG = '#0b0a12', SURFACE2 = '#1a1726', MUTED = '#9690ad';

  var TEXT = {
    en: { bodies: 'bodies', hint: 'Drag to throw · click or tap empty space to add a ball' },
    tr: { bodies: 'cisim', hint: 'Sürükleyip fırlatın · boş alana tıklayınca top eklenir' }
  };
  // Keys that would scroll the page while the canvas has focus (Space also drops a ball).
  var SWALLOW = { Space: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };

  // -------------------------------------------------------------- helpers ----
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return [167, 139, 250];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }
  // Tiny seeded PRNG (mulberry32) so the starting scene is the same on every load.
  function makeRandom(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- mount ----
  function mount(canvas, opts) {
    opts = opts || {};
    var accent = hexToRgb(opts.accent || '#a78bfa');
    var onStats = typeof opts.onStats === 'function' ? opts.onStats : null;
    var L = TEXT[opts.lang === 'tr' ? 'tr' : 'en'];
    var ctx = canvas.getContext('2d');
    var SEED = 512, rand = makeRandom(SEED);

    // ---- point storage (structure of arrays, allocated once) ----
    var MAXP = 128, MAXC = 64;
    var x = new Float64Array(MAXP), y = new Float64Array(MAXP);     // position
    var px = new Float64Array(MAXP), py = new Float64Array(MAXP);   // previous position
    var ox = new Float64Array(MAXP), oy = new Float64Array(MAXP);   // position at step start (render interpolation)
    var rad = new Float64Array(MAXP);                               // collision radius
    var invM = new Float64Array(MAXP);                              // inverse mass, 0 = immovable
    var kind = new Uint8Array(MAXP), colorIdx = new Uint8Array(MAXP);
    var bodyOf = new Int16Array(MAXP), alive = new Uint8Array(MAXP);
    var pinned = new Uint8Array(MAXP);
    var nPts = 0;

    // ---- distance constraints ----
    var ca = new Int16Array(MAXC), cb = new Int16Array(MAXC);
    var rest = new Float64Array(MAXC), cDraw = new Uint8Array(MAXC);
    var nCon = 0;

    // ---- composite bodies ----
    var ropeFirst = 0, ropeCount = 0, nBodies = 0;
    var boxFirst = new Int16Array(4), boxBody = new Int16Array(4), nBoxes = 0;
    var fnx = new Float64Array(4), fny = new Float64Array(4);      // scratch: box face normals

    // ---- loose balls live in a fixed block of slots used as a ring buffer ----
    var ballFirst = 0, ballCap = 0, ballSeq = 0, ballCount = 0;
    var ballAge = new Float64Array(MAXP);

    var worldH = WORLD_W * 10 / 16;
    var unitPx = 1, dpr = 1;               // device px per world unit
    var acc = 0, stepsThisSecond = 0, rateTimer = 0, stepRate = STEP_HZ;
    var statsTimer = 0, lastStats = '';
    var running = false, destroyed = false, rafId = 0, lastT = 0;
    var showHint = true, hintFont = '';

    // ---- drag state ----
    var dragId = -1, dragPt = -1, dragInvM = 0;
    var dragTX = 0, dragTY = 0, dragFromX = 0, dragFromY = 0;
    var SAMPLES = 8, sampT = new Float64Array(SAMPLES), sampX = new Float64Array(SAMPLES);
    var sampY = new Float64Array(SAMPLES), sampHead = 0, sampN = 0;

    // ---- colours (strings built once) ----
    var bgRgb = hexToRgb(BG), white = [255, 255, 255], grey = [110, 104, 136];
    var BALL_COLORS = [
      rgba(accent, 1),
      rgba(mix(accent, white, 0.35), 1),
      rgba(mix(accent, grey, 0.55), 1),
      rgba(mix(grey, bgRgb, 0.1), 1),
      rgba(mix(accent, bgRgb, 0.4), 1)
    ];
    var boxFill = rgba(mix(hexToRgb(SURFACE2), accent, 0.12), 0.92);
    var boxStroke = rgba(mix(accent, grey, 0.4), 1);
    var diagStroke = rgba(accent, 0.18);
    var gridStroke = rgba(hexToRgb(SURFACE2), 1);
    var highlight = 'rgba(255,255,255,0.14)';
    var accentStr = rgba(accent, 1), dragRing = rgba(accent, 0.45);

    // ------------------------------------------------------------ scene ----
    function addPoint(px0, py0, r, mass, k, body) {
      var i = nPts++;
      x[i] = px[i] = ox[i] = px0; y[i] = py[i] = oy[i] = py0;
      rad[i] = r; invM[i] = mass > 0 ? 1 / mass : 0;
      kind[i] = k; bodyOf[i] = body; alive[i] = 1; pinned[i] = mass > 0 ? 0 : 1;
      return i;
    }
    function addConstraint(i, j, draw) {
      var dx = x[j] - x[i], dy = y[j] - y[i];
      ca[nCon] = i; cb[nCon] = j; rest[nCon] = Math.sqrt(dx * dx + dy * dy); cDraw[nCon] = draw ? 1 : 0;
      nCon++;
    }

    function addRope(ax, ay, angle) {
      var body = nBodies++;
      ropeFirst = nPts;
      addPoint(ax, ay, PIN_R, 0, KIND_BEAD, body);                  // the pin: infinite mass
      var cx = Math.cos(angle), cy = Math.sin(angle), i;
      for (i = 1; i <= ROPE_LINKS; i++) {
        addPoint(ax + cx * ROPE_SPACING * i, ay + cy * ROPE_SPACING * i, BEAD_R, 0.6, KIND_BEAD, body);
        addConstraint(nPts - 2, nPts - 1, true);
      }
      // Heavy bob at the end; its link is longer so it does not overlap the last bead.
      var d = ROPE_SPACING * ROPE_LINKS + BEAD_R + BOB_R + 0.4;
      var bob = addPoint(ax + cx * d, ay + cy * d, BOB_R, BOB_R * BOB_R, KIND_BEAD, body);
      colorIdx[bob] = 0;
      addConstraint(nPts - 2, bob, true);
      ropeCount = nPts - ropeFirst;
    }

    function addBox(cx, cy, size, angle) {
      var body = nBodies++, h = size / 2, c = Math.cos(angle), s = Math.sin(angle);
      var mass = size * size * 0.15;                                 // per corner
      var first = nPts;
      // Corners in winding order, so edges are (0,1) (1,2) (2,3) (3,0).
      addPoint(cx + (-h * c + h * s), cy + (-h * s - h * c), EDGE_R, mass, KIND_CORNER, body);
      addPoint(cx + (h * c + h * s), cy + (h * s - h * c), EDGE_R, mass, KIND_CORNER, body);
      addPoint(cx + (h * c - h * s), cy + (h * s + h * c), EDGE_R, mass, KIND_CORNER, body);
      addPoint(cx + (-h * c - h * s), cy + (-h * s + h * c), EDGE_R, mass, KIND_CORNER, body);
      for (var k = 0; k < 4; k++) addConstraint(first + k, first + ((k + 1) & 3), true);
      addConstraint(first, first + 2, false);                        // diagonals keep it square
      addConstraint(first + 1, first + 3, false);
      boxFirst[nBoxes] = first; boxBody[nBoxes] = body; nBoxes++;
    }

    function spawnBall(bx, by, r) {
      // Reuse a free slot, or recycle the oldest ball once the cap is reached.
      var slot = -1, oldest = -1, i;
      for (i = ballFirst; i < ballFirst + ballCap; i++) {
        if (!alive[i]) { slot = i; break; }
        if (oldest < 0 || ballAge[i] < ballAge[oldest]) oldest = i;
      }
      if (slot < 0) {
        slot = oldest;
        if (dragPt === slot) endDrag(0, 0, false);
        ballCount--;
      }
      x[slot] = px[slot] = ox[slot] = bx; y[slot] = py[slot] = oy[slot] = by;
      rad[slot] = r; invM[slot] = 1 / (r * r); kind[slot] = KIND_BALL; pinned[slot] = 0;
      bodyOf[slot] = slot + 1000;                                   // unique body id per ball
      colorIdx[slot] = (ballSeq * 7) % BALL_COLORS.length;
      alive[slot] = 1; ballAge[slot] = ballSeq++;
      ballCount++;
      return slot;
    }

    function buildScene() {
      var W = WORLD_W, H = worldH;
      addRope(W * 0.26, H * 0.1, 0.35);
      addBox(W * 0.6, H * 0.35, 18, 0.25);
      addBox(W * 0.8, H * 0.2, 13, -0.4);
      ballFirst = nPts;
      ballCap = Math.min(MAXP - nPts, MAX_BODIES - nBodies);
      nPts = ballFirst + ballCap;                                    // slots exist, start dead
      for (var i = 0; i < 16; i++) {
        spawnBall(W * (0.05 + 0.9 * rand()), H * (0.08 + 0.5 * rand()), 2.2 + 2 * rand());
      }
    }

    // Back to the starting scene (same seed, so it looks exactly like the first load).
    function resetScene() {
      if (dragPt >= 0) endDrag(0, 0, false);
      alive.fill(0);
      nPts = 0; nCon = 0; nBodies = 0; nBoxes = 0;
      ballSeq = 0; ballCount = 0; acc = 0;
      rand = makeRandom(SEED);
      buildScene();
    }

    // ---------------------------------------------------------- physics ----
    function integrate() {
      var g = GRAVITY * STEP * STEP, maxStep = MAX_SPEED * STEP;
      for (var i = 0; i < nPts; i++) {
        if (!alive[i]) continue;
        ox[i] = x[i]; oy[i] = y[i];
        if (invM[i] === 0) { px[i] = x[i]; py[i] = y[i]; continue; } // pinned or dragged
        var vx = (x[i] - px[i]) * DAMPING, vy = (y[i] - py[i]) * DAMPING;
        var v2 = vx * vx + vy * vy;
        if (v2 > maxStep * maxStep) { var k = maxStep / Math.sqrt(v2); vx *= k; vy *= k; }
        px[i] = x[i]; py[i] = y[i];
        x[i] += vx; y[i] += vy + g;
      }
    }

    // Move both ends towards the rest length, split by inverse mass.
    function solveConstraints() {
      for (var c = 0; c < nCon; c++) {
        var i = ca[c], j = cb[c];
        var wsum = invM[i] + invM[j];
        if (wsum === 0) continue;
        var dx = x[j] - x[i], dy = y[j] - y[i];
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) continue;
        var k = (d - rest[c]) / (d * wsum);
        x[i] += dx * k * invM[i]; y[i] += dy * k * invM[i];
        x[j] -= dx * k * invM[j]; y[j] -= dy * k * invM[j];
      }
    }

    // Overlapping circles are pushed apart along the line between their centres.
    // O(n^2) is fine at <= 48 bodies (~2k pairs); a uniform grid would be the next step.
    //
    // With friction = true this is a separate pass that runs once after relaxation has
    // converged: the relative motion of the two points during this step is
    // (x - px)_j - (x - px)_i, its tangential part is sliding, and removing a fraction of it
    // (split by inverse mass) is position-based friction. It must not run while bodies are
    // still mid-correction, or that transient motion drags resting objects along (a ratchet).
    function solveCircles(friction) {
      for (var i = 0; i < nPts; i++) {
        if (!alive[i] || kind[i] === KIND_CORNER) continue;
        for (var j = i + 1; j < nPts; j++) {
          if (!alive[j] || kind[j] === KIND_CORNER) continue;
          var dx = x[j] - x[i], dy = y[j] - y[i], rr = rad[i] + rad[j];
          var d2 = dx * dx + dy * dy, reach = rr + (friction ? CONTACT_SLOP : 0);
          if (d2 >= reach * reach) continue;
          var wsum = invM[i] + invM[j];
          if (wsum === 0) continue;
          var d = Math.sqrt(d2);
          if (d < 1e-9) { dx = 0; dy = 1; d = 1; }          // exactly coincident: pick a direction
          var nx = dx / d, ny = dy / d;
          if (!friction && d < rr) {
            var k = (rr - d) / wsum;
            x[i] -= nx * k * invM[i]; y[i] -= ny * k * invM[i];
            x[j] += nx * k * invM[j]; y[j] += ny * k * invM[j];
          }
          if (friction) {
            var rvx = (x[j] - px[j]) - (x[i] - px[i]), rvy = (y[j] - py[j]) - (y[i] - py[i]);
            var vn = rvx * nx + rvy * ny;
            var f = CONTACT_FRICTION / wsum, tx = (rvx - vn * nx) * f, ty = (rvy - vn * ny) * f;
            x[i] += tx * invM[i]; y[i] += ty * invM[i];
            x[j] -= tx * invM[j]; y[j] -= ty * invM[j];
          }
        }
      }
    }

    // Point (circle of radius r) vs box (convex quad whose edges have half-thickness EDGE_R).
    // For each face we know its outward normal n; s = n . (p - a) is the signed distance of
    // p from that face's line. The face with the largest s is the one to push out through;
    // if even that s is < r + EDGE_R, the point overlaps the box. This also handles points
    // that are fully inside. (Near a corner it is slightly conservative, i.e. it pushes a
    // little early, because it treats the corner as square; invisible at this scale.)
    //
    // The correction is a position-based constraint C = s - (r + EDGE_R) >= 0 on three
    // points: p, and the contact point q = (1-t)a + tb on the face. Gradients are n for p,
    // -(1-t)n for a and -t n for b, so lambda = -C / (wp + (1-t)^2 wa + t^2 wb) and each
    // point moves by w * lambda * gradient. Hitting a box near one corner therefore mostly
    // moves that corner, which makes the box rotate correctly. The friction pass works like
    // the one in solveCircles, with the contact point's motion interpolated from a and b.
    function solveBoxes(friction) {
      for (var b = 0; b < nBoxes; b++) {
        var f = boxFirst[b], k;
        var cx = (x[f] + x[f + 1] + x[f + 2] + x[f + 3]) * 0.25;
        var cy = (y[f] + y[f + 1] + y[f + 2] + y[f + 3]) * 0.25;
        var br2 = 0;
        for (k = 0; k < 4; k++) {
          var a = f + k, e = f + ((k + 1) & 3);
          var ex = x[e] - x[a], ey = y[e] - y[a], len = Math.sqrt(ex * ex + ey * ey) || 1;
          var nx = ey / len, ny = -ex / len;
          if ((cx - x[a]) * nx + (cy - y[a]) * ny > 0) { nx = -nx; ny = -ny; } // make it point outwards
          fnx[k] = nx; fny[k] = ny;
          var qx = x[a] - cx, qy = y[a] - cy;
          if (qx * qx + qy * qy > br2) br2 = qx * qx + qy * qy;
        }
        var br = Math.sqrt(br2) + EDGE_R;

        for (var p = 0; p < nPts; p++) {
          if (!alive[p] || bodyOf[p] === boxBody[b]) continue;
          var dx = x[p] - cx, dy = y[p] - cy, reach = br + rad[p];
          if (dx * dx + dy * dy > reach * reach) continue;            // bounding-circle reject
          var best = -1e9, bk = 0;
          for (k = 0; k < 4; k++) {
            var s = (x[p] - x[f + k]) * fnx[k] + (y[p] - y[f + k]) * fny[k];
            if (s > best) { best = s; bk = k; }
          }
          var pen = rad[p] + EDGE_R - best;
          if (pen <= (friction ? -CONTACT_SLOP : 0)) continue;
          var ia = f + bk, ib = f + ((bk + 1) & 3);
          var fx = x[ib] - x[ia], fy = y[ib] - y[ia];
          var t = ((x[p] - x[ia]) * fx + (y[p] - y[ia]) * fy) / (fx * fx + fy * fy || 1);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var denom = invM[p] + (1 - t) * (1 - t) * invM[ia] + t * t * invM[ib];
          if (denom === 0) continue;
          var nX = fnx[bk], nY = fny[bk], ka, kb;
          if (!friction && pen > 0) {
            var lambda = pen / denom;
            x[p] += nX * lambda * invM[p]; y[p] += nY * lambda * invM[p];
            ka = lambda * invM[ia] * (1 - t); kb = lambda * invM[ib] * t;
            x[ia] -= nX * ka; y[ia] -= nY * ka;
            x[ib] -= nX * kb; y[ib] -= nY * kb;
          }
          if (friction) {
            // relative motion of p against the contact point q = (1-t)a + tb this step
            var rvx = (x[p] - px[p]) - ((1 - t) * (x[ia] - px[ia]) + t * (x[ib] - px[ib]));
            var rvy = (y[p] - py[p]) - ((1 - t) * (y[ia] - py[ia]) + t * (y[ib] - py[ib]));
            var vn = rvx * nX + rvy * nY, fr = CONTACT_FRICTION / denom;
            var tx = (rvx - vn * nX) * fr, ty = (rvy - vn * nY) * fr;
            x[p] -= tx * invM[p]; y[p] -= ty * invM[p];
            ka = invM[ia] * (1 - t); kb = invM[ib] * t;
            x[ia] += tx * ka; y[ia] += ty * ka;
            x[ib] += tx * kb; y[ib] += ty * kb;
          }
        }
      }
    }

    // Keep every point inside the world (positions only; used inside the relaxation loop).
    function clampToWorld() {
      for (var i = 0; i < nPts; i++) {
        if (!alive[i]) continue;
        var r = rad[i];
        if (x[i] < r) x[i] = r; else if (x[i] > WORLD_W - r) x[i] = WORLD_W - r;
        if (y[i] < r) y[i] = r; else if (y[i] > worldH - r) y[i] = worldH - r;
      }
    }

    // After relaxation: points resting on a wall get a bounce (reflect the normal part of
    // v = x - px, scaled by RESTITUTION) and friction (shrink the tangential part). Slow
    // impacts are simply stopped, which is what keeps resting bodies perfectly still.
    function wallResponse() {
      var minV = BOUNCE_MIN * STEP, keep = 1 - WALL_FRICTION, eps = 1e-6;
      for (var i = 0; i < nPts; i++) {
        if (!alive[i] || invM[i] === 0) continue;
        var r = rad[i], vx = x[i] - px[i], vy = y[i] - py[i];
        var onFloor = y[i] >= worldH - r - eps, onCeil = y[i] <= r + eps;
        if (onFloor || onCeil) {
          // Friction applies whenever touching: a resting ball has vy == 0 exactly.
          px[i] = x[i] - vx * keep;
          if ((onFloor && vy > 0) || (onCeil && vy < 0)) {
            py[i] = Math.abs(vy) > minV ? y[i] + vy * RESTITUTION : y[i];
          }
        }
        vx = x[i] - px[i]; vy = y[i] - py[i];
        var onRight = x[i] >= WORLD_W - r - eps, onLeft = x[i] <= r + eps;
        if (onRight || onLeft) {
          py[i] = y[i] - vy * keep;
          if ((onRight && vx > 0) || (onLeft && vx < 0)) {
            px[i] = Math.abs(vx) > minV ? x[i] + vx * RESTITUTION : x[i];
          }
        }
      }
    }

    // Gauss-Seidel relaxation: each pass fixes one constraint at a time using the already
    // corrected positions; repeating the passes converges towards satisfying all of them.
    function relax(passes, friction) {
      for (var it = 0; it < passes; it++) {
        solveConstraints();
        solveCircles(false);
        solveBoxes(false);
        clampToWorld();
      }
      if (friction) {
        solveCircles(true);
        solveBoxes(true);
        clampToWorld();
      }
    }

    function step(dragFrac) {
      integrate();
      if (dragPt >= 0) {
        // The dragged point has infinite mass and follows the pointer, interpolated across
        // this frame's sub-steps so a fast flick does not teleport it through other bodies.
        x[dragPt] = dragFromX + (dragTX - dragFromX) * dragFrac;
        y[dragPt] = dragFromY + (dragTY - dragFromY) * dragFrac;
      }
      relax(ITERATIONS, true);
      wallResponse();
      stepsThisSecond++;
    }

    function simulate(dt) {
      acc += dt;
      var n = Math.floor(acc / STEP);
      if (n > MAX_STEPS_PER_FRAME) n = MAX_STEPS_PER_FRAME;
      acc -= n * STEP;
      if (acc > STEP) acc = STEP;            // dropped time: never try to "catch up" later
      for (var s = 0; s < n; s++) step((s + 1) / n);
      if (n > 0 && dragPt >= 0) { dragFromX = dragTX; dragFromY = dragTY; }

      rateTimer += dt;
      if (rateTimer >= 1) {
        stepRate = Math.round(stepsThisSecond / rateTimer);
        stepsThisSecond = 0; rateTimer = 0;
      }
    }

    // ----------------------------------------------------------- render ----
    function render() {
      if (canvas.width === 0) return;
      // Interpolate between the start and the end of the last step by the leftover
      // accumulator time, so motion is smooth when fps and 120 Hz do not line up.
      var a = acc / STEP, s = unitPx, i, c;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);    // from here on we draw in world units

      // Background grid every 10 units.
      ctx.beginPath();
      for (var gx = 10; gx < WORLD_W; gx += 10) { ctx.moveTo(gx, 0); ctx.lineTo(gx, worldH); }
      for (var gy = worldH - 10; gy > 0; gy -= 10) { ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); }
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1 / s * dpr;
      ctx.stroke();

      // Boxes: filled quad, thick edges (the visual thickness is the collision thickness),
      // faint diagonals so the constraint structure is visible.
      ctx.lineJoin = 'round';
      for (var b = 0; b < nBoxes; b++) {
        var f = boxFirst[b];
        ctx.beginPath();
        for (var k = 0; k < 4; k++) {
          var qx = ox[f + k] + (x[f + k] - ox[f + k]) * a, qy = oy[f + k] + (y[f + k] - oy[f + k]) * a;
          if (k === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
        }
        ctx.closePath();
        ctx.fillStyle = boxFill;
        ctx.fill();
        ctx.strokeStyle = boxStroke;
        ctx.lineWidth = EDGE_R * 2;
        ctx.stroke();
      }
      ctx.beginPath();
      for (c = 0; c < nCon; c++) {
        if (cDraw[c]) continue;
        var i0 = ca[c], j0 = cb[c];
        ctx.moveTo(ox[i0] + (x[i0] - ox[i0]) * a, oy[i0] + (y[i0] - oy[i0]) * a);
        ctx.lineTo(ox[j0] + (x[j0] - ox[j0]) * a, oy[j0] + (y[j0] - oy[j0]) * a);
      }
      ctx.strokeStyle = diagStroke;
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // Rope links.
      ctx.beginPath();
      for (i = ropeFirst; i < ropeFirst + ropeCount; i++) {
        var rx = ox[i] + (x[i] - ox[i]) * a, ry = oy[i] + (y[i] - oy[i]) * a;
        if (i === ropeFirst) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
      }
      ctx.strokeStyle = MUTED;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Rope beads (everything except pin and bob).
      ctx.beginPath();
      for (i = ropeFirst + 1; i < ropeFirst + ropeCount - 1; i++) {
        var bx = ox[i] + (x[i] - ox[i]) * a, by = oy[i] + (y[i] - oy[i]) * a;
        ctx.moveTo(bx + rad[i], by);
        ctx.arc(bx, by, rad[i], 0, 2 * Math.PI);
      }
      ctx.fillStyle = MUTED;
      ctx.fill();
      // Pin: a ring.
      i = ropeFirst;
      ctx.beginPath();
      ctx.arc(ox[i] + (x[i] - ox[i]) * a, oy[i] + (y[i] - oy[i]) * a, PIN_R, 0, 2 * Math.PI);
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = accentStr;
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // Balls (and the bob) batched into one path per colour.
      var bob = ropeFirst + ropeCount - 1;
      for (c = 0; c < BALL_COLORS.length; c++) {
        ctx.beginPath();
        for (i = 0; i < nPts; i++) {
          if (!alive[i] || colorIdx[i] !== c || (kind[i] !== KIND_BALL && i !== bob)) continue;
          var cxp = ox[i] + (x[i] - ox[i]) * a, cyp = oy[i] + (y[i] - oy[i]) * a;
          ctx.moveTo(cxp + rad[i], cyp);
          ctx.arc(cxp, cyp, rad[i], 0, 2 * Math.PI);
        }
        ctx.fillStyle = BALL_COLORS[c];
        ctx.fill();
      }
      // Soft highlight on every ball.
      ctx.beginPath();
      for (i = 0; i < nPts; i++) {
        if (!alive[i] || (kind[i] !== KIND_BALL && i !== bob)) continue;
        var hx = ox[i] + (x[i] - ox[i]) * a - rad[i] * 0.35, hy = oy[i] + (y[i] - oy[i]) * a - rad[i] * 0.35;
        ctx.moveTo(hx + rad[i] * 0.38, hy);
        ctx.arc(hx, hy, rad[i] * 0.38, 0, 2 * Math.PI);
      }
      ctx.fillStyle = highlight;
      ctx.fill();

      if (dragPt >= 0) {
        i = dragPt;
        ctx.beginPath();
        ctx.arc(ox[i] + (x[i] - ox[i]) * a, oy[i] + (y[i] - oy[i]) * a, rad[i] + 1.6, 0, 2 * Math.PI);
        ctx.strokeStyle = dragRing;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      if (showHint) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = hintFont;
        ctx.textBaseline = 'top';
        ctx.fillStyle = MUTED;
        ctx.fillText(L.hint, 10 * dpr, 9 * dpr);
      }
    }

    // ---------------------------------------------------------- sizing ----
    function resize() {
      var cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (cssW === 0 || cssH === 0) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;
      unitPx = bw / WORLD_W;
      var newH = WORLD_W * cssH / cssW;
      if (newH !== worldH) {
        worldH = newH;
        // Shift anything now outside the world back in. px/ox move by the same amount so
        // the shift does not turn into velocity. Constraints straighten boxes out after.
        for (var i = 0; i < nPts; i++) {
          if (!alive[i]) continue;
          var r = rad[i];
          var nx = Math.min(Math.max(x[i], r), WORLD_W - r), ny = Math.min(Math.max(y[i], r), worldH - r);
          px[i] += nx - x[i]; ox[i] += nx - x[i]; x[i] = nx;
          py[i] += ny - y[i]; oy[i] += ny - y[i]; y[i] = ny;
        }
        // A smaller world can squeeze bodies into each other. Resolve that now, and move the
        // previous positions along with it so the fix-up does not become a violent kick.
        for (i = 0; i < nPts; i++) { ox[i] = x[i]; oy[i] = y[i]; }
        relax(20, false);
        for (i = 0; i < nPts; i++) {
          px[i] += x[i] - ox[i]; py[i] += y[i] - oy[i];
          ox[i] = x[i]; oy[i] = y[i];
        }
      }
      // Hint font shrinks on narrow canvases so it fits on one line.
      hintFont = Math.round(Math.max(10, Math.min(12, cssW / 34)) * dpr) +
        'px system-ui, -apple-system, "Segoe UI", sans-serif';
      return true;
    }

    // ----------------------------------------------------------- stats ----
    function stats(force) {
      if (!onStats) return;
      var s = (nBodies + ballCount) + ' ' + L.bodies + ' · ' + stepRate + ' Hz';
      if (force || s !== lastStats) { lastStats = s; onStats(s); }
    }

    // ----------------------------------------------------------- input ----
    function toWorld(e) {
      var rect = canvas.getBoundingClientRect();
      dragTX = (e.clientX - rect.left) / rect.width * WORLD_W;
      dragTY = (e.clientY - rect.top) / rect.height * worldH;
    }
    function clampTarget(r) {
      dragTX = Math.min(Math.max(dragTX, r), WORLD_W - r);
      dragTY = Math.min(Math.max(dragTY, r), worldH - r);
    }

    // Pick what is under the pointer: inside a box -> its nearest corner; otherwise the
    // nearest point whose circle (with a finger-sized minimum) contains the pointer.
    function pick(wx, wy) {
      var b, k, i, best = -1, bestD = 1e9;
      for (b = 0; b < nBoxes; b++) {
        var f = boxFirst[b], inside = true;
        var cx = (x[f] + x[f + 1] + x[f + 2] + x[f + 3]) * 0.25, cy = (y[f] + y[f + 1] + y[f + 2] + y[f + 3]) * 0.25;
        for (k = 0; k < 4 && inside; k++) {
          var a = f + k, e = f + ((k + 1) & 3);
          var nx = y[e] - y[a], ny = -(x[e] - x[a]);
          if ((cx - x[a]) * nx + (cy - y[a]) * ny > 0) { nx = -nx; ny = -ny; }
          var len = Math.sqrt(nx * nx + ny * ny) || 1;
          if (((wx - x[a]) * nx + (wy - y[a]) * ny) / len > EDGE_R) inside = false;
        }
        if (inside) {
          for (k = 0; k < 4; k++) {
            var d = (x[f + k] - wx) * (x[f + k] - wx) + (y[f + k] - wy) * (y[f + k] - wy);
            if (d < bestD) { bestD = d; best = f + k; }
          }
          return best;
        }
      }
      var slop = 14 * (canvas.width / Math.max(1, canvas.clientWidth)) / unitPx; // ~14 CSS px
      for (i = 0; i < nPts; i++) {
        if (!alive[i]) continue;
        var dx = x[i] - wx, dy = y[i] - wy, reach = Math.max(rad[i], slop);
        var d2 = dx * dx + dy * dy;
        if (d2 < reach * reach && d2 < bestD) { bestD = d2; best = i; }
      }
      return best;
    }

    function pushSample(t) {
      sampT[sampHead] = t; sampX[sampHead] = dragTX; sampY[sampHead] = dragTY;
      sampHead = (sampHead + 1) % SAMPLES;
      if (sampN < SAMPLES) sampN++;
    }

    function onPointerDown(e) {
      if (dragId !== -1 || destroyed) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // preventDefault() below also cancels the focus a click would give, so take it explicitly
      // (the keyboard controls work while the canvas has focus).
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
      toWorld(e);
      var p = pick(dragTX, dragTY);
      if (p < 0) p = spawnBall(dragTX, dragTY, 2.2 + 2 * rand());
      dragId = e.pointerId;
      dragPt = p;
      dragInvM = invM[p];
      invM[p] = 0;                            // infinite mass while held
      clampTarget(rad[p]);
      dragFromX = x[p]; dragFromY = y[p];
      sampN = 0; sampHead = 0;
      pushSample(e.timeStamp);
      showHint = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      e.preventDefault();
      if (!running) render();
      stats(false);
    }
    function onPointerMove(e) {
      if (e.pointerId !== dragId) return;
      toWorld(e);
      clampTarget(rad[dragPt]);
      pushSample(e.timeStamp);
      if (!running) { x[dragPt] = ox[dragPt] = px[dragPt] = dragTX; y[dragPt] = oy[dragPt] = py[dragPt] = dragTY; render(); }
    }
    function onPointerUp(e) {
      if (e.pointerId !== dragId) return;
      toWorld(e);
      clampTarget(rad[dragPt]);
      pushSample(e.timeStamp);
      // Throw velocity: displacement over the last THROW_WINDOW seconds of pointer history.
      var newest = (sampHead - 1 + SAMPLES) % SAMPLES, oldest = newest;
      for (var k = 1; k < sampN; k++) {
        var idx = (newest - k + SAMPLES) % SAMPLES;
        if ((sampT[newest] - sampT[idx]) / 1000 > THROW_WINDOW) break;
        oldest = idx;
      }
      var span = (sampT[newest] - sampT[oldest]) / 1000, vx = 0, vy = 0;
      if (span > 0.004) {
        vx = (sampX[newest] - sampX[oldest]) / span;
        vy = (sampY[newest] - sampY[oldest]) / span;
      }
      endDrag(vx, vy, true);
    }
    function onPointerCancel(e) {
      if (e.pointerId === dragId) endDrag(0, 0, true);
    }

    // Keyboard (canvas focused): Space / Enter drop a ball at a random x near the top, R resets.
    // Tab and modified keys (Ctrl+R, ...) are left to the browser.
    function onKeyDown(e) {
      if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
      var drop = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
      if (drop || e.code === 'KeyR' || SWALLOW[e.code]) e.preventDefault();
      if (e.repeat || !(drop || e.code === 'KeyR')) return;
      if (drop) {
        var r = 2.2 + 2 * rand();
        spawnBall(r + (WORLD_W - 2 * r) * rand(), r + 1, r);
      } else {
        resetScene();
      }
      showHint = false;
      if (!running) render();
      stats(false);
    }

    // Release: restore the mass and encode the throw velocity in the previous position.
    function endDrag(vx, vy, placeAtPointer) {
      if (dragPt < 0) return;
      var p = dragPt;
      if (placeAtPointer) { x[p] = dragTX; y[p] = dragTY; }
      var sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > MAX_SPEED) { vx *= MAX_SPEED / sp; vy *= MAX_SPEED / sp; }
      if (pinned[p]) { vx = 0; vy = 0; }      // the pin stays where it is dropped
      invM[p] = dragInvM;
      px[p] = x[p] - vx * STEP; py[p] = y[p] - vy * STEP;
      ox[p] = x[p]; oy[p] = y[p];
      dragPt = -1; dragId = -1;
      if (!running) render();
    }

    // ------------------------------------------------------------ loop ----
    function frame(t) {
      rafId = 0;
      if (!running) return;
      rafId = window.requestAnimationFrame(frame);
      var dt = lastT ? (t - lastT) / 1000 : 0;
      lastT = t;
      if (dt > MAX_DT) dt = MAX_DT;
      if (dt < 0) dt = 0;
      simulate(dt);
      render();
      statsTimer += dt;
      if (statsTimer >= 0.25) { statsTimer = 0; stats(false); }
    }
    function start() {
      if (running || destroyed) return;
      running = true;
      lastT = 0;
      rateTimer = 0; stepsThisSecond = 0;
      rafId = window.requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    }

    // Dragging inside the sandbox must not scroll the page on touch screens.
    var prevTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('lostpointercapture', onPointerCancel);
    canvas.addEventListener('keydown', onKeyDown);

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { if (resize()) render(); });
      ro.observe(canvas);
    }

    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) worldH = WORLD_W * canvas.clientHeight / canvas.clientWidth;
    buildScene();
    if (resize()) render();
    stats(true);

    return {
      start: start,
      stop: stop,
      destroy: function () {
        if (destroyed) return;
        if (dragPt >= 0) endDrag(0, 0, false);
        stop();
        destroyed = true;
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
        canvas.removeEventListener('lostpointercapture', onPointerCancel);
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.style.touchAction = prevTouchAction;
        if (ro) { ro.disconnect(); ro = null; }
      },
      // Switch the canvas hint and stats language without touching the simulation.
      setLang: function (lang) {
        if (destroyed) return;
        L = TEXT[lang === 'tr' ? 'tr' : 'en'];
        stats(true);
        if (!running) render();
      },
      // Read-only snapshot for tests / debugging; not needed by the host page.
      inspect: function () {
        var nan = 0, outside = 0, maxSpeed = 0, i;
        for (i = 0; i < nPts; i++) {
          if (!alive[i]) continue;
          if (!isFinite(x[i]) || !isFinite(y[i]) || !isFinite(px[i]) || !isFinite(py[i])) nan++;
          if (x[i] < rad[i] - 1e-6 || x[i] > WORLD_W - rad[i] + 1e-6 ||
              y[i] < rad[i] - 1e-6 || y[i] > worldH - rad[i] + 1e-6) outside++;
          var vx = (x[i] - px[i]) / STEP, vy = (y[i] - py[i]) / STEP;
          maxSpeed = Math.max(maxSpeed, Math.sqrt(vx * vx + vy * vy));
        }
        var maxOverlap = 0;                    // deepest circle-circle penetration
        for (i = 0; i < nPts; i++) {
          if (!alive[i] || kind[i] === KIND_CORNER) continue;
          for (var j = i + 1; j < nPts; j++) {
            if (!alive[j] || kind[j] === KIND_CORNER) continue;
            var dx = x[j] - x[i], dy = y[j] - y[i];
            maxOverlap = Math.max(maxOverlap, rad[i] + rad[j] - Math.sqrt(dx * dx + dy * dy));
          }
        }
        var pos = [];
        for (i = 0; i < nPts; i++) if (alive[i]) pos.push(i, kind[i], x[i], y[i]);
        return { bodies: nBodies + ballCount, balls: ballCount, points: nPts, nan: nan, outside: outside, pos: pos,
                 maxSpeed: maxSpeed, maxOverlap: maxOverlap, worldW: WORLD_W, worldH: worldH, stepRate: stepRate,
                 dragging: dragPt >= 0, running: running };
      }
    };
  }

  window.LabDemos = window.LabDemos || {};
  window.LabDemos.verlet = { mount: mount };
})();
