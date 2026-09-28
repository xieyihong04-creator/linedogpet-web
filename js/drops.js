/* =============================================================================
 * drops.js — LineDogPet Web port
 * 对应原 smartpet/drops.py（DroppedItem / random_item / Drops）
 *
 * 浏览器差异：
 *   - 原版 QWidget 独立窗口 → 网页用 fixed div + pointer-events:auto
 *   - 原版 pyqtSignal → Core.Signal 或回调
 *   - 原版 QTimer → setInterval / setTimeout
 * ========================================================================== */
(function (global) {
  'use strict';

  var Core = global.Core;
  if (!Core) throw new Error('drops.js: Core not found');

  var DATA = Core.DATA || {};
  var drops = DATA.drops || {};
  var DROP_LIBRARY = drops.DROP_LIBRARY || [];
  var LIFETIME_MS = drops.LIFETIME_MS || 180000;

  /* ---- random_item：随机掉落物 ---- */
  function random_item() {
    if (!DROP_LIBRARY.length) return ['星星', '⭐'];
    var idx = Math.floor(Math.random() * DROP_LIBRARY.length);
    return DROP_LIBRARY[idx];
  }

  /* ---- DroppedItem：单个掉落物 ---- */
  /* 差异：原版 QWidget 54x54，网页用 div 54x54 */
  function DroppedItem(name, emoji, cx, cy, container) {
    this.item = [name, emoji];
    this._picked = false;
    this._anchor_y = cy;
    this._offset = 0;
    this._dir = 1;
    this._FLOAT_AMP = 3;

    /* DOM 元素 */
    this.el = document.createElement('div');
    this.el.className = 'dropped-item';
    this.el.style.cssText = 'position:absolute;width:54px;height:54px;' +
      'font:26pt "Segoe UI Emoji","Microsoft YaHei",sans-serif;' +
      'background:rgba(255,250,245,210);border-radius:27px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'cursor:pointer;user-select:none;z-index:1000;' +
      'box-shadow:0 2px 6px rgba(0,0,0,0.1);';
    this.el.textContent = emoji;
    this.el.style.left = (cx - 27) + 'px';
    this.el.style.top = (cy - 27) + 'px';

    /* 信号 */
    this.sig_picked = new Core.Signal();
    this.sig_expired = new Core.Signal();

    /* 点击事件 */
    var self = this;
    this.el.addEventListener('click', function (e) {
      if (!self._picked) {
        self._picked = true;
        self.sig_picked.emit(self);
      }
    });

    /* 漂浮动画 */
    this._pulse = setInterval(function () { self._float_step(); }, 110);

    /* 生命周期 */
    this._life = setTimeout(function () { self._expire(); }, LIFETIME_MS);

    /* 添加到容器 */
    if (container) container.appendChild(this.el);
  }

  DroppedItem.prototype._float_step = function () {
    this._offset += this._dir;
    if (this._offset >= this._FLOAT_AMP) {
      this._dir = -1;
    } else if (this._offset <= -this._FLOAT_AMP) {
      this._dir = 1;
    }
    this.el.style.top = (this._anchor_y + this._offset - 27) + 'px';
  };

  DroppedItem.prototype.collect = function () {
    this._picked = true;
    clearInterval(this._pulse);
    clearTimeout(this._life);
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  };

  DroppedItem.prototype._expire = function () {
    clearInterval(this._pulse);
    if (!this._picked) {
      this.sig_expired.emit(this);
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
  };

  /* ---- Drops：掉落物管理器 ---- */
  function Drops(container, cfg) {
    this.container = container;
    this.cfg = cfg || {};
    this._active = null;
  }

  Drops.prototype.spawn = function (name, emoji, x, y) {
    if (this._active) return null;
    var item = new DroppedItem(name, emoji, x, y, this.container);
    this._active = item;
    return item;
  };

  Drops.prototype.clear = function () {
    if (this._active) {
      this._active.collect();
      this._active = null;
    }
  };

  /* 暴露全局 */
  global.random_item = random_item;
  global.Drops = Drops;
  global.DroppedItem = DroppedItem;

})(window);
