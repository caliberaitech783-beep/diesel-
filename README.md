# Diesel

Diesel signs users in with their Caliber Pulse account.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://localhost:3000`. For Pulse sign-in, copy `.env.example` to `.env` and configure the issuer and shared secret.

Run `npm test` to test sign-in against a simulated issuer and `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`, alongside `sign-in/`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge a tested change into `main`. In the Diesel Web App’s Deployment Center, select **Sync** to pull that branch. Azure builds the Node.js 24 application and starts it with `npm start`.
2. Check the deployed commit and build result in Deployment Center. Open the [health check](https://pulse-lll.cmll.in/healthz) and verify that sign-in and sign-out work with a Pulse account.

Set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Both apps need the same `DIESEL_SSO_CLIENT_SECRET`, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`.

The [GitHub Actions workflow](.github/workflows/azure.yml) runs tests and builds. Its optional deployment job requires a Diesel-scoped Azure federated identity, the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets, and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables.

See [AGENTS.md](AGENTS.md) for repository rules.
