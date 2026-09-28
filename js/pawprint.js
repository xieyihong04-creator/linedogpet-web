/* =============================================================================
 * pawprint.js — LineDogPet Web port
 * 对应原 smartpet/pawprint.py（PawCanvas / StepCounter / Prank / ShotBubble）
 *
 * 浏览器差异：
 *   - 原版 QWidget 透明置顶画布 → <canvas> + pointer-events:none
 *   - 原版 winapi.set_cursor_pos() → 网页无法移动系统光标，Prank 改为宠物视觉抖动
 *   - 原版 OS 剪贴板监听 → 网页需用户手势触发 navigator.clipboard.read()
 *   - 原版 QPixmap → Canvas 2D API
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  if (!Core) throw new Error('pawprint.js: Core not found');

  var DATA = Core.DATA || {};
  var fx = DATA.fx || {};

  /* ---- PawCanvas：透明画布，画渐隐爪印 ---- */
  /* 差异：原版 QWidget 全屏置顶，网页用 fixed canvas + z-index */
  function PawCanvas(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg || {};
    this._fade = Math.max(parseInt(this.cfg.paw_fade_sec) || 6, 2);
    this._paws = [];
    this._enabled = false;
    this._timer = null;
    this._resize();
    var self = this;
    /* S2-9: 保存引用，dispose 时移除，避免销毁后监听器仍持有/回调旧画布 */
    this._onResize = function () { self._resize(); };
    window.addEventListener('resize', this._onResize);
  }

  PawCanvas.prototype._resize = function () {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  PawCanvas.prototype.set_enabled = function (on) {
    this._enabled = !!on;
    if (!on && this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  };

  PawCanvas.prototype.set_fade_sec = function (sec) {
    this._fade = Math.max(parseInt(sec) || 2, 2);
  };

  /* 差异：原版 add(x,y,angle) 桌面坐标，网页用页面坐标 */
  PawCanvas.prototype.note_step = function (x, y, angle) {
    if (!this._enabled) return;
    this._paws.push({ x: x, y: y, angle: angle, born: Date.now() / 1000 });
    if (!this._timer) {
      var self = this;
      this._timer = setInterval(function () { self._tick(); }, 120);
    }
    this._draw();
  };

  PawCanvas.prototype._tick = function () {
    var now = Date.now() / 1000;
    this._paws = this._paws.filter(function (p) {
      return now - p.born < this._fade;
    }.bind(this));
    if (!this._paws.length) {
      clearInterval(this._timer);
      this._timer = null;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    this._draw();
  };

  PawCanvas.prototype._draw = function () {
    var ctx = this.ctx;
    var now = Date.now() / 1000;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (var i = 0; i < this._paws.length; i++) {
      var p = this._paws[i];
      var age = now - p.born;
      var alpha = Math.max(0, 150 * (1.0 - age / this._fade));
      this._draw_paw(p.x, p.y, p.angle, alpha);
    }
  };

  /* 差异：原版 QPainter drawEllipse，网页用 Canvas arc/ellipse */
  PawCanvas.prototype._draw_paw = function (x, y, ang, alpha) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(90,70,60,' + (alpha / 255) + ')';
    ctx.beginPath();
    /* 主掌垫：10x7 椭圆，中心 (-5,-3) */
    ctx.ellipse(-5, -3, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    /* 四个脚趾：4x4 圆 */
    var toes = [[-4, -6], [4, -6], [-6, -2], [6, -2]];
    for (var i = 0; i < toes.length; i++) {
      ctx.beginPath();
      ctx.arc(toes[i][0], toes[i][1], 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  PawCanvas.prototype.today = function () {
    return this._paws.length;
  };

  PawCanvas.prototype.save = function () {
    /* 爪印不持久化，每次会话重新计算 */
  };

  PawCanvas.prototype.clear = function () {
    this._paws = [];
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  PawCanvas.prototype.dispose = function () {
    this.clear();
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    this.canvas = null;
    this.ctx = null;
  };

  /* ---- StepCounter：像素距离 → 步数 ---- */
  /* 差异：原版 cfg 持久化到 config.json，网页用 localStorage */
  function StepCounter(cfg) {
    this.cfg = cfg || {};
    this._accum = 0.0;
    this.STEP_PX = 18.0;
    this._check_day();
  }

  StepCounter.prototype._check_day = function () {
    /* S2-7: 原版是 Python date.today()（本地日期）；toISOString 是 UTC，
     * 本地 0-8 点会算到昨天，跨天重置时机错位。改用本地日期串。 */
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    if (this.cfg.paw_steps_date !== today) {
      this.cfg.paw_steps_today = 0;
      this.cfg.paw_steps_date = today;
    }
  };

  StepCounter.prototype.add_distance = function (px) {
    if (px <= 0) return;
    this._check_day();
    this._accum += px;
    while (this._accum >= this.STEP_PX) {
      this.cfg.paw_steps_today = parseInt(this.cfg.paw_steps_today || 0) + 1;
      this._accum -= this.STEP_PX;
    }
  };

  StepCounter.prototype.today = function () {
    this._check_day();
    return parseInt(this.cfg.paw_steps_today || 0);
  };

  /* 兼容 contract.md 的 .today / .date / .count / .bump() / .reset_if_new_day() */
  Object.defineProperty(StepCounter.prototype, 'count', {
    get: function () { return this.today(); }
  });
  Object.defineProperty(StepCounter.prototype, 'date', {
    get: function () { return this.cfg.paw_steps_date; }
  });

  StepCounter.prototype.bump = function () {
    this.add_distance(this.STEP_PX);
  };

  StepCounter.prototype.reset_if_new_day = function () {
    this._check_day();
  };

  /* ---- Prank：小恶作剧 ---- */
  /* 差异：原版 winapi.set_cursor_pos() 移动系统光标，网页无法做到 */
  /* 改为：宠物视觉抖动（短暂偏移 1-2px）+ 小爪印 */
  var Prank = {
    cfg: null,
    paw: null,
    pet: null,
    cursor: null,
    _timer: null,
    _started: false,

    init: function (cfg, paw_canvas, pet) {
      this.cfg = cfg;
      this.paw = paw_canvas;
      this.pet = pet;
    },

    /* S3-13: 原版 Prank 只有两种恶作剧（pawprint.py:155-161）：
     *   r<0.4 且 prank_mouse → _nudge_cursor()（OS 光标 ±2px）
     *   r<0.8 → _tiny_paws()
     * 之前这里的 swap/unswap「切换宠物状态」是臆造的，原版不存在，已删除。
     * 浏览器无法移动系统光标，用「让鼠标宠物偏移 ±2px」作为可见等价实现。 */
    set_cursor_pet: function (cp) { this.cursor = cp; },

    _nudge_cursor: function () {
      var cp = this.cursor;
      if (!cp || cp._enabled !== true) return;
      var dx = Core.rndInt(-2, 2);
      var dy = Core.rndInt(-2, 2);
      if (!dx && !dy) return;
      cp.update((cp._last_x || 0) + dx, (cp._last_y || 0) + dy);
    },

    set_enabled: function (on) {
      if (on && !this._started) {
        var self = this;
        this._timer = setInterval(function () { self._tick(); }, 20000);
        this._started = true;
      } else if (!on && this._started) {
        clearInterval(this._timer);
        this._timer = null;
        this._started = false;
      }
    },

    _tick: function () {
      if (!this.cfg || !this.cfg.prank_enabled) return;
      var r = Math.random();
      /* 与原版逐分支一致：r<0.4 且 prank_mouse 开 → 动光标并结束；
       * r<0.4 但 prank_mouse 关 → 继续 fall through 到 r<0.8 判定小爪印。 */
      if (r < 0.4 && this.cfg.prank_mouse) {
        this._nudge_cursor();
        return;
      }
      if (r < 0.8) this._tiny_paws();
    },

    _tiny_paws: function () {
      if (!this.cfg || !this.cfg.paw_enabled) return;
      if (!this.paw) return;
      var desk = Core.desk();
      var cx = Core.rndInt(desk.x + 80, desk.x + desk.w - 80);
      var cy = Core.rndInt(desk.y + 80, desk.y + desk.h - 80);
      var n = Core.rndInt(2, 4);
      for (var i = 0; i < n; i++) {
        this.paw.note_step(
          cx + i * 18,
          cy + Core.rnd(-4, 4),
          Core.rnd(-0.3, 0.3)
        );
      }
    }
  };

  /* ---- ShotBubble：截图缩略气泡 ---- */
  /* 差异：原版监听 OS 剪贴板，网页需用户手动触发 */
  /* 改为：捕获伪窗口 DOM 生成 SVG foreignObject → dataURL */
  function ShotBubble(cfg) {
    this.cfg = cfg || {};
    this.el = document.createElement('div');
    this.el.className = 'shot-bubble';
    this.el.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;' +
      'background:rgba(255,250,245,0.95);border-radius:8px;padding:6px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);display:none;';
    this._img = document.createElement('img');
    this._img.style.cssText = 'max-width:160px;max-height:100px;display:block;';
    this.el.appendChild(this._img);
    this._label = document.createElement('div');
    this._label.style.cssText = 'font-size:11px;color:#666;text-align:center;margin-top:2px;';
    this.el.appendChild(this._label);
    document.body.appendChild(this.el);
    this._timer = null;
    this._last_sig = '';
  }

  /* 差异：原版 show_shot(pixmap, anchor)，网页用 dataURL */
  ShotBubble.prototype.show = function (dataUrl, w, h, x, y) {
    if (!dataUrl) return;
    /* 去重签名："%dx%d%d" % (w, h, int(time.time())) */
    var sig = w + 'x' + h + Math.floor(Date.now() / 1000);
    if (sig === this._last_sig) return;
    this._last_sig = sig;

    this._img.src = dataUrl;
    this._label.textContent = w + '×' + h;
    this.el.style.display = 'block';

    /* 定位：宠物旁边 */
    var desk = Core.desk();
    var left = x + 10;
    var top = y;
    if (left + 180 > desk.x + desk.w) {
      left = Math.max(desk.x, x - 180);
    }
    top = Math.max(desk.y, Math.min(top, desk.y + desk.h - 120));
    this.el.style.left = left + 'px';
    this.el.style.top = top + 'px';

    var self = this;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(function () { self.hide(); }, 3500);
  };

  ShotBubble.prototype.hide = function () {
    this.el.style.display = 'none';
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  };

  /* 暴露全局 */
  global.PawCanvas = PawCanvas;
  global.StepCounter = StepCounter;
  global.Prank = Prank;
  global.ShotBubble = ShotBubble;

})(window);
