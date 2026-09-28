/* =============================================================================
 * fx.js — 移植 effects.py / pawprint.pyc 的 EffectEngine + EffectLayer + CursorLightLayer
 *
 * Canvas 2D 实现，requestAnimationFrame 驱动。
 * 差异：原版 QWidget 全屏透明覆盖层 → 网页用 <canvas> pointer-events:none。
 * 差异：原版 winapi.pin_above_wallpaper → 网页无法钉在壁纸层，用 z-index 最低层模拟。
 * 差异：原版 _link_ok 门控 PawLiveWall 在线才渲染；网页默认 _link_active=false，
 *       需 app.js 调 set_link_active(true) 或 force_link(true) 才能看到特效。
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  var FX = (Core && Core.DATA && Core.DATA.fx) || {};
  var FPS_INTERVALS = FX.FPS_INTERVALS || { '15': 66, '24': 42, '30': 33, '60': 16 };
  var MAX_PARTICLES = FX.MAX_PARTICLES || 180;
  var PETAL_WOBBLE = FX.PETAL_WOBBLE || 1;
  var K_DOT = FX.K_DOT || 'dot';
  var K_PETAL = FX.K_PETAL || 'petal';
  var K_LEAF = FX.K_LEAF || 'leaf';
  var K_NOTE = FX.K_NOTE || 'note';

  var rnd = Core.rnd, rndInt = Core.rndInt, choice = Core.choice, clamp = Core.clamp, hypot = Core.hypot;

  /* ---- 工具 ---- */
  function _now() { return Date.now() / 1000; }
  function _hexRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ---- 64×64 离屏径向渐变球缓存 ---- */
  var _ballCache = {};
  function _ball(color) {
    if (_ballCache[color]) return _ballCache[color];
    var c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    var ctx = c.getContext('2d');
    var rgb = _hexRgb(color);
    var g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',1)');
    g.addColorStop(0.35, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.667)');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    _ballCache[color] = c;
    return c;
  }

  /* ============================================================================
   * CursorLightLayer — 鼠标径向光晕（fx.md §1.4）
   * 差异：原版 Z-order 钉在壁纸之上；网页用最低 z-index 的 canvas 模拟。
   * ========================================================================== */
  function CursorLightLayer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.RADIUS = 190;
    this._glow = this._renderGlow('#ffdf9e', this.RADIUS * 2);
    this._pos = null;
    this._enabled = false;
    this._raf = null;
    this._self = this;
    this._onMove = null;
  }

  CursorLightLayer.prototype._renderGlow = function (color, size) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    var rgb = _hexRgb(color);
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.92)');
    g.addColorStop(0.35, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.51)');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return c;
  };

  CursorLightLayer.prototype.set_enabled = function (on) {
    this._enabled = !!on;
    if (on) {
      this._pos = null;
      this._resize();
      var self = this;
      if (!this._onMove) {
        this._onMove = function (e) {
          if (!self._enabled) return;
          self._pos = { x: e.clientX, y: e.clientY };
        };
      }
      document.addEventListener('mousemove', this._onMove);
      this._loop();
    } else {
      if (this._onMove) document.removeEventListener('mousemove', this._onMove);
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };

  CursorLightLayer.prototype._resize = function () {
    this.canvas.width = global.innerWidth;
    this.canvas.height = global.innerHeight;
  };

  CursorLightLayer.prototype._loop = function () {
    if (!this._enabled) return;
    var self = this;
    this._raf = requestAnimationFrame(function () { self._draw(); self._loop(); });
  };

  CursorLightLayer.prototype._draw = function () {
    if (!this._pos) return;
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34;
    var r = this.RADIUS;
    ctx.drawImage(this._glow, this._pos.x - r, this._pos.y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  CursorLightLayer.prototype.dispose = function () {
    this.set_enabled(false);
    this._glow = null;
  };

  /* ============================================================================
   * EffectEngine — 11 种特效（fx.md §1.5）
   * ========================================================================== */
  function EffectEngine(a, b) {
    var canvas, cfg;
    /* 参数顺序容错 */
    if (a && a.getContext) { canvas = a; cfg = b || {}; }
    else if (b && b.getContext) { canvas = b; cfg = a || {}; }
    else { canvas = a; cfg = b || {}; }

    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.cfg = cfg;

    this.pet = null;
    this._anchors = [];
    this._parts = [];
    this._rings = [];
    this._env = [];
    this._flies = [];
    this._bfly = [];
    this._env_ready = false;
    this._env_g = null;
    this._hist = [];
    this._histMax = 26;
    this._trail_until = 0;
    this._trail_energy = 0;
    this._music_until = 0;
    this._music_beat_at = 0;
    this._paused = false;
    this._enabled = true;
    this._link_active = false;
    this._mx = -1; this._my = -1;
    this._pmx = -1; this._pmy = -1;
    this._lb_prev = false;
    this._ball_cache = _ballCache;
    this._t0 = _now();
    this._last_t = _now();
    this._running = false;
    this._raf = null;
    this._miss = 0;
    this._interval = 33;
    this._lastFrame = 0;
    this._dirty = null;
    this._cursorLight = null;

    this._bindEvents();
    this._sync_running();
  }

  /* ---- 事件绑定 ---- */
  EffectEngine.prototype._bindEvents = function () {
    var self = this;
    this._onMouseMove = function (e) {
      self._pmx = self._mx; self._pmy = self._my;
      self._mx = e.clientX; self._my = e.clientY;
    };
    this._onMouseDown = function () { self._lb_prev_state = true; };
    this._onMouseUp = function () { self._lb_prev_state = false; };
    this._lb_prev_state = false;
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mouseup', this._onMouseUp);
    }
  };

  /* ---- 配置 / 状态 ---- */
  EffectEngine.prototype.set_config = function (cfg) { this.cfg = cfg || {}; };
  EffectEngine.prototype.apply_config = function (cfg) { if (cfg) this.cfg = cfg; this._sync_running(); };
  EffectEngine.prototype.set_enabled = function (on) { this._enabled = !!on; this._sync_running(); };
  EffectEngine.prototype.setEnabled = function (on) { this.set_enabled(on); };
  EffectEngine.prototype.set_fullscreen = function (fs) { this._paused = !!fs; this._sync_running(); };
  EffectEngine.prototype.set_link_active = function (on) {
    this._link_active = !!on;
    this._parts = []; this._rings = []; this._env = []; this._flies = []; this._bfly = [];
    this._env_ready = false;
    this._sync_running();
  };
  /* 差异：网页无法自动检测 PawLiveWall，提供 force_link 便于调试/演示 */
  EffectEngine.prototype.force_link = function (on) { this.set_link_active(on); };

  EffectEngine.prototype._link_ok = function () { return this._link_active; };

  EffectEngine.prototype._on = function (key) {
    var cfg = this.cfg || {};
    return !!cfg.fx_enabled && this._link_ok() && !!cfg[key];
  };

  EffectEngine.prototype.any_effect_on = function () {
    var cfg = this.cfg || {};
    if (!cfg.fx_enabled) return false;
    if (!this._link_ok()) return false;
    var keys = ['fx_halo', 'fx_step', 'fx_mouse_trail', 'fx_click_burst', 'fx_shadow',
                'fx_petals', 'fx_leaves', 'fx_fireflies', 'fx_butterfly', 'fx_trail', 'fx_music'];
    for (var i = 0; i < keys.length; i++) {
      if (cfg[keys[i]]) return true;
    }
    return false;
  };

  /* ---- Pet 锚点 ---- */
  EffectEngine.prototype.attach_pet = function (pet) { this.pet = pet; };
  EffectEngine.prototype.set_pet_anchor = function (list) {
    this._anchors = list || [];
    if (this._anchors.length && !this.pet) {
      var a = this._anchors[0];
      this.pet = {
        _anchor: a,
        isVisible: function () { return true; },
        x: function () { return a.x; },
        y: function () { return a.y; },
        width: function () { return a.w; },
        height: function () { return a.h; },
        state: { mood: a.mood || 80, picked: false }
      };
    }
  };

  /* ---- _dog_anchor：返回 [cx, cy, by, size, visible, picked] ---- */
  EffectEngine.prototype._dog_anchor = function () {
    var pet = this.pet;
    if (!pet) {
      if (this._anchors && this._anchors.length) {
        var a = this._anchors[0];
        var cx = a.x + (a.w || 0) * 0.5;
        var cy = a.y + (a.h || 0) * 0.5;
        var by = a.y + (a.h || 0);
        var sz = Math.max(a.w || 0, a.h || 0);
        return [cx, cy, by, sz, true, false];
      }
      return null;
    }
    if (typeof pet.isVisible === 'function' && !pet.isVisible()) return null;
    if (typeof pet.is_visible === 'function' && !pet.is_visible()) return null;
    var w = typeof pet.width === 'function' ? pet.width() : (pet.w || 100);
    var h = typeof pet.height === 'function' ? pet.height() : (pet.h || 100);
    var px = typeof pet.x === 'function' ? pet.x() : (pet.x || 0);
    var py = typeof pet.y === 'function' ? pet.y() : (pet.y || 0);
    var cx2 = px + w * 0.5;
    var cy2 = py + h * 0.5;
    var by2 = py + h;
    var size = Math.max(w, h);
    var picked = false;
    if (pet.state && pet.state.picked) picked = true;
    return [cx2, cy2, by2, size, true, picked];
  };

  EffectEngine.prototype._burst_anchor = function () {
    var dog = this._dog_anchor();
    if (dog) return [dog[0], dog[1]];
    if (this._mx >= 0) return [this._mx, this._my];
    return [600, 400];
  };

  EffectEngine.prototype._theme = function () {
    return (this.cfg && this.cfg.theme_color) || '#ff96bb';
  };

  /* ---- 粒子裁剪 ---- */
  EffectEngine.prototype._trim_particles = function () {
    if (this._parts.length > MAX_PARTICLES) {
      this._parts.splice(0, this._parts.length - MAX_PARTICLES);
    }
  };

  /* ---- _kick：确保运行 ---- */
  EffectEngine.prototype._kick = function () {
    if (this._enabled && !this._paused && this._link_ok()) {
      this.start();
    }
  };

  EffectEngine.prototype._sync_running = function () {
    if (this._enabled && !this._paused && this._link_ok() && this.any_effect_on()) {
      this.start();
    } else {
      this.stop();
    }
  };

  /* ---- interval / start / stop ---- */
  EffectEngine.prototype.set_interval = function (ms) {
    this._interval = clamp(Math.floor(ms), 16, 100);
  };

  EffectEngine.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._last_t = _now();
    this._lastFrame = 0;
    this._miss = 0;
    if (this.canvas) {
      this.canvas.width = global.innerWidth;
      this.canvas.height = global.innerHeight;
    }
    this._loop();
  };

  EffectEngine.prototype.stop = function () {
    this._running = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
  };

  EffectEngine.prototype._loop = function () {
    if (!this._running) return;
    var self = this;
    this._raf = requestAnimationFrame(function () {
      var now = performance.now();
      if (now - self._lastFrame >= self._interval) {
        self._lastFrame = now;
        var dirty = self.frame();
        if (dirty) {
          self._miss = 0;
          self._paint();
        } else {
          self._miss++;
          if (self._miss >= 4) {
            self.stop();
            return;
          }
        }
      }
      self._loop();
    });
  };

  /* ---- feed_step(x, y, angle) — fx.md §1.5.13 校正版 ---- */
  EffectEngine.prototype.feed_step = function (x, y, angle) {
    if (!this._on('fx_step')) return;
    var theme = this._theme();
    var colors = [theme, '#ffffff', '#ffd9e8'];
    var n = rndInt(3, 5);
    var now = _now();
    for (var i = 0; i < n; i++) {
      var ang = angle + rnd(-1.2, 1.2);
      var spd = rnd(18, 55);
      var kind = Math.random() < 0.72 ? K_DOT : K_PETAL;
      this._parts.push({
        kind: kind,
        x: x + rnd(-6, 6),
        y: y + rnd(-4, 2),
        vx: Math.cos(ang) * spd * 0.4,
        vy: -Math.abs(Math.sin(ang)) * spd - rnd(10, 40),
        born: now,
        life: rnd(0.6, 1.0),
        size: rnd(3.0, 6.5),
        color: choice(colors),
        spin: rnd(-180, 180),
        grav: 60.0
      });
    }
    this._trim_particles();
    this._kick();
  };

  /* ---- feed_music() — 进入 8 秒节奏期 ---- */
  EffectEngine.prototype.feed_music = function () {
    if (!this._on('fx_music')) return;
    var now = _now();
    this._music_until = now + 8.0;
    this._music_beat_at = 0;
    this._kick();
  };

  /* ---- set_music(on) — 外部调用接口 ---- */
  EffectEngine.prototype.set_music = function (on) {
    if (on) this.feed_music();
  };

  /* ---- play_link_burst() — 金色双环 + 26 粒子 ---- */
  EffectEngine.prototype.play_link_burst = function () {
    var now = _now();
    var anc = this._burst_anchor();
    var cx = anc[0], cy = anc[1];
    this._rings.push([cx, cy, now, 1.2, 190.0, '#ffd76a']);
    this._rings.push([cx, cy, now + 0.18, 1.0, 130.0, '#ff96bb']);
    for (var i = 0; i < 26; i++) {
      var ang = (i / 26.0) * 6.283 + rnd(-0.1, 0.1);
      var spd = rnd(130, 280);
      this._parts.push({
        kind: K_DOT, x: cx, y: cy,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        born: now, life: rnd(0.9, 1.6),
        size: rnd(3.0, 6.5),
        color: choice(['#ffd76a', '#ff96bb', '#ffffff', '#9fd8ff']),
        spin: 0.0, grav: 30.0
      });
    }
    this._trim_particles();
    this._kick();
  };

  /* ---- play_unlink_fade() — 蓝色环 + 柔和上浮 ---- */
  EffectEngine.prototype.play_unlink_fade = function () {
    var now = _now();
    var anc = this._burst_anchor();
    var cx = anc[0], cy = anc[1];
    this._rings.push([cx, cy, now, 1.0, 110.0, '#8fb8ff']);
    for (var i = 0; i < 14; i++) {
      var ang = rnd(0, 6.283);
      this._parts.push({
        kind: K_DOT,
        x: cx + Math.cos(ang) * 28, y: cy + Math.sin(ang) * 28,
        vx: Math.cos(ang) * 45, vy: Math.sin(ang) * 45,
        born: now, life: rnd(0.8, 1.2),
        size: rnd(2.5, 4.5),
        color: '#8fb8ff', spin: 0.0, grav: -10.0
      });
    }
    this._trim_particles();
    this._kick();
  };

  /* ---- burst(x,y) / _spawn_burst(x,y,color) — 点击爆炸 ---- */
  EffectEngine.prototype.burst = function (x, y) {
    this._spawn_burst(x, y, this._theme());
  };

  EffectEngine.prototype._spawn_burst = function (x, y, color) {
    var now = _now();
    for (var i = 0; i < 14; i++) {
      var ang = (i / 14.0) * 6.283 + rnd(-0.15, 0.15);
      var spd = rnd(90, 210);
      this._parts.push({
        kind: K_DOT, x: x, y: y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        born: now, life: rnd(0.45, 0.8),
        size: rnd(2.5, 5.5),
        color: (i % 3 !== 0) ? color : '#ffffff',
        spin: 0.0, grav: 120.0
      });
    }
    this._rings.push([x, y, now, 0.5, 66.0, color]);
    this._trim_particles();
    this._kick();
  };

  /* ---- notify() — 外部通知（触发一次 burst 在锚点） ---- */
  EffectEngine.prototype.notify = function () {
    var anc = this._burst_anchor();
    this._spawn_burst(anc[0], anc[1], this._theme());
  };

  /* ---- _ensure_env() — 初始化环境粒子 ---- */
  EffectEngine.prototype._ensure_env = function () {
    if (this._env_ready) return;
    this._env_ready = true;
    var w = global.innerWidth, h = global.innerHeight;
    this._env_g = [0, 0, w, h];
    var now = _now();

    var wantPetals = this._on('fx_petals') ? 34 : 0;
    var wantLeaves = this._on('fx_leaves') ? 24 : 0;

    var petals = [], leaves = [];
    for (var i = 0; i < this._env.length; i++) {
      if (this._env[i].kind === 'petal') petals.push(this._env[i]);
      else if (this._env[i].kind === 'leaf') leaves.push(this._env[i]);
    }
    while (petals.length < wantPetals) petals.push(this._new_env('petal', now, true));
    while (leaves.length < wantLeaves) leaves.push(this._new_env('leaf', now, true));
    this._env = petals.concat(leaves);

    if (this._on('fx_fireflies') && !this._flies.length) {
      for (var j = 0; j < 16; j++) {
        this._flies.push({
          x: rnd(0, w), y: rnd(40, h - 60),
          vx: rnd(-14, 14), vy: rnd(-10, 10),
          phase: rnd(0, 6.28)
        });
      }
    }
    if (this._on('fx_butterfly') && !this._bfly.length) {
      var cols = ['#f7a8c4', '#ffd479', '#9fd8ff'];
      for (var k = 0; k < 2; k++) {
        this._bfly.push({
          x: rnd(60, w - 60), y: rnd(60, h - 120),
          color: cols[k % cols.length],
          phase: rnd(0, 6.28), orbit: 0
        });
      }
    }
  };

  EffectEngine.prototype._new_env = function (kind, now, randomY) {
    var g = this._env_g || [0, 0, global.innerWidth, global.innerHeight];
    var lx = g[0], ly = g[1], lw = g[2], lh = g[3];
    var x = rnd(lx, lx + lw);
    var y = randomY ? rnd(ly, ly + lh) : (ly - rnd(10, 120));
    var vx = rnd(-8, 8);
    var vy, size, spin, color;
    if (kind === 'petal') {
      vy = rnd(10, 20); size = rnd(4.5, 8.0); spin = rnd(-40, 40); color = '#f8b8d0';
    } else {
      vy = rnd(16, 30); size = rnd(5.0, 9.0); spin = rnd(-90, 90);
      color = choice(['#d8a45e', '#c98f4a', '#b7793a']);
    }
    return {
      kind: kind, x: x, y: y, vx: vx, vy: vy,
      size: size, rot: rnd(0, 360), spin: spin,
      phase: rnd(0, 6.28), color: color
    };
  };

  /* ---- frame() — 主帧更新（fx.md §1.5.25） ---- */
  EffectEngine.prototype.frame = function () {
    if (this._paused || !this._enabled || !this._link_ok()) return false;
    var now = _now();
    var dt = clamp(now - this._last_t, 0.005, 0.1);
    this._last_t = now;
    var t = now - this._t0;

    var dog = this._dog_anchor();
    var dirty = false;

    /* click burst */
    if (this._on('fx_click_burst')) {
      var pressed = this._lb_prev_state;
      if (pressed && !this._lb_prev) {
        this._spawn_burst(this._mx, this._my, this._theme());
        dirty = true;
      }
      this._lb_prev = pressed;
    }

    /* trail / history */
    if (dog) {
      var cx = dog[0], cy = dog[1];
      if (this._hist.length > 0) {
        var last = this._hist[this._hist.length - 1];
        var speed = hypot(cx - last[0], cy - last[1]) / dt;
        if (speed > 200) {
          this._trail_energy = Math.min(1.0, this._trail_energy + dt * 5.0);
        } else {
          this._trail_energy = Math.max(0, this._trail_energy - dt * 2.2);
        }
      }
      this._hist.push([cx, cy]);
      if (this._hist.length > this._histMax) this._hist.shift();

      if (this._on('fx_trail') && this._trail_energy > 0.02) {
        dirty = true;
      } else {
        this._trail_energy = Math.max(0, this._trail_energy - dt * 3.0);
      }
    }

    /* particle physics */
    if (this._parts.length) {
      for (var i = this._parts.length - 1; i >= 0; i--) {
        var pt = this._parts[i];
        pt.vy += (pt.grav || 0) * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.rot = (pt.rot || 0) + (pt.spin || 0) * dt;
        if (now - pt.born >= pt.life) {
          this._parts.splice(i, 1);
        }
      }
      dirty = true;
    }

    /* rings */
    if (this._rings.length) {
      for (var r = this._rings.length - 1; r >= 0; r--) {
        if (now - this._rings[r][2] >= this._rings[r][3]) {
          this._rings.splice(r, 1);
        }
      }
      dirty = true;
    }

    /* music beat */
    if (this._on('fx_music') && now < this._music_until) {
      if (now - this._music_beat_at >= 0.45) {
        this._music_beat_at = now;
        if (dog) {
          var dcx = dog[0], dcy = dog[1];
          var mn = rndInt(2, 5);
          for (var m = 0; m < mn; m++) {
            var mang = rnd(0, 6.283);
            var mspd = rnd(40, 100);
            this._parts.push({
              kind: Math.random() < 0.6 ? K_DOT : K_NOTE,
              x: dcx + rnd(-20, 20), y: dcy + rnd(-10, 10),
              vx: Math.cos(mang) * mspd, vy: Math.sin(mang) * mspd - 40,
              born: now, life: rnd(0.8, 1.5),
              size: rnd(4, 10),
              color: choice([this._theme(), '#ffd479', '#9fd8ff']),
              spin: rnd(-18, 18), grav: -18.0
            });
          }
          this._trim_particles();
        }
      }
      dirty = true;
    }

    /* environment */
    this._ensure_env();

    if (this._env.length && (this._on('fx_petals') || this._on('fx_leaves'))) {
      for (var ei = 0; ei < this._env.length; ei++) {
        var e = this._env[ei];
        if (PETAL_WOBBLE && e.kind === 'petal') {
          e.vx += Math.sin(t * 1.1 + e.phase) * 0.5 * dt * 40;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.rot += e.spin * dt;
        e.vx *= 0.985;
        var eg = this._env_g || [0, 0, global.innerWidth, global.innerHeight];
        if (e.y > eg[1] + eg[3] + 50) {
          e.y = eg[1] - rnd(10, 40);
          e.x = rnd(eg[0], eg[0] + eg[2]);
        }
      }
      dirty = true;
    }

    /* fireflies */
    if (this._on('fx_fireflies')) {
      for (var fi = 0; fi < this._flies.length; fi++) {
        var f = this._flies[fi];
        if (dog) {
          var ftx = dog[0], fty = dog[1] - dog[3] * 0.18;
          var fdd = hypot(ftx - f.x, fty - f.y);
          if (fdd > 90) {
            f.vx += (ftx - f.x) / fdd * 46 * dt;
            f.vy += (fty - f.y) / fdd * 46 * dt;
          } else {
            f.vx += Math.cos(now * 1.4 + f.phase) * 40 * dt;
            f.vy += Math.sin(now * 1.8 + f.phase) * 40 * dt;
          }
        } else {
          f.vx += Math.cos(now * 1.4 + f.phase) * 40 * dt;
          f.vy += Math.sin(now * 1.8 + f.phase) * 40 * dt;
        }
        var fspd = hypot(f.vx, f.vy);
        if (fspd > 70) { f.vx *= 70 / fspd; f.vy *= 70 / fspd; }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
      }
      dirty = true;
    }

    /* butterflies */
    if (this._on('fx_butterfly')) {
      for (var bi = 0; bi < this._bfly.length; bi++) {
        var b = this._bfly[bi];
        if (dog) {
          var btx = dog[0], bty = dog[1] - dog[3] * 0.18;
          var bdd = hypot(btx - b.x, bty - b.y);
          if (bdd > 64) {
            var bsp = 66;
            b.x += (btx - b.x) / bdd * bsp * dt;
            b.y += (bty - b.y) / bdd * bsp * dt + Math.sin(now * 6 + b.phase) * 46 * dt;
            b.orbit = 0;
          } else {
            b.orbit += dt * 2.2;
            var box = dog[0] + Math.cos(b.orbit) * 74;
            var boy = dog[1] - dog[3] * 0.18 + Math.sin(b.orbit) * 34;
            var bsm = Math.min(dt * 3.4, 1);
            b.x += (box - b.x) * bsm;
            b.y += (boy - b.y) * bsm;
          }
        } else {
          b.x += Math.cos(now * 0.7 + b.phase) * 22 * dt;
          b.y += Math.sin(now * 1.1 + b.phase) * 26 * dt;
        }
      }
      dirty = true;
    }

    /* halo / shadow mark dirty */
    if (dog && (this._on('fx_halo') || this._on('fx_shadow'))) {
      dirty = true;
    }

    return dirty;
  };

  /* ---- _paint() — 渲染所有特效 ---- */
  EffectEngine.prototype._paint = function () {
    if (!this.ctx || !this.canvas) return;
    var ctx = this.ctx;
    var now = _now();
    var t = now - this._t0;
    var dog = this._dog_anchor();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    /* shadow */
    if (dog && this._on('fx_shadow')) {
      var scx = dog[0], sby = dog[2], ssize = dog[3], spicked = dog[5];
      var sw = ssize * (spicked ? 0.3 : 0.42);
      var sh = ssize * (spicked ? 0.055 : 0.1);
      var sa = spicked ? 0.32 : 0.5;
      ctx.save();
      ctx.globalAlpha = sa;
      var ballShadow = _ball('#20242c');
      ctx.drawImage(ballShadow, scx - sw, sby - sh * 0.5, sw * 2, sh * 2);
      ctx.restore();
    }

    /* halo */
    if (dog && this._on('fx_halo')) {
      var hcx = dog[0], hcy = dog[1], hsize = dog[3], hpicked = dog[5];
      var mood = parseFloat((this.cfg && this.cfg.mood) || 80);
      var breathe = 1.0 + 0.05 * Math.sin(t * 2.1);
      if (now < this._music_until) {
        breathe += 0.1 * Math.sin(t * 6.283 * 1.25);
      }
      var hr = hsize * (0.62 + mood / 100.0 * 0.38) * breathe;
      ctx.save();
      ctx.globalAlpha = hpicked ? 0.16 : 0.1;
      var ballHalo = _ball(this._theme());
      ctx.drawImage(ballHalo, hcx - hr, hcy - hr, hr * 2, hr * 2);
      ctx.restore();
    }

    /* energy trail */
    if (dog && this._on('fx_trail') && this._trail_energy > 0.02) {
      var pts = this._hist;
      var pn = pts.length;
      if (pn >= 3) {
        ctx.save();
        var themeRgb = _hexRgb(this._theme());
        var strength = this._trail_energy;
        for (var ti = 1; ti < pn; ti++) {
          var tk = ti / pn;
          var ta = Math.max(1.5, 120 * tk * strength) / 255;
          ctx.strokeStyle = 'rgba(' + themeRgb[0] + ',' + themeRgb[1] + ',' + themeRgb[2] + ',' + ta + ')';
          ctx.lineWidth = Math.max(1.0, dog[3] * 0.12 * tk * strength);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pts[ti - 1][0], pts[ti - 1][1]);
          ctx.lineTo(pts[ti][0], pts[ti][1]);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* environment particles (petals, leaves) */
    if (this._env.length) {
      for (var ei2 = 0; ei2 < this._env.length; ei2++) {
        var ev = this._env[ei2];
        ctx.save();
        ctx.translate(ev.x, ev.y);
        ctx.rotate(ev.rot * Math.PI / 180);
        ctx.fillStyle = ev.color;
        ctx.beginPath();
        if (ev.kind === 'petal') {
          ctx.ellipse(0, 0, ev.size * 0.5, ev.size * 0.3, 0, 0, Math.PI * 2);
        } else {
          ctx.ellipse(0, 0, ev.size * 0.3, ev.size * 0.5, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }
    }

    /* fireflies */
    if (this._flies.length) {
      for (var fi2 = 0; fi2 < this._flies.length; fi2++) {
        var ff = this._flies[fi2];
        var glow = 0.5 + 0.5 * Math.sin(now * 3.0 + ff.phase);
        var fr = 3 + glow * 4;
        var ballFly = _ball('#d9f07e');
        ctx.drawImage(ballFly, ff.x - fr, ff.y - fr, fr * 2, fr * 2);
      }
    }

    /* butterflies */
    if (this._bfly.length) {
      for (var bi2 = 0; bi2 < this._bfly.length; bi2++) {
        var bf = this._bfly[bi2];
        var flap = Math.abs(Math.sin(now * 11 + bf.phase));
        ctx.save();
        ctx.translate(bf.x, bf.y);
        ctx.globalAlpha = 0.9;
        var bcol = bf.color;
        ctx.fillStyle = bcol;
        var wing = 7.5;
        var ww = wing * (0.35 + 0.65 * flap);
        ctx.beginPath();
        ctx.ellipse(-ww * 0.5, -3, ww * 0.5, 3.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(ww * 0.5, -3, ww * 0.5, 3.25, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(70,60,55,0.86)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.1, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    /* rings */
    for (var ri = 0; ri < this._rings.length; ri++) {
      var rng = this._rings[ri];
      var rk = (now - rng[2]) / rng[3];
      if (rk < 0) continue;
      var rAlpha = clamp(0.55 * (1.0 - rk), 0, 1);
      var rWidth = Math.max(1.0, 2.5 * (1 - rk));
      var rRad = rng[4] * (0.25 + 0.75 * rk);
      var rRgb = _hexRgb(rng[5]);
      ctx.save();
      ctx.globalAlpha = rAlpha;
      ctx.strokeStyle = 'rgb(' + rRgb[0] + ',' + rRgb[1] + ',' + rRgb[2] + ')';
      ctx.lineWidth = rWidth;
      ctx.beginPath();
      ctx.arc(rng[0], rng[1], rRad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    /* particles */
    for (var pi = 0; pi < this._parts.length; pi++) {
      var pp = this._parts[pi];
      var age = (now - pp.born) / pp.life;
      if (age >= 1) continue;
      ctx.save();
      ctx.globalAlpha = clamp((1.0 - age) * 0.9, 0, 1);

      if (pp.kind === K_DOT) {
        var pr = pp.size * (1.0 - 0.35 * age);
        var ballP = _ball(pp.color);
        ctx.drawImage(ballP, pp.x - pr, pp.y - pr, pr * 2, pr * 2);
      } else if (pp.kind === K_PETAL) {
        ctx.translate(pp.x, pp.y);
        ctx.rotate((pp.rot || 0) * Math.PI / 180);
        ctx.fillStyle = pp.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, pp.size * 0.5, pp.size * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (pp.kind === K_NOTE) {
        ctx.fillStyle = pp.color;
        ctx.font = 'bold ' + Math.floor(pp.size * 2) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u266A', pp.x, pp.y);
      }
      ctx.restore();
    }
  };

  /* ---- cursor light ---- */
  EffectEngine.prototype.set_cursor_light = function (on) {
    if (on && !this._cursorLight) {
      var clCanvas = document.createElement('canvas');
      clCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
      document.body.appendChild(clCanvas);
      this._cursorLight = new CursorLightLayer(clCanvas);
    }
    if (this._cursorLight) {
      this._cursorLight.set_enabled(!!on);
    }
  };

  /* ---- dispose ---- */
  EffectEngine.prototype.dispose = function () {
    this.stop();
    if (this._cursorLight) { this._cursorLight.dispose(); this._cursorLight = null; }
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('mousedown', this._onMouseDown);
      document.removeEventListener('mouseup', this._onMouseUp);
    }
    this._parts = []; this._rings = []; this._env = []; this._flies = []; this._bfly = [];
  };

  /* ---- 导出 ---- */
  global.EffectEngine = EffectEngine;
  global.CursorLightLayer = CursorLightLayer;
})(window);
