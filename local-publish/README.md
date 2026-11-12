# local-publish — 本地一键发布控制台

在本机 Windows 上通过网页触发 `zhibo-ops/scripts/test` 里现有的发布脚本，看实时日志。

> 后期计划（本目录暂不做）：在 test 服务器上另做一套发布服务，用 `test IP:端口` 访问，从 git 拉代码后在服务器本地打包发布。

## 功能

- 简单登录（账号密码在 `.env`）
- 勾选发布：nginx / admin-web / live-web / admin-java / live-java（默认都不勾选）
- 「全部发布」按顺序跑：nginx → admin-web → live-web → admin-java → live-java（各自独立脚本，控制台分 tab 看日志）
- 多选单项时按 nginx → admin-web → live-web → admin-java → live-java 顺序依次执行对应 `.ps1`
- SSE 实时日志
- 同时只允许一个发布任务

## 按钮与脚本对应

| 操作 | 脚本 |
|------|------|
| 仅 nginx | `deploy-nginx-test.ps1` |
| 仅 admin-web | `deploy-admin-web-test.ps1` |
| 仅 live-web | `deploy-live-web-test.ps1` |
| 仅 admin-java | `deploy-java-test.ps1 -Target admin`（本机 JDK 17 打包，测试机 Docker 听 127.0.0.1:9080） |
| 仅 live-java | `deploy-java-test.ps1 -Target live`（本机 JDK 17 打包，测试机 Docker 听 127.0.0.1:9081） |
| 全部发布 / 全选 | 依次跑 nginx、两个前端、两个 Java 脚本（不是再包一层 deploy-all-test） |
| 多选（非全选） | 按 nginx → admin-web → live-web → admin-java → live-java 顺序跑选中的脚本 |

## 安装与启动

```powershell
cd D:\ai-project\zhibo\zhibo-ops\local-publish
copy .env.example .env
npm run install:all
npm run dev
```

开发模式请打开前端：**http://localhost:6688**（Vite 已把 /api 代理到 3789）。

生产式本地（先 build）：**http://localhost:3789**

默认账号：`ops` / `ops123`（可在 `.env` 修改）

- 开发模式：Vite 前端（6688）+ Express API（3789），Vite 把 `/api` 代理到 Express；根路径 3789 也可直接打开（生产式托管需先 build）
- 生产式本地：`npm run build` 后 `npm start`，Express 托管 `web/dist` 并提供 API

## 环境变量

见 `.env.example`：

- `PORT` 默认 `3789`
- `PUBLISH_USER` / `PUBLISH_PASS`
- `SESSION_SECRET`
- `SCRIPTS_DIR` 默认相对 server 的 `../../scripts/test`

## 目录

```
local-publish/
  server/     Node + Express API
  web/        React + Vite 前端
  .env.example
  README.md
```
