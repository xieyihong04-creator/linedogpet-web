/* =============================================================================
 * cursorpet.js — 移植 smartpet/cursorpet.py（鼠标跟随宠）
 *
 * 原版语义逐函数对应：
 *   __init__(assets, cfg, parent)  -> new CursorPet(assets, cfg)
 *   _render()                      -> _render()
 *   _rescale()                     -> _rescale()
 *   set_character(ch)              -> set_character(ch)
 *   set_size(size)                 -> set_size(px)
 *   force_rerender()               -> force_rerender()
 *   set_enabled(on)                -> set_enabled(on)
 *   _follow()                      -> _follow() / update(x,y)
 *
 * 网页差异：
 * - 原版用 QCursor.pos() 取全局光标位置 + 16ms 定时器跟随
 * - 网页用 pointermove 事件（页面聚焦才有效，注释说明）
 * - 原版用 QLabel + QMovie 逐帧渲染
 * - 网页用 #cursorpet 的 background-image + background-position（与 Movie 一致）
 * - 原版 cursor_custom_gif 读本地文件路径
 * - 网页支持用户上传 GIF/DataURL，存 localStorage 键 linedogpet.cursor.custom
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  var $ = Core.$;

  /* localStorage 键：用户自定义光标宠 GIF（DataURL 或 blob URL） */
  var LS_CUSTOM = 'linedogpet.cursor.custom';

  /* 原版常量（从 disassembly 提取） */
  var CURSOR_SIZE_DEFAULT = 75;
  var CURSOR_SIZE_MIN = 30;
  var CURSOR_SIZE_MAX = 150;
  var OFFSET_X = 10;      // _follow: dx 默认值
  var OFFSET_Y = 12;      // _follow: dy 默认值
  var EDGE_THRESHOLD = 4; // _follow: 距离边缘 < 4px 时翻转

  /**
   * CursorPet 构造函数
   * @param {AssetIndex} assets - 素材索引（必须用 resolve_own，不抽双狗池）
   * @param {Object} cfg - 配置对象（Core.load() 返回）
   */
  function CursorPet(assets, cfg) {
    this.assets = assets;
    this.cfg = cfg || {};
    this._el = $('cursorpet');
    if (!this._el) {
      console.error('CursorPet: #cursorpet element not found');
      return;
    }

    /* 内部状态 */
    this._movie = null;           // 当前 Movie 实例
    this._last_path = '';         // 上次加载的素材路径（避免重复加载）
    this._src_w = 0;              // 原始帧宽
    this._src_h = 0;              // 原始帧高
    this._render_ss = 1;          // DPR 缩放因子
    this._enabled = false;
    this._custom_dataurl = null;  // 用户上传的自定义 GIF DataURL

    /* 从 localStorage 恢复自定义 GIF */
    try {
      var stored = localStorage.getItem(LS_CUSTOM);
      if (stored) this._custom_dataurl = stored;
    } catch (e) { /* localStorage 不可用 */ }

    /* 绑定 pointermove 事件（等价原版 QCursor.pos() + 16ms 定时器） */
    this._onPointerMove = this._onPointerMove.bind(this);
    this._last_x = 0;
    this._last_y = 0;

    /* 初始渲染 */
    this._render();
  }

  /**
   * pointermove 事件处理（等价原版 _follow 的 QCursor.pos() 调用）
   * 注意：网页无法取全局光标位置，只在页面聚焦时有效
   */
  CursorPet.prototype._onPointerMove = function (e) {
    this._last_x = e.clientX;
    this._last_y = e.clientY;
    if (this._enabled) {
      this._follow();
    }
  };

  /**
   * 手动更新位置（供外部调用，等价原版 _follow）
   * @param {number} x - 光标 clientX
   * @param {number} y - 光标 clientY
   */
  CursorPet.prototype.update = function (x, y) {
    this._last_x = x;
    this._last_y = y;
    this._follow();
  };

  /**
   * 启用/禁用跟随（等价原版 set_enabled）
   * @param {boolean} on
   */
  CursorPet.prototype.set_enabled = function (on) {
    this._enabled = !!on;
    if (this._enabled) {
      this._render();
      this._el.style.display = '';
      /* 绑定 pointermove（页面级） */
      document.addEventListener('pointermove', this._onPointerMove);
      this._follow();
    } else {
      document.removeEventListener('pointermove', this._onPointerMove);
      this._el.style.display = 'none';
    }
  };

  /**
   * 设置大小（等价原版 set_size）
   * @param {number} px - 长边像素（30~150）
   */
  CursorPet.prototype.set_size = function (px) {
    px = Math.max(CURSOR_SIZE_MIN, Math.min(CURSOR_SIZE_MAX, parseInt(px) || CURSOR_SIZE_DEFAULT));
    if (px === (this.cfg.cursor_size || CURSOR_SIZE_DEFAULT)) return;
    this.cfg.cursor_size = px;
    this._rescale();
    this._follow();
  };

  /**
   * 设置自定义 GIF（等价原版 cursor_custom_gif 配置）
   * 网页差异：支持 DataURL 或 blob URL，存 localStorage
   * @param {string} name_or_dataurl - GIF 文件名、DataURL 或空字符串清除
   */
  CursorPet.prototype.set_gif = function (name_or_dataurl) {
    if (!name_or_dataurl) {
      this._custom_dataurl = null;
      try { localStorage.removeItem(LS_CUSTOM); } catch (e) {}
    } else if (name_or_dataurl.indexOf('data:') === 0 || name_or_dataurl.indexOf('blob:') === 0) {
      /* DataURL 或 blob URL：直接存储 */
      this._custom_dataurl = name_or_dataurl;
      try { localStorage.setItem(LS_CUSTOM, name_or_dataurl); } catch (e) {}
    } else {
      /* 文件名：网页无法读本地路径，忽略并提示 */
      console.warn('CursorPet.set_gif: 文件名在网页不可用，请上传 DataURL');
      return;
    }
    this._last_path = '';  // 强制重新渲染
    this._render();
  };

  /**
   * 设置角色（等价原版 set_character）
   * @param {string} ch - 角色名（如 'xiaobai'）
   */
  CursorPet.prototype.set_character = function (ch) {
    if (!ch) ch = 'xiaobai';
    this.cfg.character = ch;
    this._last_path = '';
    this._render();
  };

  /**
   * 设置配置（供外部批量更新）
   * @param {Object} cfg
   */
  CursorPet.prototype.set_config = function (cfg) {
    for (var k in cfg) {
      if (Object.prototype.hasOwnProperty.call(cfg, k)) {
        this.cfg[k] = cfg[k];
      }
    }
    this._last_path = '';
    this._render();
  };

  /**
   * 强制重新渲染（等价原版 force_rerender）
   */
  CursorPet.prototype.force_rerender = function () {
    this._last_path = '';
    this._render();
  };

  /**
   * 销毁（清理资源）
   */
  CursorPet.prototype.dispose = function () {
    document.removeEventListener('pointermove', this._onPointerMove);
    if (this._movie) {
      this._movie.dispose();
      this._movie = null;
    }
    if (this._el) {
      this._el.style.backgroundImage = '';
      this._el.style.display = 'none';
    }
  };

  /* ---- 内部方法 ---- */

  /**
   * 渲染素材（等价原版 _render）
   * 逻辑：
   * 1. 优先用自定义 GIF（cursor_custom_gif 或 _custom_dataurl）
   * 2. 否则用 resolve_own('idle', character)
   * 3. 路径未变则跳过
   * 4. 加载 Movie，设置缩放，绑定帧回调
   */
  CursorPet.prototype._render = function () {
    var custom_gif = this.cfg.cursor_custom_gif || '';
    var path;

    /* 1. 自定义 GIF 优先（网页支持 DataURL） */
    if (this._custom_dataurl) {
      path = this._custom_dataurl;
    } else if (custom_gif && (custom_gif.indexOf('data:') === 0 || custom_gif.indexOf('blob:') === 0)) {
      path = custom_gif;
      this._custom_dataurl = custom_gif;
    } else {
      /* 2. 用角色自己的 idle 素材（不抽双狗池） */
      var ch = this.cfg.character || 'xiaobai';
      path = this.assets.resolve_own('idle', ch);
    }

    /* 3. 路径未变则跳过 */
    if (path === this._last_path && this._movie) return;
    this._last_path = path;

    /* 4. 销毁旧 Movie */
    if (this._movie) {
      var old = this._movie;
      this._movie = null;
      old.dispose();
    }

    /* 清空背景 */
    this._el.style.backgroundImage = '';

    if (!path) {
      /* 无素材：设置最小尺寸 */
      var sz = Math.max(CURSOR_SIZE_MIN, parseInt(this.cfg.cursor_size) || CURSOR_SIZE_DEFAULT);
      this._el.style.width = (sz + 8) + 'px';
      this._el.style.height = '40px';
      return;
    }

    /* 5. 创建新 Movie */
    var movie = new global.Movie(path);
    if (!movie.meta) {
      /* 自定义 DataURL 没有 meta，用占位 */
      this._src_w = 300;
      this._src_h = 300;
      this._render_ss = 1;
      this._applySize(300, 300);
      return;
    }

    /* 获取首帧尺寸 */
    var img = new Image();
    var self = this;
    img.onload = function () {
      var w0 = img.naturalWidth || movie.meta.w;
      var h0 = img.naturalHeight || movie.meta.h;
      if (w0 <= 0 || h0 <= 0) { w0 = 300; h0 = 300; }

      /* 计算缩放 */
      var le = Math.max(CURSOR_SIZE_MIN, parseInt(self.cfg.cursor_size) || CURSOR_SIZE_DEFAULT);
      var nh = le;
      var nw = Math.max(1, parseInt(w0 * le / h0));

      /* DPR 处理（网页简化：用 window.devicePixelRatio） */
      var dpr = window.devicePixelRatio || 1;
      var ss = Math.max(2, parseInt(Math.round(dpr)));

      self._src_w = w0;
      self._src_h = h0;
      self._render_ss = ss;

      /* 设置容器尺寸 */
      self._applySize(nw, nh);

      /* 启动 Movie */
      movie.onFrame(function (frame) {
        self._applyFrame(movie, frame, ss);
      });
      movie.start();
      self._movie = movie;
    };
    img.onerror = function () {
      /* 加载失败：用 meta 尺寸 */
      var w0 = movie.meta.w || 300;
      var h0 = movie.meta.h || 300;
      self._src_w = w0;
      self._src_h = h0;
      self._render_ss = 1;
      var le = Math.max(CURSOR_SIZE_MIN, parseInt(self.cfg.cursor_size) || CURSOR_SIZE_DEFAULT);
      var nh = le;
      var nw = Math.max(1, parseInt(w0 * le / h0));
      self._applySize(nw, nh);
      movie.onFrame(function (frame) {
        self._applyFrame(movie, frame, 1);
      });
      movie.start();
      self._movie = movie;
    };
    img.src = 'assets/' + movie.meta.img;
  };

  /**
   * 应用帧到背景（等价原版 _apply_frame）
   * 用 background-position 实现图集步进
   */
  CursorPet.prototype._applyFrame = function (movie, frame, ss) {
    if (!movie || !movie.meta) return;
    var rect = movie.frameRect(frame);
    var bgX = -rect.x * ss;
    var bgY = -rect.y * ss;
    var bgW = movie.meta.cols * movie.meta.w * ss;
    var bgH = movie.meta.rows * movie.meta.h * ss;
    this._el.style.backgroundImage = 'url(assets/' + movie.meta.img + ')';
    this._el.style.backgroundPosition = bgX + 'px ' + bgY + 'px';
    this._el.style.backgroundSize = bgW + 'px ' + bgH + 'px';
    this._el.style.backgroundRepeat = 'no-repeat';
  };

  /**
   * 应用尺寸到容器
   */
  CursorPet.prototype._applySize = function (w, h) {
    this._el.style.width = w + 'px';
    this._el.style.height = h + 'px';
  };

  /**
   * 只缩放（等价原版 _rescale）
   */
  CursorPet.prototype._rescale = function () {
    if (!this._movie || !this._movie.meta) return;
    if (this._src_w <= 0 || this._src_h <= 0) return;

    var le = Math.max(CURSOR_SIZE_MIN, parseInt(this.cfg.cursor_size) || CURSOR_SIZE_DEFAULT);
    var nh = le;
    var nw = Math.max(1, parseInt(this._src_w * le / this._src_h));
    this._applySize(nw, nh);

    /* 重新应用当前帧 */
    if (this._movie) {
      this._applyFrame(this._movie, this._movie.currentFrame(), this._render_ss);
    }
  };

  /**
   * 跟随光标（等价原版 _follow）
   * 逻辑：
   * - 默认偏移 (10, 12) 在光标右下
   * - 靠近右/下边缘时翻转到左上
   * - 限制在屏幕范围内
   */
  CursorPet.prototype._follow = function () {
    if (!this._el) return;

    var pos_x = this._last_x;
    var pos_y = this._last_y;

    /* 视口尺寸（等价原版 availableGeometry） */
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var w = this._el.offsetWidth || 50;
    var h = this._el.offsetHeight || 50;

    var dx = OFFSET_X;
    var dy = OFFSET_Y;

    /* 靠近右边缘：翻转到左侧 */
    if (pos_x + dx + w > vw - EDGE_THRESHOLD) {
      dx = -w - OFFSET_X;
    }

    /* 靠近下边缘：翻转到上方 */
    if (pos_y + dy + h > vh - EDGE_THRESHOLD) {
      dy = -h - OFFSET_Y;
    }

    /* 限制在视口内 */
    var x = Math.max(0, Math.min(vw - w, pos_x + dx));
    var y = Math.max(0, Math.min(vh - h, pos_y + dy));

    this._el.style.left = x + 'px';
    this._el.style.top = y + 'px';
  };

  /* 导出 */
  global.CursorPet = CursorPet;

})(window);
