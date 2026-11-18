# Diesel

Diesel on Azure requires an allowed Pulse account. Open **Item Master** to submit an item with **Save**. The **Import and export** dropdown transfers the fields for one item. Excel (`.xlsx`) and CSV use the Item Master field names as column headers and one data row. For PDF import, use a fillable PDF exported from Item Master. Imports fill the current form for review before saving.

The other masters are form previews. Diesel Rate calculates the all-inclusive price per litre and per kilolitre from the invoice total and litres. Use the three-line icon to return to the Master tab and the sidebar’s back arrow to open the Pulse sign-in screen.

## Run locally

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://127.0.0.1:3000`. `npm run preview:masters` opens the same local workspace on port 4313. The local workspace uses sample maker and checker roles and stores records in `.local-diesel/items.sqlite`. For the Location and Storage Location workflows, load the Pulse project directory with `npm run sync:pulse-projects -- "<trusted Pulse 1 checkout>"`.

To test Pulse sign-in, copy `.env.example` to `.env`, set `DIESEL_ACCESS_MODE=pulse`, and configure the issuer and shared secret.

Run `npm test` to check Item Master saves, local review, the form previews, and Pulse sign-in against a simulated issuer. Run `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`. Master definitions are registered in `src/features/masters/catalog.mjs`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge the tested change into `main`.
2. In [GitHub Actions](https://github.com/caliberaitech783-beep/diesel-/actions/workflows/azure.yml), select **Test and deploy Diesel**, choose **Run workflow** on `main`, and wait for the `deploy` job. From an authenticated GitHub CLI session, run `gh workflow run azure.yml --ref main --repo caliberaitech783-beep/diesel-`.
3. Check that the workflow verified the expected commit and `itemMaster: ready` at the [production health endpoint](https://pulse-lll.cmll.in/healthz). Open Item Master with an allowed Pulse account and check for **Import and export** and **Save**.

If the GitHub deployment workflow is unavailable, select **Sync** in the Diesel app’s Azure Deployment Center. Confirm the expected commit in the deployment log and check that the live site responds.

Production Item Master stores each pending submission and its optional attachment under Diesel’s persistent App Service directory `/home/data/diesel-item-submissions`. Keep App Service storage enabled. Each allowed Pulse account can reopen its own submissions. The local workspace supports maker and checker approval.

To enable Pulse sign-in, set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Set the same `DIESEL_SSO_CLIENT_SECRET` on both apps, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`. Configure the comma-separated Diesel app setting `DIESEL_ALLOWED_PULSE_LOGINS` with the approved Pulse usernames. An empty list denies all accounts. Azure always requires Pulse. Once the Pulse issuer is ready, set `DIESEL_ACCESS_MODE=pulse` on Diesel and verify sign-in and sign-out with a Pulse account.

GitHub Actions deploys with a federated identity scoped to the Diesel Web App and trusted for `main`. It uses the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables. The deployment workflow uses these repository settings from any Diesel chat.

See [AGENTS.md](AGENTS.md) for repository rules.
