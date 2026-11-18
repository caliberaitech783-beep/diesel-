# Diesel

Diesel opens in guest mode with 20 form previews under **Master**. Use sample details only. Inputs stay on the current page. **Check fields** checks the form without saving. Diesel Rate calculates the all-inclusive price per litre and per kilolitre from the invoice total and litres.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://localhost:3000`. To test Pulse sign-in, copy `.env.example` to `.env`, set `DIESEL_ACCESS_MODE=pulse`, and configure the issuer and shared secret.

Run `npm test` to check the master previews, invoice rate calculation, guest access and sign-in against a simulated issuer. The master names and order are in `src/features/masters/catalog.mjs`. Each master has a field definition in that directory. Run `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`, alongside `sign-in/`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge a tested change into `main`. In the Diesel Web App’s Deployment Center, select **Sync** to pull that branch. Azure builds the Node.js 24 application and starts it with `npm start`.
2. Check the deployed commit and build result in Deployment Center. Open the [health check](https://pulse-lll.cmll.in/healthz) and verify that the homepage opens as a guest.

To enable Pulse sign-in, set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Set the same `DIESEL_SSO_CLIENT_SECRET` on both apps, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`. Once the Pulse issuer is ready, set `DIESEL_ACCESS_MODE=pulse` on Diesel and verify sign-in and sign-out with a Pulse account.

The [GitHub Actions workflow](.github/workflows/azure.yml) runs tests and builds. Its optional deployment job requires a Diesel-scoped Azure federated identity, the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets, and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables.

See [AGENTS.md](AGENTS.md) for repository rules.
