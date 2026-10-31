# 大图上传与错误页资源

## 实现范围

所有现有图片上传入口复用 `save_image_upload`：分块暂存到 `backend/.image-staging`（不挂载到 Web），随后以单个独立进程运行 libvips 顺序缩图。成功后发布 WebP、浏览尺寸和原图，失败清理暂存文件。原 API、数据库字段与已有图片 URL 不变。

静态文件安全上限为 50MiB、1.5 亿像素、单边 30000px；动态图仍保留动画，限制为 5MiB、3600 万像素。不能取消所有限制：生产环境为 1GiB 内存，检查时约 512MiB available，swap 已用 631MiB，磁盘仅剩 3.5GiB。

## 依赖和许可

| 项目 | 来源 / 版本 | 用途 | 许可 |
| --- | --- | --- | --- |
| pyvips | https://github.com/libvips/pyvips / 3.2.0 | Python 低内存图片处理绑定 | MIT，`licenses/pyvips-MIT.txt` |
| libvips / pyvips-binary | https://github.com/libvips/libvips 、https://github.com/kleisauke/pyvips-binary | 动态链接原生缩图库，保留可替换安装方式 | LGPL-2.1-or-later；`licenses/libvips-LICENSE.txt`，对应源代码见上游发布版本 |
| T-Rex Runner | https://github.com/wayou/t-rex-runner / 5455bfa408ec6b707c7300ff194b7390733a766d | Chromium 跳跃、障碍、碰撞、计分核心 | BSD-3-Clause；`public/vendor/t-rex-runner/LICENSE` 和 `CHROMIUM-LICENSE` |
| canvas-confetti | https://github.com/catdad/canvas-confetti / 1.9.4（官方 npm 发布包） | 仅保留普通取酒的方形粒子庆祝；护盾/风系二段跳不再依赖散粒子；展开后才加载 | ISC，`public/vendor/canvas-confetti/LICENSE` |
| Fusion Pixel | https://github.com/TakWolf/fusion-pixel-font / 2026.10.25 | 游戏专用中文像素字体 | SIL OFL 1.1；`licenses/fusion-pixel-OFL.txt` 及 `fusion-pixel-sources/` |
| Lucide | https://github.com/lucide-icons/lucide / 0.468.0 | 太阳、月亮、下拉箭头、暂停、跳跃五枚功能图标，内联静态 SVG，不安装图标包 | ISC / Feather MIT，`licenses/lucide-LICENSE.txt` |

没有新增前端框架或大型游戏引擎；仅引入局部粒子特效库，不在全站加载，不使用远程 CDN。`psutil` 仅用于本地内存诊断，不是运行依赖。

Runner 的供应商源码变更：删除 DOMContentLoaded 自动启动入口；为 `update` 增加可选固定步长参数，不传时保留原时间戳行为。站点适配器禁用全局键盘监听、声音、全屏与主题反转；角色、像素城镇、路障绘制在适配器中，保留原核心物理和碰撞规则。

## 本地素材映射

| 原始素材 | 网站文件 | 说明 |
| --- | --- | --- |
| 用户附件 `8d701197-87e9-4f00-a5a3-d986c18fa4d1/image-1.png` | `/images/errors/lingxun-expression.png` | 用户明确提供用于错误页，未经 AI 重绘 |
| 既有 `/images/loading/lingxun-run-32-v5.webp` | 同路径 | 32 × 160px 跑步帧，未修改既有 loading 动画 |
| 上游 `assets/default_100_percent/100-offline-sprite.png` | `/vendor/t-rex-runner/sprite-1x.png` | 跑酷核心基础像素资源 |
| 上游 `assets/default_200_percent/200-offline-sprite.png` | `/vendor/t-rex-runner/sprite-2x.png` | 高 DPI 基础像素资源 |
| 发布包 `fusion-pixel-12px-proportional-zh_hans.otf.woff2` | `/fonts/` 同名 | 仅使用简体中文文件，约 685KiB；展开游戏后按需加载 |

像素城镇房屋、石板路、酒桶和三种饮品由本站 Canvas 绘制。护盾和风系效果改用下列有来源的素材。游戏配色复用煤黑、钢蓝、红与装备黄，使用本地像素字体；操作与计分都在游戏画面内。沿用原核心跳跃和碰撞，增加二段踏风、三种饮品效果、送酒委托奖励与首次 Tips；取消俯身和需要俯身躲避的飞行障碍。

## 护盾与风系素材（2026-10-30）

| 作者 / 作品 | 原始文件 → 本地文件 | 许可 / 来源 |
| --- | --- | --- |
| SnoopethDuckDuck / Shields 2 CC0 | `snoopeths_shields_2.zip/1px/5.png` → `/images/game-fx/shield-snoopeth.png` | [CC0，作者发布页](https://opengameart.org/content/shields-2-cc0)；只复制该张 32px 贴图，见 `licenses/snoopeth-shields-CC0.md` |
| Clint Bellanger / Shield Spell | `shield.png`，4×128px → `/images/game-fx/shield-spell-clint.png` | [CC BY 3.0，作者发布页](https://opengameart.org/content/shield-spell)；旧版素材保留映射，当前游戏不加载 |
| zwonky / Whirlwind - Arne16 | `tornado_wobbly_0.png`，4×16px → `/images/game-fx/whirlwind-zwonky.png` | [CC0，作者发布页](https://opengameart.org/content/whirlwind-arne16)；上游另列 Spring Spring 为 bendy 版本作者，本项目选择 wobbly 版本 |
| UrieW / Clouds and Gust | `gust_32x32.gif`，32px → `/images/game-fx/gust-uriew.gif` | [CC0，作者发布页](https://opengameart.org/content/clouds-and-gust) |
| Dungeon Crawl Stone Soup / RLTiles | `releases/Nov-2015/item/armour/shields/shield1.png`，32px → `/images/game-fx/kite-shield-rltiles.png` | [官方 CC0 精选导出](https://github.com/crawl/tiles/tree/a6ea1655db5c044829d9eea19a232fa6fcac87b0)；保留 `licenses/crawl-tiles-CC0-README.md`；旧版盾徽，当前游戏不加载 |

没有复用商业游戏拆图，没有 AI 重绘，也没有安装新的特效依赖。原始图片未改；盾牌在运行时映射为四级淡蓝调色板、硬像素透明边缘，居中绘制，沿贴图轮廓叠加淡蓝微光与八枚稀疏像素光点；不是前方金色盾或全身大圆环。HUD 和 Tips 复用同一张蓝色处理结果。碰撞后盾牌两半消散，盾徽移除。减弱动态模式使用静态光点和淡出，暂停冻结计时。二段跳仍使用已有风旋与风团，随场景同速移走。

公共署名位于 `/images/game-fx/ATTRIBUTION.txt`，游戏下方有可访问链接；各素材单独标记许可，不将整个 Crawl 代码库误标为 CC0。

按钮统一复用 `--radius-control: 16px`：导航日夜开关、手机开关与菜单按钮、通用 `.button`、错误页和游戏按钮。画框和状态标签不是按钮，保留各自尺寸规则，不用一组不一致的按钮圆角补丁。

玩法由 `DRINKS` 单一配置同时提供给游戏与 Tips：麦酒 6 秒双倍积分和 12% 平滑加速，不能突破最高速度；清风酒 10 秒内牵引附近 110px 范围的饮品；护身酒 7 秒内抵挡一次碰撞，不叠加次数。效果互不清除。内部 `water` 键为兼容保留，前台已是清风酒，不再是冰水。每三杯送达一单，奖励 25 分。

饮品沿地面放在已有障碍之后，前后各预留 240 个世界像素；后续生成的障碍也必须绕开这个空档。初次生成在障碍更新后规划，不重复扣除该帧位移。普通饮品、路面和障碍共享同一取整位移；只在清风酒主动牵引时，附近饮品沿短路径飞向角色。拾取采用横向扫掠检测，降低慢帧漏判。饮品约每 7–9 秒规划一杯，不再靠高频护盾降低整个游戏难度。

难度按有效游玩时间增长，暂停不计时，重开归零。路况 1–5 的起始基础 pace 分别为 5 / 5.45 / 5.9 / 6.8 / 7.7，150 秒时达到基础 7.8 的硬上限；含麦酒的绝对 pace 上限为 8.4，之后不再增加。原引擎自动加速关闭。普通障碍混合密集段与缓冲段，最低生成空档 40 个速度行进帧、绝对最低 140 个世界像素；特殊障碍后至少保留 48 个行进帧的恢复空档。手机与电脑取消宽度速度缩放，使用同一速度和固定 60Hz 逻辑更新。

路况 3（60 秒）开始加入高箱与长连箱；4、5 提高特殊箱选择权重，加入双箱组合；不会连续选择相同特殊类型。三种新形态沿用现有钢蓝/装备黄像素绘制，无新增素材包或依赖。长箱宽度按不超过基础速度的取整步长确定，不把临时麦酒加速算进长度，避免效果中途结束导致不可跨越；碰撞宽度与显示宽度一致，使用原引擎进行单跳/二段跳时序验算。高箱提前踏风，长箱在中段再次踏风，双箱可调整起跳节奏。点击与按键均采用固定起跳幅度，不依赖按住时长。

首次开始先显示三段 Tips（9 秒自动翻页，最后等待确认；也可手动下一条或跳过）。最新玩法使用 `lingxun-runner-tips-v4` 记录已看状态；问号可重复打开。减弱动态模式不自动翻页；离开页面或后台暂停游戏和提示计时。Tips 为键盘可访问对话框，手机保留全部功能。

`TavernGame.astro` 由错误页与彩蛋页底部共用，默认折叠，展开后才加载核心/图片；关闭暗门会暂停并收起游戏。主题变化时若游戏暂停，执行不推进模型的纯重绘，不改变位置、倒计时、难度或积分。游戏样式已从错误页拆到 `tavern-game.css`，避免把错误页装饰带到首页。

本轮修改前快照保留在 `.local-backups/game-drinks-20261030/`。前后端路由、上传逻辑、生产数据及既有 loading 动画未改；本轮新增的游戏模块均为前端内部逻辑。

10 月 31 日阶段玩法与共用入口的补充快照分别为 `.local-backups/density-20261031/`、`.local-backups/shared-game-20261031/`。没有推送或部署。

手机同速与视野调整前快照为 `.local-backups/unified-game-20261031/`。内部世界固定 600×301，碰撞、跳跃、障碍和难度不依赖设备宽度。单独的展示画布等比显示完整 600 单位前方视野，只有展示画布使用 DPR，转屏不移动模型。手机游戏框离屏幕左右各约 8px、高 360px；Tips 共用同一框体，内容可内部滚动，触控跳跃按钮保持 64×56px。底部留出 72px 操作区，不遮住地面路况。卡顿最多补算 100ms，逐步检测碰撞；切到后台仍暂停，不无限追赶。

## 发布前必须检查

- 本轮没有推送或部署。部署时必须安装更新后的 Python requirements；不能只上传前端。
- Nginx / 上游代理的请求体限制应至少为 `55m`（50MiB 图片加 multipart 元数据），超时应容许 90 秒处理；否则代理会先返回 413 / 504，应用无法接管。
- 对 Nginx 自身产生的 404 / 50x，需要将 `error_page` 指向构建的错误页；FastAPI 当前已处理到达应用的 HTML 错误。避免将 `/api/` 错误改为 HTML。
- 暂存目录必须位于上传目录之外，不得配置为静态目录。发布前复核剩余磁盘并清理可回退的旧发布包，不自动删除用户原图。
- 本地 Windows 内存诊断不代替生产 Linux 验收；上线前应在相同依赖版本复测单张最大图片，保持单任务处理。
