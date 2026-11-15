/*
 * Portfolio shell behaviour. Classic script, no modules, no dependencies.
 *  1. Hero DDA figure (real grid raycast, drawn as SVG)
 *  2. Lab: mounts window.LabDemos.* into their canvases and drives start/stop
 *  3. Arcade: accessible modal game viewer
 *  4. Contact: copy email to clipboard
 *  5. Nav: marks the section currently in view
 */
(function () {
  'use strict';

  var doc = document;
  var I18N = window.SiteI18n || {
    lang: 'en',
    onChange: function () {},
    t: function (k) { return k; }
  };
  var t = function (k, v) { return I18N.t(k, v); };
  var ACCENT = '#a78bfa';

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var prefersReduced = !!(reduceMQ && reduceMQ.matches);

  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  /* ------------------------------------------------------------------ */
  /* 1. Hero: DDA raycast figure                                         */
  /* ------------------------------------------------------------------ */

  function initDDA() {
    var svg = doc.getElementById('dda-svg');
    var box = doc.getElementById('dda');
    var stat = doc.getElementById('dda-stat');
    if (!svg || !box) return;

    var NS = 'http://www.w3.org/2000/svg';
    var MAP = [
      '################',
      '#..............#',
      '#..##.......#..#',
      '#...........#..#',
      '#.......##.....#',
      '#..............#',
      '#..............#',
      '#.....#........#',
      '#.......#...##.#',
      '################'
    ];
    var W = MAP[0].length, H = MAP.length, CELL = 20;
    var FOV = 66 * Math.PI / 180;
    var RAYS = 33;
    var px = 2.5, py = 6.5;
    var angle = -0.38;
    var lastCells = 0;

    function isWall(x, y) {
      if (x < 0 || y < 0 || x >= W || y >= H) return true;
      return MAP[y].charAt(x) === '#';
    }

    // Static layer: grid lines and wall cells.
    var gridPath = '';
    for (var gx = 1; gx < W; gx++) gridPath += 'M' + gx * CELL + ' 0V' + H * CELL;
    for (var gy = 1; gy < H; gy++) gridPath += 'M0 ' + gy * CELL + 'H' + W * CELL;
    var grid = doc.createElementNS(NS, 'path');
    grid.setAttribute('d', gridPath);
    grid.setAttribute('class', 'gridline');
    svg.appendChild(grid);

    var cellEls = {};
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (!isWall(x, y)) continue;
        var r = doc.createElementNS(NS, 'rect');
        r.setAttribute('x', x * CELL + 1);
        r.setAttribute('y', y * CELL + 1);
        r.setAttribute('width', CELL - 2);
        r.setAttribute('height', CELL - 2);
        r.setAttribute('rx', 2);
        r.setAttribute('class', 'cell');
        svg.appendChild(r);
        cellEls[x + ',' + y] = r;
      }
    }
    var dyn = doc.createElementNS(NS, 'g');
    svg.appendChild(dyn);

    // Classic DDA: step to whichever grid line (x or y) is closer, until a wall cell.
    function cast(a, collectSteps) {
      var dx = Math.cos(a), dy = Math.sin(a);
      var mx = Math.floor(px), my = Math.floor(py);
      var ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
      var ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
      var sx, sy, sdx, sdy;
      if (dx < 0) { sx = -1; sdx = (px - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - px) * ddx; }
      if (dy < 0) { sy = -1; sdy = (py - my) * ddy; } else { sy = 1; sdy = (my + 1 - py) * ddy; }
      var dist = 0, steps = [], visited = 0;
      for (var i = 0; i < 64; i++) {
        if (sdx < sdy) { dist = sdx; sdx += ddx; mx += sx; } else { dist = sdy; sdy += ddy; my += sy; }
        visited++;
        if (collectSteps) steps.push([px + dx * dist, py + dy * dist]);
        if (isWall(mx, my)) break;
      }
      return { x: px + dx * dist, y: py + dy * dist, cx: mx, cy: my, steps: steps, visited: visited };
    }

    function f(n) { return (Math.round(n * 10) / 10).toString(); }

    function render() {
      var hits = [], cells = 0, hitCells = {}, mid = null;
      for (var i = 0; i < RAYS; i++) {
        var a = angle - FOV / 2 + FOV * (i / (RAYS - 1));
        var center = i === (RAYS - 1) / 2;
        var h = cast(a, center);
        if (center) mid = h;
        cells += h.visited;
        hits.push(h);
        hitCells[h.cx + ',' + h.cy] = true;
      }
      lastCells = cells;

      var P = [px * CELL, py * CELL];
      var cone = 'M' + f(P[0]) + ' ' + f(P[1]);
      var rays = '';
      var dots = '';
      for (var j = 0; j < hits.length; j++) {
        var hx = hits[j].x * CELL, hy = hits[j].y * CELL;
        cone += 'L' + f(hx) + ' ' + f(hy);
        rays += 'M' + f(P[0]) + ' ' + f(P[1]) + 'L' + f(hx) + ' ' + f(hy);
        dots += '<circle class="hit" cx="' + f(hx) + '" cy="' + f(hy) + '" r="1.3"/>';
      }
      cone += 'Z';
      var steps = '';
      if (mid) {
        for (var k = 0; k < mid.steps.length - 1; k++) {
          steps += '<rect class="step" x="' + f(mid.steps[k][0] * CELL - 1.6) + '" y="' + f(mid.steps[k][1] * CELL - 1.6) + '" width="3.2" height="3.2"/>';
        }
      }
      var ex = P[0] + Math.cos(angle) * 9, ey = P[1] + Math.sin(angle) * 9;
      dyn.innerHTML =
        '<path class="cone" d="' + cone + '"/>' +
        '<path class="ray" d="' + rays + '"/>' +
        dots + steps +
        '<line x1="' + f(P[0]) + '" y1="' + f(P[1]) + '" x2="' + f(ex) + '" y2="' + f(ey) + '" stroke="' + ACCENT + '" stroke-width="2" stroke-linecap="round"/>' +
        '<circle class="player" cx="' + f(P[0]) + '" cy="' + f(P[1]) + '" r="4"/>';

      for (var key in cellEls) {
        if (Object.prototype.hasOwnProperty.call(cellEls, key)) {
          cellEls[key].setAttribute('class', hitCells[key] ? 'cell is-hit' : 'cell');
        }
      }
      updateStat();
    }

    function updateStat() {
      if (stat) stat.textContent = t('hero.ddaStat', { rays: RAYS, cells: lastCells });
    }

    var pending = false, target = angle;
    function aimAt(clientX, clientY) {
      var rect = box.getBoundingClientRect();
      if (!rect.width) return;
      var mxp = (clientX - rect.left) / rect.width * W;
      var myp = (clientY - rect.top) / rect.height * H;
      if (Math.abs(mxp - px) < .05 && Math.abs(myp - py) < .05) return;
      target = Math.atan2(myp - py, mxp - px);
      if (!pending) {
        pending = true;
        window.requestAnimationFrame(function () { pending = false; sweeping = false; angle = target; render(); });
      }
    }
    box.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      aimAt(e.clientX, e.clientY);
    });
    box.addEventListener('pointerdown', function (e) { aimAt(e.clientX, e.clientY); });

    // One orchestrated moment on load: the view cone sweeps once, then waits for the pointer.
    var sweeping = false;
    if (!prefersReduced && window.requestAnimationFrame) {
      var from = -1.45, to = -0.38, dur = 1600, t0 = null;
      sweeping = true;
      angle = from;
      var tick = function (ts) {
        if (!sweeping) return;
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        angle = from + (to - from) * e;
        render();
        if (p < 1) window.requestAnimationFrame(tick); else sweeping = false;
      };
      render();
      window.requestAnimationFrame(tick);
    } else {
      render();
    }

    I18N.onChange(updateStat);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Lab demos                                                        */
  /* ------------------------------------------------------------------ */

  function initLab() {
    var cards = $all('.demo[data-demo]');
    var controllers = [];

    cards.forEach(function (card) {
      var name = card.getAttribute('data-demo');
      var canvas = $('canvas', card);
      var overlay = $('.demo__overlay', card);
      var msg = $('.demo__msg', card);
      var playBtn = $('.demo__play', card);
      var stats = $('.demo__stats', card);
      var toggle = $('.demo__toggle', card);
      if (!canvas || !toggle) return;

      var st = {
        inst: null,
        visible: false,
        running: false,
        everStarted: false,
        // With reduced motion the user has to start the demo explicitly.
        userPaused: prefersReduced
      };

      function lib() {
        var L = window.LabDemos;
        return L && L[name] && typeof L[name].mount === 'function' ? L[name] : null;
      }

      function mount() {
        var L = lib();
        if (!L) return null;
        try {
          var inst = L.mount(canvas, {
            accent: ACCENT,
            lang: I18N.lang,
            onStats: function (text) { if (stats) stats.textContent = String(text); }
          });
          if (inst && typeof inst.start === 'function' && typeof inst.stop === 'function') return inst;
        } catch (err) {
          if (window.console) console.warn('[lab] ' + name + ' failed to mount:', err);
        }
        return null;
      }

      function call(fn) {
        if (!st.inst || typeof st.inst[fn] !== 'function') return;
        try { st.inst[fn](); } catch (err) {
          if (window.console) console.warn('[lab] ' + name + '.' + fn + '() failed:', err);
        }
      }

      function render() {
        var unavailable = !st.inst;
        card.classList.toggle('is-unavailable', unavailable);
        toggle.disabled = unavailable;
        toggle.hidden = false;

        if (unavailable) {
          toggle.textContent = t('lab.pause');
          overlay.hidden = false;
          msg.innerHTML = '';
          var strong = doc.createElement('strong');
          strong.textContent = t('lab.unavailTitle');
          msg.appendChild(strong);
          msg.appendChild(doc.createTextNode(t('lab.unavailText')));
          playBtn.hidden = true;
          if (stats) stats.textContent = '—';
          return;
        }

        if (st.userPaused) {
          toggle.textContent = st.everStarted ? t('lab.resume') : t('lab.playShort');
        } else {
          toggle.textContent = t('lab.pause');
        }
        toggle.setAttribute('aria-pressed', st.userPaused ? 'true' : 'false');

        // Before the first start (reduced motion) the overlay button is the only start control.
        var needsPlay = st.userPaused && !st.everStarted;
        overlay.hidden = !needsPlay;
        playBtn.hidden = !needsPlay;
        toggle.hidden = needsPlay;
        if (needsPlay) {
          msg.textContent = prefersReduced ? t('lab.reducedText') : '';
          playBtn.textContent = t('lab.play');
        }
      }

      function sync() {
        var should = !!st.inst && st.visible && !doc.hidden && !st.userPaused;
        if (should !== st.running) {
          st.running = should;
          call(should ? 'start' : 'stop');
          if (should) st.everStarted = true;
        }
        render();
      }

      function setPaused(p) {
        st.userPaused = p;
        sync();
      }

      toggle.addEventListener('click', function () { setPaused(!st.userPaused); });
      playBtn.addEventListener('click', function () {
        setPaused(false);
        try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
      });

      st.inst = mount();
      if (!st.inst) st.userPaused = false;

      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { st.visible = en.isIntersecting; });
          sync();
        }, { threshold: 0 });
        io.observe(card.querySelector('.demo__screen') || card);
      } else {
        st.visible = true;
      }

      var ctl = {
        sync: sync,
        relang: function (lang) {
          if (!st.inst) { render(); return; }
          if (typeof st.inst.setLang === 'function') {
            try { st.inst.setLang(lang); } catch (e) { /* ignore */ }
            render();
            return;
          }
          // Remount so the demo picks up the new language.
          if (st.running) call('stop');
          st.running = false;
          call('destroy');
          st.inst = mount();
          sync();
        }
      };
      controllers.push(ctl);
      sync();
    });

    doc.addEventListener('visibilitychange', function () {
      controllers.forEach(function (c) { c.sync(); });
    });
    I18N.onChange(function (lang) {
      controllers.forEach(function (c) { c.relang(lang); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 3. Arcade viewer                                                    */
  /* ------------------------------------------------------------------ */

  function initViewer() {
    var viewer = doc.getElementById('viewer');
    var panel = doc.getElementById('viewer-panel');
    var frame = doc.getElementById('viewer-frame');
    var title = doc.getElementById('viewer-title');
    if (!viewer || !panel || !frame) return;

    var btnRestart = $('[data-act="restart"]', panel);
    var btnFull = $('[data-act="fullscreen"]', panel);
    var linkNew = $('[data-act="newtab"]', panel);
    var btnClose = $('[data-act="close"]', panel);
    var outside = [doc.querySelector('.top'), doc.getElementById('main'), doc.querySelector('.foot'), doc.querySelector('.skip')];

    var GAMES = {
      snake: 'games/snake/index.html',
      breakout: 'games/breakout/index.html',
      pong: 'games/pong/index.html'
    };
    var current = null;     // game id
    var opener = null;      // element to return focus to
    var scrollY = 0;

    var fsEnabled = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled) &&
      !!(panel.requestFullscreen || panel.webkitRequestFullscreen);
    if (!fsEnabled) btnFull.hidden = true;

    function fsElement() { return doc.fullscreenElement || doc.webkitFullscreenElement || null; }
    function exitFs() {
      if (!fsElement()) return;
      try {
        var p = doc.exitFullscreen ? doc.exitFullscreen() : (doc.webkitExitFullscreen && doc.webkitExitFullscreen());
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    }
    function updateFsLabel() {
      btnFull.textContent = fsElement() === panel ? t('viewer.exitFullscreen') : t('viewer.fullscreen');
    }
    doc.addEventListener('fullscreenchange', updateFsLabel);
    doc.addEventListener('webkitfullscreenchange', updateFsLabel);

    function urlFor(id) { return GAMES[id] + '?lang=' + encodeURIComponent(I18N.lang); }
    function isOpen() { return !viewer.hidden; }

    function labelFor(id) {
      var name = t('arc.' + id + '.title');
      title.textContent = name;
      frame.setAttribute('title', t('viewer.frameTitle', { game: name }));
      linkNew.href = urlFor(id);
    }

    function lockScroll() {
      scrollY = window.pageYOffset || doc.documentElement.scrollTop;
      var sbw = window.innerWidth - doc.documentElement.clientWidth;
      if (sbw > 0) doc.body.style.paddingRight = sbw + 'px';
      doc.body.classList.add('is-locked');
    }
    function unlockScroll() {
      doc.body.classList.remove('is-locked');
      doc.body.style.paddingRight = '';
      if (Math.abs((window.pageYOffset || 0) - scrollY) > 2) window.scrollTo(0, scrollY);
    }

    function setInert(on) {
      outside.forEach(function (el) {
        if (!el) return;
        if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
        else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
      });
    }

    function open(id, from) {
      if (!GAMES[id]) return;
      current = id;
      opener = from || doc.activeElement;
      labelFor(id);
      updateFsLabel();
      viewer.hidden = false;
      lockScroll();
      setInert(true);
      frame.src = urlFor(id);
      btnClose.focus();
    }

    function close() {
      if (!isOpen()) return;
      exitFs();
      frame.src = 'about:blank';
      viewer.hidden = true;
      setInert(false);
      unlockScroll();
      current = null;
      var back = opener;
      opener = null;
      if (back && typeof back.focus === 'function') {
        try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); }
      }
    }

    function focusFrame() {
      try { frame.focus({ preventScroll: true }); } catch (e) { frame.focus(); }
      try { if (frame.contentWindow) frame.contentWindow.focus(); } catch (e) { /* cross-origin (file://) */ }
    }

    frame.addEventListener('load', function () {
      if (!isOpen() || !current) return;
      var src = frame.getAttribute('src') || '';
      if (src === 'about:blank') return;
      // Esc inside the game should still close the viewer (same-origin only).
      try {
        var w = frame.contentWindow;
        if (w && !w.__viewerEscBound) {
          w.__viewerEscBound = true;
          w.addEventListener('keydown', function (e) {
            if ((e.key === 'Escape' || e.key === 'Esc') && !e.defaultPrevented && !fsElement()) close();
          });
        }
      } catch (e) { /* cross-origin: Esc works once focus is back in the toolbar */ }
      focusFrame();
    });

    btnRestart.addEventListener('click', function () {
      if (!current) return;
      var reloaded = false;
      try {
        if (frame.contentWindow && frame.contentWindow.location.href !== 'about:blank') {
          frame.contentWindow.location.reload();
          reloaded = true;
        }
      } catch (e) { /* cross-origin */ }
      if (!reloaded) frame.src = urlFor(current);
    });

    btnFull.addEventListener('click', function () {
      if (fsElement()) { exitFs(); return; }
      try {
        var p = panel.requestFullscreen ? panel.requestFullscreen() : panel.webkitRequestFullscreen();
        if (p && p.then) p.then(focusFrame, function () {});
        else focusFrame();
      } catch (e) { /* ignore */ }
    });

    btnClose.addEventListener('click', close);
    viewer.addEventListener('mousedown', function (e) { if (e.target === viewer) close(); });

    // Focus trap. Sentinels catch Tab leaving the iframe (whose key events we cannot see).
    function focusables() {
      return [btnRestart, btnFull, linkNew, btnClose, frame].filter(function (el) {
        return el && !el.hidden && el.offsetParent !== null;
      });
    }
    $all('.viewer__sentinel', panel).forEach(function (s) {
      s.addEventListener('focus', function () {
        var list = focusables();
        if (!list.length) return;
        if (s.getAttribute('data-sentinel') === 'start') {
          var last = list[list.length - 1];
          if (last === frame) focusFrame(); else last.focus();
        } else {
          list[0].focus();
        }
      });
    });

    doc.addEventListener('keydown', function (e) {
      if (!isOpen()) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (fsElement()) return; // browser exits fullscreen first
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      var a = doc.activeElement;
      if (e.shiftKey && (a === first || !panel.contains(a))) {
        e.preventDefault();
        if (last === frame) focusFrame(); else last.focus();
      } else if (!e.shiftKey && (a === last || !panel.contains(a))) {
        e.preventDefault();
        first.focus();
      }
    });

    doc.addEventListener('focusin', function (e) {
      if (isOpen() && !panel.contains(e.target)) btnClose.focus();
    });

    $all('.cab__play[data-game]').forEach(function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-game'), b); });
    });

    I18N.onChange(function () {
      if (current) labelFor(current);
      updateFsLabel();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 4. Copy email                                                       */
  /* ------------------------------------------------------------------ */

  function initCopy() {
    var btn = doc.getElementById('copy-mail');
    var status = doc.getElementById('copy-status');
    if (!btn || !status) return;
    var timer = null;
    var lastKey = null;

    function show(key, isError) {
      lastKey = key;
      status.textContent = t(key);
      status.classList.toggle('is-error', !!isError);
      clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; lastKey = null; }, 4000);
    }

    function fallback(text) {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      btn.focus();
      return ok;
    }

    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () {
          show('contact.copied');
        }, function () {
          var ok = fallback(text);
          show(ok ? 'contact.copied' : 'contact.copyFail', !ok);
        });
      } else {
        var ok = fallback(text);
        show(ok ? 'contact.copied' : 'contact.copyFail', !ok);
      }
    });

    I18N.onChange(function () { if (lastKey) status.textContent = t(lastKey); });
  }

  /* ------------------------------------------------------------------ */
  /* 5. Nav: current section                                             */
  /* ------------------------------------------------------------------ */

  function initNav() {
    if (!('IntersectionObserver' in window)) return;
    var links = $all('.nav a[href^="#"]');
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute('aria-current'); });
        var a = map[en.target.id];
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $all('main > section[id]').forEach(function (s) { io.observe(s); });
  }

  function boot() {
    initDDA();
    initLab();
    initViewer();
    initCopy();
    initNav();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
