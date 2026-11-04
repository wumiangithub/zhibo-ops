# test 环境

- SSH：`ssh ubuntu@14.103.210.83`（当前密码登录；有密钥后再关密码）
- 系统：Ubuntu 26.04 64 位（火山云）
- 站点：
  - admin-web → `http://14.103.210.83:5173`
  - live-web → `http://14.103.210.83:5174`
- 静态目录约定（初始化后创建）：
  - `/var/www/zhibo/admin-web`（放 admin `dist`）
  - `/var/www/zhibo/live-web`（放 live `dist`）
- Nginx 配置草案：`../nginx/test/`
- 发布脚本：后续放 `../scripts/`

## 为什么先初始化机器

把「能登录的裸机」变成「能安全托管两个静态站」的底子：时区、基础工具、防火墙、Nginx、目录。还不碰业务代码。

## 初始化步骤（在 test 机上执行）

> 先确认你能 SSH 登录，且账号有 `sudo`。

### 1. 确认系统与用户

```bash
lsb_release -a
whoami
```

把输出留着对照（期望 Ubuntu 26.04、用户 `ubuntu`）。

### 2. 时区、更新、基础包、防火墙

```bash
sudo timedatectl set-timezone Asia/Shanghai
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential nginx
# 不要启用 ufw；端口放行只走火山云安全组（D103）
```

说明：

- 时区：日志和以后证书时间对齐上海
- `git`/`curl`：拉代码、下载用
- `nginx`：对外提供两个静态站
- 端口放行只走火山云安全组（D103），**不要启用 ufw**。
- 安全组需放行 5173、5174（以及后端需要的端口，如 80、8081）。

### 3. 站点目录

```bash
sudo mkdir -p /var/www/zhibo/admin-web /var/www/zhibo/live-web
sudo chown -R ubuntu:ubuntu /var/www/zhibo
```

### 4. 装上 Nginx 站点（配置文件下一步从本仓拷）

配置草案见 `../nginx/test/`。装好后：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 5. 验收

本机浏览器打开：

- `http://14.103.210.83:5173`
- `http://14.103.210.83:5174`

目录还空时可能是 Nginx 默认页或 403；发布 `dist` 后应看到前端页面。

## 与后端共存（重要）

## 防火墙约定

- **不要自行开启 `ufw`**。对外访问以火山云安全组为准。
- 本机若曾启用过 `ufw`，应 `sudo ufw disable`，避免误挡后端端口（如 80、8081）。
- 需要放行端口时，优先改安全组，而不是在服务器上开 ufw。

test 机上**已有后端同学部署的 Java 服务**。本仓只增加前端静态站与对应 Nginx server：

- 不要随意 `systemctl stop/restart` 不明服务、不要占用后端已用端口
- 安全组只**追加**需要的端口；不要启用 ufw
- Nginx：用独立 `server` 听 5173/5174；改配置前先 `sudo nginx -t`，reload 前尽量跟后端确认没有共用冲突
- 前端同源前缀写在 `.env.test` 的 `VITE_APP_BASE_API`（admin `/live-admin`，live `/live-client`）。Nginx 把这两个前缀转到本机 `127.0.0.1:80`（/live-admin）、`127.0.0.1:8081`（/live-client）

## 本轮先不做

- 关 SSH 密码、改 SSH 端口（等密钥登录稳定）
- HTTPS / 域名
- 后端 Java 发布
- 网页一键发布流水线（以后再做）
