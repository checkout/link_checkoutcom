# Runbook: a vanilla Storefront Next sandbox running on localhost

**Audience:** Checkout​.com engineers who need a fresh Salesforce B2C Commerce sandbox with a
working Storefront Next storefront, for development and testing.
**Result:** a storefront on `http://localhost:5173` that talks to a cloud sandbox, with
products you can buy: catalog, prices, stock, taxes and shipping are all set up.
**Time:** about 1.5 hours, most of it waiting for the sandbox and the storefront wizard.

This runbook stops at a working vanilla storefront. To add Checkout​.com payments afterwards,
follow **"Checkout​.com for Storefront Next: installation and configuration"**.

> **Placeholders.** Everything in `<angle brackets>` is a value you supply. Never paste real
> keys, secrets or passwords into this page or into chat; keep them in the local files named
> below, which are excluded from git.

---

## How the pieces fit together

| Piece | Where it runs | What it is |
| --- | --- | --- |
| **Sandbox** (B2C Commerce instance) | Salesforce cloud, e.g. `abcd-001.dx.commercecloud.salesforce.com` | The commerce back end: catalog, baskets, orders, Business Manager |
| **Business Manager (BM)** | The sandbox, at `https://<sandbox-host>/on/demandware.store/Sites-Site` | The admin UI |
| **Storefront Next app** | **Your Mac**, `http://localhost:5173` (and Managed Runtime once deployed) | The React storefront shoppers see |
| **SLAS** | Salesforce cloud | Shopper login and API tokens for the storefront |
| **Managed Runtime (MRT)** | Salesforce cloud | Hosting for the deployed storefront |

Only the storefront app runs locally; it calls the sandbox's APIs over the internet.

---

## 0. Prerequisites (once per machine)

### 0.1 Access you need

| Access | Why | Who grants it |
| --- | --- | --- |
| Account Manager user with the **Business Administrator** role on the realm (or Business Manager read-write access to *Storefronts*) | Without it, **New Storefront** in Business Manager is greyed out | Your Salesforce Account Manager admin |
| **Managed Runtime User or Admin** role | The wizard creates an MRT project | Same |
| **SLAS Organization Admin** role | To add custom scopes to SLAS clients | Same |
| An **Account Manager API client** with the **Sandbox API User** role for your realm | Creating sandboxes and running the `b2c` CLI | Same; you receive a client id and secret |
| A GitHub account with the **owner** role in the GitHub organization the storefront repo goes into | The wizard creates the repository | Your GitHub org owner |

### 0.2 Tools

Open **Terminal**. These commands can run from any folder.

```bash
# Node version manager, if you do not have it yet: https://github.com/nvm-sh/nvm
nvm install 24.21.0           # the Storefront Next template requires Node 24.13 or later
nvm use 24.21.0

npm install -g pnpm@10.28.0   # the template is pinned to pnpm 10.28 (pnpm 12 refuses to run it)
npm install -g @salesforce/b2c-cli

node -v                       # v24.x
pnpm -v                       # 10.28.0
b2c --version                 # @salesforce/b2c-cli/...
```

> `pnpm` installed with `npm -g` belongs to the Node version that was active. Run `nvm use
> 24.21.0` before every session, or pnpm may resolve to another version.

---

## 1. Create the sandbox

Pick a working folder for sandbox configuration, for example `~/Projects/sandboxes`:

```bash
mkdir -p ~/Projects/sandboxes && cd ~/Projects/sandboxes
```

Create `dw.json` **in that folder** with your API client (the CLI reads it from the current folder):

```json
{
    "client-id": "<Account Manager API client id>",
    "client-secret": "<API client secret>"
}
```

Create the sandbox:

```bash
cd ~/Projects/sandboxes
b2c sandbox create --realm <realm id, 4 letters> --wait
b2c sandbox list            # note the new sandbox's host, e.g. abcd-001.dx.commercecloud.salesforce.com
```

`--wait` returns once the sandbox has started (5–15 minutes). Add `--ttl <hours>` for a
temporary sandbox. By default the command also gives your API client the OCAPI and WebDAV
permissions the CLI needs.

Log in to Business Manager at `https://<sandbox-host>/on/demandware.store/Sites-Site`
with your Account Manager user.

---

## 2. Create the Storefront Next storefront

In Business Manager: **Administration → Sites → Storefronts → New Storefront**.

> If **New Storefront** is greyed out, your user lacks a role from 0.1 (Business
> Administrator / Storefronts read-write, or Managed Runtime), or the site you want already has
> a storefront (one storefront per site).

The wizard asks for:

| Field | Example | Notes |
| --- | --- | --- |
| Template | Market Street | Beauty Street is the other option |
| Site name / ID | `my-test-site` | Lowercase with dashes; you will type the ID often |
| Default currency | EUR | Remember it: price books and shipping must match it |
| GitHub organization / repository | `<github-user>/storefront-next-test-5` | Must not exist yet; the wizard creates it |

When the wizard finishes, open the storefront (**Administration → Sites → Storefronts →
<your site>**). The page shows:

- **API Access** – *Salesforce Commerce API* and *SLAS Client* (each with **Manage**).
- **Environments** – the MRT environment, e.g. `my-test-s-1a2b3c`, status **Ready**. The **eye**
  icon opens the deployed storefront.
- **Source Code** – the GitHub repository, and **Download .env**.

Click **Download .env** and save the file; you need it in step 4. It contains the SLAS
client secret and is the only easy way to get it.

---

## 3. Clone the storefront repository

```bash
cd ~/Projects
git clone git@github.com:<github-user>/storefront-next-test-5.git
cd ~/Projects/storefront-next-test-5
git branch --show-current     # "latest"
```

> **Pushing to `latest` deploys to Managed Runtime** (`.github/workflows/deploy.yml`, with the
> deploy secrets the wizard added). Do your work on another branch:
> `git checkout -b dev`.

---

## 4. Configure and install the storefront

All commands in this step run in the storefront repository:

```bash
cd ~/Projects/storefront-next-test-5
nvm use 24.21.0
```

### 4.1 The `.env` file

Copy the downloaded file to **the top level of the storefront repository**, next to
`package.json`, and name it `.env`:

```bash
cp ~/Downloads/<downloaded file>.env ~/Projects/storefront-next-test-5/.env
```

It looks like this (values shortened):

```dotenv
MRT_PROJECT=<mrt project>
MRT_TARGET=<mrt environment>
PUBLIC__app__commerce__api__clientId=<SLAS client id>
PUBLIC__app__commerce__api__organizationId=f_ecom_<realm>_<instance>   # e.g. f_ecom_abcd_001
PUBLIC__app__commerce__api__shortCode=<short code>
PUBLIC__app__defaultSiteId=<site id>
PUBLIC__app__commerce__sites=[{"id":"<site id>", ... }]
```

`.env` is git-ignored. Do not commit it.

### 4.2 Install dependencies

```bash
cd ~/Projects/storefront-next-test-5
pnpm install
```

If you see `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN`, the wrong pnpm is running: check `pnpm -v` says
10.28.0 (see 0.2).

---

## 5. Locale: make the storefront use en-US

A wizard-created site starts with only the `default` locale, while the template falls back to
`en-GB`. Requests then fail with *"The locale 'en-GB' isn't supported or activated for this
site"*. Use `en_US`:

1. Business Manager → **Administration → Global Preferences → Locales**: `en_US` is ticked
   (it is by default).
2. Select your site in the site selector (top left) → **Merchant Tools → Site Preferences →
   Locales**: tick **en_US** → **Apply**.
3. In the storefront repository, edit **`.env`**. In `PUBLIC__app__commerce__sites`, set
   `defaultLocale` to `en-US` and the supported locales to en-US with your site's currency,
   and add one line so these values win over Business Manager's Storefront Settings:

   ```dotenv
   PUBLIC__app__commerce__sites=[{"cookies":{"domain":null},"id":"<site id>","alias":"Sites-<site id>-Site","name":"Sites-<site id>-Site","defaultLocale":"en-US","defaultCurrency":"EUR","supportedLocales":[{"id":"en-US","preferredCurrency":"EUR"}],"supportedCurrencies":["EUR"]}]
   PUBLIC__app__commerce__sitesFromDal=false
   ```

4. In the storefront repository, edit **`config.server.ts`**: in `i18n`, set
   `fallbackLng: 'en-US'` and move `'en-US'` to the **end** of `supportedLngs` (the fallback
   must be last).

> For the deployed storefront, set the same locale under **Administration → Sites →
> Storefronts → <site> → Storefront Settings** instead; `.env` only affects localhost.

---

## 6. Test data: catalog, products, prices, stock and shipping

A new site has no products. The Checkout​.com repository ships a small test data set you can
import into any site:

| Data | Contents |
| --- | --- |
| Catalog `checkoutcom-test-catalog` | `root` category, category *Checkout​.com Test*, products **Test T-Shirt** (`CKO-TEST-TSHIRT`) and **Test Mug** (`CKO-TEST-MUG`) |
| Price books | `checkoutcom-test-usd`, `-gbp`, `-eur`: T-Shirt 25.00, Mug 12.50 |
| Inventory list | `checkoutcom-test-inventory`: 10,000 of each |
| Shipping methods | "Standard", 5.00 flat rate, one per currency |

### 6.1 Import it

You need the Checkout​.com repository (`link_checkoutcom`, branch `flow_storefrontnext`, folder
`checkoutcom-storefront-next`) cloned at `~/Projects/link_checkoutcom`.

Create `dw.json` in **`~/Projects/link_checkoutcom/checkoutcom-storefront-next`** (git-ignored):

```json
{
    "hostname": "<sandbox-host>",
    "username": "<your Business Manager user, e.g. you@example.com>",
    "password": "<your WebDAV access key>",
    "client-id": "<Account Manager API client id>",
    "client-secret": "<API client secret>",
    "tenant-id": "<realm>_<instance>",
    "short-code": "<short code, from .env>",
    "code-version": "<active code version, see below>"
}
```

- **WebDAV access key:** Business Manager → your name (top right) → **Manage Access Keys** →
  generate a *WebDAV File Access and UX Studio* key.
- **Active code version:**
  ```bash
  cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
  b2c code list                # use the ID marked Active, e.g. latest_20261020_133622_f7170bf
  ```

Stage and import only the test data (no Checkout​.com metadata needed for a vanilla site):

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
mkdir -p dist/test-data/sites
cp -R test/data/checkoutcom-test-data/catalogs test/data/checkoutcom-test-data/pricebooks test/data/checkoutcom-test-data/inventory-lists dist/test-data/
cp -R test/data/checkoutcom-test-data/sites/SITEID dist/test-data/sites/<site id>
b2c job import dist/test-data
```

The import ends with `Import completed: OK`.

> If it fails with *"Access to resource 'POST /data/…/jobs/…' isn't allowed for the current
> client"*, give your API client OCAPI permissions: see **Appendix A**.

### 6.2 Assign the data to the site

Select your site in the site selector, then:

1. **Merchant Tools → Products and Catalogs → Catalogs** → open `checkoutcom-test-catalog` →
   **Site Assignments** → tick your site → **Apply**.
2. **Merchant Tools → Products and Catalogs → Price Books** → open the price book in **your
   site's currency** (e.g. `checkoutcom-test-eur`) → **Site Assignments** → tick your site.
3. **Merchant Tools → Products and Catalogs → Inventory** → open `checkoutcom-test-inventory` →
   assign it to your site.
4. **Merchant Tools → Ordering → Shipping Methods**: check that *Standard* exists for your
   currency.

### 6.3 Build the search index

**Merchant Tools → Search → Search Indexes** → tick **Product** → **Rebuild**. Wait until the
status shows it is done (a minute or two). Until then, category pages and search are empty
and product search returns an error 500. Product pages work straight away by URL:
`http://localhost:5173/<site id>/en-US/product/CKO-TEST-TSHIRT`.

---

## 7. Taxes

Without a tax rate the basket has **no order total**, and checkout cannot continue past
shipping. In Business Manager (your site selected) → **Merchant Tools → Ordering → Taxation**:

1. **Tax Classes** → **New** → ID `standard` → tick **Default** → **Apply**.
2. **Tax Jurisdictions** → **New** → country you use at checkout (e.g. Germany for EUR) →
   **Apply**. Add one per test country.
3. **Tax Rates** → set a rate for `standard` in each jurisdiction (0% is fine; 19% if you
   want to see tax in totals).

---

## 8. A payment method for vanilla checkout

To place a test order **without** Checkout​.com, the site needs an enabled payment method:
**Merchant Tools → Ordering → Payment Methods** → enable **Credit Card** (`CREDIT_CARD`), and
under **Payment Cards** enable at least Visa. (Skip this if you go straight on to install
Checkout​.com.)

---

## 9. Run the storefront on localhost

```bash
cd ~/Projects/storefront-next-test-5
nvm use 24.21.0
pnpm dev
```

Open **`http://localhost:5173/<site id>/en-US/`**.

Check that:

- the *Checkout​.com Test* category lists both products;
- you can add the Test T-Shirt to the cart;
- checkout shows shipping **Standard 5.00**, tax and an **order total**.

`pnpm dev` reloads storefront code changes automatically; `.env` and `config.server.ts`
changes need a restart (Ctrl-C, then `pnpm dev`).

---

## 10. Deploy to Managed Runtime (optional)

```bash
cd ~/Projects/storefront-next-test-5
git checkout latest && git merge dev && git push      # the push deploys
```

The deployed storefront reads its environment variables from MRT, not from `.env`. Set the
same locale values there, from the storefront repository:

```bash
cd ~/Projects/storefront-next-test-5
b2c mrt env var set 'PUBLIC__app__commerce__sites=<value from .env>' -p <MRT_PROJECT> -e <MRT_TARGET>
```

Open it with the **eye** icon on the storefront page in Business Manager.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| **New Storefront** greyed out | Missing Business Administrator / Storefronts or MRT role, or the site already has a storefront | Step 0.1 roles |
| `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` | pnpm 12 instead of 10.28, or Node 22 | `nvm use 24.21.0`, `npm i -g pnpm@10.28.0` |
| *The locale 'en-GB' isn't supported or activated for this site* | Template falls back to en-GB; site has only `default` | Step 5 |
| *No category with ID 'root' for site* | Catalog not assigned to the site | Step 6.2 |
| `NormalizedApiError: Internal Server Error` in `fetchSearchProducts` | No search index | Step 6.3 |
| Checkout stuck, no order total | No tax rate | Step 7 |
| `Error: no auth mechanism defined` / *WebDAV credentials required* | `dw.json` missing in the folder you ran the command from, or invalid JSON | Run from the folder that has `dw.json`; validate it |
| *No valid auth method available* | `dw.json` has no `client-id` / `client-secret` | Add the API client (step 6.1) |
| *Access to resource … isn't allowed for the current client* | API client lacks OCAPI permissions | Appendix A |
| *tenant-id is required* / *short code required* | Missing in `dw.json` | Add `tenant-id` and `short-code` |

---

## Appendix A: API client permissions

Business Manager → **Administration → Site Development → Open Commerce API Settings** →
**Type: Data**, **Context: Global**. Add this entry to the `clients` array (keep existing
entries; if the page is empty, wrap it as `{ "_v": "19.5", "clients": [ … ] }`):

```json
{
    "client_id": "<Account Manager API client id>",
    "resources": [
        { "resource_id": "/jobs/*/executions", "methods": ["post"], "read_attributes": "(**)", "write_attributes": "(**)" },
        { "resource_id": "/jobs/*/executions/*", "methods": ["get"], "read_attributes": "(**)", "write_attributes": "(**)" },
        { "resource_id": "/code_versions", "methods": ["get"], "read_attributes": "(**)", "write_attributes": "(**)" },
        { "resource_id": "/code_versions/*", "methods": ["patch", "delete"], "read_attributes": "(**)", "write_attributes": "(**)" },
        { "resource_id": "/sites", "methods": ["get"], "read_attributes": "(**)", "write_attributes": "(**)" }
    ]
}
```

And **Administration → Organization → WebDAV Client Permissions**:

```json
{
    "client_id": "<Account Manager API client id>",
    "permissions": [
        { "path": "/impex", "operations": ["read_write"] },
        { "path": "/cartridges", "operations": ["read_write"] }
    ]
}
```

Changes take a minute or two to apply.
