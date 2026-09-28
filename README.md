# 线条小狗桌宠 · 网页移植版（LineDogPet Web Port）

由 `Mrjiumeng/LineDogPet`（PyQt6 桌面宠物，v2.5.0）逆向还原并 1:1 移植的纯静态网页版。
所有常量、状态机、素材索引算法、音效合成公式均从原始字节码逐函数提取，非手工誊写。

## 使用方法

1. 解压本压缩包到任意目录（保持目录结构）。
2. 双击 `index.html` 即可在浏览器中运行（`file://` 直开，无需服务器、无需联网）。
3. 推荐 Chrome / Edge，手机浏览器同样可用（触屏拖拽/点按已适配）。

> 数据保存在浏览器 localStorage（配置、日记、聊天、步数），清浏览器数据会重置。

## 已移植功能（与原版对齐）

- **桌宠本体**：状态机（idle/happy/sleep/deep/work/pet/hop/spin/chase/hide/flee/nervous/stare/relax/groom/eat/play/chin/pickup/paper/peek/…），TEMP_STATES 定时回落、`_back_to_base`、夜间/睡眠/工作陪伴模式。
- **动画系统**：GIF → 无损 WebP 图集（495 张），`Movie` 类复刻 QMovie 语义（jumpToFrame / setSpeed / frameChanged / 即用即弃销毁），`AssetIndex` 完整复刻：共享池概率门 `chance = max(0.35, share/(own+share))`、防重复 `_last`、`ACTION_FALLBACK` 链式回退、FIXED_GIFS 短路（举起来/转圈/狂奔）、4 级 resolve 兜底。
- **鼠标交互**：单击摸头 Q 弹（squash 关键帧逐帧复刻）、双击弹跳、长按抱起（举起来动画 + 挣扎）、拖拽、画圈手势（winding number）、中键打开聊天、滚轮、鼠标跟随（sticky/timid/off）、凝视 stare。
- **音效**：WebAudio 逐样本合成，`_tone` 公式与原版一致（bark/meow/chime/chirp/whine/munch 6 配方 + 22050Hz + 泛音/包络/尾部线性衰减），支持自定义声音导入。
- **爪印与步数**：Canvas 渐隐爪印（28px 间距、STEP_PX=18 累加器）、每日步数统计与跨日重置、恶作剧爪印（Prank）、截屏气泡（ShotBubble）。
- **粒子特效**（联动视效）：光环/脚步粒子/鼠标吸引/点击爆炸/鼠标光源/脚下阴影/能量尾巴/花瓣/落叶/萤火虫共 11 种，`any_effect_on` 联动门控、`play_link_burst` 金粉双环爆炸（26 粒子）逐参数复刻；BroadcastChannel 模拟原版 PawLiveWall 命名互斥体联动。
- **感知系统**：整点报时、空闲入睡/唤醒、CPU 忙碌代理（打字/点击速率）调速、剪贴板内容识别（代码/长文/链接 → 对应文案）、页面标题观察（Observe，等价原版前台窗口识别）、音乐状态回调。
- **掉落物**：随机掉落 5×5 道具、fetch 取回、寿命 180s、±3px 抖动。
- **AI 聊天**：OpenAI 兼容接口（设置→AI 填 base/key/model），本地命令（变小/变大/躲起来/出来/安静/陪我玩/追球/喂食/睡觉…）离线兜底回复表逐条复刻；聊天记录 ChatDB 持久化。
- **小狗日记 + 里程碑**：活动记录、首次成就、奖励称号（贴心小跟班/最佳拍档/铲屎官认证/永远的家人）、日记本纸张 UI。
- **设置面板**：7 个标签页（形象/声音、交互/指针、感知/AI、附加功能、外观主题、联动视效、关于），全部控件与原版逐项对应；主题引擎 HSV 色系推导（`_color_family` light/dark 两套 26 色）与 QSS→CSS 变量注入等价。
- **多宠**：pet_count 1–15，副宠 80ms tick、无爪印、共享配置，布局算法与原版一致。
- **Bongo 模式**：54 帧按键贴图、33ms 轮询、90ms 保持、空格优先级、镜像/大小/透明度/点击穿透、拖动。
- **指针皮肤**：跟随光标的迷你狗（resolve_own 无共享池语义、(10,12) 偏移、16ms tick）。
- **模拟桌面**：伪窗口（README.md 编辑器，可拖动/最大化/全屏）、44px 任务栏、托盘菜单、窗口避让、全屏角落躲藏、锁角模式。
- **更新检查**：三源（GitHub/Gitee/GitCode）版本号对比（受 CORS 限制，失败有提示）。
- **持久化**：配置 3s 防抖保存 + pagehide 立即保存，位置/心情/体力/日记/聊天全部恢复。

## 无法 1:1 的能力（浏览器沙箱限制，已做等价替代）

| 原版能力 | 网页现状 |
|---|---|
| 系统托盘图标 | 页面底部任务栏 🐶 按钮 + 菜单模拟 |
| 全局热键 RegisterHotKey | 仅页面聚焦时生效（Ctrl+Alt+D） |
| 剪贴板全局轮询 | 需用户手势 / 页内"模拟复制"按钮 |
| GetSystemTimes CPU 采样 | 打字/点击速率代理指标 |
| EnumWindows / 前台窗口标题 | 仅感知页内伪窗口与标签页标题 |
| 多显示器 / 物理像素 DPR | 单视口，devicePixelRatio 近似 |
| 注册表开机自启 | 开关保留但仅存本机偏好 |
| OS 级截图 / 光标穿透 | 页内截屏气泡、伪窗口近似 |
| 置顶于所有应用之上 | 仅在本页面内置顶 |
| PawLiveWall 命名互斥体 | BroadcastChannel 同浏览器多标签联动 |

## 目录结构

```
LineDogPet/
├── index.html          # 入口（file:// 直开）
├── assets/
│   ├── gifs/           # 495 张无损 WebP 帧图集
│   ├── bongo/          # 54 张 bongo 键位贴图
│   ├── manifest.js     # 图集索引（自动生成）
│   └── bongomanifest.js
└── js/
    ├── data.js         # 全部原版常量（字节码导出，自动生成）
    ├── core.js         # 信号/定时器/工具
    ├── assets.js       # AssetIndex + Movie（QMovie 等价）
    ├── sound.js        # WebAudio _tone 合成
    ├── pet.js          # PetWidget 完整状态机
    ├── fx.js           # EffectEngine + CursorLight
    ├── pawprint.js     # 爪印/步数/恶作剧/截屏气泡
    ├── drops.js        # 掉落物
    ├── observe.js      # 感知文案/代码识别/音乐
    ├── diary.js        # 日记 + ChatDB
    ├── ai.js           # AI 聊天 + 本地命令
    ├── panels.js       # 设置/主题引擎/对话框
    ├── cursorpet.js    # 指针皮肤
    ├── bongo.js        # Bongo 模式
    └── app.js          # PetApp 主控 / 模拟桌面
```

## 验证

- Node 无头冒烟：17 个模块加载、24 个全局、启动 + 10 项交互探针全部通过。
- Playwright + Chromium（桌面 1000×720 / 移动 390×780）：43 项断言 0 失败、0 控制台错误、0 页面异常。

## 来源与授权声明（重要）

本项目是 [Mrjiumeng/LineDogPet](https://github.com/Mrjiumeng/LineDogPet)（作者 chu minghao）
的**网页移植衍生作品**，代码通过逆向还原其 Python 字节码得到。

授权状况以原项目 README 的声明为准：

> 本项目开源免费，**仅用于学习交流，禁止商用**。线条小狗相关美术素材版
> 权版权归原作者所有，请勿将本项目以及相关素材用于任何商业用途。

因此：

- **用途限制**：本移植版同样仅限个人学习与交流，**不得用于任何商业用途**。
- **素材版权**：全部线条小狗图像素材（`assets/` 下的 GIF/WebP/PNG）版权归原素材
  作者所有，本仓库不主张任何权利，也不授予你再分发素材的许可。
- **代码许可**：仓库内的 `LICENSE` 是原项目携带的 Apache-2.0 模板文本（其版权方
  占位符 `{yyyy} {name of copyright owner}` 并未填写），不构成对素材的商用授权；
  实际授权以上述「禁止商用」声明为准。
- **二次开发**：请保留本段致谢，并注明原作者 Mrjiumeng / chu minghao。

如需商用或正式分发，请先向原作者与素材版权方取得许可。
