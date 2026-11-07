# zhibo-ops

运维相关：环境说明、Nginx、发布/回退脚本、流水线工具等放这里。维护者是 **运维（Grok，D102）**，开工先看 [AGENTS.md](./AGENTS.md)。子仓里已有的 nginx / 发布 / 环境配置可以由这个窗口改；不写业务代码。

## 目录

| 路径 | 用途 |
|------|------|
| `envs/` | 各环境机器、端口、初始化步骤 |
| `nginx/` | Nginx 配置草案（按环境） |
| `scripts/` | 发布 / 回退脚本 |
| `local-publish/` | 本机一键发布控制台（React + Node，调 scripts/test） |

## 环境速查

- **local**：本机 Windows
- **test**：`ubuntu@14.103.210.83`，admin `5173`，live `5174` → 见 [envs/test.md](./envs/test.md)
- **uat**：`ubuntu@14.103.46.159`（占位）
- **prod**：机器待定（占位）

当前范围：test/uat 上**后端 Java 已由后端自行部署**；本仓先部署 `admin-web` / `live-web`；后端暂不由本仓发布。

本目录是独立 git 仓，默认分支 `master`，远程 `git@github.com:wumiangithub/zhibo-ops.git`。父目录不要 `git init`。
