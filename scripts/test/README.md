# scripts/test

| Script | What it does |
|--------|----------------|
| `deploy-nginx-test.bat` / `.ps1` | Upload + reload Nginx only |
| `deploy-frontend-test.bat` / `.ps1` | build:test + scp admin/live dist |
| `deploy-all-test.bat` / `.ps1` | Run both in order |

SSH key to `ubuntu@14.103.210.83` and Node/npm required.
