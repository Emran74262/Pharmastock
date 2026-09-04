
# PharmaStock — Server-Ready v1

This version uses **PostgreSQL** instead of local SQLite and is packaged for deployment with Docker.

## Local test
Install Docker Desktop, then from this folder run:

    docker compose up --build

Open:

    http://localhost:5000

Health check:

    http://localhost:5000/health

## Deploy to a VPS
1. Get a Linux VPS/server.
2. Install Docker + Docker Compose.
3. Copy this project to the server.
4. Change the PostgreSQL password in `docker-compose.yml` and `.env.example`.
5. Run:

    docker compose up -d --build

6. Put a domain name in front of the web container using a reverse proxy such as Caddy or Nginx.
7. Enable HTTPS.
8. Point the domain's DNS A record to the server IP.

## Important production work still needed
- Authentication and role permissions
- HTTPS/reverse proxy configuration
- Automated encrypted database backups
- Audit log
- CSRF protection and security headers
- Password reset / account management
- Barcode scanner support
- Prescription workflow
- Pharmacy-specific legal/tax settings

Do not expose PostgreSQL directly to the public internet. Only the web server should be publicly accessible.
