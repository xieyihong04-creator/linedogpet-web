/* =============================================================================
 * panels.js — LineDogPet Web port
 * 对应原 smartpet/panels.py（设置面板 / 主题引擎 / 状态 / 对话 / 日记 / 里程碑）
 * 差异：QSS → CSS 变量注入；QTabWidget → .tabs；ToggleSwitch → .sw；
 *       QKeySequenceEdit → 自定义快捷键捕获；Win32 mutex → 不可用，联动 tab 简化
 * ========================================================================== */
(function (global) {
  'use strict';

  var C = global.Core;
  var $ = C.$;
  var el = C.el;

  /* ======================================================================
   * 1. _color_family(base, dark) — HSV 派生 25+ 键，公式 verbatim 自 panels.md
   * ====================================================================== */
  function colorFamily(base, dark) {
    var rgb = C.hex2rgb(base);
    var hsvArr = C.rgb2hsv(rgb[0], rgb[1], rgb[2]);
    var h = Math.round(hsvArr[0]);
    var s = Math.round(hsvArr[1] * 255);
    var v = Math.round(hsvArr[2] * 255);

    function hsv(hh, ss, vv) {
      var hMod = ((hh % 360) + 360) % 360;
      var sClamped = Math.min(255, Math.max(0, Math.round(ss)));
      var vClamped = Math.min(255, Math.max(0, Math.round(vv)));
      var sNorm = sClamped / 255;
      var vNorm = vClamped / 255;
      var out = C.hsv2rgb(hMod, sNorm, vNorm);
      return C.rgb2hex(out[0], out[1], out[2]);
    }

    if (dark) {
      return {
        main:       hsv(h, Math.max(35, s), Math.min(255, v + 20)),
        dark:       hsv(h, Math.min(255, s + 60), 30),
        darker:     hsv(h, Math.min(255, s + 40), 20),
        bg:         hsv(h, Math.max(5, Math.floor(s / 6)), 17),
        bg2:        hsv(h, Math.max(6, Math.floor(s / 7)), 22),
        input:      hsv(h, Math.max(6, Math.floor(s / 7)), 27),
        border:     hsv(h, Math.max(18, Math.floor(s / 2)), 52),
        border2:    hsv(h, Math.max(15, Math.floor(s / 2)), 60),
        hover:      hsv(h, Math.min(255, s + 30), Math.min(255, v + 60)),
        pressed:    hsv(h, Math.max(30, s), Math.max(30, v - 30)),
        disabled:   hsv(h, 10, 42),
        disabled_t: hsv(h, 10, 118),
        flat:       hsv(h, Math.max(12, Math.floor(s / 4)), 30),
        flat_h:     hsv(h, Math.max(22, Math.floor(s / 3)), 42),
        flat_text:  hsv(h, 25, 212),
        text:       hsv(h, 18, 236),
        text2:      hsv(h, 10, 200),
        tab_sel:    hsv(h, Math.min(255, s + 40), 238),
        tab_text:   hsv(h, Math.min(255, s + 20), 185),
        hint:       hsv(h, 28, 190),
        slider_g:   hsv(h, Math.max(10, Math.floor(s / 3)), 52),
        slider_s:   hsv(h, Math.min(255, s + 20), Math.min(255, v + 30)),
        scroll:     hsv(h, 15, 58),
        scroll_h:   hsv(h, 25, 82),
        selection:  hsv(h, Math.min(255, s + 20), Math.min(255, v + 30)),
        group_t:    hsv(h, Math.min(255, s + 50), Math.max(50, v - 50))
      };
    }
    /* light mode */
    return {
      main:       hsv(h, s, v),
      dark:       hsv(h, Math.min(255, s + 50), Math.max(70, v - 50)),
      darker:     hsv(h, Math.min(255, s + 80), Math.max(50, v - 80)),
      bg:         hsv(h, Math.max(8, Math.floor(s / 5)), 250),
      bg2:        hsv(h, Math.max(5, Math.floor(s / 6)), 252),
      input:      hsv(h, 0, 255),
      border:     hsv(h, Math.max(20, Math.floor(s / 2)), 225),
      border2:    hsv(h, Math.max(15, Math.floor(s / 2)), 235),
      hover:      hsv(h, Math.min(255, s + 10), Math.max(100, v - 10)),
      pressed:    hsv(h, Math.min(255, s + 40), Math.max(70, v - 40)),
      disabled:   hsv(h, Math.max(10, Math.floor(s / 4)), 235),
      disabled_t: hsv(h, Math.max(20, Math.floor(s / 3)), 200),
      flat:       hsv(h, Math.max(15, Math.floor(s / 4)), 245),
      flat_h:     hsv(h, Math.max(20, Math.floor(s / 3)), 235),
      flat_text:  hsv(h, Math.min(255, s + 30), Math.max(80, v - 40)),
      text:       hsv(h, Math.min(255, s + 60), Math.max(40, v - 70)),
      text2:      hsv(h, Math.min(255, s + 70), Math.max(30, v - 80)),
      tab_sel:    hsv(h, Math.min(255, s + 40), Math.max(80, v - 40)),
      tab_text:   hsv(h, Math.min(255, s + 30), Math.max(90, v - 50)),
      hint:       hsv(h, Math.min(255, s + 20), Math.max(100, v - 30)),
      slider_g:   hsv(h, Math.max(30, Math.floor(s / 2)), 230),
      slider_s:   hsv(h, Math.min(255, s + 10), Math.max(100, v - 10)),
      scroll:     hsv(h, Math.max(30, Math.floor(s / 2)), 220),
      scroll_h:   hsv(h, Math.max(40, Math.floor(s / 2)), 200),
      selection:  hsv(h, Math.min(255, s + 20), Math.max(120, v - 20)),
      group_t:    hsv(h, Math.min(255, s + 50), Math.max(70, v - 50))
    };
  }

  /* ======================================================================
   * 2. apply_theme(cfg) — 把 generate_style() 的 QSS 等价翻译为 CSS 变量注入
   * ====================================================================== */
  function applyTheme(cfg) {
    cfg = cfg || {};
    var themeColor = cfg.theme_color || '#ff96bb';
    var radius = parseInt(cfg.theme_radius, 10) || 8;
    var opacity = parseFloat(cfg.panel_opacity != null ? cfg.panel_opacity : 1.0);
    var dark = !!cfg.dark_mode;
    var c = colorFamily(themeColor, dark);

    var root = document.documentElement;
    root.style.setProperty('--pri', c.main);
    root.style.setProperty('--bg', c.bg);
    root.style.setProperty('--card', c.bg2);
    root.style.setProperty('--inp', c.input);
    root.style.setProperty('--bd', c.border);
    root.style.setProperty('--tx', c.text);
    root.style.setProperty('--tx2', c.text2);
    root.style.setProperty('--tx3', c.hint);
    root.style.setProperty('--r', radius + 'px');
    root.style.setProperty('--head', c.flat);
    root.style.setProperty('--bar', c.bg2);
    root.style.setProperty('--sw', c.slider_g);
    root.style.setProperty('--paper', dark ? '#241a22' : '#fffafc');

    /* panel opacity — apply to #dlg and #status */
    var dlg = $('dlg');
    if (dlg) dlg.style.opacity = String(opacity);
    var status = $('status');
    if (status) status.style.opacity = String(opacity);

    /* dark mode class on body */
    if (dark) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }

  function hintColor(cfg) {
    var dark = !!(cfg && cfg.dark_mode);
    return colorFamily('#ff96bb', dark).hint;
  }

  /* ======================================================================
   * 3. Lookup tables — verbatim from panels.md
   * ====================================================================== */
  var FPS_ITEMS = [
    ['smooth',   '流畅（最生动，耗电略高）'],
    ['balanced', '均衡（推荐）'],
    ['normal',   '普通'],
    ['saver',    '省电（最低帧率）']
  ];

  var FOLLOW_ITEMS = [
    ['off',    '关闭（不跟随）'],
    ['sticky', '粘人模式（慢慢跟着你，离远会小跑过来）'],
    ['timid',  '胆小模式（快挪鼠标会躲开，停下会凑过来）']
  ];

  var CORNER_ITEMS = [
    ['',   '不锁定（自由活动+智能避让）'],
    ['tl', '锁定左上角'],
    ['tr', '锁定右上角'],
    ['bl', '锁定左下角'],
    ['br', '锁定右下角']
  ];

  var ACTION_CN = {
    idle:   '待机',
    happy:  '开心',
    pet:    '摸头',
    chin:   '挠下巴',
    pickup: '抱起来',
    spin:   '转圈',
    hop:    '蹦跳',
    sleep:  '睡觉',
    deep:   '深睡',
    walk:   '走路',
    chase:  '追球',
    scared: '受惊',
    nervous:'紧张',
    relax:  '放松',
    groom:  '舔毛',
    eat:    '吃东西',
    paper:  '收信息',
    work:   '陪写代码',
    peek:   '探头',
    play:   '玩耍',
    hide:   '躲藏'
  };

  var STATE_TEXT = {
    idle:     '悠闲地发呆',
    walk:     '正在走',
    flee:     '吓得躲开了',
    happy:    '很开心',
    pet:      '被摸头中',
    chin:     '在挠下巴',
    picked:   '被你抱起来了',
    spin:     '正在转圈圈',
    hop:      '蹦了一下',
    sleep:    '睡觉中',
    deep:     '蜷成一团睡熟了',
    go_sleep: '走去趴下',
    chase:    '在追小球！',
    hide:     '躲起来了，去找它吧~',
    nervous:  '紧张地踱步（电脑有点忙）',
    work:     '安静陪着你写代码',
    peek:     '扒着窗口偷看',
    eat:      '吃东西中',
    play:     '玩耍中',
    paper:    '叼着小纸片',
    relax:    '趴着休息',
    groom:    '舔毛整理中',
    stare:    '正盯着你的光标看'
  };

  var THEME_PRESETS = [
    ['#ff96bb', '淡粉'],
    ['#7bc4ff', '天蓝'],
    ['#9be89b', '嫩绿'],
    ['#ffd97b', '暖黄'],
    ['#c89bff', '薰衣草'],
    ['#ff8b8b', '珊瑚红']
  ];

  var FX_CHECKBOXES = [
    ['fx_halo',          '小狗光环'],
    ['fx_step',          '脚步粒子'],
    ['fx_mouse_trail',   '鼠标吸引粒子'],
    ['fx_click_burst',   '点击爆炸'],
    ['fx_cursor_light',  '鼠标光源（桌面层）'],
    ['fx_shadow',        '脚下阴影'],
    ['fx_trail',         '能量尾巴'],
    ['fx_petals',        '花瓣互动'],
    ['fx_leaves',        '落叶互动'],
    ['fx_fireflies',     '萤火虫聚集'],
    ['fx_butterfly',     '蝴蝶追踪'],
    ['fx_music',         '音乐律动']
  ];

  var FX_FPS_ITEMS = [
    [15, '15 FPS'],
    [24, '24 FPS'],
    [30, '30 FPS'],
    [60, '60 FPS']
  ];

  var AI_PROVIDERS = [
    ['deepseek',  'DeepSeek'],
    ['doubao',    '豆包'],
    ['openai',    'OpenAI'],
    ['custom',    '自定义']
  ];

  /* ======================================================================
   * 4. Helpers
   * ====================================================================== */
  function makeToggle(on, onChange) {
    var sw = el('span', 'sw' + (on ? ' on' : ''));
    sw.setAttribute('role', 'checkbox');
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.tabIndex = 0;
    function toggle() {
      var isOn = sw.classList.contains('on');
      if (isOn) {
        sw.classList.remove('on');
        sw.setAttribute('aria-checked', 'false');
      } else {
        sw.classList.add('on');
        sw.setAttribute('aria-checked', 'true');
      }
      if (onChange) onChange(!isOn);
    }
    sw.addEventListener('click', toggle);
    sw.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
    sw._isOn = function () { return sw.classList.contains('on'); };
    sw._set = function (v) {
      if (v) { sw.classList.add('on'); sw.setAttribute('aria-checked', 'true'); }
      else { sw.classList.remove('on'); sw.setAttribute('aria-checked', 'false'); }
    };
    return sw;
  }

  function makeRow(labelText, control) {
    var row = el('div', 'row');
    var lbl = el('label', null, labelText);
    row.appendChild(lbl);
    if (control) row.appendChild(control);
    return row;
  }

  function makeCheckbox(labelText, checked, onChange) {
    var row = el('div', 'row');
    var id = 'cb_' + Math.random().toString(36).substr(2, 8);
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.checked = !!checked;
    cb.style.cssText = 'accent-color:var(--pri);margin-right:6px';
    var lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.textContent = labelText;
    lbl.style.cssText = 'display:flex;align-items:center;gap:0;cursor:pointer;flex:1;color:var(--tx);font-size:12.5px';
    lbl.insertBefore(cb, lbl.firstChild);
    row.appendChild(lbl);
    cb.addEventListener('change', function () {
      if (onChange) onChange(cb.checked);
    });
    row._cb = cb;
    return row;
  }

  function makeSelect(items, value, onChange) {
    var sel = document.createElement('select');
    for (var i = 0; i < items.length; i++) {
      var opt = document.createElement('option');
      opt.value = items[i][0];
      opt.textContent = items[i][1];
      if (String(items[i][0]) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', function () {
      var v = sel.value;
      /* try to keep numeric if original was numeric */
      for (var j = 0; j < items.length; j++) {
        if (String(items[j][0]) === v && typeof items[j][0] === 'number') {
          v = items[j][0]; break;
        }
      }
      if (onChange) onChange(v);
    });
    return sel;
  }

  function makeSlider(min, max, value, onChange) {
    var wrap = el('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:0 1 260px;max-width:260px';
    var inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.value = String(value);
    inp.style.cssText = 'flex:1;accent-color:var(--pri)';
    var out = document.createElement('output');
    out.textContent = String(value);
    wrap.appendChild(inp);
    wrap.appendChild(out);
    inp.addEventListener('input', function () {
      out.textContent = inp.value;
      if (onChange) onChange(Number(inp.value));
    });
    wrap._inp = inp;
    wrap._out = out;
    return wrap;
  }

  function makeGroup(title) {
    var g = el('div', 'grp');
    var h = el('h4', null, title);
    g.appendChild(h);
    return g;
  }

  function makeHint(text) {
    return el('div', 'hint', text);
  }

  function makeNote(text, ok) {
    var n = el('div', 'note' + (ok ? ' ok' : ''), text);
    return n;
  }

  function clearEl(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ======================================================================
   * 5. open_settings(cfg, hooks) — 7 个 tab
   * ====================================================================== */
  function openSettings(cfg, hooks) {
    cfg = cfg || C.load();
    hooks = hooks || {};
    var body = $('dlgbody');
    if (!body) return;
    body.setAttribute('data-page', 'settings');
    clearEl(body);

    var dlgTitle = $('dlgtitle');
    if (dlgTitle) dlgTitle.innerHTML = '<b style="color:var(--pri)">LineDogPet</b> 设置';

    /* root container */
    var root = el('div');
    root.id = 'settings_root';

    /* header row with dark toggle */
    var header = el('div');
    header.style.cssText = 'display:flex;align-items:center;margin-bottom:10px';
    var titleSpan = el('span');
    titleSpan.innerHTML = '<b style="color:var(--pri);font:bold 11pt sans-serif">LineDogPet</b> 设置';
    titleSpan.style.cssText = 'flex:1;font-size:14px;color:var(--tx)';
    header.appendChild(titleSpan);
    var darkBtn = el('button', 'btn', cfg.dark_mode ? '☀️' : '🌙');
    darkBtn.title = cfg.dark_mode ? '当前深色，点击切换到浅色模式' : '当前浅色，点击切换到深色模式';
    darkBtn.style.cssText = 'width:30px;height:30px;font-size:16px;padding:0';
    darkBtn.addEventListener('click', function () {
      cfg.dark_mode = !cfg.dark_mode;
      if (hooks.on_change) hooks.on_change('dark_mode', cfg.dark_mode);
      applyTheme(cfg);
      darkBtn.textContent = cfg.dark_mode ? '☀️' : '🌙';
      darkBtn.title = cfg.dark_mode ? '当前深色，点击切换到浅色模式' : '当前浅色，点击切换到深色模式';
    });
    header.appendChild(darkBtn);
    root.appendChild(header);

    /* tabs */
    var tabNames = ['形象/声音', '交互/指针', '感知/AI', '附加功能', '外观主题', '联动视效', '关于'];
    var tabContents = [];
    var tabsBar = el('div', 'tabs');
    var tabBtns = [];
    for (var t = 0; t < tabNames.length; t++) {
      (function (idx) {
        var btn = el('button', null, tabNames[idx]);
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
        btn.addEventListener('click', function () {
          for (var j = 0; j < tabBtns.length; j++) {
            tabBtns[j].setAttribute('aria-selected', j === idx ? 'true' : 'false');
          }
          for (var k = 0; k < tabContents.length; k++) {
            tabContents[k].style.display = k === idx ? 'block' : 'none';
          }
        });
        tabBtns.push(btn);
        tabsBar.appendChild(btn);
      })(t);
    }
    root.appendChild(tabsBar);

    /* tab content containers */
    for (var tc = 0; tc < tabNames.length; tc++) {
      var pane = el('div');
      pane.style.display = tc === 0 ? 'block' : 'none';
      tabContents.push(pane);
      root.appendChild(pane);
    }

    /* ---- Tab 0: 形象/声音 ---- */
    buildTab0(tabContents[0], cfg, hooks);
    /* ---- Tab 1: 交互/指针 ---- */
    buildTab1(tabContents[1], cfg, hooks);
    /* ---- Tab 2: 感知/AI ---- */
    buildTab2(tabContents[2], cfg, hooks);
    /* ---- Tab 3: 附加功能 ---- */
    buildTab3(tabContents[3], cfg, hooks);
    /* ---- Tab 4: 外观主题 ---- */
    buildTab4(tabContents[4], cfg, hooks);
    /* ---- Tab 5: 联动视效 ---- */
    buildTab5(tabContents[5], cfg, hooks);
    /* ---- Tab 6: 关于 ---- */
    buildTab6(tabContents[6], cfg, hooks);

    /* bottom buttons */
    var bottom = el('div');
    bottom.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding-top:10px;border-top:1px solid var(--bd)';
    var cancelBtn = el('button', 'btn', '取消');
    cancelBtn.addEventListener('click', function () {
      closeDialog();
    });
    var okBtn = el('button', 'btn pri', '确定');
    okBtn.addEventListener('click', function () {
      if (hooks.on_action) hooks.on_action('save_config', cfg);
      closeDialog();
    });
    bottom.appendChild(cancelBtn);
    bottom.appendChild(okBtn);
    root.appendChild(bottom);

    body.appendChild(root);
    openDialog();
  }

  /* ---- Tab 0: 形象/声音 ---- */
  function buildTab0(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    /* mode row */
    var g = makeGroup('模式');
    var modeRow = el('div', 'row');
    modeRow.innerHTML = '<label>模式：</label>';
    var modeWrap = el('div');
    modeWrap.style.cssText = 'display:flex;align-items:center;gap:8px';
    modeWrap.appendChild(el('span', null, '桌宠'));
    var classicSw = makeToggle(!!cfg.classic_enabled, function (v) { oc('classic_enabled', v); });
    modeWrap.appendChild(classicSw);
    modeWrap.appendChild(el('span', null, 'Bongo'));
    var bongoSw = makeToggle(!!cfg.bongo_enabled, function (v) { oc('bongo_enabled', v); updateBongoGroup(); });
    modeWrap.appendChild(bongoSw);
    modeRow.appendChild(modeWrap);
    g.appendChild(modeRow);

    /* pet count */
    var countRow = el('div', 'row');
    countRow.innerHTML = '<label>小狗数量：</label>';
    var countInp = document.createElement('input');
    countInp.type = 'number';
    countInp.min = '1';
    countInp.max = '15';
    countInp.value = String(cfg.pet_count || 1);
    countInp.style.cssText = 'width:56px;padding:4px 6px;font-size:12.5px;color:var(--tx);background:var(--inp);border:1px solid var(--bd);border-radius:calc(var(--r) - 3px)';
    countInp.title = '同时显示的小狗数量（1~15）';
    countInp.addEventListener('change', function () {
      var n = parseInt(countInp.value, 10);
      if (isNaN(n) || n < 1) n = 1;
      if (n > 15) n = 15;
      countInp.value = String(n);
      oc('pet_count', n);
    });
    countRow.appendChild(countInp);
    g.appendChild(countRow);

    g.appendChild(makeHint('桌宠模式与 Bongo 模式可同时开启（会加大 CPU 和内存占用）。小狗数量：第 1 只为主小狗，其余为陪玩小狗。'));

    /* bongo sub-group */
    var bongoGroup = el('div', 'grp');
    bongoGroup.style.marginLeft = '12px';
    var bgMirror = makeCheckbox('镜像键盘（与真实键盘同向）', !!cfg.bongo_mirror, function (v) { oc('bongo_mirror', v); });
    var bgClickThrough = makeCheckbox('鼠标穿透（点击穿过窗口到桌面，不可拖动）', !!cfg.bongo_click_through, function (v) { oc('bongo_click_through', v); });
    bongoGroup.appendChild(bgMirror);
    bongoGroup.appendChild(bgClickThrough);

    var szLabel = el('div', 'row');
    szLabel.innerHTML = '<label>显示大小：</label>';
    var bongoSz = makeSlider(120, 700, cfg.bongo_size || 440, function (v) { oc('bongo_size', v); bongoSzOut.textContent = v + 'px'; });
    var bongoSzOut = bongoSz._out;
    bongoSzOut.textContent = (cfg.bongo_size || 440) + 'px';
    szLabel.appendChild(bongoSz);
    bongoGroup.appendChild(szLabel);

    var opLabel = el('div', 'row');
    opLabel.innerHTML = '<label>透明度：</label>';
    var bongoOp = makeSlider(30, 100, Math.round((cfg.bongo_opacity || 1.0) * 100), function (v) { oc('bongo_opacity', v / 100); bongoOpOut.textContent = v + '%'; });
    var bongoOpOut = bongoOp._out;
    bongoOpOut.textContent = Math.round((cfg.bongo_opacity || 1.0) * 100) + '%';
    opLabel.appendChild(bongoOp);
    bongoGroup.appendChild(opLabel);

    function updateBongoGroup() {
      bongoGroup.style.display = bongoSw._isOn() ? 'block' : 'none';
    }
    updateBongoGroup();
    g.appendChild(bongoGroup);
    container.appendChild(g);

    /* character row */
    var g2 = makeGroup('宠物形象');
    var charRow = el('div', 'row');
    charRow.innerHTML = '<label>宠物形象：</label>';
    var chars = getCharacters();
    var charSel = makeSelect(chars.map(function (c) { return [c, c]; }), cfg.character || 'xiaobai', function (v) { oc('character', v); });
    charRow.appendChild(charSel);
    var addBtn = el('button', 'btn', '＋ 添加');
    addBtn.addEventListener('click', function () {
      var name = prompt('给新伙伴起个名字（会成为素材文件夹名）：');
      if (!name || !name.trim()) return;
      name = name.trim();
      var custom = getCustomCharacters();
      if (custom.indexOf(name) >= 0 || chars.indexOf(name) >= 0) {
        alert('已存在同名角色或不允许用这个名称，请换一个。');
        return;
      }
      custom.push(name);
      try { localStorage.setItem('linedogpet.custom_chars', JSON.stringify(custom)); } catch (e) {}
      if (hooks.on_action) hooks.on_action('add_character', name);
      /* TODO: GIF upload — UI placeholder */
    });
    charRow.appendChild(addBtn);
    var delBtn = el('button', 'btn', '－ 删除');
    delBtn.addEventListener('click', function () {
      var sel = charSel.value;
      var custom = getCustomCharacters();
      if (custom.indexOf(sel) < 0) {
        alert('只有自定义角色可以删除，默认角色保留。');
        return;
      }
      if (!confirm('确定删除自定义角色「' + sel + '」吗？\n其全部素材文件都会被移除，该操作不可恢复。')) return;
      var idx = custom.indexOf(sel);
      if (idx >= 0) custom.splice(idx, 1);
      try { localStorage.setItem('linedogpet.custom_chars', JSON.stringify(custom)); } catch (e) {}
      if (hooks.on_action) hooks.on_action('del_character', sel);
    });
    charRow.appendChild(delBtn);
    g2.appendChild(charRow);

    /* upload GIF row */
    var upRow = el('div', 'row');
    upRow.innerHTML = '<label>上传表情：</label>';
    var actItems = [];
    for (var a in ACTION_CN) {
      if (ACTION_CN.hasOwnProperty(a)) actItems.push([a, ACTION_CN[a]]);
    }
    var actSel = makeSelect(actItems, 'idle', function () {});
    upRow.appendChild(actSel);
    var uploadBtn = el('button', 'btn', '上传 GIF…');
    uploadBtn.addEventListener('click', function () {
      /* TODO: file input for GIF upload to character/action folder */
      alert('选择要上传的 GIF（会加入「' + (charSel.value) + '」的「' + (ACTION_CN[actSel.value] || actSel.value) + '」）');
    });
    upRow.appendChild(uploadBtn);
    g2.appendChild(upRow);

    /* custom sound */
    var sndRow = el('div', 'row');
    sndRow.innerHTML = '<label>自定义叫声：</label>';
    var sndPick = el('button', 'btn', '选择音频…');
    sndPick.addEventListener('click', function () {
      alert('选择叫声音频（wav，建议 1 秒以内）');
    });
    sndRow.appendChild(sndPick);
    var sndReset = el('button', 'btn', '恢复默认');
    sndReset.addEventListener('click', function () {
      if (hooks.on_action) hooks.on_action('reset_sound');
    });
    sndRow.appendChild(sndReset);
    g2.appendChild(sndRow);

    /* size slider */
    var szRow = el('div', 'row');
    szRow.innerHTML = '<label>显示大小：</label>';
    var sizeSlider = makeSlider(80, 500, cfg.size || 150, function (v) { oc('size', v); sizeOut.textContent = v + 'px'; });
    var sizeOut = sizeSlider._out;
    sizeOut.textContent = (cfg.size || 150) + 'px';
    szRow.appendChild(sizeSlider);
    g2.appendChild(szRow);

    /* fps */
    var fpsRow = el('div', 'row');
    fpsRow.innerHTML = '<label>动画帧率：</label>';
    var fpsSel = makeSelect(FPS_ITEMS, cfg.fps_mode || 'balanced', function (v) { oc('fps_mode', v); });
    fpsRow.appendChild(fpsSel);
    g2.appendChild(fpsRow);

    /* bubble on */
    g2.appendChild(makeCheckbox('显示字幕/气泡（关闭后所有文字气泡都不再弹出）', !!cfg.bubble_on, function (v) { oc('bubble_on', v); }));

    /* bubble duration */
    var bdRow = el('div', 'row');
    bdRow.innerHTML = '<label>气泡显示时长：</label>';
    var bdSlider = makeSlider(1500, 12000, cfg.bubble_duration || 4200, function (v) { oc('bubble_duration', v); bdOut.textContent = v + 'ms'; });
    var bdOut = bdSlider._out;
    bdOut.textContent = (cfg.bubble_duration || 4200) + 'ms';
    bdRow.appendChild(bdSlider);
    g2.appendChild(bdRow);

    /* bubble color */
    var bcRow = el('div', 'row');
    bcRow.innerHTML = '<label>气泡文字颜色：</label>';
    var bcSwatch = el('span');
    bcSwatch.style.cssText = 'display:inline-block;width:44px;height:20px;border-radius:4px;border:1px solid var(--bd);background:' + (cfg.bubble_color || '#222222');
    bcRow.appendChild(bcSwatch);
    var bcBtn = el('button', 'btn', '更改…');
    bcBtn.addEventListener('click', function () {
      var c = prompt('输入气泡文字颜色（如 #222222）：', cfg.bubble_color || '#222222');
      if (c) {
        cfg.bubble_color = c;
        bcSwatch.style.background = c;
        if (hooks.on_change) hooks.on_change('bubble_color', c);
      }
    });
    bcRow.appendChild(bcBtn);
    g2.appendChild(bcRow);

    /* sound on */
    g2.appendChild(makeCheckbox('开启音效（叫声/哼唧，都是极短的小声音）', !!cfg.sound_on, function (v) { oc('sound_on', v); }));
    /* hourly chime */
    g2.appendChild(makeCheckbox('整点轻轻叫一声', !!cfg.hourly_chime, function (v) { oc('hourly_chime', v); }));

    /* reset defaults */
    var resetBtn = el('button', 'btn', '恢复默认设置');
    resetBtn.style.marginTop = '10px';
    resetBtn.addEventListener('click', function () {
      if (!confirm('确定要把所有设置恢复为默认值吗？\n（形象/大小/音效/AI/快捷键等全部重置）')) return;
      var def = C.DEFAULT_CONFIG;
      for (var k in def) {
        if (def.hasOwnProperty(k)) cfg[k] = def[k];
      }
      if (hooks.on_action) hooks.on_action('reset_defaults');
      closeDialog();
      openSettings(cfg, hooks);
    });
    g2.appendChild(resetBtn);

    container.appendChild(g2);
  }

  /* ---- Tab 1: 交互/指针 ---- */
  function buildTab1(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    var g = makeGroup('鼠标交互');
    g.appendChild(makeCheckbox('开启鼠标交互（摸头/抱起/手势/跟随）', !!cfg.mouse_interaction, function (v) { oc('mouse_interaction', v); }));
    g.appendChild(makeHint('关闭后为「鼠标穿透」'));
    g.appendChild(makeCheckbox('开启点击 Q 弹动画（单击压扁回弹 / 双击弹跳）', !!cfg.click_squash_on, function (v) { oc('click_squash_on', v); }));
    g.appendChild(makeHint('单击原地 Q 弹，双击向上弹跳落地回弹；关闭后仅保留对话。'));
    container.appendChild(g);

    var g2 = makeGroup('指针皮肤');
    g2.appendChild(makeCheckbox('鼠标指针皮肤（可自定义鼠标皮肤）', !!cfg.cursor_follow, function (v) { oc('cursor_follow', v); }));
    g2.appendChild(makeHint('开启后会和光标一起移动，不影响点击操作。'));

    var cursorRow = el('div', 'row');
    cursorRow.innerHTML = '<label>自定义表情：</label>';
    var cursorUp = el('button', 'btn', '上传自定义表情…');
    cursorUp.addEventListener('click', function () {
      alert('选择鼠标宠物自定义表情');
    });
    cursorRow.appendChild(cursorUp);
    var cursorReset = el('button', 'btn', '恢复默认');
    cursorReset.addEventListener('click', function () {
      if (hooks.on_action) hooks.on_action('reset_cursor_gif');
    });
    cursorRow.appendChild(cursorReset);
    g2.appendChild(cursorRow);

    var csRow = el('div', 'row');
    csRow.innerHTML = '<label>指针皮肤大小：</label>';
    var csSlider = makeSlider(30, 150, cfg.cursor_size || 75, function (v) { oc('cursor_size', v); csOut.textContent = v + '%'; });
    var csOut = csSlider._out;
    csOut.textContent = (cfg.cursor_size || 75) + '%';
    csRow.appendChild(csSlider);
    g2.appendChild(csRow);
    container.appendChild(g2);

    var g3 = makeGroup('行为');
    var followRow = el('div', 'row');
    followRow.innerHTML = '<label>跟随模式：</label>';
    followRow.appendChild(makeSelect(FOLLOW_ITEMS, cfg.follow_mode || 'off', function (v) { oc('follow_mode', v); }));
    g3.appendChild(followRow);
    g3.appendChild(makeHint('左键轻点＝摸头 长按拖拽＝抱起 右键＝挠下巴 双击＝呼唤\n按住拖一个小圆圈＝转圈撒娇 快速甩动＝小狗追\n滚轮中键点击＝和它说话'));

    g3.appendChild(makeCheckbox('智能避让窗口（自动跑到没被窗口挡住的空白桌面）', !!cfg.avoid_windows, function (v) { oc('avoid_windows', v); }));
    g3.appendChild(makeCheckbox('随机闲逛（空闲时在桌面空白处自然走动）', !!cfg.roam_enabled, function (v) { oc('roam_enabled', v); }));

    var cornerRow = el('div', 'row');
    cornerRow.innerHTML = '<label>固定位置：</label>';
    cornerRow.appendChild(makeSelect(CORNER_ITEMS, cfg.lock_corner || '', function (v) { oc('lock_corner', v); }));
    g3.appendChild(cornerRow);

    g3.appendChild(makeCheckbox('启用全局快捷键（一键隐藏/显示）', !!cfg.hotkey_on, function (v) { oc('hotkey_on', v); }));

    /* hotkey capture */
    var hkRow = el('div', 'row');
    hkRow.innerHTML = '<label>快捷键：</label>';
    var hkInp = document.createElement('input');
    hkInp.type = 'text';
    hkInp.value = cfg.hotkey || 'Ctrl+Alt+D';
    hkInp.readOnly = true;
    hkInp.title = '必须包含 Ctrl/Alt/Shift 中的至少一个';
    hkInp.style.cssText = 'flex:0 1 220px;max-width:220px;padding:4px 6px;font-size:12.5px;color:var(--tx);background:var(--inp);border:1px solid var(--bd);border-radius:calc(var(--r) - 3px);cursor:pointer';
    var capturing = false;
    hkInp.addEventListener('click', function () {
      capturing = true;
      hkInp.value = '按下快捷键…';
      hkInp.style.borderColor = 'var(--pri)';
    });
    hkInp.addEventListener('keydown', function (e) {
      if (!capturing) return;
      e.preventDefault();
      var parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');
      var key = e.key;
      if (['Control', 'Alt', 'Shift', 'Meta'].indexOf(key) >= 0) return;
      if (key.length === 1) key = key.toUpperCase();
      parts.push(key);
      if (parts.length < 2) {
        alert('必须包含 Ctrl/Alt/Shift 中的至少一个');
        hkInp.value = cfg.hotkey || 'Ctrl+Alt+D';
        capturing = false;
        hkInp.style.borderColor = '';
        return;
      }
      var combo = parts.join('+');
      cfg.hotkey = combo;
      hkInp.value = combo;
      capturing = false;
      hkInp.style.borderColor = '';
      if (hooks.on_change) hooks.on_change('hotkey', combo);
    });
    hkInp.addEventListener('blur', function () {
      if (capturing) {
        capturing = false;
        hkInp.value = cfg.hotkey || 'Ctrl+Alt+D';
        hkInp.style.borderColor = '';
      }
    });
    hkRow.appendChild(hkInp);
    g3.appendChild(hkRow);

    /* autostart — web 不支持，保留 UI */
    g3.appendChild(makeCheckbox('开机自启动（登录 Windows 时自动运行）', !!cfg.autostart, function (v) { oc('autostart', v); }));

    /* paw prints */
    g3.appendChild(makeCheckbox('移动时在桌面留淡脚印（渐隐消失）', !!cfg.paw_enabled, function (v) { oc('paw_enabled', v); }));
    var pfRow = el('div', 'row');
    pfRow.innerHTML = '<label>脚印淡出：</label>';
    var pfSlider = makeSlider(2, 30, cfg.paw_fade_sec || 6, function (v) { oc('paw_fade_sec', v); pfOut.textContent = v + 's'; });
    var pfOut = pfSlider._out;
    pfOut.textContent = (cfg.paw_fade_sec || 6) + 's';
    pfRow.appendChild(pfSlider);
    g3.appendChild(pfRow);

    container.appendChild(g3);
  }

  /* ---- Tab 2: 感知/AI ---- */
  function buildTab2(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    /* sense group */
    var g = makeGroup('感知');
    g.appendChild(makeCheckbox('全局感知总开关', !!cfg.sense_enabled, function (v) { oc('sense_enabled', v); }));
    g.appendChild(makeCheckbox('空闲感知（检测你是否在电脑前）', !!cfg.sense_idle, function (v) { oc('sense_idle', v); }));
    g.appendChild(makeCheckbox('窗口感知（检测活跃窗口标题）', !!cfg.sense_window, function (v) { oc('sense_window', v); }));
    g.appendChild(makeCheckbox('CPU 感知（检测系统负载）', !!cfg.sense_cpu, function (v) { oc('sense_cpu', v); }));
    g.appendChild(makeCheckbox('剪贴板感知（检测复制的内容）', !!cfg.sense_clipboard, function (v) { oc('sense_clipboard', v); }));
    g.appendChild(makeCheckbox('时间感知（根据时间段调整行为）', !!cfg.sense_time, function (v) { oc('sense_time', v); }));
    g.appendChild(makeCheckbox('全屏时自动缩小（检测到全屏应用时缩小宠物）', !!cfg.fullscreen_shrink, function (v) { oc('fullscreen_shrink', v); }));
    container.appendChild(g);

    /* AI group */
    var g2 = makeGroup('AI 对话');
    g2.appendChild(makeCheckbox('启用 AI 对话', !!cfg.ai_enabled, function (v) { oc('ai_enabled', v); }));

    var provRow = el('div', 'row');
    provRow.innerHTML = '<label>服务商：</label>';
    provRow.appendChild(makeSelect(AI_PROVIDERS, cfg.ai_provider || 'deepseek', function (v) { oc('ai_provider', v); }));
    g2.appendChild(provRow);

    var baseRow = el('div', 'row');
    baseRow.innerHTML = '<label>API 地址：</label>';
    var baseInp = document.createElement('input');
    baseInp.type = 'text';
    baseInp.value = cfg.ai_base || '';
    baseInp.addEventListener('change', function () { oc('ai_base', baseInp.value); });
    baseRow.appendChild(baseInp);
    g2.appendChild(baseRow);

    var keyRow = el('div', 'row');
    keyRow.innerHTML = '<label>API Key：</label>';
    var keyInp = document.createElement('input');
    keyInp.type = 'password';
    keyInp.value = cfg.ai_key || '';
    keyInp.addEventListener('change', function () { oc('ai_key', keyInp.value); });
    keyRow.appendChild(keyInp);
    g2.appendChild(keyRow);

    var modelRow = el('div', 'row');
    modelRow.innerHTML = '<label>模型：</label>';
    var modelInp = document.createElement('input');
    modelInp.type = 'text';
    modelInp.value = cfg.ai_model || '';
    modelInp.addEventListener('change', function () { oc('ai_model', modelInp.value); });
    modelRow.appendChild(modelInp);
    g2.appendChild(modelRow);

    g2.appendChild(makeCheckbox('附带上下文（发送当前窗口标题等环境信息）', !!cfg.ai_context, function (v) { oc('ai_context', v); }));

    /* persona editor */
    var personaRow = el('div', 'row col');
    var personaLbl = el('span', 'lbl', '角色人设（留空使用默认）：');
    personaRow.appendChild(personaLbl);
    var personaBox = document.createElement('textarea');
    personaBox.style.cssText = 'width:100%;min-height:80px;padding:6px 8px;font-size:12.5px;color:var(--tx);background:var(--inp);border:1px solid var(--bd);border-radius:calc(var(--r) - 3px);resize:vertical;line-height:1.6;font-family:ui-monospace,Menlo,Consolas,monospace';
    var personas = cfg.ai_personas || {};
    var curChar = cfg.character || 'xiaobai';
    personaBox.value = personas[curChar] || '';
    personaBox.placeholder = C.DATA.ai && C.DATA.ai._DEFAULT_CUSTOM_PERSONA ? C.DATA.ai._DEFAULT_CUSTOM_PERSONA : '';
    personaBox.addEventListener('change', function () {
      if (!cfg.ai_personas) cfg.ai_personas = {};
      cfg.ai_personas[curChar] = personaBox.value;
      if (hooks.on_change) hooks.on_change('ai_personas', cfg.ai_personas);
    });
    personaRow.appendChild(personaBox);
    g2.appendChild(personaRow);
    g2.appendChild(makeHint('人设中的 {name} 会被替换为角色名'));

    container.appendChild(g2);
  }

  /* ---- Tab 3: 附加功能 ---- */
  function buildTab3(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    var g = makeGroup('附加功能');
    g.appendChild(makeCheckbox('夜间模式（深夜自动安静）', !!cfg.night_enabled, function (v) { oc('night_enabled', v); }));
    g.appendChild(makeCheckbox('环境观察（根据窗口/剪贴板内容主动搭话）', !!cfg.observe_enabled, function (v) { oc('observe_enabled', v); }));
    g.appendChild(makeCheckbox('音乐感知（检测到音乐时跟着律动）', !!cfg.music_enabled, function (v) { oc('music_enabled', v); }));
    g.appendChild(makeCheckbox('截图互动（截图时小狗摆 pose）', !!cfg.shot_enabled, function (v) { oc('shot_enabled', v); }));
    g.appendChild(makeCheckbox('恶作剧模式（偶尔偷偷做些小动作）', !!cfg.prank_enabled, function (v) { oc('prank_enabled', v); }));
    g.appendChild(makeCheckbox('恶作剧：鼠标偏移（轻微移动鼠标位置）', !!cfg.prank_mouse, function (v) { oc('prank_mouse', v); }));
    container.appendChild(g);
  }

  /* ---- Tab 4: 外观主题 ---- */
  function buildTab4(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    /* theme color */
    var g = makeGroup('主题颜色');
    var tcRow = el('div', 'row');
    tcRow.innerHTML = '<label>主题色：</label>';
    var tcSwatch = el('span');
    tcSwatch.style.cssText = 'display:inline-block;width:60px;height:24px;border-radius:4px;border:1px solid var(--bd);background:' + (cfg.theme_color || '#ff96bb');
    tcRow.appendChild(tcSwatch);
    var tcBtn = el('button', 'btn', '更改主题色…');
    tcBtn.addEventListener('click', function () {
      var c = prompt('输入主题色（如 #ff96bb）：', cfg.theme_color || '#ff96bb');
      if (c) {
        cfg.theme_color = c;
        tcSwatch.style.background = c;
        applyTheme(cfg);
        if (hooks.on_change) hooks.on_change('theme_color', c);
      }
    });
    tcRow.appendChild(tcBtn);
    g.appendChild(tcRow);

    /* presets */
    var presetRow = el('div', 'row');
    presetRow.innerHTML = '<label>快捷预设：</label>';
    var presetWrap = el('div', 'swrow');
    for (var i = 0; i < THEME_PRESETS.length; i++) {
      (function (idx) {
        var p = THEME_PRESETS[idx];
        var pill = el('span', 'pill');
        var dot = el('span');
        dot.style.cssText = 'display:inline-block;width:14px;height:14px;border-radius:50%;background:' + p[0] + ';border:1px solid var(--bd)';
        pill.appendChild(dot);
        pill.appendChild(el('span', null, p[1]));
        pill.style.cursor = 'pointer';
        pill.addEventListener('click', function () {
          cfg.theme_color = p[0];
          tcSwatch.style.background = p[0];
          applyTheme(cfg);
          if (hooks.on_change) hooks.on_change('theme_color', p[0]);
        });
        presetWrap.appendChild(pill);
      })(i);
    }
    presetRow.appendChild(presetWrap);
    g.appendChild(presetRow);
    container.appendChild(g);

    /* radius */
    var g2 = makeGroup('控件圆角');
    var rRow = el('div', 'row');
    rRow.innerHTML = '<label>圆角大小：</label>';
    var rSlider = makeSlider(0, 20, cfg.theme_radius || 8, function (v) {
      oc('theme_radius', v);
      rOut.textContent = v + 'px';
      applyTheme(cfg);
    });
    var rOut = rSlider._out;
    rOut.textContent = (cfg.theme_radius || 8) + 'px';
    rRow.appendChild(rSlider);
    g2.appendChild(rRow);
    container.appendChild(g2);

    /* panel opacity */
    var g3 = makeGroup('面板透明度');
    var poRow = el('div', 'row');
    poRow.innerHTML = '<label>面板透明度：</label>';
    var poSlider = makeSlider(50, 100, Math.round((cfg.panel_opacity != null ? cfg.panel_opacity : 1.0) * 100), function (v) {
      oc('panel_opacity', v / 100);
      poOut.textContent = v + '%';
      applyTheme(cfg);
    });
    var poOut = poSlider._out;
    poOut.textContent = Math.round((cfg.panel_opacity != null ? cfg.panel_opacity : 1.0) * 100) + '%';
    poRow.appendChild(poSlider);
    g3.appendChild(poRow);
    container.appendChild(g3);

    /* pet opacity */
    var g4 = makeGroup('宠物透明度');
    var petoRow = el('div', 'row');
    petoRow.innerHTML = '<label>宠物透明度：</label>';
    var petoSlider = makeSlider(30, 100, Math.round((cfg.pet_opacity != null ? cfg.pet_opacity : 1.0) * 100), function (v) {
      oc('pet_opacity', v / 100);
      petoOut.textContent = v + '%';
    });
    var petoOut = petoSlider._out;
    petoOut.textContent = Math.round((cfg.pet_opacity != null ? cfg.pet_opacity : 1.0) * 100) + '%';
    petoRow.appendChild(petoSlider);
    g4.appendChild(petoRow);
    container.appendChild(g4);

    container.appendChild(makeHint('主题色影响所有面板/菜单/按钮配色；透明度可让宠物和面板半透明~'));
  }

  /* ---- Tab 5: 联动视效 ---- */
  function buildTab5(container, cfg, hooks) {
    function oc(key, val) { cfg[key] = val; if (hooks.on_change) hooks.on_change(key, val); }

    /* link card — PawLiveWall not available in web */
    var card = el('div', 'grp');
    card.style.cssText = 'text-align:center;padding:24px 16px';
    card.appendChild(el('div', null, '🐾 想让小狗在桌面上也动起来？')).style.cssText = 'font-size:14px;font-weight:600;color:var(--tx);margin-bottom:8px';
    card.appendChild(makeHint('打开 PawLiveWall 动态壁纸，小狗会自动与壁纸联动，\n这里就会解锁更多桌面特效。'));
    var dlBtn = el('button', 'btn', '下载 PawLiveWall');
    dlBtn.style.marginTop = '10px';
    dlBtn.addEventListener('click', function () {
      var url = C.PAWLIVEWALL_URL || C.APP_WEBSITE;
      if (url) window.open(url, '_blank');
    });
    card.appendChild(dlBtn);
    container.appendChild(card);

    /* FX group */
    var g = makeGroup('桌面特效（全屏时自动暂停）');
    g.appendChild(makeCheckbox('特效总开关', !!cfg.fx_enabled, function (v) { oc('fx_enabled', v); }));

    /* FX checkboxes in rows of 3 */
    var fxGrid = el('div');
    fxGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px;margin:8px 0';
    for (var i = 0; i < FX_CHECKBOXES.length; i++) {
      (function (idx) {
        var item = FX_CHECKBOXES[idx];
        var wrap = el('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx)';
        var cbId = 'fx_cb_' + idx;
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = cbId;
        cb.checked = !!cfg[item[0]];
        cb.style.cssText = 'accent-color:var(--pri)';
        cb.addEventListener('change', function () { oc(item[0], cb.checked); });
        var lbl = document.createElement('label');
        lbl.htmlFor = cbId;
        lbl.textContent = item[1];
        lbl.style.cursor = 'pointer';
        wrap.appendChild(cb);
        wrap.appendChild(lbl);
        fxGrid.appendChild(wrap);
      })(i);
    }
    g.appendChild(fxGrid);

    /* FX FPS */
    var fpsRow = el('div', 'row');
    fpsRow.innerHTML = '<label>特效帧率：</label>';
    fpsRow.appendChild(makeSelect(FX_FPS_ITEMS, cfg.fx_fps || 30, function (v) { oc('fx_fps', v); }));
    g.appendChild(fpsRow);

    g.appendChild(makeHint('特效只在与 PawLiveWall 双开联动时渲染；画在壁纸之上，不抢焦点也不挡点击，全屏应用时自动暂停。鼠标光源画在桌面层：盖在壁纸上，被打开的窗口遮挡时自动不可见。花瓣 / 落叶 / 萤火虫 / 蝴蝶较耗资源，建议按需开启。'));

    container.appendChild(g);
  }

  /* ---- Tab 6: 关于 ---- */
  function buildTab6(container, cfg, hooks) {
    var about = el('div');
    about.style.cssText = 'text-align:center;padding:16px 0';

    /* app name */
    var nameEl = el('div');
    nameEl.innerHTML = '<b style="color:var(--pri);font-size:16pt">' + escHtml(C.APP_NAME) + '</b>';
    about.appendChild(nameEl);

    var cnEl = el('div');
    cnEl.style.cssText = 'margin-top:4px';
    cnEl.innerHTML = '<span style="color:var(--tx3);font-size:11pt">' + escHtml(C.APP_CN_NAME) + '</span>';
    about.appendChild(cnEl);

    var verEl = el('div');
    verEl.style.cssText = 'margin-top:4px';
    verEl.innerHTML = '<span style="color:var(--tx3)">版本 v' + escHtml(C.APP_VERSION) + '</span>';
    about.appendChild(verEl);

    /* info table */
    var info = el('div');
    info.style.cssText = 'margin-top:14px;text-align:left;display:inline-block;font-size:12.5px;color:var(--tx)';
    if (C.APP_AUTHOR) info.innerHTML += '<div>作者：' + escHtml(C.APP_AUTHOR) + '</div>';
    if (C.APP_EMAIL) info.innerHTML += '<div>邮箱：<a href="mailto:' + escHtml(C.APP_EMAIL) + '" style="color:var(--pri)">' + escHtml(C.APP_EMAIL) + '</a></div>';
    if (C.APP_WEBSITE) info.innerHTML += '<div>官网：<a href="' + escHtml(C.APP_WEBSITE) + '" target="_blank" style="color:var(--pri)">' + escHtml(C.APP_WEBSITE) + '</a></div>';
    about.appendChild(info);

    /* repos */
    var repos = el('div');
    repos.style.cssText = 'margin-top:10px;text-align:left;display:inline-block;font-size:12.5px;color:var(--tx)';
    repos.innerHTML = '<div style="font-weight:600;margin-bottom:4px">项目地址</div>';
    if (C.RELEASE_GITHUB) repos.innerHTML += '<div>GitHub：<a href="' + escHtml(C.RELEASE_GITHUB) + '" target="_blank" style="color:var(--pri)">' + escHtml(C.RELEASE_GITHUB) + '</a></div>';
    if (C.RELEASE_GITEE) repos.innerHTML += '<div>Gitee：<a href="' + escHtml(C.RELEASE_GITEE) + '" target="_blank" style="color:var(--pri)">' + escHtml(C.RELEASE_GITEE) + '</a></div>';
    if (C.RELEASE_GITCODE) repos.innerHTML += '<div>GitCode：<a href="' + escHtml(C.RELEASE_GITCODE) + '" target="_blank" style="color:var(--pri)">' + escHtml(C.RELEASE_GITCODE) + '</a></div>';
    about.appendChild(repos);

    /* update */
    var updateStatus = el('div');
    updateStatus.style.cssText = 'margin-top:10px';
    updateStatus.innerHTML = '<span style="color:var(--tx3)">正在检查更新…</span>';
    about.appendChild(updateStatus);

    var updateBtn = el('button', 'btn', '检查更新');
    updateBtn.style.marginTop = '6px';
    updateBtn.addEventListener('click', function () {
      if (hooks.on_action) hooks.on_action('check_update');
    });
    about.appendChild(updateBtn);

    /* 5-click easter egg */
    var clickCount = 0;
    var lastClick = 0;
    about.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - lastClick > 5000) clickCount = 0;
      lastClick = now;
      clickCount++;
      if (clickCount >= 5) {
        clickCount = 0;
        if (hooks.on_action) hooks.on_action('easter_egg');
      }
    });

    container.appendChild(about);
  }

  /* ======================================================================
   * 6. open_status(info)
   * ====================================================================== */
  var _status_timer = null;

  function openStatus(info) {
    var panel = $('status');
    if (!panel) return;

    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      if (_status_timer) { clearInterval(_status_timer); _status_timer = null; }
      return;
    }

    clearEl(panel);
    panel.classList.add('open');

    /* info 可为对象（快照）或函数（原版 status_provider，每 1000ms refresh） */
    var provider = (typeof info === 'function') ? info : function () { return info || {}; };

    function snap() {
      try { return provider() || {}; } catch (e) { return {}; }
    }

    var h = el('h4', null, '🐶 状态');
    panel.appendChild(h);

    var stateEl = el('div', 'kv');
    panel.appendChild(stateEl);

    var moodLabel = el('div', 'kv');
    panel.appendChild(moodLabel);
    var moodBar = el('div', 'bar');
    var moodFill = el('i');
    moodBar.appendChild(moodFill);
    panel.appendChild(moodBar);

    var energyLabel = el('div', 'kv');
    panel.appendChild(energyLabel);
    var energyBar = el('div', 'bar');
    var energyFill = el('i');
    energyBar.appendChild(energyFill);
    panel.appendChild(energyBar);

    var stepsEl = el('div', 'kv');
    panel.appendChild(stepsEl);

    var onlineEl = el('div', 'kv');
    panel.appendChild(onlineEl);

    var cpuEl = el('div', 'kv');
    panel.appendChild(cpuEl);

    var flagsEl = el('div', 'kv');
    panel.appendChild(flagsEl);

    var btns = el('div');
    btns.style.cssText = 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap';
    var actions = [
      ['喂食', 'feed'],
      ['玩耍', 'play'],
      ['追小球', 'chase'],
      ['躲猫猫', 'hidegame']
    ];
    for (var i = 0; i < actions.length; i++) {
      (function (idx) {
        var b = el('button', 'btn pri', actions[idx][0]);
        b.style.cssText = 'flex:1;min-width:60px;font-size:12px;padding:4px 8px';
        b.addEventListener('click', function () {
          if (global.App && global.App.handleStatusAction) {
            global.App.handleStatusAction(actions[idx][1]);
          }
        });
        btns.appendChild(b);
      })(i);
    }
    panel.appendChild(btns);

    panel.appendChild(makeHint('状态自动保存在本机小 JSON 里，下次打开还在。'));

    /* refresh() — 原版 StatusDialog.timerEvent(1000) */
    function refresh() {
      var d = snap();
      var state = d.state || 'idle';
      var mood = d.mood != null ? d.mood : 80;
      var energy = d.energy != null ? d.energy : 80;
      stateEl.innerHTML = '<span>现在：</span><b>' + escHtml(STATE_TEXT[state] || state) + '</b>';
      moodLabel.innerHTML = '<span>心情：</span><b>' + Math.round(mood) + '</b>';
      moodFill.style.width = Math.round(mood) + '%';
      energyLabel.innerHTML = '<span>体力：</span><b>' + Math.round(energy) + '</b>';
      energyFill.style.width = Math.round(energy) + '%';
      stepsEl.innerHTML = '<span>今日步数：</span><b>' + escHtml(String(d.steps_today || 0)) + '</b>';
      onlineEl.innerHTML = '<span>在线时长：</span><b>' + escHtml(String(d.online_time || '0分钟')) + '</b>';
      cpuEl.innerHTML = '<span>CPU 因子：</span><b>' + escHtml(String(d.cpu_factor != null ? d.cpu_factor : '1.0')) + '</b>';
      flagsEl.innerHTML = '<span>夜间：</span><b>' + (d.night_mode ? '是' : '否') +
        '</b>&nbsp;<span>陪伴：</span><b>' + (d.companion_mode ? '是' : '否') + '</b>';
    }
    refresh();
    _status_timer = setInterval(refresh, 1000);
  }
  /* ======================================================================
   * 7. open_chat(hooks)
   * ====================================================================== */
  function openChat(hooks) {
    hooks = hooks || {};
    var body = $('dlgbody');
    if (!body) return;
    body.setAttribute('data-page', 'chat');
    clearEl(body);

    var dlgTitle = $('dlgtitle');
    if (dlgTitle) dlgTitle.textContent = '和桌宠说句话（滚轮中键点它也能打开）';

    /* chat hint */
    var aiOn = hooks.get_cfg && hooks.get_cfg().ai_enabled;
    var hintText = aiOn
      ? 'AI 已开启，直接对话~'
      : 'AI 未开启：现在只能执行本地指令（变小/躲起来/出来/安静/陪我玩等），\n想聊天请去 设置→AI填入你自己的API。';
    var hintEl = el('div');
    hintEl.style.cssText = 'padding:8px 12px;font-size:11px;color:var(--tx3);line-height:1.5;white-space:pre-wrap;background:var(--card);border-bottom:1px solid var(--bd)';
    hintEl.textContent = hintText;
    body.appendChild(hintEl);

    /* chat log */
    var chatlog = el('div');
    chatlog.id = 'chatlog';
    body.appendChild(chatlog);

    /* load history */
    if (global.ChatDB && global.ChatDB.history) {
      var hist = global.ChatDB.history(50);
      for (var i = 0; i < hist.length; i++) {
        var msg = hist[i];
        var div = el('div', 'msg ' + (msg.role === 'user' ? 'me' : msg.role === 'system' ? 'sys' : 'pet'));
        div.textContent = msg.text;
        chatlog.appendChild(div);
      }
      if (chatlog.lastChild) chatlog.scrollTop = chatlog.scrollHeight;
    }

    /* chat form */
    var form = el('div');
    form.id = 'chatform';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'chatin';
    inp.placeholder = '说点什么…（试试：你好/变小/陪我玩/安静）';
    form.appendChild(inp);

    var sendBtn = el('button', 'btn pri', '发送');
    form.appendChild(sendBtn);
    body.appendChild(form);

    function send() {
      var text = inp.value.trim();
      if (!text) return;
      inp.value = '';

      /* user message */
      var userDiv = el('div', 'msg me');
      userDiv.textContent = text;
      chatlog.appendChild(userDiv);

      if (global.ChatDB && global.ChatDB.append) {
        global.ChatDB.append('user', text);
      }

      if (hooks.on_action) hooks.on_action('chat', text);

      chatlog.scrollTop = chatlog.scrollHeight;
    }

    sendBtn.addEventListener('click', send);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    openDialog();
    inp.focus();
  }

  /* ======================================================================
   * 8. open_diary()
   * ====================================================================== */
  function openDiary() {
    var body = $('dlgbody');
    if (!body) return;
    body.setAttribute('data-page', 'diary');
    clearEl(body);

    var dlgTitle = $('dlgtitle');
    if (dlgTitle) dlgTitle.innerHTML = '📖 小狗日记';

    var diary = global.Diary;
    var today = new Date();
    var curDate = today.toISOString().slice(0, 10);

    /* header */
    var head = el('div', 'dlhead');
    var prevBtn = el('button', 'btn', '◀ 前一天');
    var dateLabel = el('span');
    dateLabel.style.cssText = 'flex:1;text-align:center;font-size:13px;color:var(--tx)';
    var nextBtn = el('button', 'btn', '后一天 ▶');
    head.appendChild(prevBtn);
    head.appendChild(dateLabel);
    head.appendChild(nextBtn);
    body.appendChild(head);

    var todayBtn = el('button', 'btn', '今天');
    todayBtn.style.cssText = 'display:block;margin:0 auto 10px';
    body.appendChild(todayBtn);

    /* paper */
    var paper = el('div', 'paper');
    body.appendChild(paper);

    /* tip */
    body.appendChild(makeHint('每天打开时，我都会根据当天发生的事实时写一篇日记~'));

    function weekdays(d) {
      var names = '一二三四五六日';
      return names[d.getDay()];
    }

    function dayLabel(dateStr) {
      var d = new Date(dateStr + 'T00:00:00');
      var dayN = 1;
      if (diary && diary.stats) {
        var st = diary.stats();
        if (st && st.first_day) {
          var first = new Date(st.first_day + 'T00:00:00');
          dayN = Math.floor((d - first) / 86400000) + 1;
          if (dayN < 1) dayN = 1;
        }
      }
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + weekdays(d) + ' · Day ' + dayN;
    }

    function refresh() {
      dateLabel.textContent = dayLabel(curDate);
      var todayStr = today.toISOString().slice(0, 10);
      prevBtn.disabled = curDate <= (diary && diary.stats && diary.stats().first_day ? diary.stats().first_day : todayStr);
      nextBtn.disabled = curDate >= todayStr;

      var text = '';
      if (diary && diary.render_day) {
        text = diary.render_day(curDate);
      }
      if (!text) {
        paper.textContent = '今天还没有故事，多陪陪我吧~ 🐾';
      } else {
        paper.textContent = text;
      }
    }

    prevBtn.addEventListener('click', function () {
      var d = new Date(curDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      curDate = d.toISOString().slice(0, 10);
      refresh();
    });
    nextBtn.addEventListener('click', function () {
      var d = new Date(curDate + 'T00:00:00');
      var todayStr = today.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 1);
      var next = d.toISOString().slice(0, 10);
      if (next <= todayStr) { curDate = next; refresh(); }
    });
    todayBtn.addEventListener('click', function () {
      curDate = today.toISOString().slice(0, 10);
      refresh();
    });

    refresh();
    openDialog();
  }

  /* ======================================================================
   * 9. open_milestone()
   * ====================================================================== */
  function openMilestone() {
    var body = $('dlgbody');
    if (!body) return;
    body.setAttribute('data-page', 'milestone');
    clearEl(body);

    var dlgTitle = $('dlgtitle');
    if (dlgTitle) dlgTitle.innerHTML = '🌟 里程碑 · 第一次';

    var diary = global.Diary;
    var ms = diary && diary.milestones ? diary.milestones() : { firsts: [], total: 0, streak: 0, eggs: 0, outfits: 0, collection: [] };
    var firsts = ms.firsts || [];
    var total = ms.total || 0;
    var collected = firsts.length;

    /* two-column layout */
    var cols = el('div');
    cols.style.cssText = 'display:flex;gap:16px;align-items:flex-start';

    /* left column */
    var left = el('div');
    left.style.cssText = 'flex:1;min-width:0';

    left.innerHTML = '<div style="font-weight:600;color:var(--tx3);margin-bottom:6px">📖 收集「第一次」</div>';

    var progressEl = el('div');
    progressEl.style.cssText = 'font-size:13px;color:var(--tx);margin-bottom:8px';
    progressEl.textContent = '已收集 ' + collected + ' / ' + total + ' 个「第一次」';
    left.appendChild(progressEl);

    /* title / next unlock */
    var titleEl = el('div');
    titleEl.style.cssText = 'font-size:12.5px;color:var(--tx2);margin-bottom:10px';
    if (diary && diary.unlock_tier) {
      var tier = diary.unlock_tier(collected);
      if (tier && tier.title) {
        titleEl.innerHTML = '当前称号：' + escHtml(tier.title);
      } else {
        titleEl.textContent = '再集齐 ' + (total - collected) + ' 个，解锁下一个称号';
      }
    }
    left.appendChild(titleEl);

    /* firsts list */
    var view = el('div', 'paper');
    if (firsts.length === 0) {
      view.textContent = '还没有任何「第一次」哦。\n\n多摸摸我、喂喂我、陪我玩小游戏……\n和小狗一起慢慢创造属于我们的回忆吧~ 🐾';
    } else {
      var lines = [];
      for (var i = 0; i < firsts.length; i++) {
        var f = firsts[i];
        lines.push('第 ' + (i + 1) + ' 个「第一次」\n ' + (f.date || '') + ' · 第一次' + (f.label || ''));
      }
      view.textContent = lines.join('\n\n');
    }
    left.appendChild(view);

    left.appendChild(makeHint('集齐更多「第一次」，解锁专属称号与小惊喜~ 多陪陪小狗吧！'));

    cols.appendChild(left);

    /* right column */
    var right = el('div');
    right.style.cssText = 'flex:none;width:280px';

    /* badges */
    var badgeGroup = makeGroup('🏅 成就徽章');
    var badgeGrid = el('div', 'badge-grid');
    badgeGrid.style.cssText = 'display:flex;gap:10px;justify-content:center';

    var badges = [
      { emoji: '📅', name: '连续陪伴', val: (ms.streak || 0) + ' 天', active: (ms.streak || 0) >= 3 },
      { emoji: '🥚', name: '彩蛋触发', val: (ms.eggs || 0) + ' 次', active: (ms.eggs || 0) >= 1 },
      { emoji: '👕', name: '服饰收集', val: (ms.outfits || 0) + ' 件', active: (ms.outfits || 0) >= 1 }
    ];
    for (var b = 0; b < badges.length; b++) {
      var bd = badges[b];
      var card = el('div', 'card' + (bd.active ? '' : ' lock'));
      var dot = el('div', 'dot', bd.emoji);
      card.appendChild(dot);
      var t = el('div', 't');
      t.innerHTML = '<b>' + escHtml(bd.name) + '</b><span>' + escHtml(bd.val) + '</span>';
      card.appendChild(t);
      badgeGrid.appendChild(card);
    }
    badgeGroup.appendChild(badgeGrid);
    right.appendChild(badgeGroup);

    /* collection */
    var collGroup = makeGroup('🐾 狗狗收藏册');
    var collGrid = el('div', 'badge-grid');
    var collection = ms.collection || [];
    if (collection.length === 0) {
      collGrid.appendChild(el('div', 'hint', '还没有收藏~'));
    } else {
      for (var ci = 0; ci < collection.length; ci++) {
        var item = collection[ci];
        var cc = el('div', 'card');
        var ccDot = el('div', 'dot', item.emoji || '?');
        cc.appendChild(ccDot);
        var ccT = el('div', 't');
        ccT.innerHTML = '<b>' + escHtml(item.name || '') + '</b><span>×' + (item.count || 1) + '</span>';
        cc.appendChild(ccT);
        collGrid.appendChild(cc);
      }
    }
    collGroup.appendChild(collGrid);
    right.appendChild(collGroup);

    cols.appendChild(right);
    body.appendChild(cols);

    openDialog();
  }

  /* ======================================================================
   * 10. Dialog open/close helpers
   * ====================================================================== */
  function openDialog() {
    var root = $('dlgroot');
    if (root) root.classList.add('open');
  }

  function closeDialog() {
    var root = $('dlgroot');
    if (root) root.classList.remove('open');
  }

  /* ======================================================================
   * 11. Character helpers
   * ====================================================================== */
  function getCharacters() {
    var base = [];
    if (global.AssetIndex && global.AssetIndex.characters) {
      base = global.AssetIndex.characters() || [];
    }
    if (base.length === 0) base = ['xiaobai'];
    var custom = getCustomCharacters();
    for (var i = 0; i < custom.length; i++) {
      if (base.indexOf(custom[i]) < 0) base.push(custom[i]);
    }
    return base;
  }

  function getCustomCharacters() {
    try {
      var raw = localStorage.getItem('linedogpet.custom_chars');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  /* ======================================================================
   * 12. Expose window.Panels
   * ====================================================================== */
  global.Panels = {
    apply_theme: applyTheme,
    open_settings: openSettings,
    open_status: openStatus,
    open_chat: openChat,
    open_diary: openDiary,
    open_milestone: openMilestone,
    close_dialog: closeDialog,
    /* utilities for app.js */
    color_family: colorFamily,
    hint_color: hintColor,
    STATE_TEXT: STATE_TEXT,
    ACTION_CN: ACTION_CN,
    FPS_ITEMS: FPS_ITEMS,
    FOLLOW_ITEMS: FOLLOW_ITEMS,
    CORNER_ITEMS: CORNER_ITEMS,
    THEME_PRESETS: THEME_PRESETS
  };

})(window);
