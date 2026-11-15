/*
 * raycaster.js - Wolfenstein-style raycaster: the algorithm of Cub3D, a 42 Istanbul pair
 * project written in C on MiniLibX together with a teammate (github.com/Clas0512/Cub3D),
 * rewritten in JavaScript for this site.
 *
 * What carries over from the C version:
 *   - the map is a grid of characters ('1' wall, '0' floor, N/S/E/W = spawn + facing),
 *     indexed map[y][x] with y growing downwards;
 *   - the camera is a direction vector plus a perpendicular "camera plane" of length 0.66
 *     (66 degree field of view), with the same N/S/E/W conventions as get_dir.c;
 *   - one ray per screen column, walked through the grid with DDA (raycast_utils.c);
 *   - perpendicular wall distance (sideDist - deltaDist) instead of Euclidean distance,
 *     which is what removes the fisheye effect;
 *   - texture chosen from the side that was hit and the ray direction, with the same
 *     texture-x flip rules as init_map.c.
 * New here: wall sliding instead of rejecting the whole move, distance fog, a minimap that
 * draws this frame's rays, an autopilot, and procedural textures (no image files).
 *
 * Usage:  var demo = LabDemos.raycaster.mount(canvas, { accent, onStats, lang });
 *         demo.start(); demo.stop(); demo.destroy();
 *         demo.setLang('tr');   // switch strings in place; position and mode are kept
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- map ----
  // Same notation as a .cub map. Layout is a compressed version of Cub3D's maps/a.cub
  // (an open hall on the left, a comb of long corridors on the right). Unlike a.cub the
  // corridors are joined at the far end so there are no dead ends for the autopilot.
  var MAP = [
    '111111111111111111111111',
    '100000000000000000000001',
    '100000000000111111111101',
    '100000000000000000000001',
    '100110011000111111111101',
    '100000000000000000000001',
    '100000000000111111111101',
    '1E0000000000000000000001',
    '100000000000111111111101',
    '100000000000000000000001',
    '100110011000111111111101',
    '100000000000000000000001',
    '100000000000111111111101',
    '100000000000000000000001',
    '111111111111111111111111'
  ];

  // ------------------------------------------------------------ tunables ----
  var PLANE = 0.66;          // camera plane half-length -> 2*atan(0.66) = 66 deg FOV (as in Cub3D)
  var RADIUS = 0.2;          // player collision radius, in cells
  var MOVE_SPEED = 3.0;      // cells per second
  var TURN_SPEED = 2.6;      // radians per second
  var IDLE_BEFORE_AUTO = 4;  // seconds without input before the autopilot takes over
  var AUTO_SPEED = 1.8;      // autopilot cruise speed, cells per second
  var AUTO_TURN = 1.9;       // autopilot max turn rate, radians per second
  var AUTO_CLEARANCE = 0.28; // how far a straight autopilot segment must stay from walls
  var MAX_RAYS = 640;        // above this many columns, one ray covers several CSS pixels
  var TEX = 64;              // texture size (power of two, like the 64x64 XPMs in Cub3D)
  var FOG_DENSITY = 0.11;    // fog = 1 - exp(-density * distance)
  var X_SIDE_SHADE = 0.72;   // x-side walls are drawn darker than y-side walls
  var MAX_DT = 0.1;          // clamp for long frames (tab switches, breakpoints)

  var FACE_NORTH = 0, FACE_SOUTH = 1, FACE_EAST = 2, FACE_WEST = 3;

  var BG = '#0b0a12', SURFACE = '#13111c', SURFACE2 = '#1a1726', BORDER = '#262236';
  var MUTED = '#9690ad';

  // raysShort is used when the canvas is narrower than NARROW_PX, so the stats line fits.
  var TEXT = {
    en: { rays: 'rays/frame', raysShort: 'rays', manual: 'manual', auto: 'autopilot',
          hint: 'Click, then WASD / ← → to drive' },
    tr: { rays: 'ışın/kare', raysShort: 'ışın', manual: 'manuel', auto: 'otopilot',
          hint: 'Tıklayın, sonra WASD / ← → ile sürün' }
  };
  var NARROW_PX = 400;

  // Key codes (physical keys, so it works on QWERTY, AZERTY and Turkish layouts alike).
  var K_FWD = 0, K_BACK = 1, K_LEFT = 2, K_RIGHT = 3, K_TURN_L = 4, K_TURN_R = 5;
  var KEYMAP = {
    KeyW: K_FWD, ArrowUp: K_FWD, KeyS: K_BACK, ArrowDown: K_BACK,
    KeyA: K_LEFT, KeyD: K_RIGHT, ArrowLeft: K_TURN_L, ArrowRight: K_TURN_R
  };
  // Keys that would scroll the page while the canvas has focus; they do nothing here.
  var SWALLOW = { Space: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };

  // -------------------------------------------------------------- helpers ----
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return [167, 139, 250]; // fall back to default accent
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function scale(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }
  // Small integer hash -> [0,1). Deterministic "noise" for the procedural textures.
  function hash2(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function parseMap(rows) {
    var h = rows.length, w = 0, x, y;
    for (y = 0; y < h; y++) w = Math.max(w, rows[y].length);
    var cells = new Uint8Array(w * h);
    var spawn = { x: 1.5, y: 1.5, angle: 0 };
    // Facing angles with y pointing down: E = 0, S = +90deg, W = 180deg, N = -90deg.
    // dir = (cos a, sin a) reproduces get_dir.c, e.g. N -> dir (0,-1).
    var facing = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        var c = rows[y][x];
        // Anything that is not floor or a spawn (including ' ' and short rows) is solid,
        // so a ray can never leave the map.
        cells[y * w + x] = (c === '0' || facing[c] !== undefined) ? 0 : 1;
        if (facing[c] !== undefined) spawn = { x: x + 0.5, y: y + 0.5, angle: facing[c] };
      }
    }
    return { w: w, h: h, cells: cells, spawn: spawn };
  }

  // Procedural 64x64 RGB textures, one per face, packed in one array:
  // texel (face, tx, ty) lives at ((face * TEX + ty) * TEX + tx) * 3.
  function buildTextures(accent) {
    var grey = [122, 116, 146];
    var bg = hexToRgb(BG);
    var tex = new Uint8Array(4 * TEX * TEX * 3);
    var brickA = mix(accent, grey, 0.45), brickB = mix(accent, grey, 0.68);
    var panelA = mix(grey, accent, 0.18), panelB = scale(mix(grey, accent, 0.3), 0.85);
    var mortar = mix(bg, accent, 0.18);

    function put(face, tx, ty, c) {
      var k = ((face * TEX + ty) * TEX + tx) * 3;
      tex[k] = c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0];
      tex[k + 1] = c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1];
      tex[k + 2] = c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2];
    }
    function bricks(face, base) {
      for (var ty = 0; ty < TEX; ty++) {
        // Rows are offset by 8 px so no mortar line lands on texel row 32, which is drawn
        // exactly at eye level (the horizon) and would look like one line through the world.
        var by = (ty + 8) & 63;
        var row = by >> 4;                         // bricks are 16 px tall
        var off = (row & 1) ? 16 : 0;              // every other row shifted half a brick
        for (var tx = 0; tx < TEX; tx++) {
          var bx = ((tx + off) & 63) >> 5;         // bricks are 32 px wide
          var inMortar = (by & 15) < 2 || ((tx + off) & 31) < 2;
          if (inMortar) { put(face, tx, ty, mortar); continue; }
          var k = 0.86 + 0.18 * hash2(bx + face * 7, row) + 0.06 * hash2(tx, ty + face * 64);
          if ((by & 15) === 2) k *= 1.12;          // light top edge
          put(face, tx, ty, scale(base, k));
        }
      }
    }
    function panels(face, base) {
      for (var ty = 0; ty < TEX; ty++) {
        for (var tx = 0; tx < TEX; tx++) {
          var px = tx & 31, py = ty;               // 32 wide, full height (no seam at eye level)
          var k = 0.92 + 0.07 * hash2(tx + face * 64, ty);
          if (px === 0 || py === 0) k = 0.45;       // seam
          else if (px === 1 || py === 1) k = 1.18;  // bevel highlight
          else if (px === 31 || py === 63) k = 0.7; // bevel shadow
          var c = scale(base, k);
          var rx = px - 5, ry = py - 6, rx2 = px - 26, ry2 = py - 57;
          if (rx * rx + ry * ry <= 2 || rx2 * rx2 + ry * ry <= 2 ||
              rx * rx + ry2 * ry2 <= 2 || rx2 * rx2 + ry2 * ry2 <= 2) {
            c = mix(accent, [255, 255, 255], 0.15); // rivets pick up the accent
          }
          put(face, tx, ty, c);
        }
      }
    }
    bricks(FACE_NORTH, brickA);
    bricks(FACE_SOUTH, brickB);
    panels(FACE_EAST, panelA);
    panels(FACE_WEST, panelB);
    return tex;
  }

  // ---------------------------------------------------------------- mount ----
  function mount(canvas, opts) {
    opts = opts || {};
    var accent = hexToRgb(opts.accent || '#a78bfa');
    var onStats = typeof opts.onStats === 'function' ? opts.onStats : null;
    var L = TEXT[opts.lang === 'tr' ? 'tr' : 'en'];
    var ctx = canvas.getContext('2d');

    var map = parseMap(MAP);
    var tex = buildTextures(accent);
    var fogRgb = hexToRgb(BG);

    // Player state. Direction is stored as an angle; dir and plane are derived from it
    // each frame, which is equivalent to Cub3D's calc_rot() rotation matrix but cannot
    // drift out of unit length over time.
    var player = { x: map.spawn.x, y: map.spawn.y, a: map.spawn.angle };
    var keys = new Uint8Array(6);
    var idle = IDLE_BEFORE_AUTO;   // start in autopilot mode until someone touches a key
    var auto = true;

    // Autopilot state (all preallocated; see planPath / updateAutopilot).
    var nCells = map.w * map.h;
    var bfsDist = new Int16Array(nCells), bfsPrev = new Int32Array(nCells);
    var bfsQueue = new Int32Array(nCells), path = new Int32Array(nCells);
    var pathLen = 0, pathIdx = 0;
    var autoOmega = 0, autoSpeed = 0;
    var stuckTimer = 0, stuckX = player.x, stuckY = player.y;

    // Render targets. The 3D view is rendered into a small pixel buffer (one column per
    // ray, square pixels) and scaled up with smoothing off; that is the same idea as
    // Cub3D's mlx image buffer, just at a lower resolution.
    var off = document.createElement('canvas');
    var offCtx = off.getContext('2d');
    var img = null, pix = null;
    var bufW = 0, bufH = 0, focal = 1, dpr = 1;
    var rowRgb = null;                                  // ceiling/floor colour per buffer row
    var hitX = new Float32Array(MAX_RAYS), hitY = new Float32Array(MAX_RAYS);
    var mini = document.createElement('canvas');        // static minimap layer
    var miniCtx = mini.getContext('2d');
    var miniCell = 0, miniPad = 0, miniX = 0, miniY = 0;
    var hintFont = '';

    var accentFill = rgba(accent, 0.16), accentRay = rgba(accent, 0.55);
    var accentSolid = rgba(accent, 1);
    var coarse = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    var running = false, destroyed = false, rafId = 0, lastT = 0;
    var statsTimer = 0, lastStats = '';

    // ------------------------------------------------------------ world ----
    function solid(cx, cy) {
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return true;
      return map.cells[cy * map.w + cx] === 1;
    }

    // Axis-separated collision: try the x move, then the y move. If the leading edge of the
    // player's square (half-size RADIUS) would enter a wall cell on that axis, snap to just
    // outside that cell. Because the axes are handled independently, pushing into a wall at
    // an angle keeps the parallel component, i.e. the player slides along the wall.
    // Steps are far smaller than one cell (speed * MAX_DT <= 0.3), so no tunnelling.
    function moveBy(dx, dy) {
      var EPS = 1e-4, c, cy, cx, lo, hi;
      if (dx !== 0) {
        var nx = player.x + dx;
        cx = Math.floor(nx + (dx > 0 ? RADIUS : -RADIUS));
        lo = Math.floor(player.y - RADIUS); hi = Math.floor(player.y + RADIUS);
        for (c = lo; c <= hi; c++) {
          if (solid(cx, c)) { nx = dx > 0 ? cx - RADIUS - EPS : cx + 1 + RADIUS + EPS; break; }
        }
        player.x = nx;
      }
      if (dy !== 0) {
        var ny = player.y + dy;
        cy = Math.floor(ny + (dy > 0 ? RADIUS : -RADIUS));
        lo = Math.floor(player.x - RADIUS); hi = Math.floor(player.x + RADIUS);
        for (c = lo; c <= hi; c++) {
          if (solid(c, cy)) { ny = dy > 0 ? cy - RADIUS - EPS : cy + 1 + RADIUS + EPS; break; }
        }
        player.y = ny;
      }
    }

    function updateManual(dt) {
      var turn = keys[K_TURN_R] - keys[K_TURN_L];
      player.a = wrapAngle(player.a + turn * TURN_SPEED * dt);
      var fwd = keys[K_FWD] - keys[K_BACK];
      var side = keys[K_RIGHT] - keys[K_LEFT];
      if (fwd === 0 && side === 0) return;
      // Diagonal input is normalised (Cub3D did the same with 0.09 / sqrt(2)).
      var k = MOVE_SPEED * dt / Math.sqrt(fwd * fwd + side * side);
      var dirX = Math.cos(player.a), dirY = Math.sin(player.a);
      // Strafing uses the plane direction (-dirY, dirX), i.e. "right" on screen.
      moveBy((dirX * fwd - dirY * side) * k, (dirY * fwd + dirX * side) * k);
    }

    // ------------------------------------------------------- autopilot ----
    // Wander = pick a random reachable cell, find a grid path to it with BFS, then follow
    // the path with "string pulling": always steer towards the furthest path cell that is
    // in clear line of sight. The heading turns with a smoothed, rate-limited angular
    // velocity and the speed eases down when the target is off to the side, so motion is
    // smooth. If progress stalls for 2 s a new target is chosen, so it cannot get stuck.

    function planPath() {
      var start = Math.floor(player.y) * map.w + Math.floor(player.x);
      bfsDist.fill(-1);
      var head = 0, tail = 0, i;
      bfsDist[start] = 0; bfsPrev[start] = -1; bfsQueue[tail++] = start;
      while (head < tail) {
        var cur = bfsQueue[head++];
        var cx = cur % map.w, cy = (cur / map.w) | 0;
        for (var n = 0; n < 4; n++) {
          var nx = cx + (n === 0 ? 1 : n === 1 ? -1 : 0);
          var ny = cy + (n === 2 ? 1 : n === 3 ? -1 : 0);
          if (solid(nx, ny)) continue;
          var ni = ny * map.w + nx;
          if (bfsDist[ni] !== -1) continue;
          bfsDist[ni] = bfsDist[cur] + 1; bfsPrev[ni] = cur; bfsQueue[tail++] = ni;
        }
      }
      // Reservoir-sample a target among cells at least 7 steps away (or the farthest cell).
      var target = -1, seen = 0, far = start;
      for (i = 0; i < tail; i++) {
        var c = bfsQueue[i];
        if (bfsDist[c] > bfsDist[far]) far = c;
        if (bfsDist[c] >= 7 && Math.random() * ++seen < 1) target = c;
      }
      if (target < 0) target = far;
      // Walk prev[] back from the target, then reverse into start -> target order.
      pathLen = 0;
      for (c = target; c !== -1; c = bfsPrev[c]) path[pathLen++] = c;
      for (i = 0; i < pathLen >> 1; i++) {
        var t = path[i]; path[i] = path[pathLen - 1 - i]; path[pathLen - 1 - i] = t;
      }
      pathIdx = 0;
      stuckTimer = 0; stuckX = player.x; stuckY = player.y;
    }

    // True if a circle of radius AUTO_CLEARANCE can travel from (ax,ay) to (bx,by)
    // without touching a wall cell (sampled every 0.1 cells, checking the 4 box corners).
    function clearLine(ax, ay, bx, by) {
      var dx = bx - ax, dy = by - ay;
      var n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / 0.1), r = AUTO_CLEARANCE;
      for (var i = 0; i <= n; i++) {
        var t = n === 0 ? 0 : i / n, x = ax + dx * t, y = ay + dy * t;
        if (solid(Math.floor(x - r), Math.floor(y - r)) || solid(Math.floor(x + r), Math.floor(y - r)) ||
            solid(Math.floor(x - r), Math.floor(y + r)) || solid(Math.floor(x + r), Math.floor(y + r))) {
          return false;
        }
      }
      return true;
    }
    function cellCX(i) { return (i % map.w) + 0.5; }
    function cellCY(i) { return ((i / map.w) | 0) + 0.5; }

    function updateAutopilot(dt) {
      if (pathLen === 0) planPath();
      // Advance along the path: skip a waypoint once it is reached, or when the next one
      // is directly visible. pathIdx only ever increases, so the target never flip-flops.
      while (pathIdx < pathLen - 1) {
        var wx = cellCX(path[pathIdx]), wy = cellCY(path[pathIdx]);
        var reached = Math.abs(wx - player.x) < 0.3 && Math.abs(wy - player.y) < 0.3;
        if (reached || clearLine(player.x, player.y, cellCX(path[pathIdx + 1]), cellCY(path[pathIdx + 1]))) {
          pathIdx++;
        } else break;
      }
      var tx = cellCX(path[pathIdx]), ty = cellCY(path[pathIdx]);
      var dx = tx - player.x, dy = ty - player.y;
      if (pathIdx === pathLen - 1 && dx * dx + dy * dy < 0.35 * 0.35) { planPath(); return; }

      // Steering: desired angular velocity is proportional to the heading error, capped,
      // then low-pass filtered so the camera never snaps.
      var err = wrapAngle(Math.atan2(dy, dx) - player.a);
      var wantOmega = Math.max(-AUTO_TURN, Math.min(AUTO_TURN, err * 3));
      autoOmega += (wantOmega - autoOmega) * Math.min(1, dt * 6);
      player.a = wrapAngle(player.a + autoOmega * dt);
      // Speed: full when facing the target, zero when it is 90+ degrees off (turn in place).
      var facing = Math.max(0, Math.cos(err));
      autoSpeed += (AUTO_SPEED * facing * facing - autoSpeed) * Math.min(1, dt * 4);
      moveBy(Math.cos(player.a) * autoSpeed * dt, Math.sin(player.a) * autoSpeed * dt);

      stuckTimer += dt;
      if (stuckTimer > 2) {
        var mx = player.x - stuckX, my = player.y - stuckY;
        if (mx * mx + my * my < 0.25 * 0.25) planPath();
        stuckTimer = 0; stuckX = player.x; stuckY = player.y;
      }
    }

    function update(dt) {
      idle += dt;
      if (!auto && idle >= IDLE_BEFORE_AUTO) {
        auto = true; autoOmega = 0; autoSpeed = 0; pathLen = 0;
      }
      if (auto) updateAutopilot(dt); else updateManual(dt);
    }

    // ---------------------------------------------------------- render ----
    function render() {
      if (bufW === 0) return;
      var W = bufW, H = bufH, data = pix, w = map.w, cells = map.cells;
      var px = player.x, py = player.y;
      var dirX = Math.cos(player.a), dirY = Math.sin(player.a);
      var planeX = -dirY * PLANE, planeY = dirX * PLANE;  // plane = dir rotated +90deg
      // camScale is 1 when the view is width-limited (normal 66deg FOV). On tall, narrow
      // canvases focal is height-limited and the horizontal FOV is narrowed to match.
      var camScale = W / (2 * focal * PLANE);
      var horizon = H * 0.5;
      var fogR = fogRgb[0], fogG = fogRgb[1], fogB = fogRgb[2];

      for (var x = 0; x < W; x++) {
        // camera x in [-1, 1] across the screen (sampled at the column centre).
        var camX = (2 * (x + 0.5) / W - 1) * camScale;
        var rdx = dirX + planeX * camX, rdy = dirY + planeY * camX;
        var mapX = Math.floor(px), mapY = Math.floor(py);
        // deltaDist: ray length (in units of the ray vector) between two x- (or y-)
        // gridlines. 1e30 stands in for infinity when the ray is parallel to an axis,
        // exactly like is_zero() in Cub3D.
        var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
        var ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
        var stepX, stepY, sdx, sdy;
        // sideDist: distance from the player to the first x- (or y-) gridline.
        if (rdx < 0) { stepX = -1; sdx = (px - mapX) * ddx; } else { stepX = 1; sdx = (mapX + 1 - px) * ddx; }
        if (rdy < 0) { stepY = -1; sdy = (py - mapY) * ddy; } else { stepY = 1; sdy = (mapY + 1 - py) * ddy; }

        // DDA: always step to whichever gridline is nearer. side 0 = crossed a vertical
        // gridline (hit an x-side), side 1 = crossed a horizontal one (y-side).
        var side = 0, guard = 0;
        for (;;) {
          if (sdx < sdy) { sdx += ddx; mapX += stepX; side = 0; } else { sdy += ddy; mapY += stepY; side = 1; }
          if (cells[mapY * w + mapX] === 1 || ++guard > 256) break; // map is closed, guard is a safety net
        }

        // Perpendicular distance: we overshot by one deltaDist, so step back once. This is
        // the distance along the view direction, not along the ray, so walls straight in
        // front are flat (no fisheye). Since rd = dir + plane*camX has a component of exactly
        // 1 along dir, the true hit point is simply p + rd * perp.
        var perp = side === 0 ? sdx - ddx : sdy - ddy;
        if (perp < 1e-4) perp = 1e-4;
        var hx = px + rdx * perp, hy = py + rdy * perp;
        hitX[x] = hx; hitY[x] = hy;

        // Wall slice height: focal / distance. The camera sits at half wall height.
        var lineH = focal / perp;
        var top = horizon - lineH * 0.5;
        var y0 = top < 0 ? 0 : Math.floor(top);
        var y1 = horizon + lineH * 0.5;
        y1 = y1 > H ? H : Math.floor(y1);

        // Texture selection mirrors Cub3D: by side and ray direction.
        var face = side === 0 ? (rdx < 0 ? FACE_WEST : FACE_EAST) : (rdy < 0 ? FACE_NORTH : FACE_SOUTH);
        var wallX = side === 0 ? hy : hx;               // where along the wall we hit, 0..1
        wallX -= Math.floor(wallX);
        var texX = (wallX * TEX) | 0;
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TEX - texX - 1;
        var step = TEX / lineH;                         // texels per screen pixel
        var texPos = (y0 - top) * step;
        var texBase = face * TEX * TEX;

        // Shading: x-sides are darker; fog blends towards the background colour.
        var fog = 1 - Math.exp(-FOG_DENSITY * perp);
        var mul = (side === 0 ? X_SIDE_SHADE : 1) * (1 - fog);
        var addR = fogR * fog, addG = fogG * fog, addB = fogB * fog;

        var o = x * 4, rowStride = W * 4, y, k;
        for (y = 0; y < y0; y++, o += rowStride) {      // ceiling
          k = y * 3; data[o] = rowRgb[k]; data[o + 1] = rowRgb[k + 1]; data[o + 2] = rowRgb[k + 2];
        }
        for (; y < y1; y++, o += rowStride) {           // wall
          k = (texBase + ((texPos | 0) & (TEX - 1)) * TEX + texX) * 3;
          texPos += step;
          data[o] = tex[k] * mul + addR; data[o + 1] = tex[k + 1] * mul + addG; data[o + 2] = tex[k + 2] * mul + addB;
        }
        for (; y < H; y++, o += rowStride) {            // floor
          k = y * 3; data[o] = rowRgb[k]; data[o + 1] = rowRgb[k + 1]; data[o + 2] = rowRgb[k + 2];
        }
      }

      offCtx.putImageData(img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      drawMinimap(W);
      drawHint();
    }

    function drawMinimap(rays) {
      var cs = miniCell, ox = miniX + miniPad, oy = miniY + miniPad, i;
      ctx.drawImage(mini, miniX, miniY);
      // Field of view: a polygon through the actual hit point of every ray cast this frame...
      ctx.beginPath();
      ctx.moveTo(ox + player.x * cs, oy + player.y * cs);
      for (i = 0; i < rays; i++) ctx.lineTo(ox + hitX[i] * cs, oy + hitY[i] * cs);
      ctx.closePath();
      ctx.fillStyle = accentFill;
      ctx.fill();
      // ...plus a subset of those rays stroked individually (all of them would be a solid fan).
      var every = Math.max(1, Math.ceil(rays / 24));
      ctx.beginPath();
      for (i = 0; i < rays; i += every) {
        ctx.moveTo(ox + player.x * cs, oy + player.y * cs);
        ctx.lineTo(ox + hitX[i] * cs, oy + hitY[i] * cs);
      }
      ctx.moveTo(ox + player.x * cs, oy + player.y * cs);
      ctx.lineTo(ox + hitX[rays - 1] * cs, oy + hitY[rays - 1] * cs);
      ctx.strokeStyle = accentRay;
      ctx.lineWidth = Math.max(1, dpr * 0.75);
      ctx.stroke();
      // Player.
      ctx.beginPath();
      ctx.arc(ox + player.x * cs, oy + player.y * cs, Math.max(2 * dpr, cs * 0.28), 0, 2 * Math.PI);
      ctx.fillStyle = accentSolid;
      ctx.fill();
    }

    function drawHint() {
      if (coarse || document.activeElement === canvas) return;
      var pad = 8 * dpr;
      ctx.font = hintFont;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(11,10,18,0.7)';
      var tw = ctx.measureText(L.hint).width;
      ctx.fillRect(pad, canvas.height - pad - 20 * dpr, tw + 16 * dpr, 20 * dpr);
      ctx.fillStyle = MUTED;
      ctx.fillText(L.hint, pad + 8 * dpr, canvas.height - pad - 5 * dpr);
    }

    // ---------------------------------------------------------- sizing ----
    function resize() {
      var cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      if (cssW === 0 || cssH === 0) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      if (canvas.width !== bw) canvas.width = bw;
      if (canvas.height !== bh) canvas.height = bh;

      // One ray per CSS pixel column, or per N columns on wide canvases (N chosen so that
      // there are at most MAX_RAYS rays). The buffer uses square pixels.
      var colW = Math.max(1, Math.ceil(cssW / MAX_RAYS));
      var nw = Math.max(1, Math.round(cssW / colW)), nh = Math.max(1, Math.round(cssH / colW));
      if (nw !== bufW || nh !== bufH) {
        bufW = nw; bufH = nh;
        off.width = bufW; off.height = bufH;
        img = offCtx.createImageData(bufW, bufH);
        pix = img.data;
        for (var i = 3; i < pix.length; i += 4) pix[i] = 255; // opaque once; never rewritten
        rowRgb = new Uint8Array(bufH * 3);
      }
      // Focal length in buffer pixels. Width-limited: the plane spans the full width
      // (66deg FOV). On tall/square layouts that would make the vertical FOV huge and the
      // walls tiny, so cap the vertical FOV instead (tan(half vFOV) = 0.5, about 53deg)
      // and let the horizontal FOV narrow.
      focal = Math.max(bufW / (2 * PLANE), bufH / (2 * 0.5));

      // Ceiling and floor: each row looks at a plane 0.5 above/below the camera at
      // distance 0.5 * focal / |row - horizon|; fogging that distance with the same formula
      // as the walls gives a gradient that matches the walls at every depth.
      var ceil = hexToRgb(SURFACE2), floor = mix(hexToRgb(SURFACE2), accent, 0.12);
      var horizon = bufH * 0.5;
      for (var y = 0; y < bufH; y++) {
        var dy = Math.abs(y + 0.5 - horizon);
        var dist = 0.5 * focal / Math.max(dy, 1e-3);
        var fog = 1 - Math.exp(-FOG_DENSITY * dist);
        var base = y < horizon ? ceil : floor;
        rowRgb[y * 3] = base[0] + (fogRgb[0] - base[0]) * fog;
        rowRgb[y * 3 + 1] = base[1] + (fogRgb[1] - base[1]) * fog;
        rowRgb[y * 3 + 2] = base[2] + (fogRgb[2] - base[2]) * fog;
      }

      buildMinimap();
      hintFont = (12 * dpr) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      return true;
    }

    function buildMinimap() {
      var cs = Math.floor(Math.min(canvas.width * 0.2 / map.w, canvas.height * 0.36 / map.h));
      miniCell = Math.max(Math.round(2 * dpr), cs);
      miniPad = Math.round(4 * dpr);
      miniX = miniY = Math.round(8 * dpr);
      mini.width = map.w * miniCell + miniPad * 2;
      mini.height = map.h * miniCell + miniPad * 2;
      var m = miniCtx;
      m.fillStyle = 'rgba(11,10,18,0.82)';
      m.fillRect(0, 0, mini.width, mini.height);
      m.strokeStyle = BORDER;
      m.lineWidth = Math.max(1, dpr);
      m.strokeRect(m.lineWidth / 2, m.lineWidth / 2, mini.width - m.lineWidth, mini.height - m.lineWidth);
      m.fillStyle = rgba(mix(hexToRgb(SURFACE2), accent, 0.35), 1);
      for (var y = 0; y < map.h; y++) {
        for (var x = 0; x < map.w; x++) {
          if (map.cells[y * map.w + x]) {
            m.fillRect(miniPad + x * miniCell, miniPad + y * miniCell, miniCell - 1, miniCell - 1);
          }
        }
      }
      // Faint floor grid.
      m.fillStyle = SURFACE;
      for (y = 0; y < map.h; y++) {
        for (x = 0; x < map.w; x++) {
          if (!map.cells[y * map.w + x]) {
            m.fillRect(miniPad + x * miniCell, miniPad + y * miniCell, miniCell - 1, miniCell - 1);
          }
        }
      }
    }

    // ----------------------------------------------------------- stats ----
    function stats(force) {
      if (!onStats) return;
      var rays = canvas.clientWidth < NARROW_PX ? L.raysShort : L.rays;
      var s = bufW + ' ' + rays + ' · ' + (auto ? L.auto : L.manual);
      if (force || s !== lastStats) { lastStats = s; onStats(s); }
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
      update(dt);
      render();
      statsTimer += dt;
      if (statsTimer >= 0.25) { statsTimer = 0; stats(false); }
    }

    function start() {
      if (running || destroyed) return;
      running = true;
      lastT = 0;
      rafId = window.requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    }

    // ----------------------------------------------------------- input ----
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab' || e.key === 'Shift') return;  // let focus move normally
      var k = KEYMAP[e.code];
      idle = 0;
      if (auto) { auto = false; autoOmega = 0; autoSpeed = 0; stats(false); }
      if (k !== undefined) { keys[k] = 1; e.preventDefault(); }
      else if (SWALLOW[e.code]) e.preventDefault();
    }
    function onKeyUp(e) {
      var k = KEYMAP[e.code];
      if (k !== undefined) { keys[k] = 0; e.preventDefault(); }
    }
    function onBlur() {
      keys.fill(0);
      if (!running) render();  // repaint the hint on the static frame
    }
    function onFocus() { if (!running) render(); }
    function onPointerDown() {
      // Clicking focuses the canvas (tabindex) and counts as taking control.
      if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
      idle = 0;
      if (auto) { auto = false; autoOmega = 0; autoSpeed = 0; stats(false); }
    }

    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('blur', onBlur);
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('pointerdown', onPointerDown);

    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function () { if (resize()) render(); });
      ro.observe(canvas);
    }

    // Initial static frame.
    if (resize()) render();
    stats(true);

    return {
      start: start,
      stop: stop,
      destroy: function () {
        if (destroyed) return;
        stop();
        destroyed = true;
        canvas.removeEventListener('keydown', onKeyDown);
        canvas.removeEventListener('keyup', onKeyUp);
        canvas.removeEventListener('blur', onBlur);
        canvas.removeEventListener('focus', onFocus);
        canvas.removeEventListener('pointerdown', onPointerDown);
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
        return { x: player.x, y: player.y, angle: player.a, auto: auto, rays: bufW, running: running };
      }
    };
  }

  window.LabDemos = window.LabDemos || {};
  window.LabDemos.raycaster = { mount: mount };
})();
