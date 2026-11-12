# scripts/test

- deploy-nginx-test.bat / .ps1: upload domain Nginx configs on :80 and reload
- deploy-admin-web-test.bat / .ps1: build:test + scp admin-web dist
- deploy-live-web-test.bat / .ps1: build:test + scp live-web dist
- deploy-java-test.bat / .ps1: JDK 17 package + Docker Temurin 17 on test (127.0.0.1:9080/9081). Optional -Target all|admin|live
- deploy-all-test.bat / .ps1: nginx, then admin-web, then live-web (frontend only; Java is a separate script / publish-console target)

SSH key to ubuntu@14.103.210.83 and Node/npm required.

- import-mysql-container-test.bat / .ps1: dump and import into container MySQL. -Source local (default) or host.
