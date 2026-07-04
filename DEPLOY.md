# Deploying Boarding to your VPS

The app is a plain Node server (Next.js `next start`) with a single SQLite
file as the database. No external services.

## One-time setup

```bash
# On the VPS (Node 20+ required; 22/24 recommended)
node -v

# 1. Get the code (push this repo to GitHub/GitLab first, or rsync it)
git clone <your-repo-url> ~/apps/boarding
cd ~/apps/boarding

# 2. Install & build
npm ci
npm run build

# 3. Data lives OUTSIDE the repo so deploys never touch it
mkdir -p ~/boarding-data

# 4. Environment
cat > .env.local <<EOF
DATABASE_PATH=/home/<user>/boarding-data/boarding.db
AUTH_SECRET=$(openssl rand -hex 32)
PORT=3050
EOF

# 5. Create tables + the 3 people (default PIN 0000 — change in Settings!)
npm run db:push
npm run db:seed

# 6. Run under pm2
npm install -g pm2
pm2 start npm --name boarding -- start
pm2 save
pm2 startup   # follow the printed instruction once so it survives reboots
```

## Subdomain + SSL (cPanel)

1. cPanel → **Domains** → create `boarding.yourdomain.lk`.
2. Reverse-proxy it to the app. Easiest on cPanel is an `.htaccess` in the
   subdomain's document root:

   ```apache
   RewriteEngine On
   RewriteRule ^(.*)$ http://127.0.0.1:3050/$1 [P,L]
   ```

   (If you have root/WHM, a proper Apache/Nginx `ProxyPass` vhost include is
   cleaner: `ProxyPass / http://127.0.0.1:3050/` + `ProxyPassReverse`.)
3. Run **AutoSSL** (or certbot) for the subdomain.
4. Open `https://boarding.yourdomain.lk`, sign in, go to **Settings**:
   - each person changes their PIN,
   - enter the opening balances for your first month
     (the "Difference" row of the last Excel sheet).

## Updating the app

```bash
cd ~/apps/boarding
git pull
npm ci
npm run build
npm run db:push        # applies any schema changes
pm2 restart boarding
```

## Nightly backup (the whole DB is one file)

```bash
crontab -e
# 03:30 every night, keep 30 days
30 3 * * * mkdir -p ~/boarding-backups && sqlite3 ~/boarding-data/boarding.db ".backup '~/boarding-backups/boarding-$(date +\%F).db'" && find ~/boarding-backups -name 'boarding-*.db' -mtime +30 -delete
```

If `sqlite3` isn't installed, a plain `cp` works too (the app uses WAL mode;
`sqlite3 .backup` is just the safest form).

## Notes

- The Keells fetch runs from the VPS and needs outbound HTTPS to
  `digibillaccess.keellssuper.com` (no key required).
- E-bill links expire ~3 months after issue, but the app stores the full
  HTML snapshot at import time, so old bills stay viewable forever.
- To restore a backup: stop the app, copy the backup file over
  `boarding.db`, start the app.
