/* =============================================================================
 * pet.js — LineDogPet Web port
 * 对应 smartpet/pet.py（PetWidget + BubbleLabel）
 *
 * 暴露：window.BubbleLabel, window.Pet
 *
 * 差异标注：
 *   - QMovie → Movie（assets.js 已实现）
 *   - frameChanged → Movie.onFrame 回调
 *   - setScaledSize + devicePixelRatio 超采样 → background-size 逐帧定位
 *     （整表按 gutter 步距缩放 + 当前帧矩形偏移，见 _applyFrame）
 *   - QCursor.pos() → document 级 pointermove 追踪
 *   - FramelessWindowHint → 透明 div，pointer-events 控制
 *   - RegisterHotKey → 无（由 app.js 处理）
 *   - winapi.double_click_ms() → 固定 500ms（TAP_CANCEL_MS）
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- 数据表（全部从 SMARTPET_DATA.pet 取） ---- */
  var PD = (global.Core && global.Core.DATA && global.Core.DATA.pet) || {};

  /* 22 个状态常量 */
  var IDLE      = PD.IDLE      || 'idle';
  var WALK      = PD.WALK      || 'walk';
  var FLEE      = PD.FLEE      || 'flee';
  var HAPPY     = PD.HAPPY     || 'happy';
  var PET       = PD.PET       || 'pet';
  var CHIN      = PD.CHIN      || 'chin';
  var PICKED    = PD.PICKED    || 'picked';
  var SPIN      = PD.SPIN      || 'spin';
  var HOP       = PD.HOP       || 'hop';
  var SLEEP     = PD.SLEEP     || 'sleep';
  var DEEP      = PD.DEEP      || 'deep';
  var GO_SLEEP  = PD.GO_SLEEP  || 'go_sleep';
  var CHASE     = PD.CHASE     || 'chase';
  var HIDE      = PD.HIDE      || 'hide';
  var NERVOUS   = PD.NERVOUS   || 'nervous';
  var WORK      = PD.WORK      || 'work';
  var PEEK      = PD.PEEK      || 'peek';
  var EAT       = PD.EAT       || 'eat';
  var PLAY      = PD.PLAY      || 'play';
  var PAPER     = PD.PAPER     || 'paper';
  var RELAX     = PD.RELAX     || 'relax';
  var GROOM     = PD.GROOM     || 'groom';
  var STARE     = PD.STARE     || 'stare';

  var TEMP_STATES      = PD.TEMP_STATES || {};
  var STATE_GIF        = PD.STATE_GIF || {};
  var RELAXED_STATES   = PD.RELAXED_STATES || [IDLE, STARE, GROOM];
  var SLEEPY_IDLE_KEYS = PD.SLEEPY_IDLE_KEYS || ['groom', 'relax', 'sleep'];
  var TAP_CANCEL_MS    = PD.TAP_CANCEL_MS || 500;

  var HAPPY_WORDS    = PD.HAPPY_WORDS || [];
  var CALL_WORDS_DOG = PD.CALL_WORDS_DOG || [];
  var SPIN_WORDS     = PD.SPIN_WORDS || [];
  var CHASE_WORDS    = PD.CHASE_WORDS || [];
  var FIND_WORDS     = PD.FIND_WORDS || [];
  var SLEEP_WORDS    = PD.SLEEP_WORDS || [];
  var EAT_WORDS      = PD.EAT_WORDS || [];
  var PLAY_WORDS     = PD.PLAY_WORDS || [];

  var IDLE_ACTION_POOLS = PD.IDLE_ACTION_POOLS || {};
  var NIGHT_ACTION_POOL = PD.NIGHT_ACTION_POOL || [];

  var TAP_SQUASH_FRAMES  = PD.TAP_SQUASH_FRAMES || PD.TAP_SQUASH || [];
  var HOP_SQUASH_FRAMES  = PD.HOP_SQUASH_FRAMES || PD.HOP_SQUASH || [];
  var CHIN_SQUASH_FRAMES = PD.CHIN_SQUASH_FRAMES || PD.CHIN_SQUASH || [];

  var FPS_PRESETS = global.Core.FPS_PRESETS || { smooth: 100, balanced: 80, normal: 60, saver: 45 };

  /* ---- 工具 ---- */
  var Core = global.Core;
  var rnd = Core.rnd, rndInt = Core.rndInt, choice = Core.choice;
  var hypot = Core.hypot, clamp = Core.clamp;

  function nowSec() { return Date.now() / 1000; }

  /* weighted choices（random.choices 等价） */
  function weightedChoice(items, weights) {
    var total = 0, i;
    for (i = 0; i < weights.length; i++) total += weights[i];
    var r = Math.random() * total, acc = 0;
    for (i = 0; i < items.length; i++) {
      acc += weights[i];
      if (r <= acc) return items[i];
    }
    return items[items.length - 1];
  }

  /* RELAXED_STATES 用 array indexOf */
  function inRelaxed(st) {
    for (var i = 0; i < RELAXED_STATES.length; i++) if (RELAXED_STATES[i] === st) return true;
    return false;
  }

  /* ==========================================================================
   * BubbleLabel — 圆角气泡
   * ========================================================================== */
  function BubbleLabel(container) {
    var el = document.createElement('div');
    el.className = 'pet-bubble';
    el.style.cssText = 'position:absolute;pointer-events:none;display:none;' +
      'background:rgba(255,255,255,0.96);border:1px solid #d9b88a;border-radius:10px;' +
      'padding:6px 10px;font:9pt "Microsoft YaHei","SimHei",sans-serif;color:#222;' +
      'max-width:260px;word-wrap:break-word;z-index:100000;line-height:1.4;' +
      'box-sizing:border-box;white-space:normal;';
    (container || document.body).appendChild(el);
    this.el = el;
    this._timer = null;
  }

  BubbleLabel.prototype.set_text_color = function (c) {
    this.el.style.color = c || '#222';
  };

  BubbleLabel.prototype.setText = function (t) {
    this.el.textContent = t;
  };

  BubbleLabel.prototype.show = function () { this.el.style.display = 'block'; };
  BubbleLabel.prototype.hide = function () { this.el.style.display = 'none'; };
  BubbleLabel.prototype.isVisible = function () { return this.el.style.display !== 'none'; };

  BubbleLabel.prototype.move = function (x, y) {
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  };

  BubbleLabel.prototype.dispose = function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  global.BubbleLabel = BubbleLabel;

  /* ==========================================================================
   * Pet — PetWidget 等价
   * ========================================================================== */
  function Pet(assets, cfg, opts) {
    opts = opts || {};

    this.assets = assets;
    this.cfg = cfg;
    this._extra_scale = opts.extra_scale || 1.0;
    this._is_extra = !!opts.is_extra;

    /* ---- 状态机 ---- */
    this.state = IDLE;
    this.base_mode = 'idle';
    this.state_until = 0;
    this.roam_target = null;
    this.arrive_action = 'base';
    this._relocate_speed = 3.2;
    this._fetch_done = null;
    this.chase_until = 0;
    this.hide_until = 0;
    this.next_pace_at = 0;
    this.sleeping = false;
    this.night = false;
    this._deep_on_arrive = false;

    /* ---- 动画 ---- */
    this.movie = null;
    this._last_path = '';
    this._cpu_factor = 1.0;
    this._walk_visual = false;
    this._src_w = 0;
    this._src_h = 0;

    /* ---- 位置/尺寸 ---- */
    this._x = 0;
    this._y = 0;
    this._w = 0;
    this._h = 0;
    this._visible = true;
    this._opacity = 1.0;

    /* ---- Corner / lock ---- */
    this._corner = false;
    this._corner_saved = null;
    this.locked = false;

    /* ---- 鼠标交互 ---- */
    this._press_global = null;
    this._press_t = 0;
    this._press_offset = { x: 0, y: 0 };
    this._moved = false;
    this._picked = false;
    this._dbl_seen = false;
    this._gesture = [];
    this._spun = false;

    /* ---- 光标追踪 ---- */
    this._cursor_x = 0;
    this._cursor_y = 0;
    this._cursor_track = [];
    this._cursor_still_since = nowSec();
    this.last_follow_at = 0;

    /* ---- Squash ---- */
    this._squash_frames = [];
    this._squash_timer = null;
    this._squash_start = 0;
    this._squash_duration = 0;
    this._squash_ground = null;
    this._squash_base_w = 0;
    this._squash_base_h = 0;

    /* ---- Bounce ---- */
    this._bounce_timer = null;
    this._bounce_seq = [];
    this._bounce_base_y = 0;

    /* ---- Idle flicker ---- */
    this._next_idle_flicker = nowSec() + rnd(5, 12);
    this._last_idle_action = null;

    /* ---- Tap timer ---- */
    this._tap_timer = null;

    /* ---- Bubble ---- */
    this._bubble_timer = null;
    this._bubble_geo = null;

    /* ---- 外部钩子 ---- */
    this._paw_canvas = null;
    this._step_counter = null;
    this._fx = null;
    this._last_paw_pos = null;
    this._paw_accum = 0;
    this._diary_rec = null;

    /* ---- 信号 ---- */
    this.signal_clicked = new Core.Signal();
    this.signal_double_clicked = new Core.Signal();
    this.signal_right_clicked = new Core.Signal();
    this.signal_hold = new Core.Signal();
    this.signal_waved = new Core.Signal();
    this.signal_moved = new Core.Signal();
    this.signal_bubble_shown = new Core.Signal();
    this.open_chat = new Core.Signal();

    /* ---- DOM ---- */
    this._container = null;
    this.el = null;
    this.bubble = null;

    this._init_dom(opts.container);
    this._init_timers();
    this._bind_events();
  }

  /* ---- DOM 初始化 ---- */
  Pet.prototype._init_dom = function (container) {
    var wrap = document.createElement('div');
    wrap.className = 'pet';
    wrap.style.cssText = 'position:absolute;cursor:grab;touch-action:none;' +
      'user-select:none;-webkit-user-select:none;z-index:99999;' +
      'background-repeat:no-repeat;';
    wrap.setAttribute('touch-action', 'none');

    var parent = container || document.body;
    parent.appendChild(wrap);
    parent.style.position = parent.style.position || 'relative';

    this._container = parent;
    this.el = wrap;

    /* bubble */
    this.bubble = new BubbleLabel(parent);

    /* 初始尺寸 */
    var sz = this.cfg.size || 150;
    this._w = sz;
    this._h = sz;
    wrap.style.width = sz + 'px';
    wrap.style.height = sz + 'px';
  };

  /* ---- Timers ---- */
  Pet.prototype._init_timers = function () {
    var self = this;
    this._tick_move_timer = new Core.Timer(50, function () { self._tick_move(); });
    this._tick_behavior_timer = new Core.Timer(1000, function () { self._tick_behavior(); });
    this._paw_tick_timer = new Core.Timer(50, function () { self._tick_paw(); });
  };

  Pet.prototype.start = function () {
    this._tick_move_timer.start();
    this._tick_behavior_timer.start();
    this._paw_tick_timer.start();
  };

  /* ---- 事件绑定（pointer + touch 兼容） ---- */
  Pet.prototype._bind_events = function () {
    var self = this;
    var el = this.el;

    /* pointer down */
    var onDown = function (e) {
      e.preventDefault();
      self._on_pointer_down(e);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        e.preventDefault();
        var t = e.touches[0];
        self._on_pointer_down({ clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: function(){} });
      }
    }, { passive: false });

    /* pointer move (document-level for drag) */
    this._onDocMove = function (e) { self._on_pointer_move(e); };
    this._onDocUp = function (e) { self._on_pointer_up(e); };
    document.addEventListener('pointermove', this._onDocMove);
    document.addEventListener('pointerup', this._onDocUp);
    document.addEventListener('pointercancel', this._onDocUp);

    /* touch move/up */
    this._onTouchMove = function (e) {
      if (e.touches.length === 1) {
        var t = e.touches[0];
        self._on_pointer_move({ clientX: t.clientX, clientY: t.clientY, buttons: 1 });
      }
    };
    this._onTouchEnd = function (e) {
      var t = e.changedTouches ? e.changedTouches[0] : null;
      self._on_pointer_up({ clientX: t ? t.clientX : 0, clientY: t ? t.clientY : 0, button: 0 });
    };
    document.addEventListener('touchmove', this._onTouchMove, { passive: false });
    document.addEventListener('touchend', this._onTouchEnd);

    /* context menu (right click) */
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      self._on_right_click(e);
    });

    /* 中键（滚轮按下）→ 打开对话：等价原版 mousePressEvent MiddleButton
     * 原版：_rec_activity('talk') + self.open_chat.emit()
     * 浏览器里 pointerdown 会先于 auxclick 触发，但 button!==0 已被 _on_pointer_down 忽略，
     * 故在此单独处理 auxclick，并阻止默认的中键自动滚动/粘贴行为。 */
    el.addEventListener('auxclick', function (e) {
      if (e.button !== 1) return;
      e.preventDefault();
      self._rec_activity('talk');
      self.open_chat.emit();
    });
    el.addEventListener('mousedown', function (e) {
      if (e.button === 1) e.preventDefault();   /* 抑制中键自动滚动图标 */
    });

    /* cursor tracking on document */
    this._onDocCursor = function (e) {
      self._cursor_x = e.clientX;
      self._cursor_y = e.clientY;
      var now = nowSec();
      self._cursor_track.push([e.clientX, e.clientY, now]);
      while (self._cursor_track.length && now - self._cursor_track[0][2] > 0.5) {
        self._cursor_track.shift();
      }
      if (self._cursor_track.length >= 2) {
        var first = self._cursor_track[0];
        var d = hypot(e.clientX - first[0], e.clientY - first[1]);
        if (d > 4) self._cursor_still_since = now;
      }
    };
    document.addEventListener('pointermove', this._onDocCursor);
  };

  /* ---- Pointer event handlers ---- */
  Pet.prototype._on_pointer_down = function (e) {
    if (!this.cfg.mouse_interaction && this.cfg.mouse_interaction !== undefined) return;

    if (e.button === 2) return; /* right click handled by contextmenu */
    if (e.button !== 0) return;

    this._stop_squash(true);
    if (this._tap_timer) { clearTimeout(this._tap_timer); this._tap_timer = null; }

    var gx = e.clientX, gy = e.clientY;
    this._press_global = { x: gx, y: gy };
    this._press_t = nowSec();
    this._press_offset = { x: gx - this._x, y: gy - this._y };
    this._moved = false;
    this._picked = false;
    this._spun = false;
    this._gesture = [[gx, gy, nowSec()]];

    this.el.style.cursor = 'grabbing';
  };

  Pet.prototype._on_pointer_move = function (e) {
    if (!this.cfg.mouse_interaction && this.cfg.mouse_interaction !== undefined) return;
    if (this._press_global === null) return;

    var gx = e.clientX, gy = e.clientY;
    var now = nowSec();

    /* first movement check */
    if (!this._moved) {
      var dx0 = gx - this._press_global.x;
      var dy0 = gy - this._press_global.y;
      if (Math.abs(dx0) + Math.abs(dy0) > 8) {
        this._moved = true;

        /* long-press pickup */
        if (!this._picked && !this._spun) {
          if (now - this._press_t > 0.2) {
            this._picked = true;
            this.sleeping = false;
            this.set_state(PICKED);
          }
        }
      }
    }

    /* record gesture */
    if (this._moved || this._picked) {
      this._gesture.push([gx, gy, now]);
    }

    /* prune old gesture points (>0.9s) */
    while (this._gesture.length && now - this._gesture[0][2] > 0.9) {
      this._gesture.shift();
    }

    /* circle detection */
    if (!this._spun && this._moved) {
      this._detect_circle();
    }

    /* drag */
    if (!this._spun && this._moved) {
      var tlx = gx - this._press_offset.x;
      var tly = gy - this._press_offset.y;
      var desk = Core.desk();
      tlx = clamp(tlx, desk.x, desk.x + desk.w - this._w);
      tly = clamp(tly, desk.y, desk.y + desk.h - this._h);
      this.move(tlx, tly);
      if (this.bubble.isVisible()) this._position_bubble();
    }
  };

  Pet.prototype._on_pointer_up = function (e) {
    if (this._press_global === null) return;

    this.el.style.cursor = 'grab';
    var gx = e.clientX, gy = e.clientY;
    var now = nowSec();

    /* recent gesture points (last 180ms) */
    var recent = [];
    for (var i = 0; i < this._gesture.length; i++) {
      if (now - this._gesture[i][2] < 0.18) recent.push(this._gesture[i]);
    }

    /* flick detection */
    var flick = false;
    if (recent.length >= 2 && this._moved) {
      var dt = Math.max(0.01, now - recent[0][2]);
      var disp = hypot(gx - recent[0][0], gy - recent[0][1]);
      if (disp / dt > 1.0 && disp > 48) flick = true;
    }

    var press_start = this._press_global;
    var was_picked = this._picked;
    var total_move = press_start ? (Math.abs(gx - press_start.x) + Math.abs(gy - press_start.y)) : 9999;

    /* reset drag state */
    this._press_global = null;
    this._picked = false;
    this._gesture = [];

    /* double-click already consumed */
    if (this._dbl_seen) {
      this._dbl_seen = false;
      return;
    }

    /* circle spin already consumed */
    if (this._spun) return;

    var self = this;
    if (flick) {
      this.start_chase();
    } else if (was_picked) {
      this._land_bounce();
      this._back_to_base();
    } else if (total_move < 14 && (now - this._press_t) < 0.5) {
      /* short tap → squash + delayed _do_tap */
      this._play_tap_squash();
      this._tap_timer = setTimeout(function () {
        self._tap_timer = null;
        self._do_tap();
      }, TAP_CANCEL_MS);
    }
  };

  Pet.prototype._on_right_click = function (e) {
    if (!this.cfg.mouse_interaction && this.cfg.mouse_interaction !== undefined) return;
    this.sleeping = false;
    this._rec_activity('chin');
    this.set_state(CHIN, 1900);
    this._play_chin_squash();
    this.show_bubble('下巴~好舒服~', 1800);
    this._snd('happy');
    this.signal_right_clicked.emit();
  };

  /* ---- Circle detection (winding number) ---- */
  Pet.prototype._detect_circle = function () {
    var pts = this._gesture;
    if (pts.length < 7) return;

    var duration = pts[pts.length - 1][2] - pts[0][2];
    if (duration < 0.25 || duration > 1.2) return;

    /* centroid */
    var cx = 0, cy = 0, i;
    for (i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
    cx /= pts.length; cy /= pts.length;

    /* radii */
    var minR = Infinity, maxR = -Infinity;
    for (i = 0; i < pts.length; i++) {
      var r = hypot(pts[i][0] - cx, pts[i][1] - cy);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    if (minR < 6 || maxR > 150) return;

    /* winding number (total signed angle) */
    var angle_sum = 0;
    for (i = 0; i < pts.length - 1; i++) {
      var a1 = Math.atan2(pts[i][1] - cy, pts[i][0] - cx);
      var a2 = Math.atan2(pts[i + 1][1] - cy, pts[i + 1][0] - cx);
      var d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      angle_sum += d;
    }

    /* bounding box */
    var sxMin = Infinity, sxMax = -Infinity, syMin = Infinity, syMax = -Infinity;
    for (i = 0; i < pts.length; i++) {
      if (pts[i][0] < sxMin) sxMin = pts[i][0];
      if (pts[i][0] > sxMax) sxMax = pts[i][0];
      if (pts[i][1] < syMin) syMin = pts[i][1];
      if (pts[i][1] > syMax) syMax = pts[i][1];
    }
    var bw = sxMax - sxMin, bh = syMax - syMin;

    if (Math.abs(angle_sum) > 5.0 && bw < 220 && bh < 220) {
      this._spun = true;
      this._picked = false;
      this.sleeping = false;
      this._rec_activity('spin');
      this.set_state(SPIN, 2100);
      this.show_bubble(choice(SPIN_WORDS), 2000);
      this._snd('chime');
      this.signal_waved.emit();
    }
  };

  /* ---- circle_progress / reset_circle ---- */
  Pet.prototype.circle_progress = function () {
    var pts = this._gesture;
    if (pts.length < 3) return 0;
    var cx = 0, cy = 0, i;
    for (i = 0; i < pts.length; i++) { cx += pts[i][0]; cy += pts[i][1]; }
    cx /= pts.length; cy /= pts.length;
    var angle_sum = 0;
    for (i = 0; i < pts.length - 1; i++) {
      var a1 = Math.atan2(pts[i][1] - cy, pts[i][0] - cx);
      var a2 = Math.atan2(pts[i + 1][1] - cy, pts[i + 1][0] - cx);
      var d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      angle_sum += d;
    }
    return Math.min(1, Math.abs(angle_sum) / (2 * Math.PI));
  };

  Pet.prototype.reset_circle = function () {
    this._gesture = [];
    this._spun = false;
  };

  /* ==========================================================================
   * _play(key) — 动画播放
   * ========================================================================== */
  Pet.prototype._play = function (key) {
    this._stop_squash(false);

    var character = this.cfg.character || 'xiaobai';
    var path = this.assets.resolve(key, character);
    if (!path) return;

    /* dedup */
    if (path === this._last_path && this.movie !== null) return;

    var ground = this.ground_center();

    var movie = new global.Movie(path);
    if (!movie.meta) return;

    movie.jumpToFrame(0);

    var sz = movie.size();
    var w0 = sz[0] || 300, h0 = sz[1] || 300;
    if (w0 <= 0 || h0 <= 0) { w0 = 300; h0 = 300; }

    /* 目标高度 */
    var le = Math.max(40, Math.floor((this.cfg.size || 150) * this._extra_scale));
    var nh = le;
    var nw = Math.max(1, Math.floor(w0 * le / h0));

    movie.setSpeed(this._speed_pct());

    var self = this;

    /* 先换上新的 movie 实例：_applyFrame 读的就是 this.movie */
    var old = this.movie;
    this.movie = movie;
    this._last_path = path;
    this._src_w = w0;
    this._src_h = h0;

    this._w = nw;
    this._h = nh;
    this._applyFrame();

    /* 帧回调 → 用「当前」元素尺寸换算，不能在闭包里钉死 nw/nh：
     * 挤压动画会把元素放大缩小，若沿用旧值，background-position 会偏移到
     * 相邻帧上，直接叠出另一张图（用户看到的“叠影”）。 */
    movie.onFrame(function () { self._applyFrame(); });

    movie.start();

    this._place_by_ground(ground);

    if (old) {
      old.dispose();
    }
  };

  /* ---- 图集定位：按元素当前尺寸换算 background-size / background-position ----
   * 唯一出口，_play / _apply_squash / _rescale 共用，避免各处缩放值不一致。 */
  Pet.prototype._applyFrame = function () {
    if (!this.movie || !this.movie.meta) return;
    var meta = this.movie.meta;
    var bg = global.atlasBg(meta, this._w, this._h, this.movie.frameRect(this.movie.currentFrame()));
    this.el.style.width = this._w + 'px';
    this.el.style.height = this._h + 'px';
    this.el.style.backgroundImage = 'url(assets/' + meta.img + ')';
    this.el.style.backgroundSize = bg.sizeX + 'px ' + bg.sizeY + 'px';
    this.el.style.backgroundPosition = bg.posX + 'px ' + bg.posY + 'px';
  };

  /* ==========================================================================
   * Ground anchoring
   * ========================================================================== */
  Pet.prototype.ground_center = function () {
    return { x: this._x + Math.floor(this._w / 2), y: this._y + this._h };
  };

  Pet.prototype.place_by_ground = function (pt) { this._place_by_ground(pt); };
  Pet.prototype._place_by_ground = function (ground) {
    var nx = ground.x - Math.floor(this._w / 2);
    var ny = ground.y - this._h;
    this.move(nx, ny);
  };

  /* ==========================================================================
   * Speed & CPU
   * ========================================================================== */
  Pet.prototype._speed_pct = function () {
    var base = FPS_PRESETS[this.cfg.fps_mode || 'balanced'] || 80;
    var factor = this._cpu_factor;
    if (this.state === SLEEP || this.state === DEEP) factor *= 0.4;
    return Math.max(20, Math.floor(base * factor));
  };

  Pet.prototype.set_cpu_factor = function (f) {
    if (Math.abs(f - this._cpu_factor) > 0.01) {
      this._cpu_factor = f;
      this.update_speed();
    }
  };

  Pet.prototype.update_speed = function () {
    if (this.movie) this.movie.setSpeed(this._speed_pct());
  };

  Pet.prototype.set_extra_scale = function (s) {
    this._extra_scale = s;
    this._last_path = '';
    this._play(STATE_GIF[this.state] || 'idle');
  };

  /* ==========================================================================
   * State machine
   * ========================================================================== */
  Pet.prototype.set_state = function (state, duration_ms, gif_key) {
    this.state = state;
    this._walk_visual = false;

    if (duration_ms) {
      this.state_until = nowSec() + duration_ms / 1000;
    } else {
      this.state_until = 0;
    }

    var key = gif_key || STATE_GIF[state] || 'idle';
    this._play(key);
  };

  Pet.prototype.state_now = function () { return this.state; };

  Pet.prototype._back_to_base = function () {
    if (this.sleeping) {
      this.set_state(this.state === DEEP ? DEEP : SLEEP);
      return;
    }
    if (this.base_mode === 'work') {
      this.set_state(WORK);
      return;
    }
    this.set_state(IDLE);
  };

  /* ---- _tick_behavior (1s) ---- */
  Pet.prototype._tick_behavior = function () {
    var now = nowSec();
    if (this.state !== IDLE) return;
    if (this.base_mode === 'work') return;
    if (now < this._next_idle_flicker) return;

    var mood = this.cfg.mood !== undefined ? this.cfg.mood : 80;
    var energy = this.cfg.energy !== undefined ? this.cfg.energy : 80;

    /* schedule next flicker */
    this._next_idle_flicker = now + rnd(8, 18) * (1.3 - mood / 250);

    /* probability gate */
    var prob;
    if (this.night) {
      prob = 0.28;
    } else {
      prob = 0.18 + mood / 450;
    }
    if (Math.random() > prob) return;

    /* select pool */
    var pool;
    if (this.night) {
      pool = NIGHT_ACTION_POOL;
    } else {
      /* python: has_energy = (mood >= 50, energy >= 50); 元组作字典键。
         data.js 由 JSON 导出后键为 "(True, True)" 形态，这里逐字构造等价键。 */
      var pyBool = function (b) { return b ? 'True' : 'False'; };
      var pyKey = '(' + pyBool(mood >= 50) + ', ' + pyBool(energy >= 50) + ')';
      pool = IDLE_ACTION_POOLS[pyKey] || IDLE_ACTION_POOLS['(True, True)'];
      if (!pool) {
        /* 兜底：任何可用的键格式（true,true / (true, true) 等） */
        var alt = (mood >= 50) + ',' + (energy >= 50);
        pool = IDLE_ACTION_POOLS[alt] || IDLE_ACTION_POOLS['true,true'];
        if (!pool) {
          for (var k in IDLE_ACTION_POOLS) {
            if (Object.prototype.hasOwnProperty.call(IDLE_ACTION_POOLS, k)) {
              pool = IDLE_ACTION_POOLS[k];
              break;
            }
          }
        }
      }
    }
    if (!pool || !pool.length) return;

    /* filter last action */
    var candidates = [];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i][0] !== this._last_idle_action) candidates.push(pool[i]);
    }
    if (!candidates.length) candidates = pool;

    /* weighted choice */
    var weights = [];
    for (var j = 0; j < candidates.length; j++) weights.push(candidates[j][3]);
    var chosen = weightedChoice(candidates, weights);

    this._last_idle_action = chosen[0];
    this.set_state(chosen[0], chosen[2], chosen[1]);
  };

  /* ---- _tick_move (50ms) ---- */
  Pet.prototype._tick_move = function () {
    var now = nowSec();
    var curX = this._cursor_x, curY = this._cursor_y;
    var st = this.state;

    /* temp state expiry */
    if (TEMP_STATES[st] !== undefined && now > this.state_until) {
      this._back_to_base();
      return;
    }

    /* frozen states */
    if (st === PICKED || st === SPIN) return;

    /* bubble follow */
    if (this.bubble.isVisible()) {
      if (!this._visible) {
        this.bubble.hide();
      } else {
        this._position_bubble();
      }
    }

    var centerX = this._x + Math.floor(this._w / 2);
    var centerY = this._y + Math.floor(this._h / 2);
    var dist_cur = hypot(curX - centerX, curY - centerY);

    /* cursor movement over tracked window */
    var moved_recent = 0;
    if (this._cursor_track.length >= 2) {
      var first = this._cursor_track[0];
      moved_recent = hypot(curX - first[0], curY - first[1]);
    }

    /* CHASE */
    if (st === CHASE) {
      if (now > this.chase_until) {
        this.show_bubble('呼…追到啦！', 2200);
        this.set_state(RELAX, 2600);
        return;
      }
      var tx = curX - Math.floor(this._w / 2);
      var ty = curY - this._h + 18;
      var step = this._calc_step(tx, ty, 6.2);
      this.move(step[0], step[1]);
      return;
    }

    /* HIDE */
    if (st === HIDE) {
      if (now <= this.hide_until) return;
      if (dist_cur < 130) {
        this._pop_hide();
        return;
      }
    }

    /* GO_SLEEP */
    if (st === GO_SLEEP) {
      if (this.roam_target && this._step_to(this.roam_target, 4.6)) {
        this.sleeping = true;
        this.set_state(this._deep_on_arrive ? DEEP : SLEEP);
      }
      return;
    }

    /* WALK */
    if (st === WALK) {
      if (this.roam_target && this._step_to(this.roam_target, this._relocate_speed)) {
        var action = this.arrive_action;
        if (action === 'sleep') {
          this.sleeping = true;
          this.set_state(this._deep_on_arrive ? DEEP : SLEEP);
        } else if (action === 'hide') {
          this.set_state(HIDE);
        } else if (action === 'peek') {
          this.set_state(PEEK, 4200);
        } else if (action === 'fetch') {
          var cb = this._fetch_done;
          this._fetch_done = null;
          this.arrive_action = 'base';
          this.set_state(HAPPY, 1800);
          if (cb) cb();
        } else {
          this._back_to_base();
        }
      }
      return;
    }

    /* FLEE */
    if (st === FLEE) {
      if (this.roam_target) this._step_to(this.roam_target, 6.0);
      return;
    }

    /* NERVOUS */
    if (st === NERVOUS) {
      this.roam_target = null;
      this._back_to_base();
      return;
    }

    /* STARE */
    if (st === STARE) {
      if (moved_recent > 6) {
        this._back_to_base();
        return;
      }
    }

    /* RELAXED_STATES: follow cursor */
    if (inRelaxed(st)) {
      var mi = this.cfg.mouse_interaction;
      if ((mi === undefined || mi) && !this._corner && !this.locked && this.base_mode !== 'work') {
        this._follow(curX, curY, dist_cur, now, moved_recent);
      }
    }
  };

  /* ---- _follow ---- */
  Pet.prototype._follow = function (curX, curY, dist_cur, now, moved_recent) {
    var mode = this.cfg.follow_mode || 'sticky';
    if (mode === 'off') {
      this._set_walk_visual(false);
      return;
    }

    if (this.state === STARE) {
      this.last_follow_at = now;
    }

    if (mode === 'sticky') {
      if (dist_cur <= 90) { this._set_walk_visual(false); return; }
      var still_for = now - this._cursor_still_since;
      if (still_for > 3.0) { this._set_walk_visual(false); return; }
      var speed = Math.min(6.5, 1.8 + dist_cur * 0.009);
      var tx = curX - Math.floor(this._w / 2);
      var ty = curY - this._h + 20;
      var step = this._calc_step(tx, ty, speed);
      var cx = this._clamp_in(step[0], step[1]);
      if (cx[0] !== this._x || cx[1] !== this._y) {
        this.move(cx[0], cx[1]);
        this.last_follow_at = now;
        this._set_walk_visual(true);
      }
      return;
    }

    if (mode === 'timid') {
      var recent = [];
      for (var i = 0; i < this._cursor_track.length; i++) {
        if (now - this._cursor_track[i][2] < 0.25) recent.push(this._cursor_track[i]);
      }
      var c_speed = 0;
      if (recent.length >= 2) {
        c_speed = hypot(recent[recent.length - 1][0] - recent[0][0],
                        recent[recent.length - 1][1] - recent[0][1]);
      }

      if (c_speed > 24 && dist_cur < 250) {
        this._set_walk_visual(false);
        var centerX = this._x + Math.floor(this._w / 2);
        var centerY = this._y + Math.floor(this._h / 2);
        var ax = centerX - curX;
        var ay = centerY - curY;
        if (Math.abs(ax) < 1 && Math.abs(ay) < 1) ax = Math.random() < 0.5 ? -1 : 1;
        var len = Math.max(1.0, hypot(ax, ay));
        var pos = this._clamp_in(this._x + ax / len * 220, this._y + ay / len * 220);
        this.roam_target = { x: pos[0], y: pos[1] };
        this.arrive_action = 'base';
        this.set_state(FLEE, 700);
        this.last_follow_at = now;
        this._snd('whine');
        return;
      }

      var still_for2 = now - this._cursor_still_since;
      if (still_for2 > 2.5 && dist_cur > 120) {
        var tx2 = curX - Math.floor(this._w / 2);
        var ty2 = curY - this._h + 16;
        var step2 = this._calc_step(tx2, ty2, 2.3);
        var cx2 = this._clamp_in(step2[0], step2[1]);
        if (cx2[0] !== this._x || cx2[1] !== this._y) {
          this.move(cx2[0], cx2[1]);
          this.last_follow_at = now;
          this._set_walk_visual(true);
        }
      }
    }
  };

  /* ---- Movement helpers ---- */
  Pet.prototype._step_to = function (target, speed) {
    var dx = target.x - this._x;
    var dy = target.y - this._y;
    var dist = hypot(dx, dy);
    if (dist <= speed) {
      this.move(Math.floor(target.x), Math.floor(target.y));
      return true;
    }
    this.move(Math.floor(this._x + dx / dist * speed),
              Math.floor(this._y + dy / dist * speed));
    return false;
  };

  Pet.prototype._calc_step = function (tx, ty, speed) {
    var dx = tx - this._x;
    var dy = ty - this._y;
    var dist = hypot(dx, dy);
    if (dist <= speed) return [tx, ty];
    return [Math.floor(this._x + dx / dist * speed),
            Math.floor(this._y + dy / dist * speed)];
  };

  Pet.prototype._clamp_in = function (x, y) {
    if (this.state === HIDE) return [Math.floor(x), Math.floor(y)];
    var desk = Core.desk();
    x = clamp(Math.floor(x), desk.x, desk.x + desk.w - this._w);
    y = clamp(Math.floor(y), desk.y, desk.y + desk.h - this._h);
    return [x, y];
  };

  /* ---- _set_walk_visual ---- */
  Pet.prototype._set_walk_visual = function (on) {
    if (on && !this._walk_visual) {
      this._walk_visual = true;
      this._play('walk');
    } else if (!on && this._walk_visual) {
      this._walk_visual = false;
      this._last_path = '';
      this._play(STATE_GIF[this.state] || 'idle');
    }
  };

  /* ==========================================================================
   * Squash / Stretch
   * ========================================================================== */
  Pet.prototype._start_squash = function (frames) {
    if (!frames || !frames.length) return;
    if (!this.movie) return;

    var w0 = this._src_w, h0 = this._src_h;
    if (w0 <= 0 || h0 <= 0) return;

    var le = Math.max(40, Math.floor((this.cfg.size || 150) * this._extra_scale));
    this._squash_base_h = le;
    this._squash_base_w = Math.max(1, Math.floor(w0 * le / h0));
    this._squash_ground = this.ground_center();
    this._squash_frames = frames.slice();
    this._squash_duration = frames[frames.length - 1][0];
    this._squash_start = nowSec();

    var self = this;
    if (!this._squash_timer) {
      this._squash_timer = setInterval(function () { self._squash_tick(); }, 33);
    }
    this._squash_tick();
  };

  Pet.prototype._squash_tick = function () {
    if (!this._squash_frames.length) {
      this._stop_squash();
      return;
    }

    var elapsed = nowSec() - this._squash_start;
    var fr = this._squash_frames;

    if (elapsed >= this._squash_duration) {
      var last = fr[fr.length - 1];
      this._apply_squash(last[1], last[2], last[3]);
      this._stop_squash();
      return;
    }

    var sx = fr[fr.length - 1][1], sy = fr[fr.length - 1][2], dy = fr[fr.length - 1][3];
    for (var i = 1; i < fr.length; i++) {
      if (fr[i][0] >= elapsed) {
        var t0 = fr[i - 1][0], sx0 = fr[i - 1][1], sy0 = fr[i - 1][2], dy0 = fr[i - 1][3];
        var t1 = fr[i][0], sx1 = fr[i][1], sy1 = fr[i][2], dy1 = fr[i][3];
        if (t1 > t0) {
          var a = (elapsed - t0) / (t1 - t0);
          sx = sx0 + (sx1 - sx0) * a;
          sy = sy0 + (sy1 - sy0) * a;
          dy = dy0 + (dy1 - dy0) * a;
        } else {
          sx = sx1; sy = sy1; dy = dy1;
        }
        break;
      }
    }
    this._apply_squash(sx, sy, dy);
  };

  Pet.prototype._apply_squash = function (sx, sy, dy) {
    if (!this.movie || !this._squash_ground) return;

    var nw = Math.max(1, Math.floor(this._squash_base_w * sx));
    var nh = Math.max(1, Math.floor(this._squash_base_h * sy));
    if (!this.movie.meta) return;

    /* 尺寸变了就走同一个 _applyFrame：缩放值必须来自当前 nw/nh */
    this._w = nw;
    this._h = nh;
    this._applyFrame();

    /* ground anchor: bottom-center stays, offset by dy */
    var g = this._squash_ground;
    var nx = Math.floor(g.x - nw / 2);
    var ny = Math.floor(g.y - nh - dy);
    this._x = nx;
    this._y = ny;
    this.el.style.left = nx + 'px';
    this.el.style.top = ny + 'px';
  };

  Pet.prototype._stop_squash = function (restore) {
    if (this._squash_timer) { clearInterval(this._squash_timer); this._squash_timer = null; }
    var active = !!this._squash_frames.length;
    this._squash_frames = [];
    this._squash_ground = null;
    if (restore && active) this._rescale();
  };

  /* ---- Squash triggers ---- */
  Pet.prototype._play_tap_squash = function () {
    if (this.cfg.click_squash_on === false) return;
    this._start_squash(TAP_SQUASH_FRAMES);
  };

  Pet.prototype._play_hop_squash = function () {
    if (this.cfg.click_squash_on === false) {
      this._hop_bounce();
      return;
    }
    this._start_squash(HOP_SQUASH_FRAMES);
  };

  Pet.prototype._play_chin_squash = function () {
    if (this.cfg.click_squash_on === false) return;
    this._start_squash(CHIN_SQUASH_FRAMES);
  };

  /* public squash entry points */
  Pet.prototype.squash_tap = function () { this._play_tap_squash(); };
  Pet.prototype.squash_hop = function () { this._play_hop_squash(); };
  Pet.prototype.squash_chin = function () { this._play_chin_squash(); };

  /* ==========================================================================
   * Bounce
   * ========================================================================== */
  Pet.prototype._land_bounce = function () {
    this._bounce_base_y = this._y;
    this._bounce_seq = [0, -7, 0, -3, 0];
    this._start_bounce();
  };

  Pet.prototype._hop_bounce = function () {
    this._bounce_base_y = this._y;
    this._bounce_seq = [0, -12, -16, -10, 0];
    this._start_bounce();
  };

  Pet.prototype._start_bounce = function () {
    var self = this;
    if (!this._bounce_timer) {
      this._bounce_timer = setInterval(function () { self._bounce_step(); }, 45);
    }
    this._bounce_step();
  };

  Pet.prototype._bounce_step = function () {
    if (!this._bounce_seq.length) {
      if (this._bounce_timer) { clearInterval(this._bounce_timer); this._bounce_timer = null; }
      return;
    }
    var dy = this._bounce_seq.shift();
    this._y = this._bounce_base_y + dy;
    this.el.style.top = this._y + 'px';
  };

  /* ==========================================================================
   * Tap / double-click
   * ========================================================================== */
  Pet.prototype._do_tap = function () {
    this.sleeping = false;
    this._rec_activity('pet');
    this.set_state(PET, 1900);
    this.show_bubble(choice(HAPPY_WORDS), 2000);
    this._snd('happy');
    this.signal_clicked.emit();
  };

  /* double-click is handled via tap_timer cancellation in _on_pointer_down:
     if within TAP_CANCEL_MS of last tap, treat as double-click */
  Pet.prototype._last_tap_time = 0;

  /* Override _on_pointer_up to handle double-click detection */
  /* We need to intercept: when a tap fires and then another press comes within TAP_CANCEL_MS */
  /* Actually the spec says: first release → start _tap_timer; if double-click arrives → cancel timer */
  /* In browser, we use a _last_release_time and check on next press */

  /* We'll patch the pointer down to detect double-click */
  var _orig_down = Pet.prototype._on_pointer_down;
  Pet.prototype._on_pointer_down = function (e) {
    var now = nowSec();
    /* check if this is a double-click (press within TAP_CANCEL_MS of last release that was a tap) */
    if (this._last_tap_time && (now - this._last_tap_time) * 1000 < TAP_CANCEL_MS && !this._moved) {
      /* double-click! */
      if (this._tap_timer) { clearTimeout(this._tap_timer); this._tap_timer = null; }
      this._dbl_seen = true;
      this._last_tap_time = 0;
      this.sleeping = false;
      this._rec_activity('call');
      this.set_state(HOP, 1300);
      this._play_hop_squash();
      this.show_bubble(choice(CALL_WORDS_DOG), 1800);
      this._snd('chirp');
      this.signal_double_clicked.emit();
      /* still run the original down handler for drag setup */
      _orig_down.call(this, e);
      return;
    }

    /* cancel any pending tap timer (new press before timer fired) */
    if (this._tap_timer) { clearTimeout(this._tap_timer); this._tap_timer = null; }

    _orig_down.call(this, e);
  };

  /* Patch pointer up to record tap time */
  var _orig_up = Pet.prototype._on_pointer_up;
  Pet.prototype._on_pointer_up = function (e) {
    var gx = e.clientX, gy = e.clientY;
    var now = nowSec();
    var total_move = this._press_global ? (Math.abs(gx - this._press_global.x) + Math.abs(gy - this._press_global.y)) : 9999;
    var was_short_tap = (this._press_global !== null && total_move < 14 && (now - this._press_t) < 0.5 && !this._moved && !this._picked);

    _orig_up.call(this, e);

    /* if this was a short tap, record time for double-click detection */
    if (was_short_tap && !this._dbl_seen && !this._spun) {
      this._last_tap_time = now;
    }
  };

  /* ==========================================================================
   * Bubble
   * ========================================================================== */
  Pet.prototype.show_bubble = function (text, ms) {
    if (this.cfg.bubble_on === false) return;
    if (!text) return;
    if (ms === undefined || ms === null) ms = this.cfg.bubble_duration || 4200;

    this.bubble.setText(text);
    /* estimate size */
    var bw = Math.min(260, Math.max(90, text.length * 14 + 26));
    var bh = Math.max(30, Math.ceil(text.length * 14 / (bw - 22)) * 18 + 14);
    this.bubble.el.style.width = bw + 'px';
    this.bubble.el.style.minHeight = bh + 'px';

    this._position_bubble();
    this.bubble.show();

    var self = this;
    if (this._bubble_timer) clearTimeout(this._bubble_timer);
    this._bubble_timer = setTimeout(function () {
      self._bubble_timer = null;
      self.bubble.hide();
    }, ms);

    this.signal_bubble_shown.emit(text);
  };

  Pet.prototype.hide_bubble = function () {
    if (this._bubble_timer) { clearTimeout(this._bubble_timer); this._bubble_timer = null; }
    this.bubble.hide();
  };

  Pet.prototype._position_bubble = function () {
    var bw = this.bubble.el.offsetWidth || 120;
    var bh = this.bubble.el.offsetHeight || 36;
    var cx = this._x + Math.floor(this._w / 2);
    var desk = Core.desk();

    var bx = Math.floor(cx - bw / 2);
    var by = this._y - bh - 8;

    /* flip below if too close to top */
    if (by < desk.y + 2) by = this._y + this._h + 4;

    /* clamp */
    bx = clamp(bx, desk.x + 2, desk.x + desk.w - bw - 2);
    by = clamp(by, desk.y + 2, desk.y + desk.h - bh - 2);

    this.bubble.move(bx, by);
  };

  /* ==========================================================================
   * Public API
   * ========================================================================== */
  Pet.prototype.move = function (x, y) {
    var oldX = this._x, oldY = this._y;
    this._x = Math.floor(x);
    this._y = Math.floor(y);
    this.el.style.left = this._x + 'px';
    this.el.style.top = this._y + 'px';
    if (oldX !== this._x || oldY !== this._y) {
      this.signal_moved.emit(this._x - oldX, this._y - oldY);
    }
  };

  Pet.prototype.pos = function () { return { x: this._x, y: this._y }; };
  Pet.prototype.size = function () { return { w: this._w, h: this._h }; };

  Pet.prototype.resize = function (w, h) {
    this._w = w;
    this._h = h;
    this.el.style.width = w + 'px';
    this.el.style.height = h + 'px';
  };

  Pet.prototype.set_geometry = function (x, y, w, h) {
    this.resize(w, h);
    this.move(x, y);
  };

  Pet.prototype.hide = function () {
    this._visible = false;
    this.el.style.display = 'none';
    this.bubble.hide();
  };

  Pet.prototype.show = function () {
    this._visible = true;
    this.el.style.display = 'block';
    /* clear_cache 释放过位图的话，重新出场时需要立刻恢复渲染 */
    if (!this.movie) this.replay();
  };

  Pet.prototype.is_visible = function () { return this._visible; };

  Pet.prototype.set_config = function (cfg) {
    this.cfg = cfg;
  };

  Pet.prototype.set_size = function (px) {
    this.cfg.size = px;
    this._last_path = '';
    this._play(STATE_GIF[this.state] || 'idle');
  };

  Pet.prototype.set_opacity = function (v) {
    this._opacity = v;
    this.el.style.opacity = v;
  };

  Pet.prototype.set_opacity_rec = function (v) {
    this.set_opacity(v);
  };

  /* ---- Sleep / Wake ---- */
  Pet.prototype.wake = function () {
    if (this.state === SLEEP || this.state === DEEP || this.state === GO_SLEEP) {
      this.sleeping = false;
      this.show_bubble('嗯？你回来了！');
      this.set_state(HAPPY, 1200);
      this._snd('happy');
    }
  };

  Pet.prototype.go_sleep = function (deep) {
    if (this.state === PICKED || this.state === CHASE || this.state === HIDE || this.state === GO_SLEEP) return;
    this.sleeping = true;
    this.set_state(deep ? DEEP : SLEEP);
    this.show_bubble(choice(SLEEP_WORDS), 2400);
  };

  Pet.prototype.set_deep = function (on) {
    if (this.sleeping && (this.state === SLEEP || this.state === DEEP)) {
      this.set_state(on ? DEEP : SLEEP);
    }
  };

  Pet.prototype.set_nervous = function () { return null; };

  Pet.prototype.set_companion = function (mode) {
    if (mode === 'code') {
      this.base_mode = 'work';
      if (this.state === IDLE || this.state === WALK || this.state === STARE ||
          this.state === RELAX || this.state === GROOM) {
        this.set_state(WORK);
      }
    } else {
      if (this.base_mode === 'work') {
        this.base_mode = 'idle';
        if (this.state === WORK) this.set_state(IDLE);
      }
    }
  };

  Pet.prototype.is_free = function () {
    return (this.state === IDLE || this.state === WALK || this.state === STARE ||
            this.state === GROOM || this.state === RELAX || this.state === WORK) && !this._corner;
  };

  /* ---- Relocate / Fetch / Corner ---- */
  Pet.prototype.relocate = function (cx, cy, speed, immediate, force) {
    if (!force && (this.state === PICKED || this.state === SLEEP || this.state === DEEP ||
        this.state === CHASE || this.state === HIDE || this.state === GO_SLEEP || this.state === SPIN)) {
      return false;
    }
    var tx = Math.floor(cx - this._w / 2);
    var ty = Math.floor(cy - this._h / 2);

    if (immediate) {
      this.roam_target = null;
      this.arrive_action = 'base';
      this.move(tx, ty);
      if (this.state === WALK || this.state === FLEE || this.state === NERVOUS) this.set_state(IDLE);
      return true;
    }

    this.arrive_action = 'base';
    this._relocate_speed = speed;
    this.roam_target = { x: tx, y: ty };
    if (this.state !== WALK) this.set_state(WALK);
    return true;
  };

  Pet.prototype.peek_at = function () { return null; };

  Pet.prototype.fetch_item = function (cx, cy, done_cb) {
    if (!this.is_free()) return false;
    this.sleeping = false;
    this._fetch_done = done_cb;
    this.arrive_action = 'fetch';
    this._relocate_speed = 4.2;
    this.roam_target = { x: Math.floor(cx - this._w / 2), y: Math.floor(cy - this._h) };
    if (this.state !== WALK) this.set_state(WALK);
    return true;
  };

  Pet.prototype.corner_hide = function (on, workarea) {
    if (on && !this._corner) {
      this._corner_saved = { x: this._x, y: this._y };
      this._corner = true;
      this._extra_scale = 0.4;
      this._last_path = '';
      this._play(STATE_GIF[this.state] || 'idle');

      if (workarea) {
        this.move(workarea[2] - this._w - 6, workarea[3] - this._h - 6);
      }
      this.show_bubble('退出全屏我就出现啦~', 2600);
    } else if (!on && this._corner) {
      this._extra_scale = 1.0;
      this._last_path = '';
      this._play(STATE_GIF[this.state] || 'idle');
      this._corner = false;

      if (this._corner_saved) {
        this.move(this._corner_saved.x, this._corner_saved.y);
        this._corner_saved = null;
      }
      this.show_bubble('回来啦~', 1600);
    }
  };

  /* ---- Actions ---- */
  Pet.prototype.feed = function () {
    this.sleeping = false;
    this._rec_activity('feed');
    this.set_state(EAT, 2600);
    this.show_bubble(choice(EAT_WORDS));
    this._snd('munch');
  };

  Pet.prototype.play_with = function () {
    this.sleeping = false;
    this._rec_activity('play');
    this.set_state(PLAY, 3500);
    this.show_bubble(choice(PLAY_WORDS));
    this._snd('happy');
  };

  Pet.prototype.start_chase = function (seconds) {
    seconds = seconds || 3;
    this.sleeping = false;
    this._rec_activity('chase');
    this.chase_until = nowSec() + seconds;
    this.set_state(CHASE);
    this.show_bubble(choice(CHASE_WORDS), 2200);
    this._snd('happy');
  };

  Pet.prototype.start_hide = function () {
    this.sleeping = false;
    this._rec_activity('hide');

    var desk = Core.desk();
    var side = Math.random() < 0.5 ? 'left' : 'right';
    var tx;
    if (side === 'left') {
      tx = desk.x - Math.floor(this._w * 0.72);
    } else {
      tx = desk.x + desk.w - Math.floor(this._w * 0.28);
    }
    var ty = rndInt(desk.y + 20, desk.y + desk.h - this._h - 20);

    this.hide_until = nowSec() + rnd(4, 10);
    this.roam_target = { x: tx, y: ty };
    this.arrive_action = 'hide';
    this._relocate_speed = 4.0;
    if (this.state !== WALK) this.set_state(WALK);
  };

  Pet.prototype._pop_hide = function () {
    var desk = Core.desk();
    var cx = this._x + Math.floor(this._w / 2);
    var cy = this._y + Math.floor(this._h / 2);

    var tx = clamp(cx + Math.floor(this._w / 2) + 4, desk.x, desk.x + desk.w - Math.floor(this._w / 2) - 4);
    var ty = clamp(cy + Math.floor(this._h / 2) + 4, desk.y, desk.y + desk.h - Math.floor(this._h / 2) - 4);

    this.roam_target = { x: tx, y: ty };
    this.arrive_action = 'base';
    this._relocate_speed = 3.5;
    if (this.state !== WALK) this.set_state(WALK);
    this.show_bubble(choice(FIND_WORDS), 2200);
  };

  /* ---- Sound dispatch ---- */
  Pet.prototype._snd = function (kind) {
    var table = { happy: 'bark', chime: 'chime', whine: 'whine', chirp: 'chirp', munch: 'munch' };
    var name = table[kind];
    if (name && global.Sound && global.Sound.play) {
      global.Sound.play(name);
    }
  };

  /* ---- Diary hook ---- */
  Pet.prototype._rec_activity = function (kind) {
    if (!this._diary_rec) return;
    this._diary_rec(kind, this.cfg.mood, this.cfg.energy);
  };

  /* ---- Mouse through ---- */
  Pet.prototype.set_mouse_through = function (on) {
    this.el.style.pointerEvents = on ? 'none' : 'auto';
  };

  /* ---- Opacity ---- */
  Pet.prototype.set_pet_opacity = function (v) {
    this.set_opacity(clamp(v, 0.3, 1.0));
  };

  /* ---- External hooks ---- */
  Pet.prototype.set_paw_hooks = function (paw_canvas, step_counter) {
    this._paw_canvas = paw_canvas;
    this._step_counter = step_counter;
  };

  Pet.prototype.set_fx = function (engine) { this._fx = engine; };
  Pet.prototype.set_diary_hooks = function (recorder) { this._diary_rec = recorder; };

  /* ---- _rescale ---- */
  Pet.prototype._rescale = function () {
    if (!this.movie) return;
    var w0 = this._src_w, h0 = this._src_h;
    if (w0 <= 0 || h0 <= 0) return;

    var le = Math.max(40, Math.floor((this.cfg.size || 150) * this._extra_scale));
    var nh = le;
    var nw = Math.max(1, Math.floor(w0 * le / h0));
    if (!this.movie.meta) return;

    var ground = this.ground_center();

    this._w = nw;
    this._h = nh;
    this._applyFrame();
    this._place_by_ground(ground);
  };

  /* ---- Paw tick ---- */
  Pet.prototype._tick_paw = function () {
    /* 原版：三者全空才 return（_paw_canvas / _step_counter / _fx 各自独立） */
    if (!this._paw_canvas && !this._step_counter && !this._fx) return;

    if (this.state === PICKED || this.state === SPIN || this.state === SLEEP ||
        this.state === DEEP || this.state === HIDE || this.state === GO_SLEEP) {
      this._last_paw_pos = null;
      return;
    }

    var moving = (this.state === WALK || this.state === FLEE || this.state === CHASE ||
                  this.state === NERVOUS) || this._walk_visual;
    var cur = [this._x, this._y];
    var old = this._last_paw_pos;
    this._last_paw_pos = cur;

    if (!moving || old === null || old === undefined) return;

    var dx = cur[0] - old[0], dy = cur[1] - old[1];
    var dist = hypot(dx, dy);
    if (dist < 1) return;

    if (this._step_counter && this._step_counter.add_distance) {
      this._step_counter.add_distance(dist);
    }

    this._paw_accum += dist;
    if (this._paw_accum >= 28) {
      this._paw_accum = 0.0;
      var ang = (dx || dy) ? Math.atan2(dy, dx) : 0.0;
      var fx = this._x + Math.floor(this._w / 2);
      var fy = this._y + this._h - 4;               /* 原版：y + height - 4 */
      if (this._paw_canvas && (this.cfg.paw_enabled !== false)) {
        if (this._paw_canvas.note_step) this._paw_canvas.note_step(fx, fy, ang);
      }
      if (this._fx && this._fx.feed_step) this._fx.feed_step(fx, fy, ang);
    }
  };

  /* ---- place_initial ---- */
  Pet.prototype.place_initial = function () {
    var s = this.cfg.size || 150;
    var desk = Core.desk();
    var pos = this.cfg.pos;
    var ok = false;

    if (pos && pos.length === 2) {
      var px = parseInt(pos[0], 10), py = parseInt(pos[1], 10);
      if (px >= desk.x - 100 && px <= desk.x + desk.w &&
          py >= desk.y - 100 && py <= desk.y + desk.h) {
        this.move(px, py);
        ok = true;
      }
    }

    if (!ok) {
      /* 字节码原版：x 偏移 randint(60,180)，y 偏移 randint(40,120) */
      this.move(
        desk.x + desk.w - s - rndInt(60, 180),
        desk.y + desk.h - s - rndInt(40, 120)
      );
    }

    /* 原版 place_initial 结尾：_play('idle') + show() —— 首帧动画由此启动 */
    this._play('idle');
    this.show();
  };

  /* ---- replay() — 皮肤/大小/缩放变化后重新加载当前状态动画 ---- */
  Pet.prototype.replay = function () {
    this._last_path = '';
    this._play(STATE_GIF[this.state] || 'idle');
  };

  /* ---- clear_cache() — S3-15 ----
   * 原版 _release_memory 用 gc.collect(1) + winapi.trim_working_set 回收内存；
   * 网页没有可显式回收的堆，这里做真正的等价动作：释放已解码的图集位图
   * （仅在隐藏时执行，避免可见时闪一帧）。下次 show() 会 replay 回来。 */
  Pet.prototype.clear_cache = function () {
    if (this._visible) return;
    this._last_path = '';
    if (this.movie) {
      this.movie.dispose();
      this.movie = null;
    }
  };

  /* ---- Drag API (for external callers) ---- */
  Pet.prototype.start_drag = function (gx, gy) {
    this._on_pointer_down({ clientX: gx, clientY: gy, button: 0, preventDefault: function () {} });
  };
  Pet.prototype.drag_to = function (gx, gy) {
    this._on_pointer_move({ clientX: gx, clientY: gy, buttons: 1 });
  };
  Pet.prototype.end_drag = function () {
    this._on_pointer_up({ clientX: this._cursor_x, clientY: this._cursor_y, button: 0 });
  };

  /* ---- Dispose ---- */
  Pet.prototype.dispose = function () {
    this._tick_move_timer.stop();
    this._tick_behavior_timer.stop();
    this._paw_tick_timer.stop();
    if (this._squash_timer) clearInterval(this._squash_timer);
    if (this._bounce_timer) clearInterval(this._bounce_timer);
    if (this._tap_timer) clearTimeout(this._tap_timer);
    if (this._bubble_timer) clearTimeout(this._bubble_timer);

    if (this.movie) this.movie.dispose();
    if (this.bubble) this.bubble.dispose();

    document.removeEventListener('pointermove', this._onDocMove);
    document.removeEventListener('pointerup', this._onDocUp);
    document.removeEventListener('pointercancel', this._onDocUp);
    document.removeEventListener('touchmove', this._onTouchMove);
    document.removeEventListener('touchend', this._onTouchEnd);
    document.removeEventListener('pointermove', this._onDocCursor);

    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  global.Pet = Pet;

})(window);
