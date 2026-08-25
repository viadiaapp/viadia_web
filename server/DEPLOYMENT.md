# Deploying the API to a VPS

Manual deploy via Docker Compose — no CI/CD, you run these steps yourself on the VPS.

## First-time setup

1. **Install Docker** on the VPS (includes Compose v2 as `docker compose`):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. **Clone the repo** and go into `server/`:
   ```bash
   git clone https://github.com/viadiaapp/viadia_web.git
   cd viadia_web/server
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Fill in at minimum: `GEMINI_API_KEY`, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`, and `FRONTEND_ORIGIN` (your Hostinger domain, e.g. `https://viadia.in`). Leave `FIREBASE_PROJECT_ID`/`FIREBASE_DATABASE_ID` as-is unless you use a different Firebase project.

4. **Add the Firebase service-account key**: in Firebase Console → Project Settings → Service Accounts → Generate new private key. Save it as `service-account.json` right in `server/` (same folder as `docker-compose.yml`) — it's gitignored and the compose file already mounts it in. Make sure `GOOGLE_APPLICATION_CREDENTIALS=./service-account.json` in `.env` matches.

5. **Build and start**:
   ```bash
   docker compose up -d --build
   ```

6. **Verify it's up**:
   ```bash
   curl http://localhost:3000/health
   # {"status":"ok"}
   curl http://localhost:3000/docs   # Swagger UI, from a browser via the reverse proxy below
   ```

7. **Put it behind a reverse proxy with TLS** so it's reachable at a real HTTPS domain (e.g. `api.viadia.in`) — the container only serves plain HTTP on port 3000. Simplest option, [Caddy](https://caddyserver.com/) (auto-HTTPS):
   ```bash
   sudo apt install -y caddy
   ```
   `/etc/caddy/Caddyfile`:
   ```
   api.viadia.in {
       reverse_proxy localhost:3000
   }
   ```
   ```bash
   sudo systemctl restart caddy
   ```
   Point `api.viadia.in`'s DNS A record at the VPS's IP first. (nginx + certbot works the same way if you'd rather use that.)

8. **Point the frontend at it**: set `VITE_BACKEND_API_URL=https://api.viadia.in` wherever the Hostinger build runs, then rebuild/redeploy the frontend.

9. **Razorpay webhook**: in the Razorpay Dashboard, add a webhook pointing at `https://api.viadia.in/api/payments/razorpay/webhook`, subscribed to `payment.captured` and `order.paid`, using the same secret as `RAZORPAY_WEBHOOK_SECRET` in `.env`.

## Redeploying after code changes

```bash
cd viadia_web/server
git pull
docker compose up -d --build
```

That rebuilds the image and replaces the running container; the old one stops only once the new one is healthy.

## Useful commands

```bash
docker compose logs -f api      # tail logs
docker compose restart api      # restart without rebuilding
docker compose down             # stop and remove the container
```
