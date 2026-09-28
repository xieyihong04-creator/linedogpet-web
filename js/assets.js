/* =============================================================================
 * assets.js — 移植 smartpet/assets.py（AssetIndex + SoundManager 素材侧）
 *
 * 原版语义逐条对应：
 *   pets/<角色>/<动作>/*.gif         -> assets/manifest.js 的键 "<char>/<action>/<file>.gif"
 *   pets/shared/<动作>/*.gif         -> 双狗共享池（不是可选角色）
 *   os.path.exists(p)                -> manifest 中存在该键
 *   QMovie 即用即弃                   -> Movie 按需 new Image，切换时 dispose 释放引用
 *
 * 注意：_pick / _chain / resolve / resolve_own 的分支顺序、概率公式、去重逻辑
 * 均来自 assets.pyc 的真实字节码（tools/disfunc.py assets AssetIndex.*）。
 * ========================================================================== */
(function (global) {
  'use strict';

  var MANIFEST = global.SMARTPET_ASSETS || {};
  var A = (global.Core && global.Core.DATA.assets) || {};
  var DEFAULT_CHAR = A.DEFAULT_CHAR || 'xiaobai';
  var SHARED_DIR = A.SHARED_DIR || 'shared';
  var SHARED_CHANCE = A.SHARED_CHANCE || 0.35;
  var FIXED_GIFS = A.FIXED_GIFS || {};
  var ACTIONS = A.ACTIONS || [];
  var ACTION_FALLBACK = A.ACTION_FALLBACK || {};

  var rnd = global.Core.rnd, choice = global.Core.choice;

  /* os.path.join(PETS_DIRS[0], ...) 后的相对路径形态，用于 manifest 查找 */
  function p() { return Array.prototype.slice.call(arguments).join('/'); }
  function exists(rel) { return Object.prototype.hasOwnProperty.call(MANIFEST, rel); }

  function AssetIndex() {
    this._by = {};        /* (char,action) -> [rel...] */
    this._shared = {};    /* action -> [rel...] */
    this._chars = [];
    this._last = {};      /* (char,action) -> rel，避免连续重复 */
    this._scan();
  }

  /* ---- _scan：只扫一遍路径建索引，驻留内存的只是字符串 ---- */
  AssetIndex.prototype._scan = function () {
    var keys = Object.keys(MANIFEST).sort();          /* sorted(os.listdir) 等价 */
    for (var i = 0; i < keys.length; i++) {
      var rel = keys[i];
      if (!/\.(gif|webp)$/i.test(rel)) continue;      /* 原版只收 .gif，manifest 已是 baked 结果 */
      var seg = rel.split('/');
      if (seg.length < 3) continue;
      var ch = seg[0], act = seg[1];
      var isShared = (ch === SHARED_DIR);
      if (!isShared && this._chars.indexOf(ch) < 0) this._chars.push(ch);
      var bucket = isShared ? this._shared : this._by;
      var key = isShared ? act : ch + '|' + act;
      if (!bucket[key]) bucket[key] = [];            /* if key not in bucket */
      bucket[key].push(rel);
    }
  };

  AssetIndex.prototype.characters = function () { return this._chars.slice(); };

  /* ---- _has_any(character)：该角色是否一张图都没有 ---- */
  AssetIndex.prototype._has_any = function (character) {
    for (var k in this._by) if (k.split('|')[0] === character) return true;
    return false;
  };

  /* ---- _shared_for(action)：该动作的双狗池，为空时沿回退链找近似动作的双狗图 ---- */
  AssetIndex.prototype._shared_for = function (action) {
    var pool = this._shared[action];
    if (pool && pool.length) return pool;
    var fb = ACTION_FALLBACK[action] || [];
    for (var i = 0; i < fb.length; i++) {
      if (this._shared[fb[i]] && this._shared[fb[i]].length) return this._shared[fb[i]];
    }
    return null;
  };

  /* ---- _pick：本角色该动作 与 双狗共享池 之间按概率抽一张 ---- */
  AssetIndex.prototype._pick = function (character, action, allowShared) {
    var own = this._by[character + '|' + action];
    var share = allowShared === false ? null : this._shared_for(action);
    var pool;
    if (own && own.length && share && share.length) {
      var chance = Math.max(SHARED_CHANCE, share.length / (own.length + share.length));
      pool = (Math.random() < chance) ? share : own;
    } else {
      pool = (own && own.length) ? own : (share || null);
    }
    if (!pool || !pool.length) return null;
    var key = character + '|' + action;
    var last = this._last[key];
    var choices = pool.filter(function (x) { return x !== last; });
    if (!choices.length) choices = pool;
    var pick = choice(choices);
    this._last[key] = pick;
    return pick;
  };

  /* ---- _chain：action → ACTION_FALLBACK 近似动作，逐个试 ---- */
  AssetIndex.prototype._chain = function (character, action, tried, allowShared) {
    var seq = [action].concat(ACTION_FALLBACK[action] || ['idle']);
    for (var i = 0; i < seq.length; i++) {
      var a = seq[i];
      var k = character + '|' + a;
      if (tried[k]) continue;
      tried[k] = true;
      var p = this._pick(character, a, allowShared);
      if (p) return p;
    }
    return null;
  };

  /* ---- resolve：角色+动作 -> 真实存在的素材（对默认角色保证兜底成功） ---- */
  AssetIndex.prototype.resolve = function (action, character) {
    var fixed = FIXED_GIFS[action];
    if (fixed) {                                    /* 招牌动作永远固定 shared 那一张 */
      var rel = p(SHARED_DIR, action, fixed);
      if (exists(rel)) return rel;
    }
    var tried = {};
    var isDefault = (character === DEFAULT_CHAR);
    if (!isDefault) {
      /* 自定义角色完全独立：只用自己素材，连双狗池都不参与 */
      var pOwn = this._chain(character, action, tried, false);
      if (pOwn) return pOwn;
      if (!this._has_any(character)) {
        var pDef = this._chain(DEFAULT_CHAR, action, tried, true);
        if (pDef) return pDef;
        if (this._has_any(character)) {             /* 该角色有图但无此动作链 → 随机任一 */
          var pool = [];
          for (var k in this._by) if (k.split('|')[0] === character) pool = pool.concat(this._by[k]);
          if (pool.length) return choice(pool);
        }
      }
    } else {
      var p1 = this._chain(character, action, tried, true);
      if (p1) return p1;
    }
    var p2 = this._chain(DEFAULT_CHAR, action, tried, true);
    if (p2) return p2;
    var p3 = this._pick(DEFAULT_CHAR, 'idle', false);
    return p3 || '';
  };

  /* ---- resolve_own：只用该角色自己的素材（鼠标跟随宠，避免双狗同框） ---- */
  AssetIndex.prototype.resolve_own = function (action, character) {
    var tried = {};
    var p = this._chain(character, action, tried, false);
    if (p) return p;
    if (character !== DEFAULT_CHAR && !this._has_any(character)) {
      p = this._chain(DEFAULT_CHAR, action, tried, true);
      if (!p) p = this._pick(DEFAULT_CHAR, 'idle', false);
    }
    return p || '';
  };

  /* ==========================================================================
   * Movie —— QMovie 等价：按需加载图集、jumpToFrame / setSpeed / frameChanged
   * 同一时刻只保留当前一个动画（原版“QMovie 绝不缓存”）。
   * ======================================================================== */
  function Movie(rel) {
    this.rel = rel;
    this.meta = MANIFEST[rel] || null;
    this._img = null;
    this._frame = 0;
    this._speed = 100;
    this._timer = null;
    this._subs = [];
    this.finished = false;
    this.frameCount = this.meta ? this.meta.count : 1;
    this.stateCount = this.frameCount;
  }
  Movie.prototype.frameRect = function (i) {
    var m = this.meta;
    if (!m) return { x: 0, y: 0, w: 0, h: 0 };
    var c = i % m.cols, r = Math.floor(i / m.cols);
    return { x: c * m.w, y: r * m.h, w: m.w, h: m.h };
  };
  Movie.prototype.size = function () { return this.meta ? [this.meta.w, this.meta.h] : [0, 0]; };
  Movie.prototype.speedDelay = function (i) {
    var d = (this.meta && this.meta.delay[i % this.frameCount]) || 0;
    if (d <= 0) d = 100;                              /* GIF 0 延迟：原版兜底 100ms */
    return d * 100 / (this._speed || 100);
  };
  Movie.prototype.setSpeed = function (pct) {
    this._speed = pct || 100;
    if (this._timer) this._startTimer();              /* 重排当前帧的剩余时间 */
  };
  Movie.prototype.jumpToFrame = function (i) { this._frame = i % this.frameCount; this._emit(); };
  Movie.prototype.currentFrame = function () { return this._frame; };
  Movie.prototype.frameChanged = { };
  Movie.prototype.onFrame = function (fn) { this._subs.push(fn); };
  Movie.prototype._emit = function () {
    for (var i = 0; i < this._subs.length; i++) { try { this._subs[i](this._frame); } catch (e) { console.error(e); } }
  };
  Movie.prototype._startTimer = function () {
    var self = this;
    clearTimeout(this._timer);
    var d = this.speedDelay(this._frame);
    this._timer = setTimeout(function () {
      self._frame = (self._frame + 1) % self.frameCount;
      self._emit();
      self._startTimer();
    }, d);
  };
  Movie.prototype.start = function () {
    if (!this.meta) { this._emit(); return; }
    /* 预热图片：加载完成后开始逐帧推进（即用即弃的“用”） */
    var self = this;
    if (!this._img) {
      this._img = new Image();
      this._img.onload = function () { self._startTimer(); };
      this._img.onerror = function () { self._startTimer(); };
      this._img.src = 'assets/' + self.meta.img;
    } else if (this._img.complete) {
      this._startTimer();
    }
    this._emit();
  };
  Movie.prototype.stop = function () { clearTimeout(this._timer); this._timer = null; };
  /* 原版：切换即销毁旧的，内存里同一时刻只有一个动画 */
  Movie.prototype.dispose = function () {
    this.stop();
    this._subs.length = 0;
    if (this._img) { this._img.onload = this._img.onerror = null; this._img.src = ''; }
    this._img = null;
    this.disposed = true;
  };

  global.Movie = Movie;
  global.AssetIndex = AssetIndex;
  global.ASSET_MANIFEST = MANIFEST;
})(window);
