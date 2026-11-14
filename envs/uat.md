# uat 环境（占位）

**Spring profile（强制）**：本环境拉起 Java 时必须带 `--spring.profiles.active=uat`（或 `SPRING_PROFILES_ACTIVE=uat`），**禁止沿用默认 `local`**。详见 `../../zhibo-shared/docs/Spring环境与启动.md`。

- SSH：`ssh ubuntu@14.103.46.159`
- 端口、目录、Nginx：等 test 跑通后按 test 镜像，再单独改端口/域名。
