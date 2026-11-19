# Diesel

Diesel on Azure requires an allowed Pulse account. Open any master and use **Save for review** at the bottom of the form. The **Import** and **Export** dropdowns transfer the fields for one record. Excel (`.xlsx`) and CSV use that master's field names as column headers and one data row. For PDF import, use a fillable PDF exported from that master. Review the fields and add any supporting files before saving.

Diesel Rate calculates the all-inclusive price per litre and per kilolitre from the invoice total and litres. Use the three-line icon to return to the Master tab and the sidebar’s back arrow to open the Pulse sign-in screen.

Expand **Master Data** in the sidebar and open a master to see its saved records. Each table uses that master's form fields as columns. **Download** and **Export** offer Excel, CSV, or PDF. **Import** fills one new record for review from an Excel or CSV row, a single-record Master Data PDF, or a fillable Diesel form PDF.

## Run locally

**Entry → Entry workspace** opens the redesigned register for all 18 Diesel entry types. On Azure each allowed Pulse login has a private sample workspace with a posted Jayant indent and a purchase order waiting for review. The site and role selectors apply to that sample workspace. Review entries persist under `/home/data/diesel-entry-review`. Production Master Data and Item Master use their existing records. Banking and SMS actions in Entry are simulations.

The shared role-based pilot covers Diesel Indent and Purchase Order. To enable it, set `DIESEL_ENTRY_ACCESS_MODE=assigned-pilot` after the authenticated Pulse `/api/diesel-sso/validate` response includes `profile.dieselEntryAccess`, an array of verified site and role pairs such as `[{"site":"Jayant","role":"Project Manager"}]`. Pulse should derive these pairs from its access assignments. Entry rechecks them for each request. Multiple assignments appear as a combined site-and-role selector. **My approvals** shows work for the current assignment and excludes the user's own entries. The pilot shares sample-data transactions within each site and stores them in `assigned-pilot.sqlite` beside the private review databases. Master access continues to use `DIESEL_ALLOWED_PULSE_LOGINS`.

On the local preview, open `/entries` to test the same register. New local workspaces start empty. Choose **Buy → Diesel indent** to create the first entry. The entry forms and rules are under `src/features/entries/`.

In the local workspace, approve **Approval Limit Master** and **Tolerance and Alert Master** records at the site to use them in Entry. Approval records use an entry code and `All` or a slab such as `Above 200000` for E1 litres or `Above 10000000` for E2 rupees. Approved effective rules are applied on the business date. **My alerts** routes notices in the app. The hosted review uses sample limits while Master Data submissions await shared approval.

**My work** shows the tasks for the selected site and role. Use a QR photo or a scanner on vehicle and storage forms. Gate entry can read an invoice photo on the Diesel server and suggests values for review. Open the form while online to queue saves during a phone signal loss. Hosted sync sends the queue when the same account, site and role reconnect and keeps authenticated pages out of the offline cache. Head Office date and equipment filters also apply to CSV exports.

After E17 is posted, Head – Accounts or CFO can download the balanced review journal from the record. The review uses sample ledger labels. Confirm the Accounting import format and ledger codes against an actual closed month before posting it to the books.

Run `npm run preview:site-stock` and open `http://127.0.0.1:4323/entries/opening-stock` to prepare measured balances. Approve the site's Item, Location, tanks and bowsers first. An underground tank chart uses one `cm,litres` pair per line with increasing readings through safe fill. The Site In-charge saves a snapshot in IST and the Project Manager approves it. The separate `.local-diesel/site-entries.sqlite` ledger supports Diesel Indent, UG tank-to-bowser, Vehicle fuel issue and Daily count. Vehicle issues need approved vehicles and drivers. No review transactions are copied into this ledger. Use `DIESEL_LOCAL_MASTER_DB` to point another local checkout at an existing master database. Use `DIESEL_LOCAL_SITE_ENTRY_DB` to select its separate site ledger.

On Azure, **Opening stock** shows setup status until the site-stock workspace is provisioned. To enable it, configure verified Pulse entry assignments and set `DIESEL_ENTRY_ACCESS_MODE=site-stock` and `DIESEL_SITE_MASTER_DB` to a trusted, read-only approved master database on persistent App Service storage. This database must expose the Diesel `master_records` and `master_history` schema. Host only the approved data needed by Entry. The shared `site-stock.sqlite` ledger is separate from the hosted review databases. Pulse roles include Site In-charge, Project Manager, Point operator, Bowser operator, and Site Store. Pending submissions in hosted Master Data do not supply the approved master source.

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
