/* =============================================================================
 * core.js — LineDogPet Web port
 * 对应原 smartpet/config.py（常量、DEFAULT_CONFIG、clamp、持久化）
 * 原版：config.json 落在程序目录，不可写退回 %APPDATA%\SmartPet
 * 网页：localStorage 键 linedogpet.config.v1，配额失败退内存态（等价降级）
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- smartpet/config.py —— 常量取自 js/data.js（真实字节码执行导出，见 tools/gen_data_js.py） ---- */
  var D = (global.SMARTPET_DATA || {});
  var CFG = D.config || {};
  var APP_VERSION = CFG.APP_VERSION || '2.5.0';
  var APP_NAME = CFG.APP_NAME || 'LineDogPet';
  var APP_CN_NAME = CFG.APP_CN_NAME || '线条小狗狗桌宠';
  var APP_AUTHOR = CFG.APP_AUTHOR || '楚明昊';
  var APP_EMAIL = CFG.APP_EMAIL || '';
  var APP_WEBSITE = CFG.APP_WEBSITE || '';
  var RELEASE_GITHUB = CFG.RELEASE_GITHUB || '';
  var RELEASE_GITEE = CFG.RELEASE_GITEE || '';
  var RELEASE_GITCODE = CFG.RELEASE_GITCODE || '';
  var UPDATE_CHECK_URLS = CFG.UPDATE_CHECK_URLS || [];
  var UPDATE_PAGE = CFG.UPDATE_PAGE || '';
  var PAWLIVEWALL_URL = (D.panels && D.panels.PAWLIVEWALL_URL) || APP_WEBSITE;

  /* FPS_PRESETS = {'smooth':100,'balanced':80,'normal':60,'saver':45}  (QMovie.setSpeed %) */
  var FPS_PRESETS = CFG.FPS_PRESETS || { smooth: 100, balanced: 80, normal: 60, saver: 45 };

  /* config.pyc 实际取出的 74 项默认配置（值与顺序 verbatim） */
  var DEFAULT_CONFIG = CFG.DEFAULT_CONFIG || {};

  /* _RUNTIME_KEYS：这些键不写盘（原版每次启动重算） */
  var RUNTIME_KEYS = D['config.runtime_keys'] || ['energy', 'theme_color', 'theme_radius', 'panel_opacity', 'pet_opacity', 'dark_mode'];

  /* 其余模块的 verbatim 数据表（pet/assets/fx/drops/diary/observe/ai/panels/…） */
  var DATA = D;

  /* ---- parse_version_tag(tag)：兼容 v1.0.1 / LineDogPet-v1.5.1 / 1.5.1 ---- */
  function parseVersionTag(tag) {
    if (!tag) tag = '';
    var m = String(tag).match(/(\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : '';
  }

  /* ---- clamp 表（config._clamp 逐键范围；缺键时原样返回） ---- */
  var CLAMP = {
    size: [80, 320], cursor_size: [40, 160], bongo_size: [220, 900],
    pet_count: [1, 4], theme_radius: [0, 22],
    bubble_duration: [1200, 9000], paw_fade_sec: [1, 20],
    mood: [0, 100], energy: [0, 100], fx_fps: [15, 60],
    pet_opacity: [0.25, 1], panel_opacity: [0.4, 1], bongo_opacity: [0.25, 1]
  };
  function clampOne(k, v) {
    var r = CLAMP[k];
    if (!r) return v;
    if (typeof v === 'boolean' || v === null) return v;
    var n = Number(v);
    if (isNaN(n)) return DEFAULT_CONFIG[k];
    return Math.min(r[1], Math.max(r[0], n));
  }

  /* ---- load_config / save_config ---- */
  var LS = 'linedogpet.config.v1';
  var memStore = null;             // localStorage 不可用时的降级（等价原版的临时目录退回）

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS); } catch (e) { raw = memStore; }
    var cfg = {};
    for (var k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
    if (raw) {
      try {
        var o = JSON.parse(raw);
        for (var key in o) {
          if (Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) cfg[key] = o[key];
        }
      } catch (e) { /* 坏档：用默认，和原版 try/except 一致 */ }
    }
    for (var c in cfg) cfg[c] = clampOne(c, cfg[c]);
    return cfg;
  }

  var saveTimer = null;
  function save(cfg, immediate) {
    var out = {};
    for (var k in cfg) {
      if (RUNTIME_KEYS.indexOf(k) >= 0) continue;
      out[k] = cfg[k];
    }
    var s = JSON.stringify(out);
    function write() {
      try { localStorage.setItem(LS, s); } catch (e) { memStore = s; }
    }
    if (immediate) { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } write(); return; }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 700);        // 原版 _save_timer 去抖
  }

  /* ---- Qt-ish helpers used across the port ---- */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rnd(a, b) { return a + Math.random() * (b - a); }        // random.uniform
  function rndInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); } // randint
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function hypot(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }
  function now() { return performance.now(); }
  function ms() { return Date.now(); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* QThread-ish：run(fn) 下一帧执行；原版 AIWorker 在子线程，网页用异步任务替代 */
  function defer(fn, msDelay) { setTimeout(fn, msDelay || 0); }

  /* ---- 信号槽（对应 pyqtSignal / .connect / .emit） ---- */
  function Signal() { this._h = []; }
  Signal.prototype.connect = function (fn) { this._h.push(fn); return this; };
  Signal.prototype.disconnect = function (fn) {
    this._h = this._h.filter(function (h) { return h !== fn; });
  };
  Signal.prototype.emit = function () {
    var a = arguments;
    for (var i = 0; i < this._h.length; i++) {
      try { this._h[i].apply(null, a); } catch (e) { console.error('slot', e); }
    }
  };

  /* ---- QTimer 等价：低频节拍，支持 setInterval/单次 ---- */
  function Timer(intervalMs, fn, single) {
    this.ms = intervalMs; this.fn = fn; this.single = !!single; this._id = null;
  }
  Timer.prototype.start = function (msOverride) {
    this.stop();
    if (msOverride) this.ms = msOverride;
    var self = this;
    if (this.single) this._id = setTimeout(function () { self._id = null; self.fn(); }, this.ms);
    else this._id = setInterval(this.fn, this.ms);
  };
  Timer.prototype.stop = function () {
    if (this._id != null) { if (this.single) clearTimeout(this._id); else clearInterval(this._id); this._id = null; }
  };
  Timer.prototype.isActive = function () { return this._id != null; };
  Timer.prototype.setInterval = function (ms) { this.ms = ms; if (this.isActive()) this.start(); };

  /* 单调时钟秒（对应 time.time() 的行为差值） */
  var t0 = Date.now();
  function mono() { return (Date.now() - t0) / 1000 + t0 / 1000; }

  /* ---- 颜色工具（QColor HSV 等价，panels._color_family 需要） ---- */
  function hex2rgb(h) {
    h = (h || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [255, 150, 187];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    function f(v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + f(r) + f(g) + f(b);
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0, s = mx === 0 ? 0 : d / mx, v = mx;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, v];
  }
  function hsv2rgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function shift(hex, dh, ds, dv) {
    var h = rgb2hsv.apply(null, hex2rgb(hex));
    return rgb2hex.apply(null, hsv2rgb(h[0] + (dh || 0), clamp(h[1] + (ds || 0), 0, 1), clamp(h[2] + (dv || 0), 0, 1)));
  }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  function rgba(hex, a) { var c = hex2rgb(hex); return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }

  /* ---- 屏幕/工作区（Qt.screen geometry 等价）---- */
  function desk() {
    var tb = 44;                       // 任务栏高度，等价 Qt availableGeometry 扣掉任务栏
    return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - tb, tb: tb };
  }

  global.Core = {
    APP_VERSION: APP_VERSION, APP_NAME: APP_NAME, APP_CN_NAME: APP_CN_NAME,
    APP_AUTHOR: APP_AUTHOR, APP_EMAIL: APP_EMAIL, APP_WEBSITE: APP_WEBSITE,
    RELEASE_GITHUB: RELEASE_GITHUB, RELEASE_GITEE: RELEASE_GITEE, RELEASE_GITCODE: RELEASE_GITCODE,
    UPDATE_CHECK_URLS: UPDATE_CHECK_URLS, UPDATE_PAGE: UPDATE_PAGE,
    PAWLIVEWALL_URL: PAWLIVEWALL_URL,
    DATA: DATA,                     /* 全量 verbatim 数据表 */
    FPS_PRESETS: FPS_PRESETS, DEFAULT_CONFIG: DEFAULT_CONFIG, RUNTIME_KEYS: RUNTIME_KEYS,
    CLAMP: CLAMP, parseVersionTag: parseVersionTag, clampOne: clampOne,
    load: load, save: save,
    clamp: clamp, rnd: rnd, rndInt: rndInt, choice: choice, shuffle: shuffle, hypot: hypot,
    now: now, ms: ms, mono: mono, $: $, el: el, defer: defer,
    Signal: Signal, Timer: Timer,
    hex2rgb: hex2rgb, rgb2hex: rgb2hex, rgb2hsv: rgb2hsv, hsv2rgb: hsv2rgb, shift: shift, mix: mix, rgba: rgba,
    desk: desk
  };
})(window);
