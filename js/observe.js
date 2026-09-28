/* =============================================================================
 * observe.js — LineDogPet Web port
 * 对应原 smartpet/observe.py（Observe / observe_text / looks_like_code / MusicDetector）
 *
 * 浏览器差异：
 *   - 原版读前台窗口标题 → 网页用"伪窗口标题 + 用户可编辑标题"等价
 *   - 原版枚举进程检测音乐 → 网页用 navigator.mediaSession.metadata + 手动开关
 *   - 原版 winapi.foreground_info() → 网页无此能力，用 document.title 或用户输入
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  if (!Core) throw new Error('observe.js: Core not found');

  var DATA = Core.DATA || {};
  var observe = DATA.observe || {};
  var OBSERVE_RULES = observe.OBSERVE_RULES || [];
  var MUSIC_PLAYERS = observe.MUSIC_PLAYERS || [];
  var MUSIC_PLAYER_CLASSES = observe.MUSIC_PLAYER_CLASSES || [];

  /* ---- observe_text：纯函数，根据窗口标题匹配观察规则 ---- */
  /* 差异：原版读 OS 前台窗口标题，网页用伪窗口标题或 document.title */
  function observe_text(title) {
    if (!title || typeof title !== 'string') return null;
    var t = title.toUpperCase();
    
    /* 遍历 OBSERVE_RULES，每个规则是 [keywords, sentence] */
    for (var i = 0; i < OBSERVE_RULES.length; i++) {
      var rule = OBSERVE_RULES[i];
      if (!rule || rule.length < 2) continue;
      var keywords = rule[0];
      var sentence = rule[1];
      if (!Array.isArray(keywords) || !keywords.length) continue;
      
      /* 检查标题是否包含任一关键词 */
      for (var j = 0; j < keywords.length; j++) {
        var kw = keywords[j];
        if (kw && t.indexOf(kw.toUpperCase()) >= 0) {
          return sentence;
        }
      }
    }
    return null;
  }

  /* ---- looks_like_code：代码检测启发式 ---- */
  /* 差异：与原版完全一致，纯字符串匹配 */
  function looks_like_code(t) {
    if (!t || typeof t !== 'string') return false;
    var marks = [
      'def ', 'import ', 'class ', '=>', 'function', '{', '}', '</',
      '<div', '#include', 'console.', 'print(', 'SELECT ', 'npm ',
      'git ', '->', '::', ' = ', '&&', ';'
    ];
    for (var i = 0; i < marks.length; i++) {
      if (t.indexOf(marks[i]) >= 0) return true;
    }
    /* 多行代码检测：换行符 >= 4 */
    var newlines = t.split('\n').length - 1;
    return newlines >= 4;
  }

  /* ---- Observe：观察管理器 ---- */
  /* 差异：原版监听前台窗口变化，网页用伪窗口标题或用户输入 */
  var Observe = {
    cfg: null,
    _enabled: false,
    _title: '',
    _timer: null,

    init: function (cfg) {
      this.cfg = cfg || {};
    },

    set_enabled: function (on) {
      this._enabled = !!on;
      if (!on && this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    },

    /* 差异：原版自动检测前台窗口，网页需手动设置或监听 document.title */
    set_title: function (title) {
      this._title = title || '';
    },

    /* 获取当前观察文本 */
    get_text: function () {
      if (!this._enabled) return null;
      return observe_text(this._title);
    },

    /* 启动定时检测（可选） */
    start_polling: function (interval_ms) {
      if (this._timer) clearInterval(this._timer);
      var self = this;
      this._timer = setInterval(function () {
        /* 网页可监听 document.title 变化 */
        self._title = document.title || '';
      }, interval_ms || 2000);
    },

    stop_polling: function () {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  };

  /* ---- MusicDetector：音乐检测器 ---- */
  /* 差异：原版枚举进程检测音乐播放器，网页用 navigator.mediaSession + 手动开关 */
  function MusicDetector(cfg) {
    this.cfg = cfg || {};
    this._enabled = false;
    this._current = null;
    this.on_state = null;
    this._poll_timer = null;
  }

  MusicDetector.prototype.set_enabled = function (on) {
    this._enabled = !!on;
    if (!on) {
      this._stop_polling();
      if (this._current !== null) {
        this._current = null;
        if (this.on_state) this.on_state(null);
      }
    } else {
      this._start_polling();
    }
  };

  MusicDetector.prototype._start_polling = function () {
    if (this._poll_timer) return;
    var self = this;
    /* 每 2 秒检测一次 navigator.mediaSession.metadata */
    this._poll_timer = setInterval(function () {
      self._check();
    }, 2000);
    this._check();
  };

  MusicDetector.prototype._stop_polling = function () {
    if (this._poll_timer) {
      clearInterval(this._poll_timer);
      this._poll_timer = null;
    }
  };

  MusicDetector.prototype._check = function () {
    /* 差异：原版枚举进程，网页用 navigator.mediaSession（若存在） */
    var song = null;
    if (typeof navigator !== 'undefined' && navigator.mediaSession && navigator.mediaSession.metadata) {
      var meta = navigator.mediaSession.metadata;
      if (meta && meta.title) {
        song = meta.title;
        if (meta.artist) song = meta.artist + ' - ' + song;
      }
    }
    
    /* 状态变化时触发回调 */
    if (song !== this._current) {
      this._current = song;
      if (this.on_state) this.on_state(song);
    }
  };

  /* 手动设置音乐状态（用户开关） */
  MusicDetector.prototype.set_state = function (song) {
    if (song !== this._current) {
      this._current = song;
      if (this.on_state) this.on_state(song);
    }
  };

  MusicDetector.prototype.dispose = function () {
    this._stop_polling();
    this.on_state = null;
  };

  /* 暴露全局 */
  global.observe_text = observe_text;
  global.looks_like_code = looks_like_code;
  global.Observe = Observe;
  global.MusicDetector = MusicDetector;

})(window);
