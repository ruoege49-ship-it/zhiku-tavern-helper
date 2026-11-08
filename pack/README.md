# 智库 · 场外画师串包生成器

在电脑上自动组画师串、调用 NovelAI 出例图，打成「画师串包」，再到智库里一键导入（画师串和例图一起进画师库）。不在插件里跑，可以挂着出一整夜。

## 准备

1. 装 [Node.js](https://nodejs.org/) 18 以上（装 LTS 版就行）。
2. 把这个 `pack` 文件夹复制到电脑上任意位置。
3. 准备画师名单 `artists.txt`：一行一个，写不写 `artist:` 都行，`#` 开头是注释。
   - 想用「法典图鉴」里的画师：电脑浏览器打开法典页面，F12 → 控制台，粘贴 `提取法典画师.js` 的内容回车，会下载 `xxx_画师.txt`（画师名单）和 `xxx_画师串.txt`（法典里的画师组合）。

## 运行

在 `pack` 文件夹里打开命令行（Windows：文件夹地址栏输入 `cmd` 回车）：

```
node zhiku-artist-pack.mjs
```

第一次会生成 `pack.config.json`，填好 `key`（NovelAI 的 pst- 开头那串）再运行一次。

- `node zhiku-artist-pack.mjs plan`：只列出要生成哪些画师串，不花点数。
- 中途 Ctrl+C 停下，再运行同一条命令会接着上次的进度出图。
- 想重新随机：删掉 `out/plan.json`。
- `node zhiku-artist-pack.mjs pack`：只把出好的图重新打包。

出完会在 `out/` 里得到：

- `预览.html`：所有画师串和例图，先看一遍挑一挑。
- `智库画师串包-001.json` …：在智库「设置 → 数据 → 导入画师串包」里选这些文件（可以多选）。只往画师库里加，不会替换现有的；同一张图重复导入会跳过。

## 三种模式（`mode`）

| 模式 | 用途 | 读哪个文件 |
| --- | --- | --- |
| `random` | 从画师名单里随机抽 `minArtists`～`maxArtists` 位组成 `count` 串，可随机权重 | `artistsFile` |
| `single` | 连续测单个画师：名单里每位画师单独一串 | `artistsFile` |
| `strings` | 直接给现成的画师串出例图（比如法典导出的 `_画师串.txt`） | `stringsFile`，每串之间空一行，`# 名字` 一行可以起名 |

## 其他设置

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `templates` | `["sfw_bust"]` | 每串出哪几张：`sfw_head` 头像、`sfw_bust` 胸像、`sfw_full` 立绘、`nsfw_head` `nsfw_bust` `nsfw_full`，和智库的例图模板一样 |
| `extra` | 空 | 每串后面都加上的词，比如 `year 2025, newest` |
| `seed` | `"same"` | `"same"` = 所有画师用同一个随机种子（同一张脸，只比画风，种子记在 out/seed.txt）；`0` = 每张随机；也可以填固定数字 |
| `model` | `nai-diffusion-4-5-full` | 也可以填 `nai-diffusion-4-5-curated`、`nai-diffusion-5-full` |
| `steps` `scale` `sampler` `schedule` `cfgRescale` | 28 / 5 / DPM++ 2M SDE / karras / 0.18 | 和智库默认一样 |
| `quality` `ucPreset` | 开 / Heavy | 质量词、负面预设 |
| `gapSeconds` | `2` | 两张之间至少隔几秒；遇到 429 会自动等待后重试 |
| `perFile` | `20` | 每个导入文件放几串 |
| `collection` | 空 | 导进智库后打上的标签，比如 `法典 N5` |

例图尺寸都不超过 1024×1024 的像素量、28 步，Opus 订阅出图不扣点。key 错误或点数不够会直接停下并提示。

## 连不上 NovelAI

命令行默认不走系统代理。开 VPN 的「TUN / 增强模式」最省事；或者用 Node 22.21 / 24 以上，运行前设代理（端口换成你自己的）：

```
set NODE_USE_ENV_PROXY=1
set HTTPS_PROXY=http://127.0.0.1:7890
node zhiku-artist-pack.mjs
```

（macOS / Linux 把 `set` 换成 `export`。）
