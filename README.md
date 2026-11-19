# Diesel

Diesel on Azure requires an allowed Pulse account. Open any master and use **Save for review** at the bottom of the form. The **Import** and **Export** dropdowns transfer the fields for one record. Excel (`.xlsx`) and CSV use that master's field names as column headers and one data row. For PDF import, use a fillable PDF exported from that master. Review the fields and add any supporting files before saving.

Diesel Rate calculates the all-inclusive price per litre and per kilolitre from the invoice total and litres. Use the three-line icon to return to the Master tab and the sidebar’s back arrow to open the Pulse sign-in screen.

Expand **Master Data** in the sidebar and open a master to see its saved records. Each table uses that master's form fields as columns. **Download** and **Export** offer Excel, CSV, or PDF. **Import** fills one new record for review from an Excel or CSV row, a single-record Master Data PDF, or a fillable Diesel form PDF.

## Run locally

**Entry → Entry workspace** opens the redesigned register for all 18 Diesel entry types. On Azure each allowed Pulse login has a private sample workspace with a posted Jayant indent and a purchase order waiting for review. The site and role selectors apply to that sample workspace. Review entries persist under `/home/data/diesel-entry-review`. Production Master Data and Item Master use their existing records. Banking and SMS actions in Entry are simulations.

On the local preview, open `/entries` to test the same register. New local workspaces start empty. Choose **Buy → Diesel indent** to create the first entry. The entry forms and rules are under `src/features/entries/`.

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://127.0.0.1:3000`. `npm run preview:masters` opens the same local workspace on port 4313. The local workspace uses sample maker and checker roles and stores records in `.local-diesel/items.sqlite`. For the Location and Storage Location workflows, load the Pulse project directory with `npm run sync:pulse-projects -- "<trusted Pulse 1 checkout>"`.

To test Pulse sign-in, copy `.env.example` to `.env`, set `DIESEL_ACCESS_MODE=pulse`, and configure the issuer and shared secret. Open Diesel to enter Pulse with Diesel selected. If prompted, complete the Pulse sign-in requirements before continuing to Diesel.

Run `npm test` to check Item Master saves, local review, the form previews, and Pulse sign-in against a simulated issuer. Run `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`. Master definitions are registered in `src/features/masters/catalog.mjs`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge the tested change into `main`.
2. In [GitHub Actions](https://github.com/caliberaitech783-beep/diesel-/actions/workflows/azure.yml), select **Test and deploy Diesel**, choose **Run workflow** on `main`, and wait for the `deploy` job. From an authenticated GitHub CLI session, run `gh workflow run azure.yml --ref main --repo caliberaitech783-beep/diesel-`.
3. Check that the workflow verified the expected commit and `masters: ready` at the [production health endpoint](https://pulse-lll.cmll.in/healthz). With an allowed Pulse account, open a master and check for **Import**, **Export** and **Save for review**.

If the GitHub deployment workflow is unavailable, select **Sync** in the Diesel app’s Azure Deployment Center. Confirm the expected commit in the deployment log and check that the live site responds.

Production masters store pending submissions and supporting files under Diesel’s persistent App Service directory `/home/data/diesel-item-submissions`. Keep App Service storage enabled. Each allowed Pulse account can reopen its own submissions in **Master Data**. Locations and storage references entered in hosted forms are pending submissions. The local workspace supports site-scoped maker and checker approval with a synced Pulse project directory.

To enable Pulse sign-in, set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Set the same `DIESEL_SSO_CLIENT_SECRET` on both apps, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`. Configure the comma-separated Diesel app setting `DIESEL_ALLOWED_PULSE_LOGINS` with the approved Pulse usernames. An empty list denies all accounts. Azure always requires Pulse. Once the Pulse issuer is ready, set `DIESEL_ACCESS_MODE=pulse` on Diesel and verify sign-in and sign-out with a Pulse account.

GitHub Actions deploys with a federated identity scoped to the Diesel Web App and trusted for `main`. It uses the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables. The deployment workflow uses these repository settings from any Diesel chat.

See [AGENTS.md](AGENTS.md) for repository rules.
