# Diesel

Diesel signs users in with their Caliber Pulse account.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://localhost:3000`. For Pulse sign-in, copy `.env.example` to `.env` and configure the issuer and shared secret.

Run `npm test` to test sign-in against a simulated issuer and `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`, alongside `sign-in/`.

## Deploy

1. Set up a Linux Azure App Service in `caliber-diesel-rg` with Node.js 24 and `npm start`. Add `pulse-lll.cmll.in` using Azure’s CNAME and TXT records, then enable HTTPS with a managed certificate.
2. Set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in`, `PULSE_ORIGIN`, and `DIESEL_SSO_CLIENT_SECRET` on Diesel. Set the same public origin and 32-byte base64url secret on the Pulse issuer, along with `DIESEL_SSO_ENABLED=1`.
3. Configure an Azure federated identity scoped to the app. Set GitHub Actions secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`, and variables `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN`. [Azure setup guide](https://learn.microsoft.com/azure/app-service/deploy-github-actions)
4. In Actions, run [Test and deploy Diesel](.github/workflows/azure.yml) from `main`. It checks that production serves the selected commit and redirects sign-in to Pulse. Verify a full sign-in and sign-out with a Pulse account before enabling the launcher tile.

See [AGENTS.md](AGENTS.md) for repository rules.
