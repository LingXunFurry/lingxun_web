# 后台与 API

FastAPI 为本站提供内容管理、公开数据、评论、计数和图片处理，同时可以提供 Astro 构建后的完整网站。

- 项目功能总览：[主 README](../README.md)
- 全新服务器与数据迁移：[部署说明](../docs/deployment.md)
- 管理入口：`/admin`
- 公开接口：`/api/public/...`
- 管理接口：`/api/admin/...`
- 健康检查：`/api/health`

## 准备环境

建议 Python 3.12。请使用独立虚拟环境，安装锁定的运行依赖；`pyvips[binary]` 和 `pyvips-binary` 是静态大图处理所需的依赖，不能只安装 Pillow 后就认为压缩服务完整可用。

在仓库根目录执行，选择对应系统：

### Windows PowerShell

```powershell
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
if (-not (Test-Path -LiteralPath backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

### Linux

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
test -e backend/.env || cp backend/.env.example backend/.env
```

复制仅适用于还没有配置文件的新环境，已有 `backend/.env` 不要覆盖。仓库不会提供可直接使用的真实数据库、管理员密码或生产配置。

## 配置

修改 `backend/.env` 中的示例值：

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy 连接地址；生产使用 MySQL，本地可选 SQLite |
| `ADMIN_USERNAME` | 空数据库首次创建管理员时使用的账号 |
| `ADMIN_PASSWORD` | 空数据库首次创建管理员时使用的密码，不是每次启动重置密码 |
| `JWT_SECRET_KEY` | 足够长的随机签名密钥，必须替换开发默认值 |
| `JWT_EXPIRE_MINUTES` | API 令牌有效期，默认 30 分钟；后台界面按 30 分钟窗口处理会话 |
| `BACKEND_CORS_ORIGINS` | 逗号分隔的允许来源；前端开发端口或独立域名须明确列入 |

### 生产 MySQL

连接地址格式示例，用户名、密码与库名均应按实际环境填写：

```dotenv
DATABASE_URL=mysql+pymysql://app-user:REPLACE_PASSWORD@127.0.0.1:3306/lingxun_website?charset=utf8mb4
```

账号或密码包含 `@`、`:`、`/` 等 URL 特殊字符时，需要先进行百分号编码。数据库应存在并使用 `utf8mb4`；应用账号需要内容读写和增量表结构检查所需的权限，不应直接使用数据库 root 账号。

`backend/.env.mysql.example` 也是配置格式示例，不是生产凭据。`sql/admin_schema.sql` 是基础建表脚本，不应当作现有数据库的完整最新快照；当前模型和启动时的增量检查还会补充后续字段与表。

`docker-compose.mysql.yml` 仅用于本地开发示例，包含示例密码并发布 3306 端口。不要原样用于公网生产；生产数据库应限制到本机或受控网络。

### 本地 SQLite

只做本地体验或测试时，可以在 `backend/.env` 中使用：

```dotenv
DATABASE_URL=sqlite:///./lingxun_local.db
```

该路径相对于进程工作目录。按下文从 `backend/` 启动时，文件位于 `backend/lingxun_local.db`。使用新的文件名可隔离不同预览；不要用本地测试库覆盖线上数据库。

## 启动完整网站

先在仓库根目录运行 `npm ci` 和 `npm run build`，生成 `dist/`。随后在 `backend/` 目录启动：

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Linux：

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- 前台：`http://127.0.0.1:8000/`
- 后台：`http://127.0.0.1:8000/admin`
- 健康检查：`http://127.0.0.1:8000/api/health`

开发 API 时可增加 `--reload`，生产不要使用。后台及接口不要求先构建前端，但完整前台需要 `dist/`；只启动 Astro 无法代替后端。

前端单独从默认 `4321` 开发端口运行时，会请求本地 `8000` API。同域部署默认请求当前站点；分域或更改端口时配置构建变量 `PUBLIC_API_BASE` 和后端允许跨域来源。

## 初始化与升级

首次启动会创建缺失的表，检查当前版本需要的字段，并在首次创建对应内容表时导入项目随附的基础内容。管理员账号仅在不存在账号时由环境变量初始化。

已有表和记录会继续使用，不会因为重新启动就用默认内容覆盖整个数据库；部分明确匹配旧默认值的文案会做定向更新。数据库为空或 API 不可用时，也不能指望前台自动恢复完整的线上内容：前台会等待公开数据，失败时展示相应提示，不以旧内容静默替换成功结果。

生产升级前必须备份。当前采用模型建表和启动时增量结构检查，并非完整的版本化迁移框架；尤其 MySQL 的表结构变更，不能简单依靠事务或 Git 回退来撤销。

## 后台内容对应

- **首页编排**：轮播、主照片与首页三张留影；图片选择后按该栏目保存。
- **角色介绍**：角色基础字段、自定义资料项、详细介绍与主展示图。下方“角色选择头像”管理独立头像，支持拖动、水平/垂直取景和缩放；该头像也用于故事选择。
- **动态管理**：普通动态、配图、附件、外链、置顶与发布状态。
- **故事管理**：故事简介、所属角色、顺序与状态。选择或保存故事后，在章节目录中新增或修改各章；草稿章不会对外公开，一部故事不因多章而变成多条普通动态。
- **评论 / 友链 / 行程 / 联系凌巽 / 酒馆暗门**：分别编辑对应前台内容。
- **站点内容**：按分组编辑标题、提示、按钮文案及相应图片，位置提示帮助对应前台。
- **图片优化**：查看图片体积与使用位置，按需生成优化版本。

文件上传开始即提示，上传及处理期间禁用相关控件，相同文件的在途重复请求会合并；完成或失败后恢复。头像、封面和文案图片上传成功不等于整个表单已经保存，应遵循当前栏目完成提示。

## 密码与会话

密码在数据库中以加盐哈希保存，不保存明文密码。修改 `ADMIN_PASSWORD` 不会覆盖已创建的账号密码。

- 正常修改：后台“安全设置”中输入账号、旧密码和新密码。
- 修改后会更新令牌版本，旧登录令牌失效，需要重新登录。
- 默认会话窗口为 30 分钟，有效后台请求可按规则续期；退出或过期后清除当前登录信息和密码输入。
- 浏览器自身的密码管理器是否保存或自动填充，由浏览器设置控制，不等于网站保存了明文密码。

忘记密码时，拥有服务器权限的人可从 `backend/` 运行：

```bash
.venv/bin/python reset_admin_password.py your-admin-name
```

Windows 对应使用 `.\.venv\Scripts\python.exe`。工具会交互式要求输入新密码，不将新密码放在命令参数中，避免进入命令历史。重置会使旧令牌失效；不要把密码或数据库连接串提交 Git 或发到公开日志。

## 需要备份的内容

| 项目 | 说明 |
| --- | --- |
| MySQL 数据库 / 本地 SQLite 文件 | 角色、文章、章节、评论、后台账号、计数、站点配置等 |
| `backend/uploads/` | 上传原件、展示图、尺寸变体及媒体元数据，保留整个目录 |
| `backend/.env` | 数据库连接、签名密钥与相关配置，作为受保护配置单独迁移 |
| 生产前端构建配置 | 例如存在时的根目录 `.env.production` |
| 服务与代理配置 | 实际 systemd、Nginx、TLS 和域名配置，不在本仓库自动恢复 |

`backend/.image-staging/` 是暂存区，不应对外暴露，也不是恢复原图的来源。迁移时不能只复制 `dist/`，也不能只克隆仓库。

## 检查

在当前虚拟环境中安装接口测试依赖并运行：

```bash
python -m pip install httpx==0.28.1
python -m unittest discover -p 'test_*.py'
```

测试使用隔离数据库及模拟升级场景，不等于已经完成目标生产 MySQL、真实手机或弱网上传验收；部署仍需检查图片处理依赖、目录权限、实际上传与各公开接口。
