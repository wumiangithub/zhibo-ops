# nginx/test

HTTP 80 + HTTPS 443, routed by server_name. Wildcard cert via snippets.

- ssl-wildcard-caijisong.conf -> deploy to /etc/nginx/snippets/ (shared SSL params)
- admin-web.conf: qkzb-admin-test -> static + /live-admin -> 127.0.0.1:8080
- live-web.conf: qkzb-live-test -> static + /live-client -> 127.0.0.1:8081
- admin-server.conf: qkzb-admin-server-test -> 127.0.0.1:8080
- client-server.conf: qkzb-client-server-test -> 127.0.0.1:8081

On server: remove obsolete qkzhlive-wxapi-test.conf from sites-enabled.
Java listens on 8080/8081 only (not 80). Security group: 80 and 443.
