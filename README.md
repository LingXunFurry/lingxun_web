# 🌌 LX-TERMINAL // 凌巽的私人星际终端

> "在浩瀚的数据之海中，构建属于自己的避风港。"

[![Status](https://img.shields.io/badge/Status-Online-emerald.svg)]()
[![Framework](https://img.shields.io/badge/Framework-Astro-ff69b4.svg)]()
[![Styling](https://img.shields.io/badge/Styling-TailwindCSS-38bdf8.svg)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg)]()

欢迎来到 **凌巽终端 (Lingxun Terminal)**。这不是一个传统的静态博客，而是一个以“深空航天器主控台”为设计理念的交互式个人数字空间。这里记录了我的摄影、日常、项目以及值得铭记的岁月。

🌐 **Live Demo (在线观测入口):** [http://67.230.170.22:8080/](http://67.230.170.22:8080/)

---

## 🛰️ 核心系统特性 (Core Features)

### 1. 沉浸式太空舱 UI (Immersive Sci-Fi UI)
- 全局深色模式 (`#020306` Space Black)，辅以高对比度的赛博荧光（青、琥珀、祖母绿）。
- **磁吸导航引擎**：引入物理引力算法，按钮在悬停时具备平滑的二维坐标偏移反馈。
- **双轨滚动雷达**：精准侦测视口深度，动态铺展全局毛玻璃（`backdrop-blur`）视效。

### 2. 自动化视觉引擎 (Automated Gallery Matrix)
- 废弃手动硬编码，基于 `import.meta.glob` 实现全自动资产扫描与管线渲染。
- 内置带“高度保底”的无缝瀑布流发牌算法，彻底消除滚动断流。
- **Blob 数据流拦截**：重构底层网络请求，原画图片无损提取并转码 `.webp` 高效下发。

### 3. 全设备自适应舱体 (Responsive Layouts)
- **双轨制分流策略**：桌面端采用高精度原生 JS 监听实现物理切屏；移动端全面释放权限，由原生 CSS `snap-mandatory` 接管，告别手势冲突与页面坍塌。
- 模块自适应塌陷重组，确保在极窄屏幕下依然保持信息的高密度与高可读性。

### 4. 🔒 隐藏协议：深渊控制台 (Classified Bonus Page)
- **非授权访问机制**：将核心交互隐藏于常规视口之外，需通过特定的时序敲击指令（3-Click Bypass）方可解除重力锁并唤起。
- **环境反向侦测 (Telemetry Scan)**：实时读取并渲染当前观测者的系统、分辨率与内存堆栈。
- **四核纪元阵列 (Chrono-Sync)**：通过独立的 CSS 变量与原生动画，实现随悬停激活的单节点呼吸辉光交互。

---

## 🛠️ 技术栈核心 (Tech Stack)

本终端剥离了沉重的运行时框架，追求极致的加载速度与极客交互：

- **Core Framework**: [Astro](https://astro.build/) - 提供无与伦比的静态渲染性能与零 JS 孤岛架构。
- **Styling Engine**: [Tailwind CSS](https://tailwindcss.com/) - 纯内联原子化构建复杂的辉光、极光与视差动画，彻底告别作用域污染。
- **Interactive Logic**: Vanilla JavaScript / TypeScript - 摒弃臃肿的第三方库，底层逻辑纯手工打造。

---

## ⚙️ 部署与本地唤醒 (Initialization)

如果你想在本地环境中运行此终端：

```bash
# 1. 克隆仓库
git clone [https://github.com/LingXunFurry/lingxun_web.git](https://github.com/LingXunFurry/lingxun_web.git)

# 2. 进入主控室
cd lingxun_web

# 3. 安装驱动依赖
npm install

# 4. 启动本地观测引擎 (默认端口: localhost:4321)
npm run dev

# 5. 构建生产环境只读数据包
npm run build

```

---
## 🤫 观测者指南 (Easter Egg Hint)
如果你正在浏览这个网站，不妨在页脚（Footer）的某处寻找一个 Unknown Entry。
提示：快速敲击三次即可建立神经连接，切记在手机端请将屏幕滑至最顶端方可安全断开连接。
