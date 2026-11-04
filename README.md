# zhibo-ops

运维相关：环境说明、Nginx、发布/回退脚本、流水线工具等放这里。维护者是 **运维（Grok，D102）**，开工先看 [AGENTS.md](./AGENTS.md)。子仓里已有的 nginx / 发布 / 环境配置可以由这个窗口改；不写业务代码。

- 当前范围：先部署 `admin-web` / `live-web` 到各环境；后端暂不由本仓发布。
- 环境：local / test / uat / prod
- test：`ubuntu@14.103.210.83`，admin `5173`，live `5174`
- uat：`ubuntu@14.103.46.159`
- prod：机器待定

本目录是否单独 git 仓，后续再定；先作为父目录下的运维工作区。
