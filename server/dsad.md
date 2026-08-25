I have a fresh **Hostinger VPS running Ubuntu 24.04 LTS**. I want you to guide me through setting it up from scratch as a **production-grade Docker server** for three applications.

Use:

* Ubuntu 24.04 LTS
* Docker Engine
* Docker Compose
* Nginx as the reverse proxy
* Certbot
* Let's Encrypt SSL certificates
* Automatic SSL renewal
* UFW firewall
* SSH key authentication
* Fail2ban where appropriate

Do NOT use Caddy.

I want a secure, maintainable production setup, not a development configuration.

# Applications

There are three applications that will run on this VPS.

## 1. CHTN Frontend

Application:

* React frontend
* Runs in its own Docker container
* Source code is in a private Git repository
* Domain is purchased in the same Hostinger account as the VPS

Production URL:

```text
https://<CHTN_FRONTEND_DOMAIN>
```

The React application must be built for production.

Do NOT run:

```bash
npm run dev
```

or the Vite/React development server in production.

Use a multi-stage Docker build:

```text
Node.js build stage
        ↓
npm ci
        ↓
npm run build
        ↓
production static files
        ↓
Nginx Alpine container
```

The frontend container should serve only the compiled React application.

Make sure React SPA routing works correctly using an Nginx fallback similar to:

```nginx
try_files $uri $uri/ /index.html;
```

---

# 2. CHTN Backend

Application:

* Node.js
* Express
* Runs in its own Docker container
* Source code is in a private Git repository
* Uses its own domain
* Domain is in the same Hostinger account as the VPS

Production URL:

```text
https://<CHTN_BACKEND_DOMAIN>
```

The Express application's internal port should NOT be publicly accessible.

Example internal port:

```text
5000
```

Use the application's actual port if different.

---

# 3. Viadia Backend

Application:

* Node.js
* Express
* Runs in its own Docker container
* Source code is in a private Git repository
* Provides the backend/API for the existing website:

```text
https://viadia.in
```

The `viadia.in` domain belongs to a **different Hostinger account**.

The API must be available at:

```text
https://api.viadia.in
```

The DNS record for `api.viadia.in` will be configured in that other Hostinger account and pointed to this VPS.

Do NOT modify the existing DNS records responsible for serving:

```text
viadia.in
www.viadia.in
```

unless there is a genuine reason.

Only:

```text
api.viadia.in
```

needs to point to this VPS.

---

# Required Architecture

I want this architecture:

```text
                         INTERNET
                            |
                     Ports 80 / 443
                            |
                            v
                    +---------------+
                    |     NGINX     |
                    | Reverse Proxy |
                    +-------+-------+
                            |
                Docker/private network
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
      +-------------+ +-------------+ +-------------+
      |    CHTN     | |    CHTN     | |   VIADIA    |
      |  Frontend   | |   Backend   | |   Backend   |
      |    React    | |   Express   | |   Express   |
      +-------------+ +-------------+ +-------------+
```

Public routing:

```text
https://<CHTN_FRONTEND_DOMAIN>
        ↓
CHTN frontend

https://<CHTN_BACKEND_DOMAIN>
        ↓
CHTN backend

https://api.viadia.in
        ↓
Viadia backend
```

---

# Important Docker/Nginx Architecture Decision

First determine and explain the best production architecture for Nginx.

My preference is:

```text
Nginx installed directly on Ubuntu
        ↓
Docker containers bound only to 127.0.0.1
```

For example:

```yaml
ports:
  - "127.0.0.1:3001:80"
```

and:

```yaml
ports:
  - "127.0.0.1:5001:5000"
```

This allows host Nginx to reach the containers without exposing application ports publicly.

If this is cleaner and safer than running the main reverse-proxy Nginx inside Docker, use this architecture.

In that case:

```text
Internet
   |
   v
Host Nginx :80/:443
   |
   +--> 127.0.0.1:3001 --> CHTN frontend container
   |
   +--> 127.0.0.1:5001 --> CHTN backend container
   |
   +--> 127.0.0.1:5002 --> Viadia backend container
```

The ports:

```text
3001
5001
5002
```

are examples.

They MUST bind only to:

```text
127.0.0.1
```

and must NOT be publicly accessible.

This is important because host Nginx cannot resolve Docker Compose service names such as:

```text
chtn-backend
viadia-backend
```

unless Nginx itself participates in the Docker network.

Do not create a configuration where host Nginx tries to proxy directly to Docker service names.

---

# Public Ports

Only these ports should be publicly accessible:

```text
22    SSH
80    HTTP
443   HTTPS
```

Do NOT expose application ports publicly, including:

```text
3000
3001
4000
5000
5001
5002
5173
8080
```

Application ports may be bound to:

```text
127.0.0.1
```

when required for host Nginx.

---

# VPS Initial Setup

Assume the VPS has just been reinstalled.

Start from the very beginning.

Provide commands for:

```bash
sudo apt update
sudo apt upgrade -y
```

Install required packages.

Create a dedicated non-root deployment user.

Configure SSH keys.

Secure SSH.

Configure timezone if appropriate.

Enable automatic Ubuntu security updates.

---

# SSH Security

Set up SSH securely.

I want:

* non-root deployment user
* sudo access
* SSH key authentication
* root login disabled after confirming the new user works
* password authentication disabled after confirming SSH keys work

IMPORTANT:

Do not tell me to disable root/password authentication until you have explicitly told me to open another terminal and verify that SSH key authentication for the new user works.

Avoid accidentally locking me out of the VPS.

Show how to validate SSH configuration before restarting/reloading SSH.

---

# Firewall

Configure UFW.

Allow:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Then:

```bash
sudo ufw enable
sudo ufw status verbose
```

No Docker application ports should be opened through UFW.

Explain any Docker/UFW caveats relevant to production security.

---

# Fail2ban

Install and configure Fail2ban for SSH protection if appropriate.

Use sensible production defaults.

Show how to verify:

```bash
sudo systemctl status fail2ban
```

and how to inspect the SSH jail.

---

# Docker Installation

Install the current stable Docker Engine from Docker's official Ubuntu repository rather than relying on an outdated distribution package if appropriate.

Install:

* Docker Engine
* Docker CLI
* containerd
* Docker Buildx
* Docker Compose plugin

Verify:

```bash
docker --version
docker compose version
```

Add the deployment user to the Docker group if appropriate.

Explain the security implication that membership in the Docker group effectively grants root-level privileges.

---

# Application Directory Structure

Use a clean structure under:

```text
/opt/apps/
```

Prefer:

```text
/opt/apps/
├── infrastructure/
│   ├── docker-compose.yml
│   └── .env
│
├── chtn-frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── .dockerignore
│   └── application source
│
├── chtn-backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env
│   └── application source
│
└── viadia-backend/
    ├── Dockerfile
    ├── .dockerignore
    ├── .env
    └── application source
```

Nginx host configuration should remain under the standard Ubuntu locations:

```text
/etc/nginx/sites-available/
/etc/nginx/sites-enabled/
```

SSL certificates should remain managed by Certbot under:

```text
/etc/letsencrypt/
```

---

# Git Deployment

Assume all three applications are stored in separate private Git repositories.

Use:

```text
<CHTN_FRONTEND_REPO>
<CHTN_BACKEND_REPO>
<VIADIA_BACKEND_REPO>
```

Show how to clone them securely.

Prefer SSH deploy keys or another production-safe mechanism.

Do NOT put:

* GitHub passwords
* personal access tokens
* private keys
* credentials

inside repositories or shell scripts.

Explain how deploy keys should be configured when multiple private repositories are used.

---

# CHTN React Dockerfile

Create an optimized production Dockerfile.

Use a multi-stage build.

Conceptually:

```dockerfile
FROM node:<SUPPORTED_LTS>-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

Do not blindly assume `/dist`.

Determine whether the application uses:

* Vite → usually `/dist`
* Create React App → usually `/build`

and explain what needs to change.

Use appropriate version pinning instead of blindly using `latest`.

---

# React Nginx Configuration

Inside the frontend container, configure Nginx to serve the SPA.

It should support React Router.

Example concept:

```nginx
server {
    listen 80;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Add appropriate static asset caching.

Do NOT aggressively cache `index.html`, because new deployments should become visible correctly.

---

# Express Production Dockerfile

Create a production Dockerfile that can be used/adapted for both Express applications.

Requirements:

* supported Node.js LTS
* `NODE_ENV=production`
* `npm ci`
* production dependencies
* non-root container user
* correct signal handling
* graceful shutdown
* health check
* `.dockerignore`
* minimal production image

Do not use development commands such as:

```bash
npm run dev
nodemon
```

Use the actual production command, such as:

```bash
npm start
```

or:

```bash
node dist/server.js
```

depending on the project.

If TypeScript is used, create an appropriate multi-stage build.

---

# Express Production Configuration

Configure both Express applications appropriately behind Nginx.

Include:

```javascript
app.set("trust proxy", 1);
```

where appropriate.

Configure:

* Helmet
* CORS
* request body limits
* centralized error handling
* graceful SIGTERM/SIGINT handling
* production logging
* health endpoint
* environment validation
* secure cookies if cookies are used

Do not expose stack traces in production responses.

---

# Health Endpoints

Each Express application should expose:

```text
GET /health
```

Example response:

```json
{
  "status": "ok"
}
```

Explain whether the health endpoint should verify only application liveness or also database readiness.

If useful, create separate:

```text
/health
/ready
```

endpoints.

---

# CORS

Configure CORS narrowly.

CHTN backend should allow only:

```text
https://<CHTN_FRONTEND_DOMAIN>
```

plus any explicitly required production origins.

Viadia backend should allow:

```text
https://viadia.in
https://www.viadia.in
```

Do NOT use:

```text
Access-Control-Allow-Origin: *
```

for authenticated/sensitive APIs.

If cookies are used, configure:

```text
credentials: true
```

correctly and explain the implications.

---

# Environment Variables

Backend secrets should live only on the VPS.

Example:

```env
NODE_ENV=production
PORT=5000

DATABASE_URL=<DATABASE_URL>
JWT_SECRET=<JWT_SECRET>
SESSION_SECRET=<SESSION_SECRET>
```

Do not commit `.env` files.

Make sure permissions are restrictive.

For example:

```bash
chmod 600 .env
```

Explain that frontend environment variables such as:

```text
VITE_API_URL
REACT_APP_API_URL
```

are compiled into the JavaScript bundle and are therefore PUBLIC.

Never put secrets into React/Vite environment variables.

---

# Docker Compose

Create the complete production:

```text
docker-compose.yml
```

It should manage:

```text
chtn-frontend
chtn-backend
viadia-backend
```

Use:

```yaml
restart: unless-stopped
```

Add health checks.

Add logging limits.

Example:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

Bind services only to loopback.

For example:

```yaml
services:

  chtn-frontend:
    build:
      context: ../chtn-frontend
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:80"

  chtn-backend:
    build:
      context: ../chtn-backend
    restart: unless-stopped
    env_file:
      - ../chtn-backend/.env
    ports:
      - "127.0.0.1:5001:5000"

  viadia-backend:
    build:
      context: ../viadia-backend
    restart: unless-stopped
    env_file:
      - ../viadia-backend/.env
    ports:
      - "127.0.0.1:5002:5000"
```

Use actual ports determined from the applications.

Do not blindly copy the example values.

---

# Host Nginx

Install Nginx directly on Ubuntu.

Create separate configuration files such as:

```text
/etc/nginx/sites-available/chtn-frontend
/etc/nginx/sites-available/chtn-backend
/etc/nginx/sites-available/viadia-api
```

Enable them using:

```text
/etc/nginx/sites-enabled/
```

Create production-grade reverse proxy configurations.

---

# CHTN Frontend Nginx

Configure:

```text
<CHTN_FRONTEND_DOMAIN>
        ↓
127.0.0.1:3001
```

Set appropriate proxy headers.

---

# CHTN Backend Nginx

Configure:

```text
<CHTN_BACKEND_DOMAIN>
        ↓
127.0.0.1:5001
```

Include appropriate headers:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

Include sensible proxy timeouts.

If WebSockets are used, configure:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

but do not add unnecessary WebSocket configuration if the application does not use WebSockets.

---

# Viadia API Nginx

Configure:

```text
api.viadia.in
        ↓
127.0.0.1:5002
```

Use appropriate reverse proxy headers and production settings.

---

# Nginx Security

Configure sensible global production settings.

Consider:

* `server_tokens off`
* request body size limits
* security headers
* TLS configuration
* proxy timeouts
* gzip where appropriate
* rate limiting for sensitive API endpoints if appropriate

Avoid blindly adding headers that could break the applications.

Explain the purpose of important security settings.

Always validate Nginx before reloading:

```bash
sudo nginx -t
```

Then:

```bash
sudo systemctl reload nginx
```

Never reload Nginx after configuration changes without testing first.

---

# DNS Configuration

Give exact DNS instructions.

## CHTN frontend

In the Hostinger account containing the frontend domain:

```text
Type: A
Name: @
Value: <VPS_PUBLIC_IP>
TTL: default
```

If using:

```text
www.<CHTN_FRONTEND_DOMAIN>
```

configure that appropriately as either an A record or CNAME.

Explain which option you recommend.

---

# CHTN Backend

If it uses an independent root domain:

```text
Type: A
Name: @
Value: <VPS_PUBLIC_IP>
```

If it instead uses a subdomain such as:

```text
api.example.com
```

use:

```text
Type: A
Name: api
Value: <VPS_PUBLIC_IP>
```

---

# Viadia API DNS

This DNS change happens in the **other Hostinger account** where `viadia.in` is managed.

Create:

```text
Type: A
Name: api
Value: <VPS_PUBLIC_IP>
TTL: default
```

Result:

```text
api.viadia.in
        ↓
<VPS_PUBLIC_IP>
```

Do NOT change the existing records for:

```text
viadia.in
www.viadia.in
```

The existing Viadia website should continue working exactly as before.

---

# DNS Verification

Before requesting SSL certificates, verify DNS.

Use commands such as:

```bash
dig +short <CHTN_FRONTEND_DOMAIN>
dig +short <CHTN_BACKEND_DOMAIN>
dig +short api.viadia.in
```

All applicable domains should resolve to:

```text
<VPS_PUBLIC_IP>
```

Do not attempt certificate issuance until DNS is resolving correctly.

---

# Automatic SSL With Certbot

Install:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Use Let's Encrypt.

Once HTTP Nginx configurations work and DNS resolves correctly, issue certificates.

Prefer issuing certificates per site/domain rather than unnecessarily putting unrelated domains into one certificate.

Example:

```bash
sudo certbot --nginx -d <CHTN_FRONTEND_DOMAIN>
```

If using `www`:

```bash
sudo certbot --nginx \
  -d <CHTN_FRONTEND_DOMAIN> \
  -d www.<CHTN_FRONTEND_DOMAIN>
```

For CHTN backend:

```bash
sudo certbot --nginx -d <CHTN_BACKEND_DOMAIN>
```

For Viadia:

```bash
sudo certbot --nginx -d api.viadia.in
```

Have Certbot configure HTTP → HTTPS redirects.

---

# Automatic SSL Renewal

Configure and verify automatic certificate renewal.

Check:

```bash
systemctl status certbot.timer
```

and:

```bash
systemctl list-timers | grep certbot
```

Test renewal safely:

```bash
sudo certbot renew --dry-run
```

Explain how Certbot automatically renews certificates before expiration.

Also explain how Nginx picks up renewed certificates.

I should NOT have to manually renew SSL certificates every few months.

---

# SSL Verification

Show how to verify certificates.

For example:

```bash
sudo certbot certificates
```

Test:

```bash
curl -I https://<CHTN_FRONTEND_DOMAIN>
curl -I https://<CHTN_BACKEND_DOMAIN>
curl -I https://api.viadia.in
```

---

# Database Security

If either backend uses:

* PostgreSQL
* MySQL
* MongoDB
* Redis

do NOT expose database ports publicly.

If databases run in Docker, put them on a private Docker network and use persistent volumes.

Do not create:

```yaml
ports:
  - "5432:5432"
```

for PostgreSQL, for example.

Backends should communicate with databases internally.

Use strong random database credentials.

---

# Docker Security

Application containers should not run as root unless necessary.

Use:

* non-root users
* minimal images
* `.dockerignore`
* read-only filesystems where practical
* `no-new-privileges` where appropriate
* resource limits where appropriate
* health checks
* logging limits

Do not overcomplicate the setup if a security feature would break normal Node.js operation.

Explain each important security decision.

---

# Secrets

Never put secrets in:

```text
Dockerfile
docker-compose.yml committed to Git
Git repository
React source
GitHub Actions logs
shell history
```

Explain how to safely generate secrets.

For example:

```bash
openssl rand -hex 32
```

or:

```bash
openssl rand -base64 48
```

Do not generate or invent my actual production credentials.

---

# Logging

Prevent Docker logs from filling the VPS disk.

Configure logging rotation.

Show:

```bash
docker compose logs -f
```

and per-service logging:

```bash
docker compose logs -f chtn-frontend
docker compose logs -f chtn-backend
docker compose logs -f viadia-backend
```

Also show Nginx logs:

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

# Deployment

Provide the exact initial deployment sequence.

For example:

```bash
cd /opt/apps/infrastructure

docker compose build
docker compose up -d

docker compose ps
```

Then verify the loopback services before configuring public routing:

```bash
curl http://127.0.0.1:3001
curl http://127.0.0.1:5001/health
curl http://127.0.0.1:5002/health
```

Only after these work should Nginx and SSL be considered complete.

---

# Updating One Application

Show how to update only the CHTN frontend:

```bash
cd /opt/apps/chtn-frontend
git pull

cd /opt/apps/infrastructure
docker compose build chtn-frontend
docker compose up -d --no-deps chtn-frontend
```

Do the same for:

```text
chtn-backend
viadia-backend
```

Do NOT unnecessarily restart all applications when deploying only one.

---

# Minimal Downtime

Explain the downtime characteristics of:

```bash
docker compose up -d --no-deps <service>
```

If there can be a short interruption while the container is replaced, explain that clearly.

Do not introduce Kubernetes or Docker Swarm just to achieve zero downtime.

Keep this VPS architecture simple unless actual traffic requirements justify additional orchestration.

---

# Rollback Strategy

Create a practical rollback strategy.

Do not rely exclusively on:

```text
git pull
```

Prefer deployments tied to:

* Git commit SHA
* Git tag
* Docker image tag

Explain how I can return to the previous known-good version quickly.

Example conceptual flow:

```text
release-2026-08-24-1
release-2026-08-24-2
```

If the second release fails, I should be able to redeploy the first.

---

# Backups

Create a production backup strategy for:

* database
* uploaded files
* `.env` files
* Nginx configuration
* Docker Compose configuration
* other persistent application data

Source code already stored in Git does not need to be treated as the primary VPS backup.

Explain how to encrypt backups containing secrets.

Also explain what Hostinger VPS backups/snapshots should and should not be relied upon for.

---

# Monitoring

Give me useful production monitoring commands.

Docker:

```bash
docker compose ps
docker stats
docker system df
docker ps
```

System:

```bash
df -h
free -h
uptime
```

Nginx:

```bash
sudo systemctl status nginx
sudo nginx -t
```

SSL:

```bash
sudo certbot certificates
systemctl status certbot.timer
```

Security:

```bash
sudo ufw status verbose
sudo fail2ban-client status
```

---

# Safe Docker Cleanup

Show how to inspect Docker disk usage:

```bash
docker system df
```

Explain the difference between:

```bash
docker image prune
docker container prune
docker builder prune
docker system prune
```

Do NOT recommend:

```bash
docker system prune -a --volumes
```

without a major warning explaining that it can permanently delete unused images, containers, networks, build cache, and volumes/data.

Never include destructive commands casually.

---

# Reboot Test

After everything is configured, verify the server survives a reboot.

Check that:

```text
Docker
Nginx
Fail2ban
containers
```

come back correctly.

Containers should use:

```yaml
restart: unless-stopped
```

After reboot:

```bash
docker compose ps
sudo systemctl status nginx
sudo systemctl status docker
```

Then test all three HTTPS URLs.

---

# Final Production Architecture

The completed server should look like:

```text
                         INTERNET
                            |
                     +------+------+
                     |             |
                    :80           :443
                     |             |
                     +------+------+
                            |
                      HOST NGINX
                            |
             +--------------+--------------+
             |              |              |
             v              v              v
      127.0.0.1:3001 127.0.0.1:5001 127.0.0.1:5002
             |              |              |
             v              v              v
       CHTN React      CHTN Express    Viadia Express
        Container       Container        Container
```

TLS:

```text
Let's Encrypt
      |
   Certbot
      |
automatic renewal
      |
    Nginx
```

---

# Final Verification Checklist

At the end, give me a checklist to verify all of the following:

* DNS for CHTN frontend resolves to VPS
* DNS for CHTN backend resolves to VPS
* `api.viadia.in` resolves to VPS
* existing `viadia.in` website still works
* only ports 22, 80 and 443 are publicly accessible
* application Docker ports are bound only to `127.0.0.1`
* UFW enabled
* SSH key authentication works
* root SSH login disabled
* password SSH authentication disabled
* Fail2ban running
* automatic security updates enabled
* Docker running
* all three containers running
* Docker health checks passing
* CHTN frontend accessible over HTTPS
* CHTN backend accessible over HTTPS
* Viadia API accessible at `https://api.viadia.in`
* HTTP redirects to HTTPS
* Let's Encrypt certificates valid
* Certbot automatic renewal enabled
* `certbot renew --dry-run` succeeds
* CORS configured correctly
* Express `trust proxy` configured correctly
* production environment variables loaded
* secrets not committed to Git
* database ports not publicly exposed
* Docker logs rotated
* Nginx logs working
* containers automatically restart after VPS reboot
* backup procedure documented and tested
* rollback procedure tested

# Important Instructions

Do not give me only an overview.

Walk me through the deployment **step by step from a completely fresh Hostinger Ubuntu 24.04 VPS**.

For every step:

1. Explain briefly what we are doing.
2. Give the exact commands.
3. Tell me what output/result I should expect.
4. Give me a verification command.
5. Do not continue conceptually past a critical verification point without telling me to confirm it works.

For example, before issuing SSL certificates:

```text
Verify DNS → Verify containers → Verify HTTP Nginx → Issue SSL
```

Do not request SSL before DNS is correctly pointing to the VPS.

Do not disable SSH password/root access until the new SSH key login has been tested from a separate terminal.

Do not invent missing values.

Use placeholders:

```text
<VPS_PUBLIC_IP>

<CHTN_FRONTEND_DOMAIN>
<CHTN_BACKEND_DOMAIN>

<CHTN_FRONTEND_REPO>
<CHTN_BACKEND_REPO>
<VIADIA_BACKEND_REPO>

<CHTN_FRONTEND_HOST_PORT>
<CHTN_BACKEND_HOST_PORT>
<VIADIA_BACKEND_HOST_PORT>

<DATABASE_URL>
<JWT_SECRET>
<SESSION_SECRET>
```

Ask me for missing application-specific information when it becomes necessary.

Priorities, in order:

1. Do not lock me out of SSH
2. Do not lose production data
3. Security
4. Correct DNS
5. Reliable HTTPS
6. Docker isolation
7. Simple deployment
8. Easy rollback
9. Easy maintenance
10. Performance

The end result must be a **production-ready Hostinger VPS running React + two Express backends in separate Docker containers behind host-level Nginx, with automatic Let's Encrypt SSL renewal through Certbot.**
