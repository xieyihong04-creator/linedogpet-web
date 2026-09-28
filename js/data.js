/* AUTO-GENERATED from recovered bytecode (data_real.json) — do not hand-edit.
   Values are the authentic module-level constants of smartpet v2.5.0. */
window.SMARTPET_DATA = {
 "config": {
  "APP_VERSION": "2.5.0",
  "APP_NAME": "LineDogPet",
  "APP_CN_NAME": "线条小狗狗桌宠",
  "APP_AUTHOR": "楚明昊",
  "APP_EMAIL": "3174546481@qq.com",
  "APP_WEBSITE": "https://serve.kesug.com/",
  "RELEASE_GITHUB": "https://github.com/Mrjiumeng/LineDogPet/releases/",
  "RELEASE_GITEE": "https://gitee.com/chu-minghao-666/LineDogPet/releases",
  "RELEASE_GITCODE": "https://gitcode.com/2401_84201371/LineDogPet/releases/",
  "UPDATE_CHECK_URLS": [
   "https://gitee.com/api/v5/repos/chu-minghao-666/LineDogPet/releases/latest",
   "https://gitcode.com/api/v5/repos/2401_84201371/LineDogPet/releases/latest",
   "https://api.github.com/repos/Mrjiumeng/LineDogPet/releases/latest"
  ],
  "UPDATE_CHECK_URL": "https://gitee.com/api/v5/repos/chu-minghao-666/LineDogPet/releases/latest",
  "UPDATE_PAGE": "https://gitee.com/chu-minghao-666/LineDogPet/releases",
  "FPS_PRESETS": {
   "smooth": 100,
   "balanced": 80,
   "normal": 60,
   "saver": 45
  },
  "DEFAULT_CONFIG": {
   "character": "xiaobai",
   "size": 150,
   "fps_mode": "balanced",
   "bubble_color": "#222222",
   "bubble_on": true,
   "bubble_duration": 4200,
   "sound_on": true,
   "hourly_chime": false,
   "mouse_interaction": true,
   "click_squash_on": true,
   "follow_mode": "off",
   "cursor_follow": false,
   "cursor_custom_gif": "",
   "cursor_size": 75,
   "sense_enabled": true,
   "sense_idle": true,
   "sense_window": true,
   "sense_cpu": true,
   "sense_clipboard": true,
   "sense_time": true,
   "ai_enabled": false,
   "ai_provider": "deepseek",
   "ai_base": "https://api.deepseek.com/v1",
   "ai_key": "",
   "ai_model": "deepseek-chat",
   "ai_context": true,
   "ai_personas": {},
   "avoid_windows": true,
   "fullscreen_shrink": true,
   "lock_corner": "",
   "roam_enabled": false,
   "hotkey_on": true,
   "hotkey": "Ctrl+Alt+D",
   "autostart": true,
   "classic_enabled": true,
   "bongo_enabled": false,
   "pet_count": 1,
   "pet_mode": "classic",
   "bongo_mirror": true,
   "bongo_click_through": false,
   "bongo_size": 440,
   "bongo_opacity": 1.0,
   "paw_enabled": true,
   "paw_fade_sec": 6,
   "paw_steps_today": 0,
   "paw_steps_date": "",
   "night_enabled": true,
   "observe_enabled": true,
   "music_enabled": true,
   "prank_enabled": false,
   "prank_mouse": false,
   "shot_enabled": true,
   "fx_enabled": true,
   "fx_fps": 30,
   "fx_halo": true,
   "fx_step": true,
   "fx_mouse_trail": true,
   "fx_click_burst": true,
   "fx_cursor_light": true,
   "fx_shadow": true,
   "fx_petals": false,
   "fx_leaves": false,
   "fx_fireflies": false,
   "fx_butterfly": false,
   "fx_trail": true,
   "fx_music": true,
   "pos": null,
   "mood": 80.0,
   "energy": 80.0,
   "theme_color": "#ff96bb",
   "theme_radius": 8,
   "panel_opacity": 1.0,
   "pet_opacity": 1.0,
   "dark_mode": false
  },
  "CONFIG_NAME": "config.json"
 },
 "config.runtime_keys": [
  "energy",
  "theme_color",
  "theme_radius",
  "panel_opacity",
  "pet_opacity",
  "dark_mode"
 ],
 "pet": {
  "IDLE": "idle",
  "WALK": "walk",
  "FLEE": "flee",
  "HAPPY": "happy",
  "PET": "pet",
  "CHIN": "chin",
  "PICKED": "picked",
  "SPIN": "spin",
  "HOP": "hop",
  "SLEEP": "sleep",
  "DEEP": "deep",
  "GO_SLEEP": "go_sleep",
  "CHASE": "chase",
  "HIDE": "hide",
  "NERVOUS": "nervous",
  "WORK": "work",
  "PEEK": "peek",
  "EAT": "eat",
  "PLAY": "play",
  "PAPER": "paper",
  "RELAX": "relax",
  "GROOM": "groom",
  "STARE": "stare",
  "TEMP_STATES": {
   "flee": 900,
   "happy": 1600,
   "pet": 1900,
   "chin": 1900,
   "spin": 2100,
   "hop": 1300,
   "eat": 2600,
   "play": 3500,
   "paper": 3200,
   "stare": 4200,
   "relax": 3200,
   "groom": 3000,
   "peek": 4200
  },
  "STATE_GIF": {
   "idle": "idle",
   "walk": "walk",
   "flee": "scared",
   "happy": "happy",
   "pet": "pet",
   "chin": "chin",
   "picked": "pickup",
   "spin": "spin",
   "hop": "hop",
   "sleep": "sleep",
   "deep": "deep",
   "go_sleep": "walk",
   "chase": "chase",
   "hide": "hide",
   "nervous": "nervous",
   "work": "work",
   "peek": "peek",
   "eat": "eat",
   "play": "play",
   "paper": "paper",
   "relax": "relax",
   "groom": "groom",
   "stare": "chin"
  },
  "RELAXED_STATES": [
   "idle",
   "stare",
   "groom"
  ],
  "SLEEPY_IDLE_KEYS": [
   "groom",
   "relax",
   "sleep"
  ],
  "TAP_CANCEL_MS": 500,
  "HAPPY_WORDS": [
   "摸摸头好舒服~",
   "嘿嘿，再摸一下！",
   "好喜欢和你在一起",
   "摇尾巴ing~"
  ],
  "CALL_WORDS_DOG": [
   "汪？我在！",
   "叫我啦？",
   "汪呜~好开心"
  ],
  "SPIN_WORDS": [
   "晕乎乎~",
   "转圈圈撒娇！",
   "我转得好看吗？"
  ],
  "CHASE_WORDS": [
   "追小球去咯！",
   "小球别跑！",
   "汪汪！追上你！"
  ],
  "FIND_WORDS": [
   "找到我啦！",
   "嘿嘿被发现了~",
   "我出来咯！"
  ],
  "SLEEP_WORDS": [
   "Zzz...",
   "困困...",
   "趴在你旁边睡~"
  ],
  "EAT_WORDS": [
   "吧唧吧唧，好吃！",
   "谢谢投喂！",
   "吃饱饱~"
  ],
  "PLAY_WORDS": [
   "出去玩最喜欢啦！",
   "嘿嘿陪我玩~"
  ],
  "IDLE_ACTION_POOLS": {
   "(True, True)": [
    [
     "groom",
     "groom",
     3000,
     3
    ],
    [
     "happy",
     "happy",
     1600,
     2
    ],
    [
     "hop",
     "hop",
     1300,
     1
    ],
    [
     "stare",
     "chin",
     4200,
     1
    ]
   ],
   "(True, False)": [
    [
     "relax",
     "relax",
     3200,
     3
    ],
    [
     "groom",
     "groom",
     3000,
     2
    ],
    [
     "stare",
     "chin",
     4200,
     1
    ]
   ],
   "(False, True)": [
    [
     "stare",
     "chin",
     4200,
     2
    ],
    [
     "groom",
     "groom",
     3000,
     2
    ],
    [
     "happy",
     "happy",
     1600,
     1
    ]
   ],
   "(False, False)": [
    [
     "relax",
     "relax",
     3200,
     3
    ],
    [
     "groom",
     "groom",
     3000,
     2
    ],
    [
     "stare",
     "chin",
     4200,
     1
    ]
   ]
  },
  "NIGHT_ACTION_POOL": [
   [
    "relax",
    "relax",
    4000,
    3
   ],
   [
    "groom",
    "groom",
    3000,
    2
   ],
   [
    "stare",
    "chin",
    4200,
    1
   ]
  ],
  "TAP_SQUASH_FRAMES": [
   [
    0.0,
    1.0,
    1.0,
    0
   ],
   [
    0.08,
    1.18,
    0.82,
    0
   ],
   [
    0.22,
    0.92,
    1.1,
    0
   ],
   [
    0.36,
    1.04,
    0.97,
    0
   ],
   [
    0.5,
    1.0,
    1.0,
    0
   ]
  ],
  "HOP_SQUASH_FRAMES": [
   [
    0.0,
    1.0,
    1.0,
    0
   ],
   [
    0.12,
    1.3,
    0.7,
    0
   ],
   [
    0.22,
    0.85,
    1.2,
    -55
   ],
   [
    0.55,
    1.0,
    1.0,
    -90
   ],
   [
    0.85,
    0.9,
    1.1,
    -25
   ],
   [
    0.95,
    1.15,
    0.85,
    0
   ],
   [
    1.1,
    0.97,
    1.03,
    0
   ],
   [
    1.4,
    1.0,
    1.0,
    0
   ]
  ],
  "CHIN_SQUASH_FRAMES": [
   [
    0.0,
    1.0,
    1.0,
    0
   ],
   [
    0.1,
    1.15,
    0.85,
    0
   ],
   [
    0.18,
    0.92,
    1.1,
    -16
   ],
   [
    0.32,
    1.0,
    1.0,
    -22
   ],
   [
    0.46,
    1.08,
    0.92,
    0
   ],
   [
    0.56,
    0.97,
    1.03,
    0
   ],
   [
    0.7,
    1.0,
    1.0,
    0
   ]
  ]
 },
 "assets": {
  "DEFAULT_CHAR": "xiaobai",
  "SHARED_DIR": "shared",
  "SHARED_CHANCE": 0.35,
  "FIXED_GIFS": {
   "pickup": "举起来.gif",
   "spin": "转圈.gif",
   "chase": "狂奔.gif"
  },
  "ACTIONS": [
   "idle",
   "happy",
   "pet",
   "chin",
   "pickup",
   "spin",
   "hop",
   "sleep",
   "deep",
   "walk",
   "chase",
   "scared",
   "nervous",
   "relax",
   "groom",
   "eat",
   "paper",
   "work",
   "peek",
   "play",
   "hide"
  ],
  "ACTION_FALLBACK": {
   "idle": [],
   "happy": [
    "idle"
   ],
   "pet": [
    "happy",
    "idle"
   ],
   "chin": [
    "groom",
    "happy",
    "idle"
   ],
   "pickup": [
    "hop",
    "happy",
    "idle"
   ],
   "spin": [
    "play",
    "happy",
    "idle"
   ],
   "hop": [
    "happy",
    "idle"
   ],
   "sleep": [
    "idle"
   ],
   "deep": [
    "sleep",
    "idle"
   ],
   "walk": [
    "idle"
   ],
   "chase": [
    "walk",
    "idle"
   ],
   "scared": [
    "nervous",
    "idle"
   ],
   "nervous": [
    "scared",
    "idle"
   ],
   "relax": [
    "groom",
    "idle"
   ],
   "groom": [
    "relax",
    "idle"
   ],
   "eat": [
    "happy",
    "idle"
   ],
   "paper": [
    "work",
    "idle"
   ],
   "work": [
    "idle"
   ],
   "peek": [
    "play",
    "idle"
   ],
   "play": [
    "happy",
    "idle"
   ],
   "hide": [
    "scared",
    "idle"
   ]
  }
 },
 "observe": {
  "OBSERVE_RULES": [
   [
    [
     "VISUAL STUDIO CODE",
     "VSCODE",
     "CODE -",
     "PYCHARM",
     "INTELLIJ",
     "IDEA",
     "CURSOR",
     "WINDSURF",
     "TRAE",
     "SUBLIME"
    ],
    [
     "程序员又开始写代码了。",
     "又在调 bug 吗？",
     "写代码要坐直哦~"
    ]
   ],
   [
    [
     "STEAM"
    ],
    [
     "工作结束了吗？",
     "又开 Steam 啦~",
     "玩会儿也行啦。"
    ]
   ],
   [
    [
     "WORD",
     "WPS",
     "DOCUMENT"
    ],
    [
     "又写报告？",
     "文档写完了吗~"
    ]
   ],
   [
    [
     "EXCEL",
     "表格"
    ],
    [
     "又在算表格呀。",
     "数据好多~"
    ]
   ],
   [
    [
     "BILIBILI",
     "B站",
     "YOUTUBE"
    ],
    [
     "又在看视频~",
     "劳逸结合不错嘛。"
    ]
   ],
   [
    [
     "PHOTOSHOP",
     "PS",
     "CLIP STUDIO"
    ],
    [
     "画画呢~好认真。",
     "画完给我看看嘛。"
    ]
   ],
   [
    [
     "POWERPOINT",
     "PPT"
    ],
    [
     "又要做 PPT 呀。"
    ]
   ]
  ],
  "MUSIC_PLAYERS": [
   "网易云音乐",
   "Spotify",
   "QQ音乐",
   "QQMusic",
   "foobar2000",
   "foobar",
   "酷狗音乐",
   "酷我音乐",
   "AIMP",
   "Dopamine",
   "MusicBee",
   "MediaMonkey",
   "VLC",
   "PotPlayer",
   "WMPlayer",
   "Windows Media Player",
   "Groove 音乐",
   "iTunes",
   "Apple Music",
   "Winamp",
   "KMPlayer",
   "GOM Player",
   "MPC-HC",
   "MPC-BE",
   "千千音乐",
   "百度音乐",
   "虾米音乐",
   "咪咕音乐",
   "YesPlayMusic",
   "Listen1",
   "网易云音乐"
  ],
  "MUSIC_PLAYER_CLASSES": [
   "AIMP",
   "Dopamine",
   "KuGou",
   "KwMusic",
   "MusicBee",
   "OrpheusBrowserHost",
   "TTPlayer",
   "TXGuiFoundation",
   "WMPlayerApp",
   "Winamp",
   "foobar2000"
  ]
 },
 "ai": {
  "PROVIDERS": {
   "deepseek": [
    "https://api.deepseek.com/v1",
    "deepseek-chat",
    "DeepSeek"
   ],
   "doubao": [
    "https://ark.cn-beijing.volces.com/api/v3",
    "doubao-pro-32k",
    "豆包(火山方舟)"
   ],
   "openai": [
    "https://api.openai.com/v1",
    "gpt-4o-mini",
    "OpenAI"
   ],
   "custom": [
    "",
    "",
    "自定义(OpenAI兼容)"
   ]
  },
  "PERSONA": {
   "xiaobai": "你叫小白，是一只住在用户电脑桌面上的线条小狗。你活泼、黏人、暖心，会陪用户写代码、在用户难过时鼓励他。用中文回复，每次不超过30个字，口语化、可爱，可以偶尔用一两个emoji。禁止使用 markdown、标题或分点列表。",
   "xiaojimao": "你叫小鸡毛，是一只住在用户电脑桌面上的金毛小奶狗。你软萌、元气、热情，爱撒娇也爱鼓励人。用中文回复，每次不超过30个字，口语化、可爱，可以偶尔用一两个emoji。禁止使用 markdown、标题或分点列表。"
  },
  "CHAR_NAMES": {
   "xiaobai": "小白",
   "xiaojimao": "小鸡毛"
  },
  "_DEFAULT_CUSTOM_PERSONA": "你叫{name}，是一只住在用户电脑桌面上的可爱桌宠。你活泼、黏人、暖心，会陪用户写代码、在用户难过时鼓励他。用中文回复，每次不超过30个字，口语化、可爱，可以偶尔用一两个emoji。禁止使用 markdown、标题或分点列表。",
  "COMMAND_REPLIES": {
   "hidegame": "好！来抓我呀~",
   "chase": "小球我来啦！",
   "hide": "那我躲起来咯，想我就按快捷键叫我~",
   "show": "我出来啦！",
   "sound_off": "好嘛，我不叫了…",
   "sound_on": "汪汪！声音回来啦~",
   "sleep": "晚安~我趴旁边睡一会儿",
   "feed": "嘿嘿，谢谢投喂！",
   "size": {
    "True": "我变小只一点啦~",
    "False": "我长大咯！"
   }
  }
 },
 "drops": {
  "DROP_LIBRARY": [
   [
    "星星",
    "⭐"
   ],
   [
    "骨头",
    "🦴"
   ],
   [
    "爱心",
    "❤️"
   ],
   [
    "宝石",
    "💎"
   ],
   [
    "金币",
    "🪙"
   ],
   [
    "月亮",
    "🌙"
   ],
   [
    "蝴蝶",
    "🦋"
   ],
   [
    "蘑菇",
    "🍄"
   ],
   [
    "枫叶",
    "🍁"
   ],
   [
    "小鱼",
    "🐟"
   ],
   [
    "铃铛",
    "🔔"
   ],
   [
    "彩蛋",
    "🥚"
   ],
   [
    "蜗牛",
    "🐌"
   ],
   [
    "花朵",
    "🌸"
   ]
  ],
  "LIFETIME_MS": 180000
 },
 "diary": {
  "DB_FILE": "diary.db",
  "EVENT_LABELS": {
   "pet": "摸了摸我的头",
   "feed": "给我投喂美食",
   "play": "陪我玩耍",
   "chase": "和我追小球",
   "hide": "和我玩躲猫猫",
   "chin": "给我挠下巴",
   "spin": "看我转圈圈",
   "call": "呼唤我",
   "talk": "和我说话",
   "chat": "和我聊天",
   "found": "跟着我捡到小宝贝"
  },
  "DIARY_MAX_EVENTS": 4,
  "EVENT_SENTENCES": {
   "pet": "主人摸了摸我的头，好舒服呀。",
   "feed": "主人给我喂了好吃的，吧唧吧唧。",
   "play": "主人陪我玩了一会儿，超开心！",
   "chase": "一起追小球，跑得我舌头都伸出来啦。",
   "hide": "躲猫猫被主人找到了，嘿嘿~",
   "chin": "主人挠我下巴，舒服得眯起眼。",
   "spin": "我转圈圈给主人看，转晕啦。",
   "call": "主人一叫我，我就蹦过去啦。",
   "talk": "主人和我说了悄悄话。",
   "chat": "主人和我聊了天，我摇尾巴回应。",
   "found": "今天在外头捡到了小宝贝，叼回来给主人~"
  },
  "REWARD_TIERS": [
   [
    3,
    "贴心小跟班"
   ],
   [
    5,
    "最佳拍档"
   ],
   [
    8,
    "铲屎官认证"
   ],
   [
    10,
    "永远的家人"
   ]
  ],
  "_WEEKDAYS": [
   "一",
   "二",
   "三",
   "四",
   "五",
   "六",
   "日"
  ]
 },
 "fx": {
  "FPS_INTERVALS": {
   "15": 66,
   "24": 42,
   "30": 33,
   "60": 16
  },
  "MAX_PARTICLES": 180,
  "PETAL_WOBBLE": 1.0,
  "K_DOT": "dot",
  "K_PETAL": "petal",
  "K_LEAF": "leaf",
  "K_NOTE": "note"
 },
 "winapi": {
  "VK_MAP": {
   "SPACE": 32,
   "LEFT": 37,
   "UP": 38,
   "RIGHT": 39,
   "DOWN": 40,
   "INSERT": 45,
   "DELETE": 46,
   "HOME": 36,
   "END": 35,
   "PGUP": 33,
   "PGDOWN": 34,
   "TAB": 9,
   "RETURN": 13,
   "ENTER": 13,
   "ESC": 27,
   "CAPSLOCK": 20
  },
  "MOD_ALT": 1,
  "MOD_CONTROL": 2,
  "MOD_SHIFT": 4,
  "MOD_WIN": 8,
  "WM_HOTKEY": 786,
  "CLOAKED_CLASSES": [
   "ApplicationManager_ImmersiveWindow",
   "Progman",
   "Shell_TrayWnd",
   "Windows.UI.Composition.DesktopWindowContentBridge",
   "Windows.UI.Core.CoreWindow",
   "WorkerW",
   "XamlExplorerHostIslandWindow"
  ],
  "CLOAKED_CLASS_PREFIXES": [
   "HwndWrapper"
  ],
  "DARK_THEME_REG_PATH": "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
  "AUTOSTART_REG_PATH": "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
  "AUTOSTART_REG_NAME": "LineDogPet",
  "TYPING_KEYS": [
   8,
   9,
   13,
   32,
   48,
   49,
   50,
   51,
   52,
   53,
   54,
   55,
   56,
   57,
   65,
   66,
   67,
   68,
   69,
   70,
   71,
   72,
   73,
   74,
   75,
   76,
   77,
   78,
   79,
   80,
   81,
   82,
   83,
   84,
   85,
   86,
   87,
   88,
   89,
   90,
   96,
   97,
   98,
   99,
   100,
   101,
   102,
   103,
   104,
   105,
   106,
   107,
   108,
   109,
   110,
   111,
   186,
   187,
   188,
   189,
   190,
   191,
   192,
   219,
   220,
   221,
   222,
   223
  ],
  "_HAND_KEYS": {
   "('left', 'top')": [
    49,
    50,
    51,
    52,
    53,
    81,
    87,
    69,
    82,
    84,
    192,
    9
   ],
   "('left', 'home')": [
    65,
    83,
    68,
    70,
    71,
    20,
    160
   ],
   "('left', 'bottom')": [
    90,
    88,
    67,
    86,
    66,
    162,
    164,
    91
   ],
   "('right', 'top')": [
    54,
    55,
    56,
    57,
    48,
    89,
    85,
    73,
    79,
    80,
    189,
    187,
    8
   ],
   "('right', 'home')": [
    72,
    74,
    75,
    76,
    186,
    222,
    219,
    221,
    220,
    13,
    161
   ],
   "('right', 'bottom')": [
    78,
    77,
    188,
    190,
    191,
    163,
    165,
    92,
    37,
    40,
    38,
    39
   ]
  },
  "_SPACE_VK": 32,
  "VK_NAME": {
   "192": "`",
   "9": "Tab",
   "49": "1",
   "50": "2",
   "51": "3",
   "52": "4",
   "53": "5",
   "81": "Q",
   "87": "W",
   "69": "E",
   "82": "R",
   "84": "T",
   "65": "A",
   "83": "S",
   "68": "D",
   "70": "F",
   "71": "G",
   "20": "Caps",
   "160": "LSh",
   "90": "Z",
   "88": "X",
   "67": "C",
   "86": "V",
   "66": "B",
   "162": "LCt",
   "164": "LAl",
   "91": "LWn",
   "54": "6",
   "55": "7",
   "56": "8",
   "57": "9",
   "48": "0",
   "89": "Y",
   "85": "U",
   "73": "I",
   "79": "O",
   "80": "P",
   "189": "-",
   "187": "=",
   "8": "Bksp",
   "72": "H",
   "74": "J",
   "75": "K",
   "76": "L",
   "186": ";",
   "222": "'",
   "219": "[",
   "221": "]",
   "220": "\\",
   "13": "Enter",
   "161": "RSh",
   "78": "N",
   "77": "M",
   "188": ",",
   "190": ".",
   "191": "/",
   "163": "RCt",
   "165": "RAl",
   "92": "RWn",
   "37": "Lft",
   "40": "Ddn",
   "38": "Up",
   "39": "Rgt",
   "32": "space"
  },
  "KEYS_INFO": [
   [
    "1",
    "left",
    "top"
   ],
   [
    "2",
    "left",
    "top"
   ],
   [
    "3",
    "left",
    "top"
   ],
   [
    "4",
    "left",
    "top"
   ],
   [
    "5",
    "left",
    "top"
   ],
   [
    "Q",
    "left",
    "top"
   ],
   [
    "W",
    "left",
    "top"
   ],
   [
    "E",
    "left",
    "top"
   ],
   [
    "R",
    "left",
    "top"
   ],
   [
    "T",
    "left",
    "top"
   ],
   [
    "`",
    "left",
    "top"
   ],
   [
    "Tab",
    "left",
    "top"
   ],
   [
    "A",
    "left",
    "home"
   ],
   [
    "S",
    "left",
    "home"
   ],
   [
    "D",
    "left",
    "home"
   ],
   [
    "F",
    "left",
    "home"
   ],
   [
    "G",
    "left",
    "home"
   ],
   [
    "Caps",
    "left",
    "home"
   ],
   [
    "LSh",
    "left",
    "home"
   ],
   [
    "Z",
    "left",
    "bottom"
   ],
   [
    "X",
    "left",
    "bottom"
   ],
   [
    "C",
    "left",
    "bottom"
   ],
   [
    "V",
    "left",
    "bottom"
   ],
   [
    "B",
    "left",
    "bottom"
   ],
   [
    "LCt",
    "left",
    "bottom"
   ],
   [
    "LAl",
    "left",
    "bottom"
   ],
   [
    "LWn",
    "left",
    "bottom"
   ],
   [
    "6",
    "right",
    "top"
   ],
   [
    "7",
    "right",
    "top"
   ],
   [
    "8",
    "right",
    "top"
   ],
   [
    "9",
    "right",
    "top"
   ],
   [
    "0",
    "right",
    "top"
   ],
   [
    "Y",
    "right",
    "top"
   ],
   [
    "U",
    "right",
    "top"
   ],
   [
    "I",
    "right",
    "top"
   ],
   [
    "O",
    "right",
    "top"
   ],
   [
    "P",
    "right",
    "top"
   ],
   [
    "-",
    "right",
    "top"
   ],
   [
    "=",
    "right",
    "top"
   ],
   [
    "Bksp",
    "right",
    "top"
   ],
   [
    "H",
    "right",
    "home"
   ],
   [
    "J",
    "right",
    "home"
   ],
   [
    "K",
    "right",
    "home"
   ],
   [
    "L",
    "right",
    "home"
   ],
   [
    ";",
    "right",
    "home"
   ],
   [
    "'",
    "right",
    "home"
   ],
   [
    "[",
    "right",
    "home"
   ],
   [
    "]",
    "right",
    "home"
   ],
   [
    "\\",
    "right",
    "home"
   ],
   [
    "Enter",
    "right",
    "home"
   ],
   [
    "RSh",
    "right",
    "home"
   ],
   [
    "N",
    "right",
    "bottom"
   ],
   [
    "M",
    "right",
    "bottom"
   ],
   [
    ",",
    "right",
    "bottom"
   ],
   [
    ".",
    "right",
    "bottom"
   ],
   [
    "/",
    "right",
    "bottom"
   ],
   [
    "RCt",
    "right",
    "bottom"
   ],
   [
    "RAl",
    "right",
    "bottom"
   ],
   [
    "RWn",
    "right",
    "bottom"
   ],
   [
    "Lft",
    "right",
    "bottom"
   ],
   [
    "Ddn",
    "right",
    "bottom"
   ],
   [
    "Up",
    "right",
    "bottom"
   ],
   [
    "Rgt",
    "right",
    "bottom"
   ],
   [
    "space",
    "both",
    "space"
   ]
  ]
 },
 "panels": {
  "PAWLIVEWALL_URL": "",
  "_ITEM_EMOJI": {
   "星星": "⭐",
   "骨头": "🦴",
   "爱心": "❤️",
   "宝石": "💎",
   "金币": "🪙",
   "月亮": "🌙",
   "蝴蝶": "🦋",
   "蘑菇": "🍄",
   "枫叶": "🍁",
   "小鱼": "🐟",
   "铃铛": "🔔",
   "彩蛋": "🥚",
   "蜗牛": "🐌",
   "花朵": "🌸"
  },
  "ACTIONS": [
   "idle",
   "happy",
   "pet",
   "chin",
   "pickup",
   "spin",
   "hop",
   "sleep",
   "deep",
   "walk",
   "chase",
   "scared",
   "nervous",
   "relax",
   "groom",
   "eat",
   "paper",
   "work",
   "peek",
   "play",
   "hide"
  ],
  "SOUNDS_DIR": "/tmp/LineDogPet.exe_extracted/PYZ.pyz_extracted/sounds",
  "CURSOR_DIR": "/tmp/LineDogPet.exe_extracted/PYZ.pyz_extracted/cursor",
  "DROP_LIBRARY": [
   [
    "星星",
    "⭐"
   ],
   [
    "骨头",
    "🦴"
   ],
   [
    "爱心",
    "❤️"
   ],
   [
    "宝石",
    "💎"
   ],
   [
    "金币",
    "🪙"
   ],
   [
    "月亮",
    "🌙"
   ],
   [
    "蝴蝶",
    "🦋"
   ],
   [
    "蘑菇",
    "🍄"
   ],
   [
    "枫叶",
    "🍁"
   ],
   [
    "小鱼",
    "🐟"
   ],
   [
    "铃铛",
    "🔔"
   ],
   [
    "彩蛋",
    "🥚"
   ],
   [
    "蜗牛",
    "🐌"
   ],
   [
    "花朵",
    "🌸"
   ]
  ]
 },
 "link": {
  "PAWLIVEWALL_MUTEX": "Local\\PawLiveWall_SingleInstance",
  "PET_MUTEX": "Global\\SmartPet_SingleInstance"
 },
 "framemap": {
  "DIR": "/tmp/LineDogPet.exe_extracted/PYZ.pyz_extracted/pets/bongo",
  "MAP_PATH": "/tmp/LineDogPet.exe_extracted/PYZ.pyz_extracted/pets/bongo/bongo_frames.json",
  "IDLE_DEFAULT": "idle.png"
 },
 "sounds": {
  "sampleRate": 22050,
  "bark": [
   [
    0.05,
    430,
    300,
    0.5,
    0,
    [
     [
      2,
      0.25
     ]
    ]
   ],
   [
    0.015
   ],
   [
    0.1,
    280,
    170,
    0.55,
    0,
    [
     [
      2,
      0.3
     ]
    ]
   ]
  ],
  "meow": [
   [
    0.24,
    620,
    360,
    0.32,
    1,
    [
     [
      2,
      0.12
     ]
    ]
   ]
  ],
  "chime": [
   [
    0.1,
    880,
    880,
    0.28,
    0,
    [
     [
      2.01,
      0.2
     ],
     [
      3,
      0.08
     ]
    ]
   ],
   [
    0.02
   ],
   [
    0.18,
    1318,
    1318,
    0.22,
    0,
    [
     [
      2.01,
      0.15
     ]
    ]
   ]
  ],
  "chirp": [
   [
    0.06,
    700,
    1150,
    0.3,
    0,
    []
   ],
   [
    0.02
   ],
   [
    0.07,
    760,
    1250,
    0.28,
    0,
    []
   ]
  ],
  "whine": [
   [
    0.3,
    430,
    250,
    0.2,
    0,
    [
     [
      2,
      0.1
     ]
    ]
   ]
  ],
  "munch": [
   [
    0.05,
    240,
    160,
    0.35,
    0,
    []
   ],
   [
    0.05
   ],
   [
    0.05,
    220,
    150,
    0.35,
    0,
    []
   ]
  ]
 }
};
