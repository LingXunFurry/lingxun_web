# 全新服务器部署与迁移

本文件描述当前 Astro + FastAPI + MySQL 网站的部署边界与操作顺序，不是已经在目标服务器执行完成的记录。服务器 IP、SSH 端口、真实账号、密钥和密码不写入公开部署配置。

相关文档：[项目总览](../README.md) / [后台配置与维护](../backend/README.md)。

示例项目路径为 `/srv/lingxun_web`、服务账号为 `lingxun`。应先确认新机实际环境，再替换这些路径；不得直接套用历史服务器的发布脚本。

## 1. 先确认新机身份与状态

- 核对 SSH 主机指纹、端口、迁移后的账号和密钥；未迁移完成时不要反复尝试或绕过主机校验。
- 只读检查系统版本、CPU、内存、交换空间、磁盘、已有端口、服务和项目目录。
- 确认域名目前指向哪里，以及旧站是否仍承担访问流量。
- 列清迁移对象：Git 提交、数据库、上传文件、受保护配置、域名/TLS、服务与代理配置。

新机如果已有网站数据，应先备份，再核对来源，不能按空服务器直接初始化。

## 2. 准备运行环境

- Git、Node.js 22.12.0 或以上及 npm，用于安装依赖和构建 Astro。
- Python（建议 3.12）、虚拟环境支持与 `backend/requirements.txt` 中的完整依赖。
- MySQL 与 `utf8mb4` 数据库；创建独立应用账号，不用 root 作为网站数据库账号。
- Nginx、systemd 与 HTTPS 证书管理方式。
- 上传目录与暂存目录应由服务账号可写，数据库和后端端口不直接暴露公网。

前端构建所需内存应提前检查。小内存服务器优先采用受控构建或在其他机器构建，不盲目增加并发；图片处理同样需要验证 libvips 运行依赖。

## 3. 恢复数据，再启动应用

1. 从原站制作一致的数据库备份，保存备份时间、对应提交及校验记录。MySQL 可使用事务一致性导出；导出失败必须停止迁移。
2. 备份整个 `backend/uploads/`，包含原件、尺寸变体及媒体元数据，不只复制画廊里当前可见的几张图片。
3. 在新机克隆指定提交，安装前端依赖及 Python 虚拟环境依赖；不要把旧 `node_modules/` 或 Python 虚拟环境跨系统直接复制过去。
4. 由数据库管理员将备份恢复到正确的目标库。新机应用第一次启动前就应完成恢复，避免把示例初始化内容误当作迁移结果。
5. 安全迁移或重新填写 `backend/.env`，核对新的数据库地址与 CORS 来源。管理员沿用数据库中的哈希密码，不用环境变量覆盖已有账号。
6. 同路径恢复上传文件并核对原文件哈希、文件数量及数据库引用，修正服务账号权限。
7. 如采用分域 API，设置根目录构建变量 `PUBLIC_API_BASE`；同域部署通常不需要。

环境文件不要提交 Git，也不要把包含密码的连接串、SQL 导出或私钥发到公开日志中。

## 4. 构建与结构升级

在已核对的项目根目录执行构建：

```bash
npm ci
npm run build
```

恢复数据库后，使用正确的 `backend/.env` 和虚拟环境启动应用，应用会执行缺失表与字段的增量检查。升级前保留数据库和代码备份；MySQL DDL 可能立即提交，不能假定停止服务就会撤销结构变更。

内容同步与表结构升级要分开审核：新增角色资料、故事、章节和简介只应导入确认过的对应记录，不覆盖整库，不导入本地测试管理员、测试留言或预览计数。

对于后续版本更新，建议先在独立发布目录构建，检查资源再切换静态目录；保留旧的哈希资源，减少已经打开的页面在更新后找不到脚本或样式。

## 5. systemd 示例

以下只是模板，路径和用户必须与新机一致；需要先准备可用的数据库、配置文件和可写上传目录。

```ini
[Unit]
Description=Lingxun Website
After=network-online.target
Wants=network-online.target

[Service]
User=lingxun
Group=lingxun
WorkingDirectory=/srv/lingxun_web/backend
EnvironmentFile=/srv/lingxun_web/backend/.env
ExecStart=/srv/lingxun_web/backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=on-failure
RestartSec=5
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

生产不使用 `--reload`。小内存环境先使用单个 worker，检查实际负载后再调整。注册服务后检查启动日志与 `http://127.0.0.1:8000/api/health`，确认数据库升级和图片依赖无误。

## 6. Nginx 与 HTTPS

当前 FastAPI 可以提供 `dist/` 下的页面及资源。全新环境可以先采用同域反向代理，避免暴露项目源码和上传暂存区：

```nginx
server {
    listen 80;
    server_name lingxun.me www.lingxun.me;

    client_max_body_size 80m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

这不是完整的 HTTPS 配置。证书签发或迁移、443 监听与 HTTP 跳转应在实际域名与 DNS 校验后完成。只开放需要的公网端口，保留真实 SSH 端口的访问，不公开 MySQL 和 Uvicorn 端口。

不要缓存后台或内容 API；后端本身会为 HTML、API、上传文件和哈希资源设置不同缓存策略。以后若由 Nginx 直接提供静态资源，只映射公开的构建输出，不能把整个仓库作为 `root`，也不能暴露 `.env`、数据库或 `.image-staging`。

`80m` 是代理接收限制，不会把应用的静态图限制变成无限制。还需实际验证上传超时、文件体积、像素限制与处理反馈。

## 7. 切流前验收

- 本机健康检查通过，后端和 Nginx 服务正常，Nginx 配置检查通过。
- 正式 Host / HTTPS 下首页、画廊、手记、友链、文章、后台和错误页可访问。
- 角色头像、主图和切换正常，故事简介、目录、独立章节、上下章可读，草稿不公开。
- 数据库已有文章、评论、友链、行程、联系方式与配置未丢失，上传原件哈希保持一致。
- 管理员能够登录；上传提示、图片压缩、头像取景、保存和退出流程正常。
- 明暗主题、手机布局、导航、灯箱、评论接口、访客与敲杯计数正常。
- 游戏两处入口、Tips、暂停、主题切换和触摸操作正常。
- 核对域名 A / AAAA、TLS 和缓存，没有流量仍被错误地址或旧缓存接走。

确认迁移完整后再切换访问流量；必要时在最终数据库/上传同步期间安排维护窗口，防止旧站继续接收写入导致两端数据分叉。

## 8. 回退边界

保留旧代码提交、静态版本、受保护配置和数据库/上传备份，并记录实际恢复命令和路径。

应用与静态文件可以按已验证的旧版本回退，但不能不加判断地恢复旧数据库，否则会丢失发布后新增的内容。新增字段通常可以暂时保留；撤销结构或内容迁移必须另行核对，避免删除用户后来编辑的记录或章节。
