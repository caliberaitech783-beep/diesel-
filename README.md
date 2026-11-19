# Diesel

Diesel on Azure uses verified Pulse assignments for shared Master Data. A **Master Maker** can import or enter a record and select **Save for review**. A separate **Master Checker** can approve the revision or return it with a reason. A **Master Viewer** can read and download records for the assigned site. Each edit, return, approval, deactivation and reactivation is recorded in the revision history. Entry uses the last approved revision while a change is in review.

The **Import** and **Export** dropdowns transfer the fields for one record. Excel (`.xlsx`) and CSV use that master's field names as column headers and one data row. For PDF import, use a fillable PDF exported from that master. Review the fields and add supporting files before saving.

Diesel Rate works out the rate per kilolitre as basic rate plus excise duty, less an invoice discount, plus VAT. A post-sale discount stays out of the rate until its credit note. Use the three-line icon to return to the Master tab and the sidebar’s back arrow to open the Pulse sign-in screen.

Expand **Master Data** in the sidebar and open a master to see its saved records. Each table uses that master's form fields as columns. **Download** and **Export** offer Excel, CSV, or PDF. **Import** fills one new record for review from an Excel or CSV row, a single-record Master Data PDF, or a fillable Diesel form PDF.

CMLL, Account and Location masters support multiple **Dated attributes**, each with its own optional attachment. Active approved attributes appear in the expiry list starting 30 days before their end date. Import and export carry the attribute values and dates. Reattach supporting files when importing records.

## Run locally

**Entry → Entry workspace** opens the register for all 18 Diesel entry types. On the local preview, start with **Buy → Diesel indent**. Forms and business rules are under `src/features/entries/`.

Approve **Approval Limit Master** and **Tolerance and Alert Master** records at the site to use them in Entry. Approval records use an entry code and `All` or a slab such as `Above 200000` for E1 litres or `Above 10000000` for E2 rupees. Approved effective rules apply on the business date. **My alerts** routes notices in the app.

**My work** shows tasks for the selected site and role. Scan a QR tag or choose an approved code. Gate entry uses the Location Master receipt scenarios and can read an invoice photo for review. Open the form while online to queue saves during a signal loss. The queue lists waiting records and syncs when the same account, site and role reconnect. Entry compresses large photos when the device supports it. Register filters apply to both CSV and Excel. Live records and downloads use the Entry role matrix and the selected site.

Approved Shift Master rows use one cut-off per site with nonoverlapping shift times. The Location Master cut-off applies before shifts are approved. Vehicle issues and daily counts can record the actual reading time in IST. Vehicle issues show the last bowser reading and compare use against approved Route Wise Diesel standards. A second repeat-fill override within seven days adds Project Manager review by default. Exception reason codes and supporting evidence follow the Reason Code Master. Bill match uses the effective Diesel Rate on the dispatch invoice date.

After E17 posts, Head – Accounts or CFO can download the balanced journal from the record. Confirm the Accounting import format and ledger codes against an actual closed month before posting it to the books.

Run `npm run preview:site-stock` and open `http://127.0.0.1:4323/entries/opening-stock`. Approve the site's observed-litre Item, Location, tanks and bowsers first. An underground tank chart uses one `cm,litres` pair per line with increasing readings through safe fill. The Site In-charge records measured balances and the Accounts-approved opening rate. The Project Manager approves the snapshot. If the rate is added later, it has its own approval and the measured balances stay locked. The separate `.local-diesel/site-entries.sqlite` ledger has all 18 Entry types. Use `DIESEL_LOCAL_MASTER_DB`, `DIESEL_LOCAL_SITE_ENTRY_DB` and `DIESEL_LOCAL_SITE_PORT` to select the master source, ledger and preview port.

Site entries need approved document series for the financial year, for example `2026-27`. Purchase orders use approved supplier accounts, depot codes, and effective diesel and freight rates. Treasury records the UTR after paying through its bank. For accounts marked as subject to TDS, an approved Tax Master (TDS) row with the account's TDS Nature and Payee Category works out the deduction on payment advice and freight bills, using the yearly thresholds and the PAN dated attribute. Without a matching row, Accounts enters its approved deduction amount. Freight GST comes from the approved GST code selected on the bill. Receipts require a calibrated instrument and approved storage. Contractor recovery terms in Account Master accept `Weighted landed cost` or `Fixed rate 90000` (₹/KL). Month-end uses the approved opening rate, receipts, signed daily counts and approved clearing and consumption accounts. Check the resulting journal against the accounting system before using it for posting.

On Azure, Entry reads approved revisions from shared Master Data. **Entry workspace** shows setup until the approved location directory is available. The live ledger is `/home/data/diesel-entry-review/site-stock.sqlite`. An existing installation that uses `DIESEL_SITE_MASTER_DB` continues to use that read-only approved source for Entry until its approved data is migrated to shared Master Data.

Pulse's authenticated `/api/diesel-sso/validate` response must include verified site and role pairs in `profile.dieselEntryAccess`. Entry checks each grant against the site scope or Pulse project name on an approved Location Master record. Multiple assignments appear in the site-and-role selector. **My approvals** excludes the user's own entries. A transfer's receiving site and storage can be selected once that site has approved opening stock for the same diesel item.

For Telegram approval in an HTTPS site-stock workspace, set `DIESEL_TELEGRAM_BOT_TOKEN` and `DIESEL_FAST2SMS_API_KEY` in Azure. The verified Pulse profile must provide `dieselApprovalContact` with a private Telegram `telegramChatId` string and an Indian `mobile` in +91 format, both linked to that account by Pulse. The reviewer must start a private chat with the Diesel bot. Where the approved Approval Limit Master enables Telegram, the reviewer can send themselves **Approve** and **Return** links. The link opens the selected action in Diesel. Sign in with the same Pulse account, choose the assigned site and role, and confirm via an SMS code. The proof expires after five minutes, and the entry history records the channel.

Use Node.js 24. Run `npm ci` and `npm run dev`, then open `http://127.0.0.1:3000`. `npm run preview:masters` opens the same local workspace on port 4313. The local workspace uses sample maker and checker roles and stores records in `.local-diesel/items.sqlite`. For the Location and Storage Location workflows, load the Pulse project directory with `npm run sync:pulse-projects -- "<trusted Pulse 1 checkout>"`.

To test Pulse sign-in, copy `.env.example` to `.env`, set `DIESEL_ACCESS_MODE=pulse`, and configure the issuer and shared secret. Open Diesel to enter Pulse with Diesel selected. If prompted, complete the Pulse sign-in requirements before continuing to Diesel.

Run `npm test` to check Item Master saves, local review, the form previews, and Pulse sign-in against a simulated issuer. Run `npm run build` to build `dist/`. The server starts in `src/server.mjs`. Add features under `src/features/`. Master definitions are registered in `src/features/masters/catalog.mjs`.

## Deploy

Production runs on `caliber-diesel-783` in `caliber-diesel-rg`. It shares the Central India P2v3 plan with Pulse Fleet and the HR API. Hostinger handles the DNS for `pulse-lll.cmll.in`. Azure supplies the HTTPS certificate.

1. Merge the tested change into `main`.
2. In [GitHub Actions](https://github.com/caliberaitech783-beep/diesel-/actions/workflows/azure.yml), select **Test and deploy Diesel**, choose **Run workflow** on `main`, and wait for the `deploy` job. From an authenticated GitHub CLI session, run `gh workflow run azure.yml --ref main --repo caliberaitech783-beep/diesel-`.
3. Check that the workflow verified the expected commit and `sharedMasters: ready` at the [production health endpoint](https://pulse-lll.cmll.in/healthz). With an assigned Master Maker and a separate Master Checker, verify save and approval at the same site.

If the GitHub deployment workflow is unavailable, select **Sync** in the Diesel app’s Azure Deployment Center. Confirm the expected commit in the deployment log and check that the live site responds.

Shared Master Data uses `/home/data/diesel-master-data/masters.sqlite` with rollback journaling on persistent App Service storage. Keep the SQLite-backed Diesel app on one instance. Earlier private submissions and their attachments remain accessible to their owners through **My earlier submissions**. A maker can export a previous record and import it into the assigned site's shared workspace as a new submission for review.

The verified Pulse profile supplies `dieselMasterAccess` entries with `site` and a `role` of `maker`, `checker` or `viewer`. For Location Master, Pulse also supplies the canonical `projectName` and `client` from its project directory unless Diesel already has a synced project. For example, `{"site":"Project A","role":"maker","projectName":"Project A OC","client":"Client A"}`. Diesel derives the actor and site from these server-verified assignments. The existing `DIESEL_ALLOWED_PULSE_LOGINS` setting provides access to private submissions.

To enable Pulse sign-in, set `DIESEL_PUBLIC_ORIGIN=https://pulse-lll.cmll.in` on both apps and `PULSE_ORIGIN=https://pulse.cmll.in` on Diesel. Set the same `DIESEL_SSO_CLIENT_SECRET` on both apps, generated from 32 random bytes encoded as base64url. Fleet also needs `DIESEL_SSO_ENABLED=1`. Configure the comma-separated Diesel app setting `DIESEL_ALLOWED_PULSE_LOGINS` with the approved Pulse usernames. An empty list denies all accounts. Azure always requires Pulse. Once the Pulse issuer is ready, set `DIESEL_ACCESS_MODE=pulse` on Diesel and verify sign-in and sign-out with a Pulse account.

GitHub Actions deploys with a federated identity scoped to the Diesel Web App and trusted for `main`. It uses the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets and the `AZURE_WEBAPP_NAME` and `DIESEL_HEALTH_ORIGIN` variables. The deployment workflow uses these repository settings from any Diesel chat.

See [AGENTS.md](AGENTS.md) for repository rules.
