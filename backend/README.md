# Lingxun Admin Backend

这个后台给现有 Astro 静态站增加 MySQL + FastAPI 管理能力。

## 本地启动

当前项目已经带了本地 `backend/.env`，默认使用 `backend/lingxun_local.db`，可以直接跑起来。

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

打开 `http://127.0.0.1:8000/admin`。

默认登录：

- 用户名：`lingxun`
- 密码：`lxloveshy`

首次启动会自动创建后台账号，并导入现有本地画廊图片、Markdown 动态、默认 Bonus、行程和联系方式。之后后台密码以数据库里的哈希密码为准，可以在后台“安全”页修改。

如果忘记后台密码，需要通过服务器权限重置，不提供网页找回入口：

```bash
cd /home/lingxun/lingxun_web/backend
source .venv/bin/activate
python reset_admin_password.py lingxun 新密码
sudo systemctl restart lingxun-web.service
```

## MySQL 配置

如果本地或服务器有 MySQL：

1. 执行 `sql/admin_schema.sql`。
2. 复制 `backend/.env.mysql.example` 到 `backend/.env`。
3. 修改 `DATABASE_URL`、`JWT_SECRET_KEY` 和允许跨域的域名。

如果用 Docker 启 MySQL：

```bash
docker compose -f docker-compose.mysql.yml up -d
```

然后把 `backend/.env.mysql.example` 复制成 `backend/.env` 使用。

## 前台连接

前台默认读取 `http://127.0.0.1:8000`。部署到服务器时，在 Astro 的环境变量里设置：

```bash
PUBLIC_API_BASE=https://你的后端域名
```

后台数据会联动替换对应内容：

- 画廊：主页画廊展示和完整画廊页共用 `gallery_photos`。
- 动态：主页默认显示最新 3 条，动态列表页显示全部，二者共用 `posts`。
- Bonus Page：后台文字、纪念日标题和日期会覆盖对应可变内容。
- 最后一页行程、联系方式：后台有数据时替换对应区域；后台为空时保留现有静态内容。

如果后端未启动或数据库为空，现有静态内容保持不变。
