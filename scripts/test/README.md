# scripts/test

- deploy-nginx-test.bat / .ps1: upload domain Nginx configs on :80 and reload
- deploy-admin-web-test.bat / .ps1: build:test + scp admin-web dist
- deploy-live-web-test.bat / .ps1: build:test + scp live-web dist
- deploy-all-test.bat / .ps1: nginx, then admin-web, then live-web

SSH key to ubuntu@14.103.210.83 and Node/npm required.
