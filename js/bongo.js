/* =============================================================================
 * bongo.js — 移植 smartpet/bongopet.py + framemap.py（架子鼓模式）
 *
 * 原版语义逐函数对应：
 *   BongoPet.__init__(cfg, parent)   -> new Bongo(cfg)
 *   _load(name)                      -> _load(name)
 *   _frame_pm(name)                  -> _frame_pm(name)
 *   set_enabled(on)                  -> set_enabled(on)
 *   is_on()                          -> is_on()
 *   set_mirror(on)                   -> set_mirror(on)
 *   set_size(w)                      -> set_size(px)
 *   set_opacity(o)                   -> set_opacity(v)
 *   set_click_through(on)            -> set_click_through(on)
 *   _place_default()                 -> _place_default()
 *   _on_poll()                       -> _on_poll() / press() / release()
 *   paintEvent                       -> 用 <img> src 切换代替
 *   mousePressEvent / Move / Release -> 拖动逻辑
 *
 * 原版常量（从 disassembly 提取）：
 *   BASE_W = 1276, BASE_H = 1037
 *   DISPLAY_W = 440 (默认 bongo_size)
 *   MIRROR_DEFAULT = true
 *   POLL_MS = 33 (ms)
 *   HOLD = 0.09 (秒，松开后帧保留时间)
 *
 * 网页差异：
 * - 原版用 QPixmap + QPainter 绘制整帧 PNG
 * - 网页用 <img id="bongoimg"> 切换 src
 * - 原版用 winapi.pressed_key_names() 全局轮询按键
 * - 网页用 document keydown/keyup（页面聚焦才有效）
 * - 原版用 QWidget 拖动
 * - 网页用 pointerdown/move/up 在 #bongo 上拖动（无 always-on-top）
 * - 帧素材来自 window.SMARTPET_BONGO（已烘焙的 manifest）
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  var $ = Core.$;
  var BONGO = global.SMARTPET_BONGO || {};

  /* 原版类常量 */
  var BASE_W = 1276;
  var BASE_H = 1037;
  var DISPLAY_W_DEFAULT = 440;
  var MIRROR_DEFAULT = true;
  var POLL_MS = 33;            // 原版轮询间隔
  var HOLD_SEC = 0.09;         // 原版 HOLD 常量（秒）
  var HOLD_MS = Math.round(HOLD_SEC * 1000);  // 90ms

  /* key2png 映射：VK_NAME -> png 文件名 */
  var key2png = BONGO.key2png || {};
  /* idle png */
  var IDLE_PNG = BONGO.idle || 'idle.png';
  /* sizes: png -> [w, h] */
  var sizes = BONGO.sizes || {};

  /**
   * Bongo 构造函数
   * @param {Object} cfg - 配置对象
   */
  function Bongo(cfg) {
    this.cfg = cfg || {};

    /* DOM 元素 */
    this._el = $('bongo');
    this._img = $('bongoimg');
    if (!this._el || !this._img) {
      console.error('Bongo: #bongo 或 #bongoimg 元素未找到');
      return;
    }

    /* 尺寸计算（等价原版 __init__ 的 _dw / _dh） */
    var initW = parseInt((this.cfg && this.cfg.bongo_size) || DISPLAY_W_DEFAULT);
    this._dw = initW;
    this._dh = Math.round(initW * BASE_H / BASE_W);

    /* 状态 */
    this._mirror = !!(this.cfg && (this.cfg.bongo_mirror !== undefined ? this.cfg.bongo_mirror : MIRROR_DEFAULT));
    this._click_through = !!(this.cfg && this.cfg.bongo_click_through);
    this._idle_src = 'assets/bongo/' + IDLE_PNG;
    this._frame_src = null;             // 当前显示的帧 PNG 路径（null 保证首帧真正写入 img.src）
    this._cache = {};                     // png -> HTMLImageElement 缓存
    this._until = 0;                      // 帧保留截止时间戳 (ms)
    this._hit_name = null;                // 当前按下的键对应的 png 名
    this._placed = false;                 // 是否已被用户放置（拖动后 true）
    this._dragging = false;
    this._drag_off_x = 0;
    this._drag_off_y = 0;
    this._enabled = false;

    /* 按键追踪（等价原版 winapi.pressed_key_names()） */
    this._pressed = {};                   // key_name -> true

    /* 帧缓存预热 idle */
    this._preload(IDLE_PNG);

    /* 应用初始设置 */
    this._applySize();
    this._applyMirror();
    this._applyOpacity();
    this._showFrame(this._idle_src);

    /* 绑定事件 */
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    /* 拖动用 */
    this._pollTimer = null;
  }

  /* ---- 公共方法 ---- */

  /**
   * 启用/禁用 Bongo 面板（等价原版 set_enabled）
   */
  Bongo.prototype.set_enabled = function (on) {
    this._enabled = !!on;
    if (on) {
      if (!this._placed) this._place_default();
      this._bindEvents();
      this._startPoll();
      this._el.hidden = false;
      this._el.style.display = '';
      this._frame_src = null;          /* 重新启用时强制重绘当前帧 */
      this._showFrame(this._idle_src);
    } else {
      this._stopPoll();
      this._unbindEvents();
      this._dragging = false;
      this._el.style.display = 'none';
      this._el.hidden = true;
    }
  };

  /**
   * 是否启用（等价原版 is_on）
   */
  Bongo.prototype.is_on = function () {
    return this._enabled;
  };

  /**
   * 设置镜像（等价原版 set_mirror）
   * 变化时清空缓存，重载帧
   */
  Bongo.prototype.set_mirror = function (on) {
    on = !!on;
    if (on === this._mirror) return;
    this._mirror = on;
    this._cache = {};
    this._hit_name = null;
    this._applyMirror();
    this._showFrame(this._idle_src);
  };

  /**
   * 设置显示宽度（等价原版 set_size）
   * 高度按素材比例自动算
   */
  Bongo.prototype.set_size = function (w) {
    w = parseInt(w) || DISPLAY_W_DEFAULT;
    if (w === this._dw) return;
    this._dw = w;
    this._dh = Math.round(w * BASE_H / BASE_W);
    this._applySize();
    this._cache = {};
    this._hit_name = null;
    this._showFrame(this._idle_src);
  };

  /**
   * 设置不透明度（等价原版 set_opacity）
   */
  Bongo.prototype.set_opacity = function (v) {
    this.cfg.bongo_opacity = parseFloat(v);
    this._applyOpacity();
  };

  /**
   * 设置点击穿透（等价原版 set_click_through）
   * 网页差异：用 pointer-events CSS 属性实现
   */
  Bongo.prototype.set_click_through = function (on) {
    on = !!on;
    if (on === this._click_through) return;
    this._click_through = on;
    this._el.style.pointerEvents = on ? 'none' : 'auto';
  };

  /**
   * 设置配置（供外部批量更新）
   */
  Bongo.prototype.set_config = function (cfg) {
    for (var k in cfg) {
      if (Object.prototype.hasOwnProperty.call(cfg, k)) {
        this.cfg[k] = cfg[k];
      }
    }
    if (cfg.bongo_size !== undefined) this.set_size(cfg.bongo_size);
    if (cfg.bongo_mirror !== undefined) this.set_mirror(cfg.bongo_mirror);
    if (cfg.bongo_opacity !== undefined) this.set_opacity(cfg.bongo_opacity);
    if (cfg.bongo_click_through !== undefined) this.set_click_through(cfg.bongo_click_through);
  };

  /**
   * 按下键（等价原版 _on_poll 检测到键按下时的逻辑）
   * @param {string} key_name - VK_NAME（如 'A', 'Space', 'Lft', 'RWn' 等）
   */
  Bongo.prototype.press = function (key_name) {
    if (!key_name) return;
    this._pressed[key_name] = true;

    /* 等价原版 framemap.held() 逻辑：
       - 如果按下 space，优先用 space 的帧
       - 否则遍历非 space 键，找第一个有映射的 */
    var fn = this._heldFrame();
    if (fn) {
      this._hit_name = fn;
      this._until = Core.ms() + HOLD_MS;
      this._showHitFrame();
    }
  };

  /**
   * 松开键（等价原版 _on_poll 检测到键松开后超时回 idle）
   * @param {string} key_name
   */
  Bongo.prototype.release = function (key_name) {
    if (!key_name) return;
    delete this._pressed[key_name];

    /* 如果还有键按着，更新帧 */
    var fn = this._heldFrame();
    if (fn) {
      this._hit_name = fn;
      this._until = Core.ms() + HOLD_MS;
      this._showHitFrame();
    } else {
      /* 无键按着：保留 HOLD_MS 后回 idle */
      /* _on_poll 会检查超时 */
    }
  };

  /**
   * 销毁（清理资源）
   */
  Bongo.prototype.dispose = function () {
    this._stopPoll();
    this._unbindEvents();
    this._cache = {};
    if (this._el) {
      this._el.style.display = 'none';
    }
  };

  /* ---- 内部方法 ---- */

  /**
   * 等价原版 framemap.held(names)：从当前按下的键中决定应播放的帧
   * - space 优先
   * - 否则遍历非 space 键，找第一个有映射的
   * - 未找到返回 null
   */
  Bongo.prototype._heldFrame = function () {
    var keys = Object.keys(this._pressed);
    if (!keys.length) return null;

    /* space 优先 */
    if (this._pressed['space'] || this._pressed['Space']) {
      var spacePng = key2png['space'] || key2png['Space'];
      if (spacePng) return spacePng;
    }

    /* 遍历非 space 键 */
    for (var i = 0; i < keys.length; i++) {
      var name = keys[i];
      if (name === 'space' || name === 'Space') continue;
      var png = key2png[name];
      if (png) return png;
    }

    return null;
  };

  /**
   * 显示敲键帧（等价原版 _on_poll 里的 _frame_pm(_hit_name)）
   */
  Bongo.prototype._showHitFrame = function () {
    if (!this._hit_name) return;
    var png = this._hit_name;
    var src = 'assets/bongo/' + png;
    this._preload(png);
    this._showFrame(src);
  };

  /**
   * 轮询处理（等价原版 _on_poll）
   * 检查超时回 idle
   */
  Bongo.prototype._on_poll = function () {
    var now = Core.ms();

    /* 检查当前帧是否超时 */
    if (!this._heldFrame() && now >= this._until) {
      if (this._hit_name !== null) {
        this._hit_name = null;
        this._showFrame(this._idle_src);
      }
    }
  };

  /**
   * 显示帧（等价原版 paintEvent 的 drawPixmap）
   */
  Bongo.prototype._showFrame = function (src) {
    if (src === this._frame_src) return;
    this._frame_src = src;
    this._img.src = src;
  };

  /**
   * 预加载帧图（等价原版 _frame_pm 的 _cache 逻辑）
   * 按需 new Image() 预热，缓存对象放 Map
   */
  Bongo.prototype._preload = function (png) {
    if (this._cache[png]) return;
    var img = new Image();
    img.src = 'assets/bongo/' + png;
    this._cache[png] = img;
  };

  /**
   * 应用尺寸到 DOM
   */
  Bongo.prototype._applySize = function () {
    this._el.style.width = this._dw + 'px';
    this._el.style.height = this._dh + 'px';
  };

  /**
   * 应用镜像（等价原版 _load 里的 QTransform.scale(-1, 1)）
   * 网页用 CSS .mirror class 做 scaleX(-1)
   */
  Bongo.prototype._applyMirror = function () {
    if (this._mirror) {
      this._el.classList.add('mirror');
    } else {
      this._el.classList.remove('mirror');
    }
  };

  /**
   * 应用不透明度
   */
  Bongo.prototype._applyOpacity = function () {
    var o = parseFloat((this.cfg && this.cfg.bongo_opacity));
    if (isNaN(o)) o = 1.0;
    this._el.style.opacity = String(o);
  };

  /**
   * 默认位置（等价原版 _place_default）
   * 屏幕底部中央
   */
  Bongo.prototype._place_default = function () {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var x = (vw - this._dw) / 2;
    var y = vh - this._dh - 1;
    this._el.style.left = Math.max(0, x) + 'px';
    this._el.style.top = Math.max(0, y) + 'px';
    this._placed = true;
  };

  /* ---- 事件绑定 ---- */

  Bongo.prototype._bindEvents = function () {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this._el.addEventListener('pointerdown', this._onPointerDown);
    /* pointermove/up 在 document 上，以支持拖出元素 */
    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup', this._onPointerUp);
  };

  Bongo.prototype._unbindEvents = function () {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._el.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
  };

  /**
   * keydown 处理（等价原版 winapi.pressed_key_names() 轮询）
   * 把 DOM keyCode 转成 VK_NAME 再 press()
   */
  Bongo.prototype._onKeyDown = function (e) {
    var name = _keyCodeToVKName(e);
    if (!name) return;
    /* 防止重复触发 */
    if (e.repeat) return;
    this.press(name);
  };

  /**
   * keyup 处理
   */
  Bongo.prototype._onKeyUp = function (e) {
    var name = _keyCodeToVKName(e);
    if (!name) return;
    this.release(name);
  };

  /**
   * 窗口失焦时释放所有键（网页特有，等价原版无全局钩子的限制）
   */
  Bongo.prototype._onBlur = function () {
    var keys = Object.keys(this._pressed);
    for (var i = 0; i < keys.length; i++) {
      delete this._pressed[keys[i]];
    }
    this._hit_name = null;
    this._until = 0;
    this._showFrame(this._idle_src);
  };

  /* ---- 拖动（等价原版 mousePressEvent / mouseMoveEvent / mouseReleaseEvent） ---- */

  Bongo.prototype._onPointerDown = function (e) {
    if (e.button !== 0) return;  // 只左键
    /* 如果 click_through 则不处理拖动 */
    if (this._click_through) return;
    this._dragging = true;
    var rect = this._el.getBoundingClientRect();
    this._drag_off_x = e.clientX - rect.left;
    this._drag_off_y = e.clientY - rect.top;
    e.preventDefault();
  };

  Bongo.prototype._onPointerMove = function (e) {
    if (!this._dragging) return;
    var x = e.clientX - this._drag_off_x;
    var y = e.clientY - this._drag_off_y;
    this._el.style.left = x + 'px';
    this._el.style.top = y + 'px';
    e.preventDefault();
  };

  Bongo.prototype._onPointerUp = function (e) {
    if (!this._dragging) return;
    this._dragging = false;
    this._placed = true;
  };

  /* ---- 轮询定时器 ---- */

  Bongo.prototype._startPoll = function () {
    var self = this;
    this._stopPoll();
    this._pollTimer = setInterval(function () {
      self._on_poll();
    }, POLL_MS);
  };

  Bongo.prototype._stopPoll = function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  };

  /* ---- 辅助：DOM keyCode -> VK_NAME 映射 ---- */

  /**
   * 把 DOM KeyboardEvent 转成原版 VK_NAME 字符串
   * 映射来自 data.js 的 winapi.VK_NAME（反向查找）
   */
  var _VK_NAME = ((global.Core && global.Core.DATA && global.Core.DATA.winapi && global.Core.DATA.winapi.VK_NAME) || {});

  /* 构建 keyCode -> VK_NAME 反查表 */
  var _kc_to_name = {};
  (function () {
    for (var code in _VK_NAME) {
      if (Object.prototype.hasOwnProperty.call(_VK_NAME, code)) {
        _kc_to_name[parseInt(code)] = _VK_NAME[code];
      }
    }
  })();

  function _keyCodeToVKName(e) {
    /* 优先用 e.code 映射常见键（更可靠） */
    var code = e.code || '';
    var key = e.key || '';

    /* 特殊键映射（按原版 VK_NAME 的命名） */
    if (code === 'Space' || e.keyCode === 32) return 'space';
    if (code === 'Enter' || e.keyCode === 13) return 'Enter';
    if (code === 'Tab' || e.keyCode === 9) return 'Tab';
    if (code === 'Backspace' || e.keyCode === 8) return 'Bksp';
    if (code === 'Escape' || e.keyCode === 27) return 'Esc';

    /* 方向键 */
    if (code === 'ArrowLeft' || e.keyCode === 37) return 'Lft';
    if (code === 'ArrowUp' || e.keyCode === 38) return 'Up';
    if (code === 'ArrowRight' || e.keyCode === 39) return 'Rgt';
    if (code === 'ArrowDown' || e.keyCode === 40) return 'Ddn';

    /* 修饰键 */
    if (code === 'ShiftLeft' || e.keyCode === 160) return 'LSh';
    if (code === 'ShiftRight' || e.keyCode === 161) return 'RSh';
    if (code === 'ControlLeft' || e.keyCode === 162) return 'LCt';
    if (code === 'ControlRight' || e.keyCode === 163) return 'RCt';
    if (code === 'AltLeft' || e.keyCode === 164) return 'LAl';
    if (code === 'AltRight' || e.keyCode === 165) return 'RAl';
    if (code === 'MetaLeft' || e.keyCode === 91) return 'LWn';
    if (code === 'MetaRight' || e.keyCode === 92) return 'RWn';
    if (code === 'CapsLock' || e.keyCode === 20) return 'Caps';

    /* 字母键 A-Z */
    if (code.indexOf('Key') === 0) {
      var letter = code.charAt(3);
      return letter.toUpperCase();
    }

    /* 数字键 Digit0-9 */
    if (code.indexOf('Digit') === 0) {
      return code.charAt(5);
    }

    /* 标点键 */
    if (code === 'Backquote') return '`';
    if (code === 'Minus') return '-';
    if (code === 'Equal') return '=';
    if (code === 'BracketLeft') return '[';
    if (code === 'BracketRight') return ']';
    if (code === 'Backslash') return '\\';
    if (code === 'Semicolon') return ';';
    if (code === 'Quote') return "'";
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Slash') return '/';

    /* 兜底：用 keyCode 查反查表 */
    var kc = e.keyCode || e.which;
    if (_kc_to_name[kc]) return _kc_to_name[kc];

    /* 单字符键直接用 key */
    if (key && key.length === 1) return key;

    return null;
  }

  /* 导出 */
  global.Bongo = Bongo;

})(window);
