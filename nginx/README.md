# Nginx 配置

按环境分子目录。当前只有 `test/`。

拷到服务器的常见位置：`/etc/nginx/sites-available/`，再 `ln -s` 到 `sites-enabled/`，然后 `nginx -t && systemctl reload nginx`。
