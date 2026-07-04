CREATE DATABASE IF NOT EXISTS lingxun_website
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lingxun_website;

CREATE TABLE IF NOT EXISTS gallery_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT,
  file_url VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_gallery_visible (is_visible),
  INDEX idx_gallery_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(180) NOT NULL UNIQUE,
  title VARCHAR(220) NOT NULL,
  date VARCHAR(32) NOT NULL,
  tag VARCHAR(80) NOT NULL DEFAULT 'UPDATE',
  summary TEXT,
  content TEXT,
  cover_url VARCHAR(500),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_posts_date (date),
  INDEX idx_posts_published (is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bonus_content (
  id INT PRIMARY KEY DEFAULT 1,
  typewriter_message TEXT NOT NULL,
  birthday_date VARCHAR(32) NOT NULL DEFAULT '2005-12-13',
  love_date VARCHAR(32) NOT NULL DEFAULT '2026-06-01',
  site_date VARCHAR(32) NOT NULL DEFAULT '2026-06-04',
  future_date VARCHAR(32) NOT NULL DEFAULT '2026-12-31',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO bonus_content (
  id,
  typewriter_message,
  birthday_date,
  love_date,
  site_date,
  future_date
) VALUES (
  1,
  '致充满好奇心的你：\n\n你能破解系统指令来到这个本不应该进入的这里，说明你拥有罕见的探索欲。\n\n这里是凌巽的一片净土，没有喧嚣的社交，只有值得纪念的日子以及这段留言。\n\n感谢你的到访。\n愿你在人生的旅途中，也能寻找到自己的意义。\n\n-- LINGXUN',
  '2005-12-13',
  '2026-06-01',
  '2026-06-04',
  '2026-12-31'
) ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS schedule_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL DEFAULT '',
  name VARCHAR(160) NOT NULL,
  location VARCHAR(180) NOT NULL DEFAULT '',
  start_date VARCHAR(32) NOT NULL,
  end_date VARCHAR(32) NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_schedule_visible (is_visible),
  INDEX idx_schedule_order (sort_order),
  INDEX idx_schedule_start (start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  icon VARCHAR(24) NOT NULL DEFAULT '',
  summary VARCHAR(180) NOT NULL DEFAULT '',
  link VARCHAR(500) NOT NULL DEFAULT '',
  number VARCHAR(120) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_visible (is_visible),
  INDEX idx_social_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friend_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  display_id VARCHAR(120) NOT NULL,
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  url VARCHAR(500) NOT NULL DEFAULT '',
  comment TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_friend_visible (is_visible),
  INDEX idx_friend_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schedule_items (code, name, location, start_date, end_date, description, sort_order, is_visible)
SELECT 'con-01', '绒爪兽聚', '重庆 · 南岸区', '2026-05-02', '2026-05-04', '小龙第一次参加兽聚', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM schedule_items);

INSERT INTO schedule_items (code, name, location, start_date, end_date, description, sort_order, is_visible)
SELECT 'con-02', '福瑞八奇物志', '成都 · 武侯区', '2026-07-24', '2026-07-26', '暑期档兽聚，会带着新装备和新物料登场（？', 2, TRUE
WHERE (SELECT COUNT(*) FROM schedule_items) = 1;

INSERT INTO schedule_items (code, name, location, start_date, end_date, description, sort_order, is_visible)
SELECT 'con-03', '你好兽聚HiFurry', '广州', '2026-10-01', '2026-10-04', '预计参加，目前正在准备相关的物料。', 3, TRUE
WHERE (SELECT COUNT(*) FROM schedule_items) = 2;

INSERT INTO social_links (name, icon, summary, link, number, sort_order, is_visible)
SELECT 'QQ', 'QQ', '日常交流 / 扩列', 'https://qm.qq.com/q/v6P80LZUdM', '1651388504', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM social_links);

INSERT INTO social_links (name, icon, summary, link, number, sort_order, is_visible)
SELECT 'X (Twitter)', 'X', '动态 / 日常', 'https://x.com/furrylingxun', '', 2, TRUE
WHERE (SELECT COUNT(*) FROM social_links) = 1;

INSERT INTO social_links (name, icon, summary, link, number, sort_order, is_visible)
SELECT 'BiliBili', 'B', '视频 Vlog / 短视频', 'https://space.bilibili.com/362846640', '', 3, TRUE
WHERE (SELECT COUNT(*) FROM social_links) = 2;

INSERT INTO social_links (name, icon, summary, link, number, sort_order, is_visible)
SELECT '抖音', 'D', '短视频 / 日常掉落', 'https://v.douyin.com/LsGqWRTDUKc/', '', 4, TRUE
WHERE (SELECT COUNT(*) FROM social_links) = 3;

INSERT INTO social_links (name, icon, summary, link, number, sort_order, is_visible)
SELECT '小红书', 'R', '动态 / 日常', 'https://www.xiaohongshu.com/user/profile/69c665ea0000000034019dd1', '', 5, TRUE
WHERE (SELECT COUNT(*) FROM social_links) = 4;

INSERT INTO friend_links (display_id, avatar_url, url, comment, sort_order, is_visible)
SELECT '寒杳', 'https://lingxun.me/logo.png', 'https://hanyao.me/', '站主的对象，一只银白色的小狼，头像暂时用本龙的代替（？', 1, TRUE
WHERE NOT EXISTS (SELECT 1 FROM friend_links);

INSERT INTO friend_links (display_id, avatar_url, url, comment, sort_order, is_visible)
SELECT 'lolpzili', 'https://www.lolpzili.com/img/avatar.webp', 'https://furry.lolpzili.com/', '一个年（都不一定）更的博主x', 2, TRUE
WHERE (SELECT COUNT(*) FROM friend_links) = 1;

INSERT INTO friend_links (display_id, avatar_url, url, comment, sort_order, is_visible)
SELECT 'LinFun_', 'https://images-r2.lin-fun.com/92dcd0d286189a611cf38ebe85e9df94.png', 'https://blog.lin-fun.com', '遇见更好的Fun', 3, TRUE
WHERE (SELECT COUNT(*) FROM friend_links) = 2;

INSERT INTO friend_links (display_id, avatar_url, url, comment, sort_order, is_visible)
SELECT 'Redflag', '', '', '是一只来自北方的狼，和网站主人是舍友（由于还没有个人网站所以头像是空的，点击也不会跳转w）', 4, TRUE
WHERE (SELECT COUNT(*) FROM friend_links) = 3;

INSERT INTO friend_links (display_id, avatar_url, url, comment, sort_order, is_visible)
SELECT '滚木', '', '', '滚木滚木滚木（实际上是占位名片，也算...一个小彩蛋吧）', 5, TRUE
WHERE (SELECT COUNT(*) FROM friend_links) = 4;
