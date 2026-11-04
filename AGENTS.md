# 接手必读（运维 agent）

本目录是运维工作区。读者是 **运维（Grok，D102）**。

Grok bot **打开父目录** `D:\ai-project\zhibo`（`zhibo-ops` 和各子仓都在这棵树里）。日常只写本目录。根目录 `AGENTS.md` 是总控 / 副总控的职责，不要按那份去改业务、改契约、下功能工单。

每次开工先看：

1. 本文件
2. [README.md](./README.md)（环境与机器）
3. `../zhibo-shared/docs/工单.md` 里派给「运维（Grok）」的待办

## 干什么

- 环境说明、Nginx、发布 / 回退脚本、流水线：写在 `zhibo-ops`。
- 某个子仓里已经放了 nginx、发布或环境配置时，可以改那个文件。
- 不写业务代码：不改 Java、Vue、小程序业务逻辑，不改 API 契约，不派业务功能工单。
- 本窗口不是副总控，禁止使用 `[lead-grok]`、`[lead]`、`[lead-codex]`、`[lead-cloud]`。

## 提交

前缀固定 `[ops-grok]`。须用户明确要求才 `git commit` / `git push`。

`zhibo-ops` 是否单独 git 仓后续再定（见 README）。改到已有子仓（`zhibo-backend` / `zhibo-frontend` / `zhibo-wxmini` / `zhibo-shared`）的运维配置，进那个子仓提交，前缀仍是 `[ops-grok]`。

父目录不要 `git init`。

## 工作区安全（D64）

禁止用 `git checkout HEAD --` / `git restore` / `git reset --hard` / `git clean -fd` 覆盖或删除未提交 WIP。细则：`../zhibo-shared/docs/工作区与Git安全.md`。
