# 正文 Markdown

普通动态、整篇故事及独立章节共用 Marked 的 CommonMark / GFM 解析，保留已有正文的单换行展示。不需要为修复斜体、引用、分割线重新编辑原文。

支持标题 1–6 级、粗体、斜体、删除线、行内代码、围栏/缩进代码块、引用及嵌套引用、多段引用、有序/无序/嵌套列表、只读任务列表、链接/引用式链接/自动链接、图片、表格与列对齐、转义字符、水平分割线。表格与代码块在手机上仅在各自区域横向滚动。

安全的基础 HTML（如 `details` / `summary`、`kbd`、`sup` / `sub`）保留；脚本、事件处理器、内嵌框架、任意样式、危险 URL 和可编辑表单不执行。外部链接使用隔离的新标签页。

数学公式、Mermaid 图、脚注及编辑器私有语法不是 CommonMark / GFM 的统一标准，不承诺自动支持；需要时单独评估相应扩展，而不是执行正文代码。

## 新增依赖

| 包 | 用途 | 版本 | 许可证 |
| --- | --- | --- | --- |
| [marked](https://marked.js.org/) | CommonMark / GFM 解析 | 18.1.3 | MIT |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 在插入 DOM 前过滤 HTML | 3.4.17 | Apache-2.0 或 MPL-2.0 |

依赖通过 npm 锁定版本，随本地构建打包，不请求远程解析脚本。许可证副本见 `docs/licenses/marked-LICENSE.txt` 和 `docs/licenses/DOMPurify-LICENSE.txt`。

`jsdom@28.1.0`（MIT）仅作为开发依赖，为 `node tests/markdown.cjs` 提供隔离 DOM 进行语法与安全回归，不进入网站浏览器包或 Python 后端。
