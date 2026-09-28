/* =============================================================================
 * ai.js — LineDogPet Web port
 * 对应原 smartpet/ai.py
 * 原版：requests.post → OpenAI 兼容接口（QThread 子线程）
 * 网页：fetch POST（浏览器直连第三方 API，CORS 是真实限制）
 * 未配置 ai_key 或 fetch 失败 → 本地兜底（COMMAND_REPLIES + 关键词匹配）
 * ========================================================================== */
(function (global) {
  'use strict';

  var D = (global.Core && Core.DATA && Core.DATA.ai) || {};
  var PROVIDERS             = D.PROVIDERS             || {};
  var PERSONA               = D.PERSONA               || {};
  var CHAR_NAMES            = D.CHAR_NAMES            || {};
  var _DEFAULT_CUSTOM_PERSONA = D._DEFAULT_CUSTOM_PERSONA || '';
  var COMMAND_REPLIES       = D.COMMAND_REPLIES       || {};

  /* =========================================================================
   * 内部工具
   * ======================================================================= */

  function _short(s, n) {
    s = String(s).replace(/\n/g, ' ');
    if (s.length <= n) return s;
    return s.slice(0, n) + '\u2026';
  }

  /* =========================================================================
   * character_display_name(character) — 形象 id → 展示名
   * ======================================================================= */

  function character_display_name(character) {
    return CHAR_NAMES[character || ''] || character || '\u5C0F\u767D';
  }

  /* =========================================================================
   * persona_for(cfg, character) — 返回某个形象的 AI 人设文本
   * ======================================================================= */

  function persona_for(cfg, character) {
    var ch = character;
    if (!ch) {
      ch = (cfg && typeof cfg === 'object' && cfg.character) || 'xiaobai';
    }

    /* 优先级：用户自定义 > 内置 > 通用模板 */
    var personas = {};
    if (cfg && typeof cfg === 'object') {
      personas = cfg.ai_personas || {};
    }
    var custom = personas[ch];
    if (custom && String(custom).strip) {
      /* ES5 没有 String.strip，用 trim */
    }
    if (custom && String(custom).replace(/^\s+|\s+$/g, '')) {
      return String(custom).replace(/^\s+|\s+$/g, '');
    }

    if (PERSONA.hasOwnProperty(ch)) {
      return PERSONA[ch];
    }

    /* 通用模板：替换 {name} */
    var name = character_display_name(ch);
    return _DEFAULT_CUSTOM_PERSONA.replace(/\{name\}/g, name);
  }

  /* =========================================================================
   * build_system_prompt(cfg, context_text) — 拼接 system prompt
   * ======================================================================= */

  function build_system_prompt(cfg, context_text) {
    var prompt = persona_for(cfg);
    if (context_text) {
      prompt += '\n\n\u4E0B\u9762\u662F\u7A0B\u5E8F\u5728\u672C\u5730\u611F\u77E5\u5230\u7684\u5F53\u524D\u73AF\u5883' +
        '\uFF08\u4EC5\u968F\u8BF7\u6C42\u53D1\u9001\u7ED9\u4F60\u914D\u7F6E\u7684API\uFF0C\u8BF7\u7ED3\u5408\u573A\u666F' +
        '\u81EA\u7136\u5730\u56DE\u590D\uFF0C\u4E0D\u8981\u9010\u6761\u7F57\u5217\uFF09\uFF1A\n' + context_text;
    }
    return prompt;
  }

  /* =========================================================================
   * parse(text) — 解析用户输入中的命令标记
   * 返回 {reply, command} 或 null
   * command = [kind, arg] 或 null
   * ======================================================================= */

  function parse(text) {
    var t = String(text).replace(/^\s+|\s+$/g, '');

    /* 命令正则匹配（verbatim 来自 ai.asm.txt parse_command） */
    var patterns = [
      ['\u8EB2\u732B\u732B|\u6349\u8FF7\u85CF', 'hidegame', null],
      ['\u966A\u6211\u73A9|\u8FFD\u7403|\u8FFD\u5C0F\u7403|\u73A9\u7403|\u5C0F\u7403', 'chase', null],
      ['\u53D8\u5C0F|\u7F29\u5C0F|\u5C0F\u4E00\u70B9|\u5C0F\u70B9', 'size', -20],
      ['\u53D8\u5927|\u5927\u4E00\u70B9|\u5927\u70B9', 'size', 20],
      ['\u8EB2\u8D77\u6765|\u85CF\u8D77\u6765|\u9690\u8EAB|\u9690\u85CF|\u6D88\u5931', 'hide', null],
      ['\u51FA\u6765|\u51FA\u73B0|\u56DE\u6765|\u732E\u8EAB|\u522B\u8EB2', 'show', null],
      ['\u5B89\u9759|\u9759\u97F3|\u522B\u53EB|\u4E0D\u8981\u53EB|\u5173\u6389\u58F0\u97F3|\u5173\u95ED\u58F0\u97F3|\u5173\u58F0\u97F3', 'sound', false],
      ['\u6253\u5F00\u58F0\u97F3|\u5F00\u542F\u58F0\u97F3|\u58F0\u97F3\u6253\u5F00|\u53EF\u4EE5\u53EB', 'sound', true],
      ['\u53BB\u7761|\u7761\u89C9|\u7761\u4E00\u4F1A|\u7761\u4F1A\u513F', 'sleep', null],
      ['\u5582\u98DF|\u5582\u4F60|\u60F3\u5403|\u5403\u4E1C\u897F|\u5403\u70B9', 'feed', null]
    ];

    for (var i = 0; i < patterns.length; i++) {
      var re = new RegExp(patterns[i][0]);
      if (re.test(t)) {
        var kind = patterns[i][1];
        var arg  = patterns[i][2];
        var reply = _command_reply(kind, arg);
        return { reply: reply, command: [kind, arg] };
      }
    }

    return null;
  }

  /* 根据 command 返回对应 COMMAND_REPLIES 文案 */
  function _command_reply(kind, arg) {
    if (kind === 'size') {
      var sizeObj = COMMAND_REPLIES.size || {};
      return arg < 0 ? (sizeObj['True'] || '\u6211\u53D8\u5C0F\u53EA\u4E00\u70B9\u5566~') :
                        (sizeObj['False'] || '\u6211\u957F\u5927\u54AF\uFF01');
    }
    var key = kind;
    if (kind === 'sound') {
      key = arg ? 'sound_on' : 'sound_off';
    }
    return COMMAND_REPLIES[key] || '\u597D~';
  }

  /* =========================================================================
   * AI 公开 API
   * ======================================================================= */

  var AI = {};

  /**
   * providers() — 返回 PROVIDERS 数据表
   */
  AI.providers = function () { return PROVIDERS; };

  /**
   * persona(cfg) — 返回当前角色的人设文本
   */
  AI.persona = function (cfg) { return persona_for(cfg); };

  /**
   * parse(text) — 解析命令（见上）
   */
  AI.parse = parse;

  /**
   * chat(user_text, ctx_text, cfg, cb_ok, cb_err)
   *
   * 主流程：
   * 1. 先尝试 parse(text) 命令匹配 → 命中则 cb_ok({reply, command, fallback:true})
   * 2. 检查 ai_key / ai_base → 未配置则走本地兜底
   * 3. fetch POST → 成功则 cb_ok({reply, command:null})
   * 4. 失败（CORS/网络/HTTP 错误）→ cb_err(msg) 或本地兜底 cb_ok({reply, fallback:true})
   *
   * 注意：浏览器直连第三方 API 大概率被 CORS 拦截，这是真实限制。
   * cb_ok 返回对象 {reply:string, command:[kind,arg]|null, fallback:boolean}
   */
  AI.chat = function (user_text, ctx_text, cfg, cb_ok, cb_err) {
    cfg = cfg || {};

    /* 1. 命令匹配 */
    var cmd = parse(user_text);
    if (cmd) {
      if (cb_ok) cb_ok({ reply: cmd.reply, command: cmd.command, fallback: true });
      return;
    }

    /* 2. 检查配置 */
    var base = String(cfg.ai_base || '').replace(/\/+$/, '');
    var key  = String(cfg.ai_key  || '');
    var model = cfg.ai_model || 'gpt-4o-mini';

    if (!base || !key) {
      var tip = '\u8FD8\u6CA1\u586B API \u5730\u5740\u6216\u5BC6\u94A5\u54E6' +
        '\uFF08\u6258\u76D8\u53F3\u952E \u2192 \u8BBE\u7F6E \u2192 AI\uFF09';
      if (cb_ok) cb_ok({ reply: _local_fallback(user_text), command: null, fallback: true });
      if (cb_err) cb_err(tip);
      return;
    }

    /* 3. 构建请求 */
    var url = base;
    if (url.indexOf('/chat/completions') === -1) {
      url = url + '/chat/completions';
    }

    var sysPrompt = build_system_prompt(cfg, ctx_text);
    var messages = [{ role: 'system', content: sysPrompt }];

    /* 历史（最近 10 条） */
    if (cfg.ai_history && cfg.ai_history.length > 0) {
      var hist = cfg.ai_history.slice(-10);
      for (var i = 0; i < hist.length; i++) {
        messages.push({ role: hist[i].role, content: hist[i].content });
      }
    }

    /* 确保最后一条是 user */
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', content: user_text });
    }

    var body = JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.8,
      max_tokens: 120,
      stream: false
    });

    /* 4. fetch */
    try {
      fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: body
      }).then(function (resp) {
        if (resp.status !== 200) {
          resp.text().then(function (txt) {
            var errMsg = 'API \u8FD4\u56DE\u9519\u8BEF ' + resp.status + '\uFF1A' + _short(txt, 80);
            if (cb_err) cb_err(errMsg);
          });
          return;
        }
        return resp.json();
      }).then(function (data) {
        if (!data) return; /* 已在上面处理了非 200 */
        try {
          var text = data.choices[0].message.content.replace(/^\s+|\s+$/g, '');
          /* 解析回复中的命令 */
          var cmd2 = parse(text);
          if (cb_ok) cb_ok({ reply: _short(text, 300), command: cmd2 ? cmd2.command : null, fallback: false });
        } catch (e2) {
          if (cb_err) cb_err('API \u8FD4\u56DE\u683C\u5F0F\u770B\u4E0D\u61C2\u2026\u6362\u4E2A\u6A21\u578B\u8BD5\u8BD5\uFF1F');
        }
      })['catch'](function (err) {
        /* CORS / 网络错误 */
        var msg = String(err && err.message ? err.message : err);
        var corsHint = '\u8FDE\u4E0D\u4E0A API\uFF1A' + _short(msg, 80) +
          '\u3002\u6D4F\u89C8\u5668\u76F4\u8FDE\u7B2C\u4E09\u65B9 API \u5927\u6982\u7387\u88AB CORS ' +
          '\u62E6\u622A\uFF0C\u8FD9\u662F\u6D4F\u89C8\u5668\u5B89\u5168\u7B56\u7565\u9650\u5236\uFF0C' +
          '\u53EF\u5C1D\u8BD5\u914D\u7F6E\u652F\u6301 CORS \u7684\u4EE3\u7406\uFF0C\u6216\u4F7F\u7528\u672C\u5730\u514D\u8D39\u5BF9\u8BDD\u3002';
        if (cb_err) cb_err(corsHint);
      });
    } catch (e) {
      if (cb_err) cb_err('\u8FDE\u4E0D\u4E0A API\uFF1A' + _short(String(e), 80));
    }
  };

  /* =========================================================================
   * 本地兜底 — 关键词匹配 + COMMAND_REPLIES 随机回复
   * ======================================================================= */

  var _fallback_replies = [
    '\u6C6A\uFF01\u6211\u542C\u4E0D\u61C2\u4F60\u5728\u8BF4\u4EC0\u4E48~',
    '\u5582\uFF0C\u4F60\u5728\u53EB\u6211\u5417\uFF1F',
    '\u597D\u5440\u597D\u5440\uFF01',
    '\u6211\u7684\u5C0F\u8111\u888B\u6CA1\u7535\u4E86\u2026',
    '\u6447\u5C3E\u5DF4\u2026\u6447\u5C3E\u5DF4\u2026',
    '\u62B1\u62B1\u4F60~',
    '\u4ECA\u5929\u5929\u6C14\u4E0D\u9519\u54E6\uFF01',
    '\u53EF\u4EE5\u966A\u6211\u73A9\u4E00\u4F1A\u513F\u5417\uFF1F'
  ];

  var _keyword_map = [
    ['\u4F60\u597D|\u55E8|hi|hello', '\u6C6A\uFF01\u4F60\u597D\u5440~'],
    ['\u8C22\u8C22|\u591A\u8C22', '\u4E0D\u7528\u8C22\u5566\uFF0C\u6211\u559C\u6B22\u4F60\uFF01'],
    ['\u53EF\u7231|\u840C', '\u563F\u563F\uFF0C\u4F60\u624D\u53EF\u7231\u5462~'],
    ['\u96BE\u8FC7|\u4E0D\u5F00\u5FC3|\u4F24\u5FC3', '\u522B\u96BE\u8FC7\uFF0C\u6211\u966A\u4F60\uFF01\u62B1\u62B1~'],
    ['\u52A0\u6CB9|\u52AA\u529B', '\u52A0\u6CB9\u52A0\u6CB9\uFF01\u4F60\u6700\u68D2\uFF01'],
    ['\u5403\u996D|\u997F\u4E86|\u5403\u4EC0\u4E48', '\u6211\u4E5F\u60F3\u5403\u597D\u5403\u7684\u2026'],
    ['\u665A\u5B89|\u7761\u89C9', '\u665A\u5B89\uFF0C\u597D\u68A6~\uD83C\uDF19'],
    ['\u65E9\u5B89|\u65E9\u4E0A\u597D', '\u65E9\u5B89\uFF01\u4ECA\u5929\u4E5F\u8981\u52A0\u6CB9\u5440~']
  ];

  function _local_fallback(text) {
    var t = String(text).replace(/^\s+|\s+$/g, '');
    for (var i = 0; i < _keyword_map.length; i++) {
      var re = new RegExp(_keyword_map[i][0]);
      if (re.test(t)) return _keyword_map[i][1];
    }
    /* 随机回复 */
    return _fallback_replies[Math.floor(Math.random() * _fallback_replies.length)];
  }

  /* ---- 暴露全局 ---- */
  AI.character_display_name = character_display_name;
  AI.persona_for = persona_for;
  AI.build_system_prompt = build_system_prompt;
  AI.COMMAND_REPLIES = COMMAND_REPLIES;
  AI._local_fallback = _local_fallback;

  global.AI = AI;

})(window);
