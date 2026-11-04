# 环境总览

| 环境 | 机器 | admin 端口 | live 端口 | 备注 |
|------|------|------------|-----------|------|
| local | 本机 Windows | 开发用 Vite 端口（见前端 `.env.development`） | 同上 | 不经本仓 Nginx |
| test | `ubuntu@14.103.210.83` | 5173 | 5174 | 第一次练手目标 |
| uat | `ubuntu@14.103.46.159` | 待定 | 待定 | test 跑通后再镜像 |
| prod | 待提供 | 待定 | 待定 | |

前端构建：`admin-web` / `live-web` 使用 `npm run build:test`（mode=test）。  
对外端口由本仓 Nginx / 安全组决定，**不会**写进 Vite 构建产物。

细节见各环境文件：`test.md`（已写）、`uat.md` / `prod.md`（占位）。
