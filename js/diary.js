/* =============================================================================
 * diary.js — LineDogPet Web port
 * 对应原 smartpet/diary.py + smartpet/chatdb.py
 * 原版：diary.db / chat_history.db（SQLite）
 * 网页：localStorage 键 linedogpet.diary.v1 / linedogpet.chat.v1（等价降级）
 * ========================================================================== */
(function (global) {
  'use strict';

  var D = (global.Core && Core.DATA && Core.DATA.diary) || {};
  var EVENT_LABELS   = D.EVENT_LABELS   || {};
  var EVENT_SENTENCES = D.EVENT_SENTENCES || {};
  var DIARY_MAX_EVENTS = D.DIARY_MAX_EVENTS || 4;
  var REWARD_TIERS   = D.REWARD_TIERS   || [[3,'贴心小跟班'],[5,'最佳拍档'],[8,'铲屎官认证'],[10,'永远的家人']];
  var WEEKDAYS       = D._WEEKDAYS      || ['一','二','三','四','五','六','日'];

  var DIARY_LS = 'linedogpet.diary.v1';
  var CHAT_LS  = 'linedogpet.chat.v1';

  /* =========================================================================
   * 内部工具
   * ======================================================================= */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function _today_str() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function _now_time_str() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function _parse_date(s) {
    if (!s) return new Date();
    var p = String(s).split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }

  /* date 加减天数，返回新 Date */
  function _shift_date(dateObj, days) {
    var d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }

  function _date_iso(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /* JS weekday(): 0=Sun..6=Sat → 转为原版 0=Mon..6=Sun */
  function _weekday_mon(d) {
    var w = d.getDay(); /* 0=Sun 1=Mon … 6=Sat */
    return (w + 6) % 7; /* Mon=0 … Sun=6 */
  }

  /* =========================================================================
   * 持久化
   * ======================================================================= */

  var _data = null;
  var _mem  = null; /* localStorage 不可用时的降级 */

  function _load() {
    if (_data) return _data;
    var raw = null;
    try { raw = localStorage.getItem(DIARY_LS); } catch (e) { raw = _mem; }
    if (raw) {
      try { _data = JSON.parse(raw); } catch (e) { _data = null; }
    }
    if (!_data) {
      _data = {
        first_day: _today_str(),
        events: [],
        firsts: [],
        meta: {}
      };
    }
    if (!_data.events) _data.events = [];
    if (!_data.firsts) _data.firsts = [];
    if (!_data.meta)   _data.meta   = {};
    if (!_data.first_day) _data.first_day = _today_str();
    return _data;
  }

  function _save() {
    var s = JSON.stringify(_data);
    try { localStorage.setItem(DIARY_LS, s); } catch (e) { _mem = s; }
  }

  function _meta_get(key, def) {
    var d = _load();
    var v = d.meta[key];
    return v !== undefined && v !== null ? v : (def !== undefined ? def : null);
  }

  function _meta_set(key, val) {
    _load();
    _data.meta[key] = String(val);
    _save();
  }

  /* =========================================================================
   * Diary 公开 API
   * ======================================================================= */

  var Diary = {};

  /**
   * log(kind, meta) — 记录一次交互事件。
   * 原版 events 表按 (date, kind) 去重，同类行为当日只记一次。
   * DIARY_MAX_EVENTS 截断由 render_day 控制，此处保留全部事件。
   * meta 可选：{mood:Number, energy:Number}
   */
  Diary.log = function (kind, meta) {
    if (!EVENT_LABELS.hasOwnProperty(kind)) return;
    _load();
    var today = _today_str();

    /* 同日同 kind 去重（等价 INSERT OR IGNORE） */
    for (var i = 0; i < _data.events.length; i++) {
      if (_data.events[i].date === today && _data.events[i].kind === kind) return;
    }

    var ev = {
      date: today,
      kind: kind,
      ts: Math.floor(Date.now() / 1000),
      mood: (meta && meta.mood != null) ? Number(meta.mood) : null,
      energy: (meta && meta.energy != null) ? Number(meta.energy) : null
    };
    _data.events.push(ev);

    /* firsts：同 kind 仅保存首次发生记录 */
    var has_first = false;
    for (var j = 0; j < _data.firsts.length; j++) {
      if (_data.firsts[j].kind === kind) { has_first = true; break; }
    }
    if (!has_first) {
      _data.firsts.push({ kind: kind, date: today, ts: ev.ts });
    }

    _save();
  };

  /**
   * render_day(dateStr) — 生成某天的日记正文（小狗口吻）。
   * 无交互返回空串（UI 显示"今天还没有故事"）。
   * 文案 verbatim 来自 EVENT_SENTENCES / _WEEKDAYS。
   */
  Diary.render_day = function (dateStr) {
    _load();
    var d   = _parse_date(dateStr);
    var dayN = Diary.day_index(dateStr);
    var wd  = WEEKDAYS[_weekday_mon(d)] || '';

    var events = Diary.events_on(dateStr);
    if (!events.length) return '';

    /* 标题: Day N · YYYY年MM月DD日 星期X */
    var title = 'Day ' + dayN + ' \u00B7 ' +
      d.getFullYear() + '\u5E74' + (d.getMonth() + 1) + '\u6708' +
      d.getDate() + '\u65E5 \u661F\u671F' + wd;

    /* 开头 */
    var today = _today_str();
    var opening;
    if (dateStr === today) {
      opening = '\u6C6A\uFF01\u4ECA\u5929\u662F\u6211\u6765\u5230\u4F60\u8EAB\u8FB9\u7684\u7B2C ' + dayN + ' \u5929\u3002';
    } else {
      opening = '\u90A3\u662F\u7B2C ' + dayN + ' \u5929\u3002';
    }

    /* 事件句子（DIARY_MAX_EVENTS 截断） */
    var shown = events.slice(0, DIARY_MAX_EVENTS);
    var body_parts = [];
    for (var i = 0; i < shown.length; i++) {
      var sentence = EVENT_SENTENCES[shown[i].kind] || '\u4ECA\u5929\u4E5F\u6709\u65B0\u9C9C\u4E8B\u3002';
      body_parts.push('\u00B7 ' + sentence);
    }
    if (events.length > DIARY_MAX_EVENTS) {
      body_parts.push('\u00B7 \u4ECA\u5929\u8FD8\u53D1\u751F\u4E86\u597D\u591A\u522B\u7684\u4E8B\uFF08' +
        (events.length - DIARY_MAX_EVENTS) + ' \u4EF6\uFF09\u2026');
    }

    /* 心情行 */
    var mood_vals = [];
    for (var j = 0; j < events.length; j++) {
      if (events[j].mood != null) mood_vals.push(events[j].mood);
    }
    var mood_line;
    if (mood_vals.length > 0) {
      var sum = 0;
      for (var k = 0; k < mood_vals.length; k++) sum += mood_vals[k];
      var avg = sum / mood_vals.length;
      mood_line = avg >= 70 ? '\u4ECA\u5929\u5FC3\u60C5\u5927\u597D\uFF01' : '\u4ECA\u5929\u5F88\u6EE1\u8DB3~';
    } else {
      mood_line = '\u4ECA\u5929\u5F88\u6EE1\u8DB3~';
    }

    /* 拼接：title\n\nopening\n\nbody\n\nmood\n🐾 你的小狗 */
    return title + '\n\n' + opening + '\n\n' +
      body_parts.join('\n') + '\n\n' +
      mood_line + '\n\uD83D\uDC3E \u4F60\u7684\u5C0F\u72D7';
  };

  /** today_str() — 返回 YYYY-MM-DD 格式的今日日期 */
  Diary.today_str = function () { return _today_str(); };

  /**
   * week_summary() — 最近 7 天日记概览。
   * 返回 {days:[{date, day_index, event_count, text}], summary:string}
   */
  Diary.week_summary = function () {
    _load();
    var result = [];
    var today = new Date();
    for (var i = 6; i >= 0; i--) {
      var d = _shift_date(today, -i);
      var ds = _date_iso(d);
      var evts = Diary.events_on(ds);
      var text = '';
      if (evts.length > 0) {
        var parts = [];
        var limit = Math.min(evts.length, DIARY_MAX_EVENTS);
        for (var j = 0; j < limit; j++) {
          parts.push(EVENT_SENTENCES[evts[j].kind] || '');
        }
        text = parts.join(' ');
      }
      result.push({
        date: ds,
        day_index: Diary.day_index(ds),
        event_count: evts.length,
        text: text
      });
    }

    /* 汇总 */
    var total = 0;
    var active = 0;
    for (var k = 0; k < result.length; k++) {
      total += result[k].event_count;
      if (result[k].event_count > 0) active++;
    }
    var summary;
    if (total === 0) {
      summary = '\u8FD9\u5468\u5C0F\u72D7\u8FD8\u6CA1\u6709\u6545\u4E8B\u5462\uFF0C\u591A\u966A\u5B83\u73A9\u73A9\u5427~';
    } else {
      summary = '\u8FD9\u5468\u4E00\u5171\u53D1\u751F\u4E86 ' + total + ' \u4EF6\u4E8B\uFF0C' +
        active + ' \u5929\u6709\u966A\u4F34\u3002';
    }

    return { days: result, summary: summary };
  };

  /**
   * milestones() — 返回 REWARD_TIERS 解锁状态。
   * 每项 {need, name, unlocked, current}
   */
  Diary.milestones = function () {
    _load();
    var n = Diary.firsts_count();
    var result = [];
    for (var i = 0; i < REWARD_TIERS.length; i++) {
      var need = REWARD_TIERS[i][0];
      var name = REWARD_TIERS[i][1];
      var key  = 'reward_' + name;
      var unlocked = _meta_get(key, '0') === '1';
      result.push({ need: need, name: name, unlocked: unlocked, current: n });
    }
    return result;
  };

  /**
   * unlock_tier(n) — 手动解锁第 n 个 REWARD_TIERS 档位。
   * 仅当 firsts_count >= need 时生效。
   */
  Diary.unlock_tier = function (n) {
    _load();
    if (n < 0 || n >= REWARD_TIERS.length) return false;
    var need = REWARD_TIERS[n][0];
    var name = REWARD_TIERS[n][1];
    if (Diary.firsts_count() >= need) {
      _meta_set('reward_' + name, '1');
      return true;
    }
    return false;
  };

  /**
   * stats() — 综合统计。
   */
  Diary.stats = function () {
    _load();
    var total_events = _data.events.length;
    var dates = {};
    for (var i = 0; i < _data.events.length; i++) {
      dates[_data.events[i].date] = true;
    }
    var active_days = 0;
    for (var k in dates) { if (dates.hasOwnProperty(k)) active_days++; }

    return {
      total_events: total_events,
      active_days: active_days,
      streak: Diary.streak_days(),
      firsts_count: Diary.firsts_count(),
      total_kinds: Diary.total_kinds(),
      current_title: Diary.current_title(),
      next_reward: Diary.next_reward(),
      first_day: _data.first_day,
      day_index: Diary.day_index(_today_str()),
      milestone_unlocked: Diary.milestone_unlocked()
    };
  };

  /* ---- 辅助方法（panels / app 可能需要） ---- */

  /** first_day() — 相识基准日（首次启动当天），返回 YYYY-MM-DD */
  Diary.first_day = function () {
    _load();
    return _data.first_day || _today_str();
  };

  /** day_index(dateStr) — 返回 dateStr 是相识后的第几天（Day 1 = 首次启动当天） */
  Diary.day_index = function (dateStr, _d) {
    var d = _d || _parse_date(dateStr);
    var fd = _parse_date(Diary.first_day());
    var diff = Math.floor((d.getTime() - fd.getTime()) / 86400000);
    return diff + 1;
  };

  /** events_on(dateStr) — 某天发生的事件列表 [{kind, mood, energy}]，按 ts 排序 */
  Diary.events_on = function (dateStr) {
    _load();
    var result = [];
    for (var i = 0; i < _data.events.length; i++) {
      var e = _data.events[i];
      if (e.date === dateStr) {
        result.push({ kind: e.kind, mood: e.mood, energy: e.energy, ts: e.ts });
      }
    }
    result.sort(function (a, b) { return a.ts - b.ts; });
    return result;
  };

  /** firsts_count() — 已记录的"第一次"种类数 */
  Diary.firsts_count = function () {
    _load();
    return _data.firsts.length;
  };

  /** total_kinds() — EVENT_LABELS 中的总种类数 */
  Diary.total_kinds = function () {
    var n = 0;
    for (var k in EVENT_LABELS) { if (EVENT_LABELS.hasOwnProperty(k)) n++; }
    return n;
  };

  /** current_title() — 当前已达标称号；未达标返回 null */
  Diary.current_title = function () {
    var n = Diary.firsts_count();
    var title = null;
    for (var i = 0; i < REWARD_TIERS.length; i++) {
      if (n >= REWARD_TIERS[i][0]) title = REWARD_TIERS[i][1];
    }
    return title;
  };

  /** next_reward() — 下一个待解锁称号 [还需数量, 称号]；已全部解锁返回 null */
  Diary.next_reward = function () {
    var n = Diary.firsts_count();
    for (var i = 0; i < REWARD_TIERS.length; i++) {
      if (n < REWARD_TIERS[i][0]) {
        return [REWARD_TIERS[i][0] - n, REWARD_TIERS[i][1]];
      }
    }
    return null;
  };

  /** check_rewards() — 检查并返回本次新解锁的称号列表（自动记录防重复） */
  Diary.check_rewards = function () {
    _load();
    var n = Diary.firsts_count();
    var got = [];
    for (var i = 0; i < REWARD_TIERS.length; i++) {
      var need = REWARD_TIERS[i][0];
      var name = REWARD_TIERS[i][1];
      if (n >= need) {
        var key = 'reward_' + name;
        if (_meta_get(key, '0') !== '1') {
          _meta_set(key, '1');
          got.push(name);
        }
      }
    }
    return got;
  };

  /** milestone_unlocked() — 里程碑入口是否已解锁（隐藏彩蛋） */
  Diary.milestone_unlocked = function () {
    return _meta_get('milestone_unlocked', '0') === '1';
  };

  /** unlock_milestone() — 解锁里程碑入口 */
  Diary.unlock_milestone = function () {
    if (!Diary.milestone_unlocked()) {
      _meta_set('milestone_unlocked', '1');
    }
  };

  /** streak_days() — 连续陪伴天数 */
  Diary.streak_days = function () {
    _load();
    var dateSet = {};
    for (var i = 0; i < _data.events.length; i++) {
      dateSet[_data.events[i].date] = true;
    }
    var keys = [];
    for (var k in dateSet) { if (dateSet.hasOwnProperty(k)) keys.push(k); }
    if (!keys.length) return 0;

    var start = _today_str();
    if (!dateSet[start]) {
      var yest = _date_iso(_shift_date(new Date(), -1));
      if (!dateSet[yest]) return 0;
      start = yest;
    }

    var n = 0;
    var d = _parse_date(start);
    while (dateSet[_date_iso(d)]) {
      n++;
      d = _shift_date(d, -1);
    }
    return n;
  };

  /** firsts() — 所有"第一次"记录 [{kind, date, ts}] */
  Diary.firsts = function () {
    _load();
    var result = [];
    for (var i = 0; i < _data.firsts.length; i++) {
      var f = _data.firsts[i];
      result.push({ kind: f.kind, date: f.date, ts: f.ts });
    }
    result.sort(function (a, b) { return a.ts - b.ts; });
    return result;
  };

  /** all_event_dates() — 所有有事件的日期（正序） */
  Diary.all_event_dates = function () {
    _load();
    var set = {};
    for (var i = 0; i < _data.events.length; i++) {
      set[_data.events[i].date] = true;
    }
    var arr = [];
    for (var k in set) { if (set.hasOwnProperty(k)) arr.push(k); }
    arr.sort();
    return arr;
  };

  /* =========================================================================
   * ChatDB — 聊天记录持久化
   * 对应原 smartpet/chatdb.py（SQLite chat_history.db → localStorage）
   * ======================================================================= */

  var ChatDB = {};
  var _chatData = null;
  var _chatMem  = null;

  function _chat_load() {
    if (_chatData) return _chatData;
    var raw = null;
    try { raw = localStorage.getItem(CHAT_LS); } catch (e) { raw = _chatMem; }
    if (raw) {
      try { _chatData = JSON.parse(raw); } catch (e) { _chatData = null; }
    }
    if (!_chatData) _chatData = { messages: [] };
    if (!_chatData.messages) _chatData.messages = [];
    return _chatData;
  }

  function _chat_save() {
    var s = JSON.stringify(_chatData);
    try { localStorage.setItem(CHAT_LS, s); } catch (e) { _chatMem = s; }
  }

  /** append(role, text) — 追加一条消息 */
  ChatDB.append = function (role, text) {
    _chat_load();
    _chatData.messages.push({ role: role, text: text, ts: Date.now() / 1000 });
    _chat_save();
  };

  /** history(limit) — 返回最近 limit 条消息（正序：旧→新），元素 {role, text} */
  ChatDB.history = function (limit) {
    _chat_load();
    var msgs = _chatData.messages;
    var start = limit ? Math.max(0, msgs.length - limit) : 0;
    var result = [];
    for (var i = start; i < msgs.length; i++) {
      result.push({ role: msgs[i].role, text: msgs[i].text });
    }
    return result;
  };

  /** clear() — 清空聊天记录 */
  ChatDB.clear = function () {
    _chat_load();
    _chatData.messages = [];
    _chat_save();
  };

  /** count() — 消息总数 */
  ChatDB.count = function () {
    _chat_load();
    return _chatData.messages.length;
  };

  /* ---- 暴露全局 ---- */
  global.Diary  = Diary;
  global.ChatDB = ChatDB;

})(window);
