/* =============================================================================
 * sound.js — 移植 smartpet/assets.py 的 _tone / _silence / SoundManager
 *
 * 逐样本复刻 assets._tone 算法，预渲染为 AudioBuffer 缓存。
 * 差异：原版首次需要时合成 wav 写入临时目录，winsound 异步播放；
 *       网页用 WebAudio API，首次用户手势 unlock() 创建 AudioContext。
 * 差异：原版 SOUNDS_DIR/<name>.wav 自定义音效优先（文件系统）；
 *       网页用 localStorage 键 linedogpet.sound.<name> 存 base64 WAV 等价。
 * ========================================================================== */
(function (global) {
  'use strict';

  var DATA = (global.Core && global.Core.DATA) || global.SMARTPET_DATA || {};
  var SOUNDS = DATA.sounds || {};
  var SAMPLE_RATE = SOUNDS.sampleRate || 22050;
  var LS_PREFIX = 'linedogpet.sound.';

  var _ctx = null;
  var _buffers = {};
  var _enabled = true;
  var _ready = false;

  /* ---- 逐样本复刻 assets._tone ---- */
  function _tone(fr, dur, f0, f1, vol, arch, harmonics) {
    var n = Math.floor(fr * dur);
    var out = new Float32Array(n > 0 ? n : 0);
    if (n <= 0) return out;
    var attack = fr * 0.008;
    for (var i = 0; i < n; i++) {
      var frac = i / Math.max(1, n - 1);
      var freq;
      if (arch) {
        freq = f0 + (f1 || 0) * Math.sin(Math.PI * frac);
      } else {
        freq = f0 + (f1 - f0) * frac;
      }
      var env = Math.min(1.0, i / attack);
      env *= Math.exp(-1.6 * frac);
      if (i > n - attack) {
        env *= (n - i) / attack;
      }
      var val = Math.sin(2 * Math.PI * freq * i / fr);
      for (var h = 0; h < harmonics.length; h++) {
        val += harmonics[h][1] * Math.sin(2 * Math.PI * freq * harmonics[h][0] * i / fr);
      }
      out[i] = vol * env * val;
    }
    return out;
  }

  /* ---- _silence(fr, dur)：全零 ---- */
  function _silence(fr, dur) {
    var n = Math.floor(fr * dur);
    return new Float32Array(n > 0 ? n : 0);
  }

  /* ---- 把多段配方拼接成完整 Float32Array ---- */
  function _renderSound(segments) {
    var totalLen = 0;
    var rendered = [];
    var s, seg, samples;
    for (s = 0; s < segments.length; s++) {
      seg = segments[s];
      if (seg.length <= 1) {
        samples = _silence(SAMPLE_RATE, seg[0]);
      } else {
        samples = _tone(SAMPLE_RATE, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5] || []);
      }
      rendered.push(samples);
      totalLen += samples.length;
    }
    var out = new Float32Array(totalLen);
    var offset = 0;
    for (s = 0; s < rendered.length; s++) {
      out.set(rendered[s], offset);
      offset += rendered[s].length;
    }
    return out;
  }

  /* ---- Float32Array → AudioBuffer（clamp 到 [-1,1]） ---- */
  function _createBuffer(samples) {
    if (!_ctx) return null;
    var buf = _ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    var ch = buf.getChannelData(0);
    for (var i = 0; i < samples.length; i++) {
      var v = samples[i];
      ch[i] = v > 1.0 ? 1.0 : (v < -1.0 ? -1.0 : v);
    }
    return buf;
  }

  /* ---- 差异：原版 SOUNDS_DIR/<name>.wav 自定义音效优先；
   *      网页用 localStorage 里用户上传的 base64 等价实现 ---- */
  function _loadCustom(name) {
    try {
      var b64 = localStorage.getItem(LS_PREFIX + name);
      if (!b64) return null;
      var bin = atob(b64);
      var buf = new ArrayBuffer(bin.length);
      var view = new Uint8Array(buf);
      for (var i = 0; i < bin.length; i++) {
        view[i] = bin.charCodeAt(i);
      }
      return buf;
    } catch (e) {
      return null;
    }
  }

  /* ---- 预渲染全部内置音效（等价原版"首次需要时合成 wav 到临时目录"） ---- */
  function _ensure() {
    if (_ready || !_ctx) return;
    _ready = true;
    var names = ['bark', 'meow', 'chime', 'chirp', 'whine', 'munch'];
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var segments = SOUNDS[name];
      if (!segments || !segments.length) continue;
      var samples = _renderSound(segments);
      if (samples.length === 0) continue;
      var buf = _createBuffer(samples);
      if (buf) _buffers[name] = buf;
    }
  }

  function _playBuffer(name) {
    var buf = _buffers[name];
    if (!buf || !_ctx) return;
    try {
      var src = _ctx.createBufferSource();
      src.buffer = buf;
      src.connect(_ctx.destination);
      src.start(0);
    } catch (e) { /* 静默，等价原版 try/except */ }
  }

  /* ---- 公开 API ---- */
  var Sound = {
    enabled: true,

    /* 首次用户手势里创建 AudioContext（等价原版 winsound 无需初始化） */
    unlock: function () {
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        if (!_ctx) _ctx = new AC();
        if (_ctx.state === 'suspended') _ctx.resume();
        _ensure();
      } catch (e) { /* 静默 */ }
    },

    setEnabled: function (on) {
      _enabled = !!on;
      this.enabled = _enabled;
    },

    /* play(name)：name ∈ bark|meow|chime|chirp|whine|munch
     * enabled=false 或 ctx 未 ready 直接 return（等价原版 try/except 静默） */
    play: function (name) {
      try {
        if (!_enabled || !_ctx) return;
        if (_ctx.state !== 'running') return;

        /* 差异：自定义音效优先（localStorage base64 → decodeAudioData） */
        var customData = _loadCustom(name);
        if (customData) {
          try {
            _ctx.decodeAudioData(customData, function (audioBuf) {
              try {
                var src = _ctx.createBufferSource();
                src.buffer = audioBuf;
                src.connect(_ctx.destination);
                src.start(0);
              } catch (e2) { /* 静默 */ }
            }, function () {
              _ensure();
              _playBuffer(name);
            });
          } catch (e3) {
            _ensure();
            _playBuffer(name);
          }
          return;
        }

        _ensure();
        _playBuffer(name);
      } catch (e) { /* 静默 */ }
    }
  };

  global.Sound = Sound;
})(window);
