/* =============================================================================
 * app.js — LineDogPet Web Port Orchestrator
 * 对应 smartpet/app.py（PetApp 主控层）
 * 
 * 浏览器限制说明（与原版 Win32/Qt 的差异）：
 * - 无系统托盘 → 用 DOM #traybtn + #menu 模拟
 * - 无 EnumWindows → 只能看到 #win 伪窗口，避让逻辑只对它生效
 * - 无 GetLastInputInfo → 用 keydown/pointermove 统计 idle 秒数
 * - 无 RegisterHotKey → 用 document keydown（仅页面聚焦时生效）
 * - 无剪贴板全局监听 → navigator.clipboard.readText() 需用户手势触发
 * - 无 CPU 监控 → 用打字/点击速率作为"忙碌"代理指标
 * - 无物理/逻辑像素转换 → 直接用 window.innerWidth/innerHeight
 * - 无自启动/注册表 → UI 保留开关但标注"仅本机偏好"
 * ========================================================================== */
(function (global) {
  'use strict';

  var C = global.Core;
  if (!C) { console.error('app.js: Core missing'); return; }

  /* ---- 常量（verbatim from app.md §0）---- */
  var HOTKEY_ID = 53249;
  var CODE_KEYWORDS = [
    'VISUAL STUDIO CODE', 'VSCODE', 'PYCHARM', 'INTELLIJ', 'IDEA',
    'WEBSTORM', 'CURSOR', 'WINDSURF', 'SUBLIME', 'NOTEPAD++', 'GOLAND',
    'CLION', 'RIDERS', 'PHPSTORM', 'RUSTROVER', 'DATAGRIP', 'JETBRAINS',
    'VIM', 'NEOVIM', 'ANDROID STUDIO', 'ECLIPSE', 'DEV-C++', 'CODE -', 'TRAE'
  ];
  var BROWSER_CLASSES = ['Chrome_WidgetWin', 'MozillaWindowClass', 'OperaWindowClass', 'IEFrame', '360se6_Frame', 'msedge '];

  /* ---- 状态 ---- */
  var cfg = null;
  var assets = null;
  var pet = null;
  var extra_pets = [];
  var started = false;

  /* 定时器 */
  var t_1s = null, t_2s = null, t_avoid = null, _save_timer = null;
  var _trim_timer = null, _unlink_timer = null;
  var _tick_count = 0;

  /* 睡眠/感知 */
  var _sleep_level = 0;
  var _fs = false;
  var _high_cpu_streak = 0, _low_cpu_streak = 0;
  var _comp_mode = null;
  var _last_chime_hour = -1;

  /* 避让 */
  var _win_rect = null;

  /* 漫游/掉落 */
  var _next_roam_at = 0;
  var _drop_score = 0.0;
  var _drop_threshold = 110;
  var _drop_gate_at = 0;
  var _drop_cooldown_until = 0;
  var _drop_active = null;

  /* 剪贴板 */
  var _last_clip_hash = '';
  var _clipboard_poll_timer = null;

  /* AI */
  var ai_history = [];
  var _chat_new = [];

  /* 更新检查 */
  var _update_urls = [];
  var _update_idx = 0;
  var _latest_version = '';

  /* 活动感知（等价 GetLastInputInfo）*/
  var _last_activity = C.ms();
  var _click_rate = 0;
  var _click_window = [];

  /* 模块引用 */
  var sound = null, fx = null, paw_canvas = null, step_counter = null;
  var prank = null, shot_bubble = null, drops = null;
  var observe = null, music = null, cursor_pet = null, bongo = null;
  var diary = null, chat_db = null, ai = null, panels = null;

  /* LinkMonitor */
  var _link_channel = null;
  var _link_heartbeat = null;
  var _link_last_ping = 0;

  /* Observe 频控 */
  var _last_observe_at = 0;
  var _last_observe_text = '';

  /* 热键 handler */
  var _hotkey_handler = null;

  /* Trim 计数 */
  var _trim_count = 0;

  /* 页面可见性 */
  var _fx_was_enabled = true;

  /* ---- 工具函数 ---- */
  function $(id) { return C.$(id); }
  function el(tag, cls, html) { return C.el(tag, cls, html); }
  function defer(fn, ms) { return C.defer(fn, ms); }

  function get_idle_seconds() {
    return Math.floor((C.ms() - _last_activity) / 1000);
  }

  function record_activity(e) {
    _last_activity = C.ms();
    var now = C.ms();
    _click_window.push(now);
    while (_click_window.length && _click_window[0] < now - 10000) _click_window.shift();
    _click_rate = _click_window.length / 10;
    if (cursor_pet && e && e.clientX !== undefined) cursor_pet.update(e.clientX, e.clientY);
  }

  function cpu_percent_proxy() {
    if (_click_rate > 5) return 75;
    if (_click_rate > 2) return 50;
    return 30;
  }

  function overlap_area(a, b) {
    var w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    var h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    return w * h;
  }

  function _phys_to_log_rect(rect) {
    if (!rect) return rect;
    return rect;
  }

  function win_title_text() {
    var wt = $('wintitle');
    return wt ? wt.textContent : '';
  }

  /* ---- 定时器（§1）---- */
  function start_timers() {
    t_1s = new C.Timer(1000, _tick_1s);
    t_2s = new C.Timer(2000, _tick_sense);
    t_avoid = new C.Timer(3000, _tick_avoid);
    _trim_timer = new C.Timer(60000, _on_trim_tick);
    t_1s.start();
    t_2s.start();
    t_avoid.start();
    _trim_timer.start();
  }

  function stop_timers() {
    if (t_1s) t_1s.stop();
    if (t_2s) t_2s.stop();
    if (t_avoid) t_avoid.stop();
    if (_trim_timer) _trim_timer.stop();
    if (_unlink_timer) _unlink_timer.stop();
  }

  /* ---- §2: _tick_1s ---- */
  function _tick_1s() {
    _tick_count++;
    cfg.energy = Math.max(0.0, cfg.energy - 0.0007);
    var idle = get_idle_seconds();
    if (idle > 600) cfg.mood = Math.max(0.0, cfg.mood - 0.0008);

    if (cfg.sense_enabled && cfg.sense_time) {
      var h = new Date().getHours();
      pet.night = (h >= 22 || h < 6);
      if (cfg.hourly_chime && cfg.sound_on) {
        var t = new Date();
        if (t.getMinutes() === 0 && h !== _last_chime_hour && pet.is_visible()) {
          _last_chime_hour = h;
          if (sound) sound.play('chime');
          pet.show_bubble('汪~ ' + h + '点啦', 2200);
        } else if (t.getMinutes() !== 0) {
          _last_chime_hour = h;
        }
      }
    } else {
      pet.night = false;
    }

    if (_tick_count % 30 === 0) save_config();
    _maybe_roam();
    _maybe_drop_tick();
    _feed_fx_anchors();
  }

  function _feed_fx_anchors() {
    if (!fx || !fx.set_pet_anchor) return;
    var anchors = [];
    var all_pets = [pet].concat(extra_pets);
    for (var i = 0; i < all_pets.length; i++) {
      var p = all_pets[i];
      var pos = p.pos();
      var sz = p.size();
      anchors.push({
        x: pos.x, y: pos.y, w: sz.w, h: sz.h,
        state: p.state, mood: cfg.mood
      });
    }
    fx.set_pet_anchor(anchors);
  }

  /* ---- §3: _tick_sense ---- */
  function _tick_sense() {
    var sense_on = cfg.sense_enabled !== false;
    var idle = get_idle_seconds();

    if (_sleep_level > 0 && idle < 15) {
      _sleep_level = 0;
      if (pet.wake) pet.wake();
    }

    var fs_now = !!document.fullscreenElement;
    if (sense_on && cfg.fullscreen_shrink) {
      if (fs_now && !_fs) {
        _fs = true;
        pet.hide();
      } else if (!fs_now && _fs) {
        _fs = false;
        pet.show();
      }
      if (fx) fx.set_fullscreen(fs_now || idle > 180);
      _sync_cursor_light();
    }

    if (sense_on && cfg.sense_idle && !_fs) {
      var threshold = pet.night ? 150 : 180;
      var level = 0;
      if (idle >= 600) level = 2;
      else if (idle >= threshold) level = 1;

      if (level > _sleep_level) {
        if (level === 2 && pet.sleeping) {
          if (pet.set_deep) pet.set_deep(true);
        } else {
          if (pet.go_sleep) pet.go_sleep(level === 2);
        }
        _sleep_level = level;
      }
    }

    if (sense_on && cfg.sense_cpu) {
      var cpu = cpu_percent_proxy();
      var busy = cpu > 72;
      var calm = cpu < 40;
      if (busy) { _high_cpu_streak++; _low_cpu_streak = 0; }
      else if (calm) { _low_cpu_streak++; _high_cpu_streak = 0; }

      if (_high_cpu_streak >= 2 && _sleep_level === 0) {
        pet.set_cpu_factor(0.55);
      } else if (_low_cpu_streak >= 2) {
        pet.set_cpu_factor(1.0);
      } else {
        pet.set_cpu_factor(1.0);
      }
    }

    if (sense_on && cfg.sense_window && !_fs && _sleep_level === 0) {
      var kind = _classify();
      if (kind === 'code' && _comp_mode !== 'code') {
        _comp_mode = 'code';
        if (pet.set_companion) pet.set_companion('code');
      } else if (kind === 'browser' && _comp_mode !== 'browser') {
        _comp_mode = 'browser';
        if (pet.set_companion) pet.set_companion(null);
      } else {
        if (_comp_mode !== null) {
          _comp_mode = null;
          if (pet.set_companion) pet.set_companion(null);
        }
      }
    } else {
      if (_comp_mode !== null) {
        _comp_mode = null;
        if (pet.set_companion) pet.set_companion(null);
      }
    }

    if (observe && cfg.observe_enabled) {
      var title = win_title_text();
      if (observe.set_title) observe.set_title(title);
      var now = C.ms() / 1000;
      if (now - _last_observe_at > 45) {
        var text = observe.get_text ? observe.get_text() : null;
        if (text && text !== _last_observe_text) {
          _pet_say(text);
          _last_observe_at = now;
          _last_observe_text = text;
        }
      }
    }
  }

  /* ---- §5: _classify ---- */
  function _classify() {
    var title = win_title_text().toUpperCase();
    for (var i = 0; i < CODE_KEYWORDS.length; i++) {
      if (title.indexOf(CODE_KEYWORDS[i]) >= 0) return 'code';
    }
    var ua = navigator.userAgent;
    for (var j = 0; j < BROWSER_CLASSES.length; j++) {
      if (ua.indexOf(BROWSER_CLASSES[j]) >= 0) {
        if (title.indexOf('VS CODE') >= 0 || title.indexOf('CODE - ') >= 0) return 'code';
        return 'browser';
      }
    }
    return 'other';
  }

  /* ---- §4: _tick_avoid ---- */
  function _tick_avoid() {
    if (_fs) return;
    if (cfg.lock_corner) return;
    if (!(cfg.sense_enabled && cfg.avoid_windows)) return;

    var now = C.ms() / 1000;
    var rects = _win_rect ? [_win_rect] : [];
    if (!rects.length) return;

    var all_pets = [pet].concat(extra_pets);
    for (var i = 0; i < all_pets.length; i++) {
      _avoid_one(all_pets[i], rects, now);
    }
  }

  function _avoid_one(p, rects, now) {
    if (now < (p._next_avoid_at || 0)) return;
    var pos = p.pos();
    var sz = p.size();
    var cx = pos.x + sz.w / 2, cy = pos.y + sz.h / 2;
    var cur_x = window.innerWidth / 2, cur_y = window.innerHeight / 2;
    if (C.hypot(cur_x - cx, cur_y - cy) < 160) {
      p._overlap_streak = 0;
      return;
    }

    if (cfg.follow_mode !== 'off') {
      if (now - (p.last_follow_at || 0) < 1.5) {
        p._overlap_streak = 0;
        return;
      }
    }

    if (p.sleeping) return;
    var pl = pos.x, pt = pos.y, pr = pl + sz.w, pb = pt + sz.h;
    var cur_box = [pl, pt, pr, pb];
    var cur_overlap = 0;
    for (var i = 0; i < rects.length; i++) cur_overlap += overlap_area(cur_box, rects[i]);
    var pet_area = Math.max(1, sz.w * sz.h);

    if (cur_overlap < pet_area * 0.25) {
      p._overlap_streak = 0;
      return;
    }

    p._overlap_streak = (p._overlap_streak || 0) + 1;
    if (p._overlap_streak < 2 || cur_overlap < pet_area * 0.5) return;

    p._overlap_streak = 0;
    var target = _find_free_spot(rects, cur_box, cur_overlap, p);
    if (target) {
      if (p.relocate) p.relocate(target[0], target[1], 20);
      p._next_avoid_at = now + 4.0;
    }
  }

  function _blank_candidates(rects, p) {
    var geo = C.desk();
    var sz = p.size();
    var cw2 = Math.floor(sz.w / 2) + 20, ch2 = Math.floor(sz.h / 2) + 20;
    var candidates = [];

    var gx0 = geo.x + cw2 + 6, gx1 = geo.x + geo.w - cw2 - 6;
    var gy0 = geo.y + ch2 + 6, gy1 = geo.y + geo.h - ch2 - 6;
    if (gx1 > gx0 && gy1 > gy0) {
      for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
          var cx = gx0 + Math.floor((gx1 - gx0) * i / 3);
          var cy = gy0 + Math.floor((gy1 - gy0) * j / 3);
          candidates.push([cx, cy]);
        }
      }
    }

    candidates.push([geo.x + cw2, geo.y + geo.h - ch2]);
    candidates.push([geo.x + geo.w - cw2, geo.y + geo.h - ch2]);
    candidates.push([geo.x + cw2, geo.y + ch2]);
    candidates.push([geo.x + geo.w - cw2, geo.y + ch2]);

    candidates.push([geo.x + cw2, geo.y + Math.floor(geo.h / 2)]);
    candidates.push([geo.x + geo.w - cw2, geo.y + Math.floor(geo.h / 2)]);
    candidates.push([geo.x + Math.floor(geo.w / 2), geo.y + ch2]);
    candidates.push([geo.x + Math.floor(geo.w / 2), geo.y + geo.h - ch2]);

    for (var k = 0; k < 25; k++) {
      var rx = C.rndInt(geo.x + cw2, geo.x + geo.w - cw2);
      var ry = C.rndInt(geo.y + ch2, geo.y + geo.h - ch2);
      candidates.push([rx, ry]);
    }
    return candidates;
  }

  function _find_free_spot(rects, cur_box, cur_overlap, p) {
    if (!p) p = pet;
    if (cur_overlap <= 0) return null;
    var geo = C.desk();
    var sz = p.size();
    var w = sz.w, h = sz.h;
    var cw2 = Math.floor(w / 2) + 20, ch2 = Math.floor(h / 2) + 20;
    var MARGIN = 14;
    var padded = [];
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      padded.push([r[0] - MARGIN, r[1] - MARGIN, r[2] + MARGIN, r[3] + MARGIN]);
    }

    var corners = [
      [geo.x + cw2, geo.y + geo.h - ch2],
      [geo.x + geo.w - cw2, geo.y + geo.h - ch2],
      [geo.x + cw2, geo.y + ch2],
      [geo.x + geo.w - cw2, geo.y + ch2]
    ];

    var candidates = _blank_candidates(rects, p);
    var best = null, best_key = null, best_box = null;
    var pos = p.pos();
    var cur_center_x = pos.x + w / 2, cur_center_y = pos.y + h / 2;

    for (var j = 0; j < candidates.length; j++) {
      var cx = candidates[j][0], cy = candidates[j][1];
      var box = [cx - Math.floor(w / 2), cy - Math.floor(h / 2), cx + Math.floor(w / 2), cy + Math.floor(h / 2)];
      var ov = 0;
      for (var k = 0; k < padded.length; k++) ov += overlap_area(box, padded[k]);
      var dist = Math.abs(cx - cur_center_x) + Math.abs(cy - cur_center_y);
      var key = [ov, dist];
      if (best_key === null || key[0] < best_key[0] || (key[0] === best_key[0] && key[1] < best_key[1])) {
        best_key = key;
        best = [cx, cy];
        best_box = box;
      }
    }

    var pet_area = Math.max(1, w * h);
    if (best_key[0] <= 0 && best_key[1] <= 8) return best;

    var actual_ov = 0;
    for (var m = 0; m < rects.length; m++) actual_ov += overlap_area(best_box, rects[m]);

    if (actual_ov <= pet_area * 0.15 && actual_ov < cur_overlap - pet_area * 0.15) return best;
    if (cur_overlap >= pet_area * 0.4 && actual_ov < cur_overlap - pet_area * 0.1) return best;

    corners.sort(function(a, b) {
      return (Math.abs(a[0] - cur_center_x) + Math.abs(a[1] - cur_center_y)) -
             (Math.abs(b[0] - cur_center_x) + Math.abs(b[1] - cur_center_y));
    });
    for (var n = 0; n < corners.length; n++) {
      var corner = corners[n];
      var cbox = [corner[0] - Math.floor(w / 2), corner[1] - Math.floor(h / 2), corner[0] + Math.floor(w / 2), corner[1] + Math.floor(h / 2)];
      var cov = 0;
      for (var o = 0; o < padded.length; o++) cov += overlap_area(cbox, padded[o]);
      if (cov <= 0) return corner;
    }

    if (actual_ov < cur_overlap) return best;
    return null;
  }

  /* ---- §9: _maybe_roam ---- */
  function _maybe_roam() {
    var now = C.ms() / 1000;
    if (now < _next_roam_at) return;
    _next_roam_at = now + C.rnd(5, 10);

    if (!cfg.roam_enabled) return;
    if (_fs || cfg.lock_corner) return;
    if (pet.state !== 'idle' || pet.sleeping || pet.locked) return;

    var rects = _win_rect ? [_win_rect] : [];
    var spots = _blank_candidates(rects, pet);
    var sz = pet.size();
    var w = sz.w, h = sz.h;
    var geo = C.desk();

    var blanks = [];
    for (var i = 0; i < spots.length; i++) {
      var cx = spots[i][0], cy = spots[i][1];
      if (cx - Math.floor(w / 2) < geo.x || cx + Math.floor(w / 2) > geo.x + geo.w) continue;
      if (cy - Math.floor(h / 2) < geo.y || cy + Math.floor(h / 2) > geo.y + geo.h) continue;
      var box = [cx - Math.floor(w / 2), cy - Math.floor(h / 2), cx + Math.floor(w / 2), cy + Math.floor(h / 2)];
      var overlap = false;
      for (var j = 0; j < rects.length; j++) {
        if (overlap_area(box, rects[j]) > 0) { overlap = true; break; }
      }
      if (!overlap) blanks.push([cx, cy]);
    }

    if (!blanks.length) return;
    var pick = C.choice(blanks);
    if (pet.relocate) pet.relocate(pick[0], pick[1], 2.0);
  }

  /* ---- §10: 掉落系统 ---- */
  function _maybe_drop_tick() {
    var now = C.ms() / 1000;
    if (pet.state === 'walk' || pet.state === 'flee' || pet.state === 'chase') {
      _drop_score = Math.min(999.0, _drop_score + 1.6);
    }

    if (_drop_active !== null) return;
    if (now < _drop_gate_at || now < _drop_cooldown_until) return;
    if (_drop_score < _drop_threshold) return;

    var p = Math.min(0.7, 0.12 + _drop_score / 800.0);
    if (Math.random() > p) return;
    if (pet.sleeping) return;
    if (_fs) return;

    _spawn_drop();
  }

  function _spawn_drop() {
    if (!global.random_item || !drops) return;
    var item_data = global.random_item();
    var name = item_data[0], emoji = item_data[1];

    var pos = pet.pos();
    var sz = pet.size();
    var cx = pos.x + sz.w / 2, cy = pos.y + sz.h / 2;
    var geo = C.desk();

    var dx = C.choice([-1, 1]) * C.rndInt(120, 300);
    var dy = C.rndInt(-60, 160);
    var tx = Math.max(geo.x + 30, Math.min(geo.x + geo.w - 30, cx + dx));
    var ty = Math.max(geo.y + 30, Math.min(geo.y + geo.h - 30, cy + dy));

    var item = drops.spawn(name, emoji, tx, ty);
    if (item) {
      _drop_active = item;
      if (item.sig_picked) item.sig_picked.connect(function(it) { _on_drop_picked(it); });
      if (item.sig_expired) item.sig_expired.connect(function(it) { _on_drop_expired(it); });
    }
    _drop_score = 0.0;
    _drop_threshold = C.rndInt(110, 180);
    _drop_cooldown_until = C.ms() / 1000 + C.rnd(150, 260);
  }

  function _on_drop_picked(item) {
    if (!_drop_active || _drop_active !== item) return;
    _drop_active = null;
    var name = item.item[0], emoji = item.item[1];
    _pet_say('捡到 ' + emoji + ' ' + name + '！');
    if (sound) sound.play('chime');
    if (drops && drops.clear) drops.clear();
  }

  function _on_drop_expired(item) {
    if (_drop_active === item) _drop_active = null;
  }

  /* ---- §11: 交互动作 ---- */
  function feed() {
    cfg.energy = Math.min(100.0, cfg.energy + 35);
    cfg.mood = Math.min(100.0, cfg.mood + 8);
    if (pet.feed) pet.feed();
    save_config();
  }

  function play() {
    cfg.mood = Math.min(100.0, cfg.mood + 18);
    cfg.energy = Math.max(0.0, cfg.energy - 12);
    if (pet.play_with) pet.play_with();
    save_config();
  }

  function start_chase() {
    cfg.mood = Math.min(100.0, cfg.mood + 10);
    cfg.energy = Math.max(0.0, cfg.energy - 6);
    if (pet.start_chase) pet.start_chase();
    save_config();
  }

  function start_hide() {
    cfg.mood = Math.min(100.0, cfg.mood + 10);
    if (pet.start_hide) pet.start_hide();
    save_config();
  }

  function _show_steps() {
    var steps = step_counter ? step_counter.today() : 0;
    if (sound) sound.play('chime');
    var msg;
    if (steps === 0) msg = '今天小狗还没怎么走动呢，多陪它玩玩吧~';
    else if (steps < 200) msg = '今天小狗走了 ' + steps + ' 步，散散步~ 🐾';
    else if (steps < 1000) msg = '今天小狗走了 ' + steps + ' 步，挺精神的！';
    else msg = '今天小狗走了 ' + steps + ' 步，活力满满！🎉';
    pet.show_bubble(msg, cfg.bubble_duration || 3500);
  }

  /* ---- §8: 睡眠/问候/日记 ---- */
  function _pet_go_sleep() {
    if (pet.is_free && pet.is_free()) {
      if (pet.go_sleep) pet.go_sleep(false);
    }
  }

  function _greet() {
    if (!pet.is_visible()) return;
    pet.show_bubble('汪！今天也要加油呀~', 3200);
  }

  function _pet_say(text) {
    if (pet.is_visible() && text) pet.show_bubble(text, 3500);
  }

  function _record_diary(kind, mood, energy) {
    if (diary) diary.log(kind, { mood: mood, energy: energy });
    if (kind === 'feed' || kind === 'play' || kind === 'chase' || kind === 'hide' ||
        kind === 'chin' || kind === 'pet' || kind === 'call' || kind === 'talk' ||
        kind === 'spin' || kind === 'chat') {
      _drop_score = Math.min(999.0, _drop_score + 22.0);
    }
  }

  function _on_milestone_unlocked() {
    if (diary && diary.unlock_milestone) diary.unlock_milestone();
    _pet_say('哇！你发现了我的小秘密~ 里程碑入口开启啦！✨');
  }

  /* ---- §7: 剪贴板 ---- */
  function _on_clipboard(text) {
    if (!text) return;
    var t = (text || '').trim();
    if (!t || t.length > 2000) return;

    var hash = simple_hash(t.substring(0, 2000));
    if (hash === _last_clip_hash) return;
    _last_clip_hash = hash;

    var msg;
    if (global.looks_like_code && global.looks_like_code(t)) {
      msg = '你复制了代码哦~ 不懂可以中键点我问';
    } else {
      var first = t.split('\n')[0].substring(0, 12);
      msg = '你复制了：' + first + (t.length > 12 ? '…' : '');
    }

    pet.sleeping = false;
    if (pet.set_state) pet.set_state('paper', 3200);
    pet.show_bubble(msg, 4200);
  }

  function simple_hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h = h & h;
    }
    return h.toString(16);
  }

  /* ---- §12: AI ---- */
  function handle_chat(text) {
    if (chat_db) chat_db.append('user', text);
    _record_diary('chat', cfg.mood, cfg.energy);

    if (ai && ai.parse) {
      var cmd = ai.parse(text);
      if (cmd && cmd.command) {
        var reply = _run_command(cmd.command);
        if (chat_db) chat_db.append('pet', reply);
        pet.show_bubble(reply, 3500);
        return;
      }
    }

    if (!(cfg.ai_enabled && cfg.ai_key)) {
      if (!cfg.ai_base) {
        var tip = 'AI 还没开启：托盘→设置→AI，填入你自己的 API 就能聊天啦';
        if (chat_db) chat_db.append('sys', tip);
        pet.show_bubble('要先在设置里填 API 哦~', 3200);
        return;
      }
    }

    var context_text = cfg.ai_context ? _ai_context_text() : '';
    ai_history.push({ role: 'user', content: text });

    if (ai && ai.chat) {
      ai.chat(text, context_text, cfg, _ai_replied, _ai_failed);
    }
  }

  function _ai_replied(res) {
    /* ai.js cb_ok 契约为 {reply, command, fallback}；兼容纯字符串 */
    var text = (res && typeof res === 'object') ? String(res.reply || '') : String(res || '');
    if (!text) text = '……';
    ai_history.push({ role: 'assistant', content: text });
    if (ai_history.length > 8) ai_history = ai_history.slice(-8);
    if (chat_db) chat_db.append('pet', text);
    var short = text.length <= 40 ? text : text.substring(0, 40) + '…';
    pet.show_bubble(short, 6000);
    if (res && typeof res === 'object' && res.command) {
      _run_command(res.command);
    }
  }

  function _ai_failed(msg) {
    if (chat_db) chat_db.append('sys', msg);
    pet.show_bubble('我连不上 API，等下再试~', 3200);
  }

  function _ai_context_text() {
    var parts = [];
    var h = new Date().getHours();
    var tod = (h >= 22 || h < 6) ? '深夜' : (h >= 18 ? '傍晚' : '白天');
    parts.push('时段：' + tod);

    var cpu = cpu_percent_proxy();
    var desc = cpu > 72 ? '很高，电脑在忙' : (cpu < 40 ? '偏低，很空闲' : '一般');
    parts.push('CPU负载：' + desc);

    var idle = get_idle_seconds();
    var idle_desc = idle > 180 ? '已经离开/在睡觉' : (idle < 30 ? '正在专注用电脑' : '在电脑前');
    parts.push('用户状态：' + idle_desc);

    if (_comp_mode === 'code') parts.push('用户正在写代码');
    else if (_comp_mode === 'browser') parts.push('用户正在浏览网页');

    if (_fs) parts.push('用户在全屏应用里');
    parts.push('宠物心情' + Math.floor(cfg.mood) + '/体力' + Math.floor(cfg.energy));

    return parts.join('；');
  }

  function _run_command(cmd) {
    var kind = cmd.kind || cmd[0];
    var arg = cmd.arg || cmd[1];
    var r = (global.AI && global.AI.COMMAND_REPLIES) || {};

    if (kind === 'size') {
      cfg.size = Math.max(80, Math.min(260, cfg.size + arg));
      if (pet.replay) pet.replay();
      save_config();
      return arg < 0 ? r.size[0] : r.size[1];
    }
    if (kind === 'hide') { set_pet_visible(false); return r.hide; }
    if (kind === 'show') { set_pet_visible(true); return r.show; }
    if (kind === 'sound') {
      cfg.sound_on = arg;
      if (sound) sound.setEnabled(arg);
      save_config();
      return arg ? r.sound_on : r.sound_off;
    }
    if (kind === 'chase') { start_chase(); return r.chase; }
    if (kind === 'hidegame') { start_hide(); return r.hidegame; }
    if (kind === 'sleep') { if (pet.go_sleep) pet.go_sleep(); return r.sleep; }
    if (kind === 'feed') { feed(); return r.feed; }
    return '好~';
  }

  function open_chat() {
    if (panels && panels.open_chat) {
      panels.open_chat(cfg, {
        on_submit: handle_chat,
        on_msg: function(role, text) { _chat_new.push([role, text, C.ms() / 1000]); },
        on_close: _chat_closed
      });
    }
  }

  function _chat_closed() {
    defer(_release_memory, 600);
  }

  function _save_chat() {
    if (!_chat_new.length) return;
    if (chat_db) {
      for (var i = 0; i < _chat_new.length; i++) {
        chat_db.append(_chat_new[i][0], _chat_new[i][1]);
      }
    }
    _chat_new = [];
  }

  /* ---- §13: 更新检查 ---- */
  function _auto_check_update() {
    _update_urls = (C.UPDATE_CHECK_URLS || []).slice();
    _update_idx = 0;
    _check_next_update();
  }

  function _check_next_update() {
    if (_update_idx >= _update_urls.length) {
      var hint = $('hint');
      if (hint) hint.textContent = '检查更新失败（浏览器可能拦截了跨域请求）';
      return;
    }
    var url = _update_urls[_update_idx++];
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(r) { return r.json(); })
      .then(function(data) { _on_update_reply(data); })
      .catch(function() { _check_next_update(); });
  }

  function _on_update_reply(data) {
    var tag = (data.tag_name || '').trim();
    var latest = C.parseVersionTag(tag);
    if (latest) {
      if (_compare_version(latest, C.APP_VERSION) > 0) {
        _latest_version = latest;
        var hint = $('hint');
        if (hint) {
          hint.innerHTML = '<button style="background:none;border:none;color:inherit;cursor:pointer">发现新版本 v' + latest + '！点击下载</button>';
          hint.firstChild.onclick = function() { window.open(C.UPDATE_PAGE || C.RELEASE_GITEE); };
        }
      }
    } else {
      _check_next_update();
    }
  }

  function _compare_version(a, b) {
    function parse(s) {
      var parts = s.split('.');
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i], 10);
        out.push(isNaN(n) ? 0 : n);
      }
      return out;
    }
    var pa = parse(a), pb = parse(b);
    var n = Math.max(pa.length, pb.length);
    while (pa.length < n) pa.push(0);
    while (pb.length < n) pb.push(0);
    for (var i = 0; i < n; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  }

  /* ---- §14: 热键 ---- */
  function _register_hotkey() {
    if (_hotkey_handler) {
      document.removeEventListener('keydown', _hotkey_handler);
    }
    _hotkey_handler = function(e) {
      if (!cfg.hotkey_on) return;
      var combo = cfg.hotkey || 'Ctrl+Alt+D';
      if (matches_hotkey(e, combo)) {
        e.preventDefault();
        toggle_pet();
      }
    };
    document.addEventListener('keydown', _hotkey_handler);
  }

  function matches_hotkey(e, combo) {
    var parts = combo.toLowerCase().split('+');
    var need_ctrl = parts.indexOf('ctrl') >= 0;
    var need_alt = parts.indexOf('alt') >= 0;
    var need_shift = parts.indexOf('shift') >= 0;
    var key = parts[parts.length - 1];
    if (e.ctrlKey !== need_ctrl) return false;
    if (e.altKey !== need_alt) return false;
    if (e.shiftKey !== need_shift) return false;
    return e.key.toLowerCase() === key;
  }

  /* ---- §15: 多宠 ---- */
  function _make_extra_pet() {
    if (!global.Pet) return null;
    var c = $('pets');
    var p = new global.Pet(assets, cfg, { is_extra: true, container: c });
    if (p._tick_move_timer) p._tick_move_timer.setInterval(80);
    /* 原版：副宠无爪印 tick（p._paw_tick.stop()） */
    if (p._paw_tick_timer) p._paw_tick_timer.stop();
    if (cfg.pet_opacity !== undefined) p.set_opacity(cfg.pet_opacity);
    if (p.set_paw_hooks) p.set_paw_hooks(paw_canvas, step_counter);
    if (p.set_fx) p.set_fx(fx);
    if (p.set_diary_hooks) p.set_diary_hooks(_record_diary);
    p._play('idle');   /* 副宠初始渲染（原版由 place_initial 触发，此处等价） */
    p.show();
    p.start();
    return p;
  }

  function _rebuild_extra_pets(n) {
    n = Math.max(1, Math.min(15, parseInt(n, 10) || 1));
    var want = n - 1;

    while (extra_pets.length > want) {
      var p = extra_pets.pop();
      if (p.dispose) p.dispose();
    }

    while (extra_pets.length < want) {
      var np = _make_extra_pet();
      if (np) extra_pets.push(np);
    }

    _layout_extra_pets();
    _set_classic_visible(!!cfg.classic_enabled);
    cfg.pet_count = n;
  }

  function _layout_extra_pets() {
    var geo = C.desk();
    var sz = pet.size();
    var w = sz.w, h = sz.h;
    var step_x = Math.max(w + 30, 40);
    var step_y = Math.max(h + 20, 40);

    for (var i = 0; i < extra_pets.length; i++) {
      var p = extra_pets[i];
      var col = (i + 1) % 4;
      var row = Math.floor((i + 1) / 4);
      var x = geo.x + 80 + col * step_x;
      var y = geo.y + geo.h - h - 40 - row * step_y;
      x = Math.max(geo.x, Math.min(x, geo.x + geo.w - w));
      y = Math.max(geo.y, Math.min(y, geo.y + geo.h - h));
      p.move(x, y);
    }
  }

  function _set_classic_visible(on) {
    if (on) {
      pet.show();
      for (var i = 0; i < extra_pets.length; i++) extra_pets[i].show();
    } else {
      pet.hide();
      for (var j = 0; j < extra_pets.length; j++) extra_pets[j].hide();
    }
  }

  function toggle_pet() {
    set_pet_visible(!pet.is_visible());
  }

  function set_pet_visible(vis) {
    if (vis) { pet.show(); for (var i = 0; i < extra_pets.length; i++) extra_pets[i].show(); }
    else { pet.hide(); for (var j = 0; j < extra_pets.length; j++) extra_pets[j].hide(); }
  }

  /* ---- §16: 模式切换 ---- */
  function _sync_feature_switches() {
    if (paw_canvas) {
      if (paw_canvas.set_enabled) paw_canvas.set_enabled(cfg.paw_enabled !== false);
      if (paw_canvas.set_fade_sec) paw_canvas.set_fade_sec(cfg.paw_fade_sec || 6);
    }
    if (prank) prank.set_enabled(!!cfg.prank_enabled);
    if (observe) observe.set_enabled(!!cfg.observe_enabled);
    if (music) music.set_enabled(!!cfg.music_enabled);
    if (cursor_pet) {
      cursor_pet.set_enabled(!!cfg.cursor_follow);
      if (cursor_pet.set_config) cursor_pet.set_config(cfg);
    }
    if (fx) {
      fx.set_enabled(cfg.fx_enabled !== false);
      if (fx.set_config) fx.set_config(cfg);
    }
    _sync_cursor_light();
    _apply_modes();
  }

  function _apply_modes() {
    var classic_on = cfg.classic_enabled !== false;
    var bongo_on = !!cfg.bongo_enabled;

    if (bongo) {
      if (bongo.set_mirror) bongo.set_mirror(cfg.bongo_mirror !== false);
      if (bongo.set_size) bongo.set_size(parseInt(cfg.bongo_size, 10) || 440);
      if (bongo.set_opacity) bongo.set_opacity(parseFloat(cfg.bongo_opacity) || 1.0);
      if (bongo.set_click_through) bongo.set_click_through(!!cfg.bongo_click_through);
      bongo.set_enabled(bongo_on);
    }

    _set_classic_visible(classic_on);

    if (classic_on) {
      if (cursor_pet) cursor_pet.set_enabled(!!cfg.cursor_follow);
      if (fx) fx.set_enabled(cfg.fx_enabled !== false);
      _sync_cursor_light();
      if (prank) prank.set_enabled(!!cfg.prank_enabled);
    } else {
      if (cursor_pet) cursor_pet.set_enabled(false);
      if (fx) fx.set_enabled(false);
      if (prank) prank.set_enabled(false);
    }
  }

  function _sync_cursor_light() {
    if (fx && fx.set_cursor_light) fx.set_cursor_light(!cfg.cursor_follow);
  }

  function _on_music_state(song) {
    if (song) {
      if (fx && fx.feed_music) fx.feed_music();
      if (pet.state === 'idle' || pet.state === 'stare' || pet.state === 'groom' || pet.state === 'relax') {
        pet.sleeping = false;
        if (pet.set_state) pet.set_state('happy', 2000);
      }
    } else {
      if (fx && fx.set_music) fx.set_music(false);
    }
  }

  function _on_dark_mode() {
    save_config();
  }

  /* ---- §17: LinkMonitor ---- */
  function setup_link_monitor() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      _link_channel = new BroadcastChannel('linedogpet.link');
      _link_channel.onmessage = function(e) {
        if (e.data && e.data.type === 'ping') {
          _link_last_ping = C.ms();
          _on_link_up();
        }
      };
      _link_channel.postMessage({ type: 'ping' });
      _link_heartbeat = setInterval(function() {
        _link_channel.postMessage({ type: 'ping' });
        if (C.ms() - _link_last_ping > 3000) _on_link_down();
      }, 1000);
    } catch (err) {
      console.warn('LinkMonitor init failed:', err);
    }
  }

  function _on_link_up() {
    if (_unlink_timer) _unlink_timer.stop();
    if (cursor_pet) cursor_pet.set_enabled(!!cfg.cursor_follow);
    if (music) music.set_enabled(!!cfg.music_enabled);
  }

  function _on_link_down() {
    if (!_unlink_timer) _unlink_timer = new C.Timer(1300, _finish_unlink, true);
    _unlink_timer.start();
  }

  function _finish_unlink() {
    if (cursor_pet) cursor_pet.set_enabled(false);
    if (music) music.set_enabled(false);
  }

  /* ---- §5: 迷你状态面板 status_provider（原版 StatusDialog 每秒 refresh） ---- */
  var _session_start = C.ms();

  function _fmt_online(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 60) return m + '分钟';
    var h = Math.floor(m / 60);
    if (h < 24) return h + '小时' + (m % 60) + '分';
    return Math.floor(h / 24) + '天' + (h % 24) + '小时';
  }

  function _status_snapshot() {
    return {
      state: pet ? pet.state : 'idle',
      mood: cfg.mood,
      energy: cfg.energy,
      steps_today: step_counter ? step_counter.today() : 0,
      online_time: _fmt_online(C.ms() - _session_start),
      cpu_factor: pet ? String((pet._cpu_factor || 1).toFixed ? (pet._cpu_factor || 1).toFixed(2) : pet._cpu_factor) : '1.0',
      night_mode: !!(pet && pet.night),
      companion_mode: !!(pet && pet.base_mode === 'work')
    };
  }

  function handle_status_action(kind) {
    if (kind === 'feed') feed();
    else if (kind === 'play') play();
    else if (kind === 'chase') start_chase();
    else if (kind === 'hidegame') start_hide();
  }

  /* ---- §6: 托盘菜单 ---- */
  function build_menu() {
    var menu = $('menu');
    if (!menu) return;
    menu.innerHTML = '';

    var items = [
      { label: '隐藏', action: toggle_pet },
      { label: '设置…', action: function() { if (panels) panels.open_settings(cfg, get_hooks()); } },
      { label: '状态面板…', action: function() { if (panels) panels.open_status(_status_snapshot); } },
      { sep: true },
      { label: '喂食', action: feed },
      { label: '玩耍', action: play },
      { label: '追小球', action: start_chase },
      { label: '躲猫猫', action: start_hide },
      { sep: true },
      { label: '小狗步数…', action: _show_steps },
      { label: '📖小狗日记…', action: function() { if (panels) panels.open_diary(); } },
      { label: '🌟《里程碑》…', action: function() { if (panels) panels.open_milestone(); } },
      { sep: true },
      { label: '退出', action: quit_app }
    ];

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.sep) {
        menu.appendChild(el('hr'));
      } else {
        var btn = el('button', '', it.label);
        btn.style.padding = '12px 10px';
        btn.style.minHeight = '34px';
        btn.onclick = (function(fn) { return function() { fn(); menu.classList.remove('open'); }; })(it.action);
        menu.appendChild(btn);
      }
    }
  }

  function _tray_activated() {
    toggle_pet();
  }

  function _apply_menu_theme() {
    /* 主题由 Panels.apply_theme 统一处理，菜单继承 CSS 变量 */
  }

  /* ---- 伪窗口交互 ---- */
  function setup_window() {
    var win = $('win');
    var winbar = $('winbar');
    var winmax = $('win-max');
    var winclose = $('win-close');
    if (!win || !winbar) return;

    var dragging = false, dx = 0, dy = 0;
    var resizing = false, rw = 0, rh = 0, rx = 0, ry = 0;
    var maximized = false, prev_rect = null;

    winbar.addEventListener('pointerdown', function(e) {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      var rect = win.getBoundingClientRect();
      dx = e.clientX - rect.left;
      dy = e.clientY - rect.top;
      winbar.style.cursor = 'grabbing';
    });

    var handle = el('div', 'resize-handle');
    handle.style.cssText = 'position:absolute;right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;z-index:100;';
    handle.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M14 14 L14 10 M14 14 L10 14 M14 14 L14 6 M14 14 L6 14" stroke="#999" stroke-width="1.5" fill="none"/></svg>';
    win.appendChild(handle);

    handle.addEventListener('pointerdown', function(e) {
      e.stopPropagation();
      resizing = true;
      rw = win.offsetWidth;
      rh = win.offsetHeight;
      rx = e.clientX;
      ry = e.clientY;
    });

    document.addEventListener('pointermove', function(e) {
      if (dragging) {
        var x = e.clientX - dx, y = e.clientY - dy;
        win.style.left = x + 'px';
        win.style.top = y + 'px';
        update_win_rect();
      } else if (resizing) {
        var nw = Math.max(280, rw + (e.clientX - rx));
        var nh = Math.max(130, rh + (e.clientY - ry));
        win.style.width = nw + 'px';
        win.style.height = nh + 'px';
        update_win_rect();
      }
    });

    document.addEventListener('pointerup', function() {
      dragging = false;
      resizing = false;
      winbar.style.cursor = 'grab';
    });

    if (winmax) {
      winmax.addEventListener('click', function() {
        if (maximized) {
          win.style.left = prev_rect.left + 'px';
          win.style.top = prev_rect.top + 'px';
          win.style.width = prev_rect.width + 'px';
          win.style.height = prev_rect.height + 'px';
          maximized = false;
        } else {
          var rect = win.getBoundingClientRect();
          prev_rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          win.style.left = '0';
          win.style.top = '0';
          win.style.width = '100vw';
          win.style.height = 'calc(100vh - 44px)';
          maximized = true;
        }
        update_win_rect();
      });
    }

    if (winclose) {
      winclose.addEventListener('click', function() {
        win.style.display = 'none';
        update_win_rect();
      });
    }

    window.addEventListener('resize', update_win_rect);
    window.addEventListener('scroll', update_win_rect);
    update_win_rect();
  }

  function update_win_rect() {
    var win = $('win');
    if (!win || win.style.display === 'none') { _win_rect = null; return; }
    var rect = win.getBoundingClientRect();
    _win_rect = [rect.left, rect.top, rect.right, rect.bottom];
  }

  /* ---- 任务栏 ---- */
  function setup_taskbar() {
    var traybtn = $('traybtn');
    var taskbtn = $('taskbtn');
    var menu = $('menu');
    var status = $('status');

    if (traybtn) {
      traybtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var rect = traybtn.getBoundingClientRect();
        var menu_rect = menu.getBoundingClientRect();
        var left = rect.left;
        var bottom = window.innerHeight - rect.top + 4;
        if (left + menu_rect.width > window.innerWidth) left = window.innerWidth - menu_rect.width - 8;
        if (bottom + menu_rect.height > window.innerHeight) bottom = window.innerHeight - menu_rect.height - 8;
        menu.style.left = left + 'px';
        menu.style.bottom = bottom + 'px';
        menu.classList.toggle('open');
      });
    }

    if (taskbtn) {
      taskbtn.addEventListener('click', function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        /* 走 panels.open_status：打开即填充内容并每秒刷新，再点关闭 */
        if (panels && panels.open_status) panels.open_status(_status_snapshot);
        else if (status) status.classList.toggle('open');
      });
    }

    document.addEventListener('click', function(e) {
      if (menu && !menu.contains(e.target) && e.target !== traybtn) {
        menu.classList.remove('open');
      }
    });
  }

  /* ---- 活动感知 ---- */
  function setup_activity_tracking() {
    document.addEventListener('keydown', record_activity);
    document.addEventListener('pointermove', record_activity);
    document.addEventListener('pointerdown', record_activity);
  }

  /* ---- 剪贴板 ---- */
  function setup_clipboard() {
    document.addEventListener('paste', function(e) {
      var text = e.clipboardData.getData('text');
      _on_clipboard(text);
    });

    if (cfg.sense_clipboard && navigator.clipboard && navigator.clipboard.readText) {
      _clipboard_poll_timer = setInterval(function() {
        if (document.hasFocus()) {
          navigator.clipboard.readText().then(function(text) {
            _on_clipboard(text);
          }).catch(function() {});
        }
      }, 1000);
    }
  }

  function setup_clipboard_buttons() {
    var winbody = $('winbody');
    if (!winbody) return;
    var btns = winbody.querySelector('.btns');
    if (!btns) return;

    var copy_btn = el('button', 'btn', '📋 复制文本');
    copy_btn.onclick = function() {
      var text = '这是一段测试文本，小狗会观察你复制了什么~';
      _on_clipboard(text);
    };
    btns.appendChild(copy_btn);

    var shot_btn = el('button', 'btn', '📸 截屏');
    shot_btn.onclick = function() {
      if (!cfg.shot_enabled) return;
      var win = $('win');
      if (!win || !shot_bubble) return;
      var rect = win.getBoundingClientRect();
      var pos = pet.pos();
      shot_bubble.show('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9Ijc1IiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk5OSIgZm9udC1zaXplPSIxNCI+5oiR5bGV5Y6FPC90ZXh0Pjwvc3ZnPg==', rect.width, rect.height, pos.x, pos.y);
      pet.show_bubble('截图收到啦~', 2200);
    };
    btns.appendChild(shot_btn);
  }

  /* ---- 配置持久化 ---- */
  function save_config() {
    if (!_save_timer) {
      _save_timer = new C.Timer(3000, function() { C.save(cfg); }, true);
    }
    _save_timer.start();
  }

  function _release_memory(deep) {
    if (global.gc) global.gc();
    if (deep && extra_pets.length > 1) {
      for (var i = 0; i < extra_pets.length; i++) {
        var p = extra_pets[i];
        if (p.clear_cache) p.clear_cache();
      }
    }
  }

  function _on_trim_tick() {
    _trim_count++;
    _release_memory(_trim_count % 2 === 0);
  }

  /* ---- 页面可见性 ---- */
  function setup_visibility() {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        _fx_was_enabled = fx && fx.enabled !== false;
        if (fx) fx.set_enabled(false);
        C.save(cfg, true);
      } else {
        if (fx && _fx_was_enabled) fx.set_enabled(true);
      }
    });

    window.addEventListener('pagehide', function() {
      C.save(cfg, true);
    });
  }

  /* ---- 退出 ---- */
  function quit_app() {
    stop_timers();
    _save_chat();
    C.save(cfg, true);
    if (pet && pet.dispose) pet.dispose();
    for (var i = 0; i < extra_pets.length; i++) {
      if (extra_pets[i].dispose) extra_pets[i].dispose();
    }
    if (fx && fx.dispose) fx.dispose();
    if (paw_canvas && paw_canvas.dispose) paw_canvas.dispose();
    if (cursor_pet && cursor_pet.dispose) cursor_pet.dispose();
    if (bongo && bongo.dispose) bongo.dispose();
    if (_link_channel) _link_channel.close();
    if (_link_heartbeat) clearInterval(_link_heartbeat);
    if (_clipboard_poll_timer) clearInterval(_clipboard_poll_timer);
  }

  /* ---- Hooks for panels ---- */
  function get_hooks() {
    return {
      on_change: function(key, value) {
        cfg[key] = value;
        save_config();

        if (key === 'theme_color' || key === 'dark_mode' || key === 'theme_radius' || key === 'panel_opacity' || key === 'pet_opacity') {
          if (panels && panels.apply_theme) panels.apply_theme(cfg);
        }
        if (key === 'size' || key === 'fps_mode' || key === 'character' || key === 'click_squash_on' || key.indexOf('bubble_') === 0) {
          if (pet && pet.set_config) pet.set_config(cfg);
          if (key === 'character' && pet && pet.replay) pet.replay();
          for (var i = 0; i < extra_pets.length; i++) {
            var ep = extra_pets[i];
            if (ep.set_config) ep.set_config(cfg);
            if (key === 'character' && ep.replay) ep.replay();
          }
        }
        if (key === 'pet_count') _rebuild_extra_pets(value);
        if (key === 'pet_mode' || key === 'classic_enabled' || key.indexOf('bongo_') === 0) _apply_modes();
        if (key.indexOf('cursor_') === 0 && cursor_pet) {
          if (cursor_pet.set_config) cursor_pet.set_config(cfg);
          if (key === 'cursor_size' && cursor_pet.set_size) cursor_pet.set_size(value);
          if (key === 'cursor_gif' && cursor_pet.set_gif) cursor_pet.set_gif(value);
        }
        if (key.indexOf('paw_') === 0 && paw_canvas) {
          if (key === 'paw_enabled' && paw_canvas.set_enabled) paw_canvas.set_enabled(value);
          if (key === 'paw_fade_sec' && paw_canvas.set_fade_sec) paw_canvas.set_fade_sec(value);
        }
        if (key.indexOf('fx_') === 0 && fx && fx.set_config) fx.set_config(cfg);
        if (key === 'sound_on' && sound) sound.setEnabled(value);
        if (key.indexOf('hotkey') === 0) _register_hotkey();
        if (key === 'bongo_size' && bongo && bongo.set_size) bongo.set_size(value);
        if (key === 'bongo_opacity' && bongo && bongo.set_opacity) bongo.set_opacity(value);
        if (key === 'bongo_mirror' && bongo && bongo.set_mirror) bongo.set_mirror(value);
        if (key === 'bongo_click_through' && bongo && bongo.set_click_through) bongo.set_click_through(value);
        if (key === 'avoid_windows' || key === 'lock_corner' || key === 'roam_enabled' || key === 'night_enabled' || key.indexOf('sense_') === 0) {
          if (key === 'lock_corner' && pet && pet.corner_hide) pet.corner_hide(value);
        }

        _sync_feature_switches();
      },
      on_action: function(name, arg) {
        if (name === 'feed') feed();
        else if (name === 'play') play();
        else if (name === 'chase') start_chase();
        else if (name === 'hide') start_hide();
        else if (name === 'chat') open_chat();
        else if (name === 'easter_egg') _on_milestone_unlocked();
        else if (name === 'toggle_bongo') { cfg.bongo_enabled = !cfg.bongo_enabled; _apply_modes(); save_config(); }
        else if (name === 'toggle_classic') { cfg.classic_enabled = !cfg.classic_enabled; _apply_modes(); save_config(); }
        else if (name === 'pet_sleep') _pet_go_sleep();
        else if (name === 'wake') { if (pet.wake) pet.wake(); }
        else if (name === 'restart_check_update') _auto_check_update();
        else if (name === 'reset_config') { cfg = C.load(); _sync_feature_switches(); save_config(); }
        else if (name === 'show_steps') _show_steps();
        else if (name === 'open_website') { if (C.APP_WEBSITE) window.open(C.APP_WEBSITE); }
        else if (name === 'quit') quit_app();
        else if (name === 'sound_test' && sound) sound.play(arg || 'chime');
      },
      get_pet_info: function() {
        return {
          mood: cfg.mood,
          energy: cfg.energy,
          state: pet.state,
          sleeping: pet.sleeping
        };
      },
      refresh: function() {
        _sync_feature_switches();
      }
    };
  }

  /* ---- 启动 ---- */
  function start() {
    if (started) return;
    started = true;

    cfg = C.load();
    assets = new global.AssetIndex();

    if (global.Panels && global.Panels.apply_theme) global.Panels.apply_theme(cfg);

    if (global.Sound) {
      sound = global.Sound;
      sound.setEnabled(cfg.sound_on !== false);
    }

    if (global.EffectEngine) {
      var fx_canvas = $('fx');
      if (fx_canvas) fx = new global.EffectEngine(fx_canvas, cfg);
    }

    if (global.PawCanvas) {
      var paw_el = $('paw');
      if (paw_el) paw_canvas = new global.PawCanvas(paw_el, cfg);
    }

    if (global.StepCounter) step_counter = new global.StepCounter(cfg);
    if (global.Prank) {
      prank = global.Prank;
      if (prank.init) prank.init(cfg, paw_canvas, pet);
    }
    if (global.ShotBubble) shot_bubble = new global.ShotBubble(cfg);
    if (global.Drops) {
      drops = new global.Drops($('scene'), cfg);
    }
    if (global.Observe) {
      observe = global.Observe;
      if (observe.init) observe.init(cfg);
    }
    if (global.MusicDetector) {
      music = new global.MusicDetector(cfg);
      music.on_state = _on_music_state;
    }
    if (global.Diary) diary = global.Diary;
    if (global.ChatDB) chat_db = global.ChatDB;
    if (global.AI) ai = global.AI;
    if (global.Panels) panels = global.Panels;
    if (global.CursorPet) cursor_pet = new global.CursorPet(assets, cfg);
    if (global.Bongo) bongo = new global.Bongo(cfg);

    if (global.Pet) {
      pet = new global.Pet(assets, cfg, { container: $('pets') });
      if (pet.set_paw_hooks) pet.set_paw_hooks(paw_canvas, step_counter);
      if (pet.set_fx) pet.set_fx(fx);
      if (pet.set_diary_hooks) pet.set_diary_hooks(_record_diary);
      if (pet.place_initial) pet.place_initial();
      pet.start();
    }

    _drop_gate_at = C.ms() / 1000 + 300;
    _rebuild_extra_pets(cfg.pet_count || 1);
    build_menu();
    setup_window();
    setup_taskbar();
    setup_activity_tracking();
    setup_clipboard();
    setup_clipboard_buttons();
    setup_link_monitor();
    setup_visibility();
    _register_hotkey();
    start_timers();

    defer(_greet, 900);
    defer(_auto_check_update, 10000);
    defer(function() { _release_memory(false); }, 6000);

    _sync_feature_switches();

    var hint = $('hint');
    if (hint) hint.textContent = C.APP_CN_NAME + ' · 已启动';
  }

  /* ---- 暴露 API ---- */
  global.App = {
    start: start,
    hooks: get_hooks,
    toggle_pet: toggle_pet,
    set_pet_visible: set_pet_visible,
    feed: feed,
    play: play,
    start_chase: start_chase,
    start_hide: start_hide,
    handle_chat: handle_chat,
    quit_app: quit_app,
    set_pet_count: function (n) { _rebuild_extra_pets(n); save_config(); },
    apply_modes: function () { _apply_modes(); },
    apply_theme: function () { if (global.Panels && global.Panels.apply_theme) global.Panels.apply_theme(cfg); },
    update_win_rect: update_win_rect,
    handleStatusAction: handle_status_action,
    simulate_copy: function (text) { _on_clipboard(String(text || '')); },
    mods: {}
  };

  Object.defineProperty(global.App, 'cfg', {
    get: function() { return cfg; },
    enumerable: true
  });

  Object.defineProperty(global.App, 'mods', {
    get: function() {
      return {
        pet: pet, extras: extra_pets, fx: fx, paw: paw_canvas, steps: step_counter,
        prank: prank, shot: shot_bubble, drops: drops, observe: observe, music: music,
        cursor: cursor_pet, bongo: bongo, panels: panels, diary: diary, chatdb: chat_db,
        ai: ai, sound: sound, assets: assets
      };
    },
    enumerable: true
  });

})(window);
