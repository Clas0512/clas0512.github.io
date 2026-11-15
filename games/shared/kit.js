/*
 * GameKit - the small set of helpers the three Arcade games have in common.
 *
 * A classic script (no ES modules) so it works from file://, GitHub Pages and inside an
 * iframe alike. It registers one global, window.GameKit. Everything game-specific
 * (rules, physics, rendering) stays in the individual game files.
 */
(function () {
  'use strict';

  const doc = document;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Running inside the site's game viewer (an iframe)? Then the viewer owns Esc (close) and shows
  // the title, so the games do not pause on Esc and hide their own HUD title (see game.css).
  const embedded = window.self !== window.top;
  if (embedded) doc.documentElement.classList.add('is-embedded');

  /* ------------------------------------------------------------------ *
   * Language: ?lang=tr | ?lang=en (default en)
   * ------------------------------------------------------------------ */

  const COMMON_STRINGS = {
    en: {
      score: 'Score', best: 'Best', play: 'Play', resume: 'Resume', playAgain: 'Play again',
      paused: 'Paused', pausedKb: 'Press P to resume.', pausedTouch: 'Tap to resume.',
      gameOver: 'Game over', newBest: 'New best!',
      pauseBtn: 'Pause (P)', resumeBtn: 'Resume (P)', soundOn: 'Turn sound on', soundOff: 'Turn sound off',
    },
    tr: {
      score: 'Skor', best: 'En iyi', play: 'Oyna', resume: 'Devam et', playAgain: 'Tekrar oyna',
      paused: 'Duraklatıldı', pausedKb: 'Devam etmek için P tuşuna bas.', pausedTouch: 'Devam etmek için dokun.',
      gameOver: 'Oyun bitti', newBest: 'Yeni rekor!',
      pauseBtn: 'Duraklat (P)', resumeBtn: 'Devam et (P)', soundOn: 'Sesi aç', soundOff: 'Sesi kapat',
    },
  };

  function getLang() {
    let q = '';
    try { q = new URLSearchParams(location.search).get('lang') || ''; } catch (e) { /* ignore */ }
    return q.toLowerCase() === 'tr' ? 'tr' : 'en';
  }

  /**
   * Merge a game's strings ({en:{...}, tr:{...}}) over the common ones, localise the static
   * markup and return t(key, vars). Markup hooks:
   *   [data-i18n]      -> textContent
   *   [data-i18n-aria] -> aria-label
   * "{name}" placeholders in a string are filled from vars.
   */
  function i18n(gameStrings) {
    const lang = getLang();
    const table = Object.assign({}, COMMON_STRINGS.en, gameStrings.en, COMMON_STRINGS[lang], gameStrings[lang]);
    const t = (key, vars) => {
      const s = key in table ? table[key] : key;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
    };
    t.lang = lang;
    doc.documentElement.lang = lang;
    doc.title = t('title') + ' · Arcade';
    doc.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    doc.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    return t;
  }

  /* ------------------------------------------------------------------ *
   * Storage: localStorage can throw (private mode, sandboxed iframes), so keep a
   * numeric in-memory copy as the fallback.
   * ------------------------------------------------------------------ */

  function storage(key) {
    let mem = 0;
    return {
      get() {
        try {
          const raw = localStorage.getItem(key);
          if (raw !== null) mem = Number(raw) || 0;
        } catch (e) { /* use the in-memory value */ }
        return mem;
      },
      set(value) {
        mem = value;
        try { localStorage.setItem(key, String(value)); } catch (e) { /* memory only */ }
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * Keyboard: held-key state plus a one-shot press callback.
   * Arrow keys and Space are always preventDefault()ed so the page / iframe never scrolls.
   * ------------------------------------------------------------------ */

  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  function keyboard(onPress) {
    const held = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;                 // leave browser shortcuts alone
      // A focused button handles Enter/Space itself (via click); don't act twice.
      if (e.target instanceof HTMLButtonElement && (e.code === 'Enter' || e.code === 'Space')) return;
      if (SCROLL_KEYS.has(e.code)) e.preventDefault();
      held.add(e.code);
      if (!e.repeat && onPress) onPress(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      held.delete(e.code);
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    });
    window.addEventListener('blur', () => held.clear());              // no stuck keys after focus loss
    return { isDown: (code) => held.has(code), clear: () => held.clear() };
  }

  /** Call cb when the window loses focus or the tab is hidden (used to auto-pause). */
  function onFocusLoss(cb) {
    window.addEventListener('blur', cb);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) cb(); });
  }

  /* ------------------------------------------------------------------ *
   * Canvas: fixed logical resolution (W x H) scaled to fit the stage, letterboxed,
   * backed by a devicePixelRatio-aware buffer (capped) so lines stay crisp.
   * After fitting, draw in logical units; the context transform does the scaling.
   * Optional chooseSize(availW, availH) -> [W, H] runs before every fit and may switch the
   * logical size (Pong uses it for its vertical court). view.W / view.H are always current.
   * ------------------------------------------------------------------ */

  function fitCanvas(canvas, W, H, maxDpr, chooseSize) {
    const cap = maxDpr || 2;
    const stage = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const view = {
      ctx, W, H,
      /** Client (CSS pixel) coordinates -> logical coordinates. */
      toLogical(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        return { x: (clientX - r.left) * view.W / r.width, y: (clientY - r.top) * view.H / r.height };
      },
    };

    function resize() {
      const cs = getComputedStyle(stage);
      const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (chooseSize) [view.W, view.H] = chooseSize(availW, availH);
      const scale = Math.max(0.05, Math.min(availW / view.W, availH / view.H));
      const cssW = Math.floor(view.W * scale);
      const cssH = Math.floor(view.H * scale);
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      if (canvas.width !== bw) canvas.width = bw;                      // assigning resets the context, so only on change
      if (canvas.height !== bh) canvas.height = bh;
      ctx.setTransform(canvas.width / view.W, 0, 0, canvas.height / view.H, 0, 0);
    }

    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);                         // also fires on zoom / DPR change
    return view;
  }

  /** Rounded-rect path (Context2D.roundRect is not available everywhere yet). */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Theme colours as the canvas needs them, read once from the CSS custom properties. */
  function theme() {
    const cs = getComputedStyle(doc.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    return {
      bg: v('--bg'), surface: v('--surface'), surface2: v('--surface-2'), border: v('--border'),
      text: v('--text'), muted: v('--muted'), accent: v('--accent'), accentStrong: v('--accent-strong'),
      ok: v('--ok'), danger: v('--danger'), mono: v('--font-mono'), ui: v('--font-ui'),
    };
  }

  /* ------------------------------------------------------------------ *
   * Fixed-timestep loop (Gaffer-on-Games style).
   * Simulation advances in constant dt steps from an accumulator; rendering runs once per
   * animation frame and receives alpha (0..1) = how far we are into the next step, for
   * interpolation. Frame gaps are clamped so a stalled tab can't trigger a catch-up spiral.
   * ------------------------------------------------------------------ */

  function loop(opts) {
    const hz = opts.hz || 60;
    const dt = 1 / hz;
    const maxFrame = opts.maxFrame || 0.1;                             // seconds
    let acc = 0;
    let last = 0;
    let raf = 0;

    function frame(now) {
      raf = requestAnimationFrame(frame);
      acc += Math.min((now - last) / 1000, maxFrame);
      last = now;
      while (acc >= dt) { opts.update(dt); acc -= dt; }
      opts.render(acc / dt);
    }

    return {
      dt,
      start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } },
      stop() { cancelAnimationFrame(raf); raf = 0; },
    };
  }

  /* ------------------------------------------------------------------ *
   * State machine: ready -> playing <-> paused, playing -> gameover | won,
   * and any state can be reset to ready. Illegal transitions are refused.
   * ------------------------------------------------------------------ */

  const TRANSITIONS = {
    ready: ['playing'],
    playing: ['paused', 'gameover', 'won', 'ready'],
    paused: ['playing', 'ready'],
    gameover: ['ready'],
    won: ['ready'],
  };

  function machine(onChange) {
    let state = 'ready';
    let since = performance.now();
    return {
      get state() { return state; },
      /** Milliseconds spent in the current state (used to ignore key-mashing right after game over). */
      age() { return performance.now() - since; },
      is(...names) { return names.includes(state); },
      go(next) {
        if (!TRANSITIONS[state].includes(next)) return false;
        const prev = state;
        state = next;
        since = performance.now();
        onChange(next, prev);
        return true;
      },
    };
  }

  /** True for events that start on the Start / Paused / Game over card (it handles its own clicks). */
  const isOverlay = (target) => !!(target && target.closest && target.closest('.overlay'));

  /* ------------------------------------------------------------------ *
   * Pointer drag along one axis (Breakout paddle, Pong paddle).
   *   mouse       -> absolute: the controlled thing follows the cursor
   *   touch / pen -> relative: dragging anywhere moves it by the finger's delta, so the
   *                  thumb never has to cover the thing being moved
   * A press-and-release without moving counts as a tap.
   * ------------------------------------------------------------------ */

  function dragAxis(el, view, axis, handlers) {
    const TAP_SLOP = 8;                                                // CSS px
    const pick = (e) => view.toLogical(e.clientX, e.clientY)[axis];
    let drag = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (isOverlay(e.target)) return;                                 // capturing here would swallow the overlay's click
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pick(e), value: handlers.value(), moved: false };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (drag && drag.id === e.pointerId && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > TAP_SLOP) drag.moved = true;
      if (e.pointerType === 'mouse') handlers.onMove(pick(e));
      else if (drag && drag.id === e.pointerId) handlers.onMove(drag.value + (pick(e) - drag.from));
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (e.type === 'pointerup' && !drag.moved && handlers.onTap) handlers.onTap();
      drag = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ------------------------------------------------------------------ *
   * Sound: tiny Web Audio blips. Starts muted; the AudioContext is only created when the
   * player unmutes (a user gesture), and nothing here ever throws.
   * ------------------------------------------------------------------ */

  function beeper() {
    let ctx = null;
    let unavailable = false;
    let muted = true;

    function context() {
      if (ctx || unavailable) return ctx;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = AC ? new AC() : null;
      } catch (e) { ctx = null; }
      if (!ctx) unavailable = true;
      return ctx;
    }

    return {
      get muted() { return muted; },
      setMuted(value) {
        muted = !!value;
        if (muted) return;
        const c = context();
        if (c && c.state === 'suspended') c.resume().catch(() => {});
      },
      blip(freq, dur, type, vol, slideTo) {
        if (muted) return;
        const c = context();
        if (!c) return;
        try {
          const d = dur || 0.06;
          const now = c.currentTime;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = type || 'square';
          osc.frequency.setValueAtTime(freq, now);
          if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + d);
          gain.gain.setValueAtTime(vol || 0.035, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + d);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(now);
          osc.stop(now + d + 0.02);
        } catch (e) { /* audio is optional */ }
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * Particles: a small burst effect (skipped for prefers-reduced-motion).
   * ------------------------------------------------------------------ */

  function particles() {
    const list = [];
    const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    return {
      burst(x, y, color, count, speed) {
        if (reduced) return;
        for (let i = 0; i < (count || 10) && list.length < 240; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = (speed || 140) * (0.35 + Math.random() * 0.65);
          list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.3 + Math.random() * 0.35, size: 1.5 + Math.random() * 2, color });
        }
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.age += dt;
          if (p.age >= p.life) { list.splice(i, 1); continue; }
          p.vx *= 0.94; p.vy *= 0.94;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
      },
      draw(ctx) {
        for (const p of list) {
          ctx.globalAlpha = 1 - p.age / p.life;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * UI: the HUD bar and the overlay are identical markup in every game; this wires them.
   * ------------------------------------------------------------------ */

  function ui(t) {
    const $ = (id) => doc.getElementById(id);
    const el = {
      score: $('score'), best: $('best'), pause: $('btn-pause'), mute: $('btn-mute'), stage: $('stage'),
      overlay: $('overlay'), title: $('ov-title'), text: $('ov-text'), button: $('ov-btn'), hint: $('ov-hint'),
    };
    const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

    // Buttons clicked with a pointer give up focus, so Space/Enter keep driving the game.
    const onClick = (target, fn) => target.addEventListener('click', (e) => {
      fn();
      if (e.detail > 0 && doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
    });

    const api = {
      touch,
      el,
      setScore(text) { el.score.textContent = text; },
      setBest(text) { el.best.textContent = text; },
      showOverlay(o) {
        el.title.textContent = o.title;
        el.text.textContent = o.text || '';
        el.text.hidden = !o.text;
        el.button.textContent = o.button;
        el.hint.textContent = o.hint || '';
        el.hint.hidden = !o.hint;
        el.overlay.hidden = false;
      },
      showPaused() {
        api.showOverlay({ title: t('paused'), text: t(touch ? 'pausedTouch' : 'pausedKb'), button: t('resume') });
      },
      hideOverlay() { el.overlay.hidden = true; },
      /** Keep the pause button in step with the state machine. */
      syncState(state) {
        const paused = state === 'paused';
        const label = t(paused ? 'resumeBtn' : 'pauseBtn');
        el.pause.dataset.paused = String(paused);
        el.pause.disabled = !(paused || state === 'playing');
        el.pause.setAttribute('aria-label', label);
        el.pause.title = label;
      },
      syncMute(muted) {
        const label = t(muted ? 'soundOn' : 'soundOff');
        el.mute.dataset.muted = String(muted);
        el.mute.setAttribute('aria-label', label);
        el.mute.title = label;
      },
      /** Wire the HUD buttons, overlay click/tap, and focus handling. */
      bind(actions) {
        onClick(el.overlay, actions.primary);
        onClick(el.pause, actions.pause);
        onClick(el.mute, actions.mute);
        el.stage.addEventListener('contextmenu', (e) => e.preventDefault());   // no long-press menu on touch
        el.stage.addEventListener('pointerdown', () => window.focus());
        window.focus();
      },
    };
    return api;
  }

  window.GameKit = {
    embedded, clamp, isOverlay, i18n, storage, keyboard, onFocusLoss, fitCanvas, roundRect, theme,
    loop, machine, dragAxis, beeper, particles, ui,
  };
})();
