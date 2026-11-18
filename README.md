# Diesel

Diesel on Azure opens the Pulse sign-in form directly and requires an allowed Pulse account. Local guest mode provides 20 form previews under **Master**. Select a master to hide the sidebar and open all form sections on one page. Use **Back to masters** above the form to choose another. Use the Day/Night switch to change the theme. Use sample details only. Inputs stay on the current page. **Check fields** checks the form without saving. Diesel Rate calculates the all-inclusive price per litre and per kilolitre from the invoice total and litres.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://localhost:3000`. To test Pulse sign-in, copy `.env.example` to `.env`, set `DIESEL_ACCESS_MODE=pulse`, and configure the issuer and shared secret.

Run `npm test` to check the master previews, invoice rate calculation, guest access and sign-in against a simulated issuer. The master names and order are in `src/features/masters/catalog.mjs`. Each master has a field definition in that directory. Run `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`, alongside `sign-in/`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge the tested change into `main`.
2. In [GitHub Actions](https://github.com/caliberaitech783-beep/diesel-/actions/workflows/azure.yml), select **Test and deploy Diesel**, choose **Run workflow** on `main`, and wait for the `deploy` job. From an authenticated GitHub CLI session, run `gh workflow run azure.yml --ref main --repo caliberaitech783-beep/diesel-`.
3. Check that the workflow verified the expected commit at the [production health endpoint](https://pulse-lll.cmll.in/healthz) and that the homepage offers Pulse sign-in.

If the GitHub deployment workflow is unavailable, select **Sync** in the Diesel app’s Azure Deployment Center. Confirm the expected commit in the deployment log and check that the live site responds.

To enable Pulse sign-in, set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Set the same `DIESEL_SSO_CLIENT_SECRET` on both apps, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`. Configure the comma-separated Diesel app setting `DIESEL_ALLOWED_PULSE_LOGINS` with the approved Pulse usernames. An empty list denies all accounts. Azure always requires Pulse. Once the Pulse issuer is ready, set `DIESEL_ACCESS_MODE=pulse` on Diesel and verify sign-in and sign-out with a Pulse account.

GitHub Actions deploys with a federated identity scoped to the Diesel Web App and trusted for `main`. It uses the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables. The deployment workflow uses these repository settings from any Diesel chat.

See [AGENTS.md](AGENTS.md) for repository rules.
