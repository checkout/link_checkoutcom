# Checkout​.com for Storefront Next: installation and configuration

**Audience:** merchants and engineers adding Checkout​.com payments to a Salesforce B2C
Commerce **Storefront Next** storefront.
**Result:** shoppers pay with **Checkout​.com Flow** at the checkout payment step (cards,
Apple Pay, Google Pay, PayPal and local payment methods in one form). Orders, captures, refunds
and voids appear in Business Manager.
**Time:** 1–2 hours the first time.

> **Placeholders.** Everything in `<angle brackets>` is a value you supply, for example
> `<site id>` or `<your secret key>`. Never put real keys, secrets or passwords into
> documentation, tickets or chat. Keep them only in Business Manager and in the local files
> named below, which are excluded from git.

---

## Contents

1. What you are installing
2. Before you start
3. Get the code
4. Prepare the command line tools (`dw.json`)
5. Upload the cartridges
6. Add the cartridges to the cartridge paths
7. Import the metadata
8. Configure the CKO Flow settings
9. Enable the payment method
10. Check the Custom API is registered
11. Allow the storefront to call the API (SLAS scope)
12. Install the storefront extension
13. Allow Checkout​.com in the Content Security Policy
14. Register the webhook
15. Test
16. Customise how Flow looks and behaves
17. Manage payments in Business Manager
18. Go live
19. Upgrading, and uninstalling
20. Troubleshooting

---

## 1. What you are installing

| Part | Where it goes | What it does |
| --- | --- | --- |
| Cartridge **`int_checkoutcom_next`** | Your B2C Commerce instance | The `checkoutcom` Custom API (creates the payment session, submits and completes payments), the webhook receiver, order and transaction updates |
| Cartridge **`bm_checkoutcom`** | Your B2C Commerce instance (Business Manager) | The *Checkout​.com Manager* console: capture, refund and void payments |
| **Metadata** (`impex/`) | Imported into your instance | The *CKO Flow* settings, the `CHECKOUTCOM_FLOW` payment method, the Checkout​.com services, and two data types the integration uses |
| **Storefront extension** `checkoutcom` | Your Storefront Next storefront code | Shows Checkout​.com Flow at the payment step, places the order, handles 3DS and redirects |

### How a payment works

1. At the **payment step**, the storefront asks the instance to create a Checkout​.com
   *payment session* for the basket, and Flow appears.
2. The shopper enters their details and clicks **Place Order**.
3. The storefront creates the **order** first, then the payment is submitted to Checkout​.com
   with the **order number as its reference**.
4. Checkout​.com runs 3DS, wallet sheets or redirects as needed.
5. The instance **verifies** the payment (status, amount, currency, reference) and places the
   order; the shopper sees the confirmation page.
6. If the payment fails, the order is failed and the **basket is restored**, so the shopper
   can try again.
7. Afterwards, **webhooks** from Checkout​.com record captures, refunds and voids on the order.

The secret key never leaves the instance, and card data never touches Salesforce (Flow
collects it in Checkout​.com-hosted fields).

---

## 2. Before you start

### 2.1 Checkout​.com

- A Checkout​.com account **with Flow enabled**. Ask your Checkout​.com account manager if you
  are unsure.
- From the Checkout​.com Dashboard:
  - a **secret key** (`sk_…`) with the **`payment-sessions`** scope;
  - a **public key** (`pk_…`) with the **`payment-sessions:pay`** and **`vault-tokenization`**
    scopes;
  - your **processing channel ID** (`pc_…`), under *Settings → Processing channels*.

  Sandbox keys work only with **Mode: Sandbox**, production keys only with **Mode: Production**.

### 2.2 Salesforce

- A B2C Commerce instance (sandbox, development or production) with a **Storefront Next**
  site, and its storefront code repository. To create a test sandbox from scratch, follow
  **"Runbook: a vanilla Storefront Next sandbox running on localhost"**.
- Business Manager access with permission to manage code, site preferences, payment methods
  and imports.
- For step 11: an Account Manager user with the **SLAS Organization Admin** role, or someone
  who has it.
- An **Account Manager API client** (client id and secret) with OCAPI/WebDAV permissions on the
  instance, for the command line steps. See Appendix A.

### 2.3 Your computer

Open **Terminal** (macOS) and install:

```bash
nvm install 24.21.0            # Node 24.13 or later, required by Storefront Next
nvm use 24.21.0
npm install -g pnpm@10.28.0    # the storefront template is pinned to pnpm 10.28
npm install -g @salesforce/b2c-cli
xmllint --version              # preinstalled on macOS; used to validate the metadata
```

---

## 3. Get the code

The integration lives in the `checkoutcom-storefront-next` folder of the Checkout​.com
repository. Clone it next to your storefront repository, for example in `~/Projects`:

```bash
cd ~/Projects
git clone git@github.com:checkout/link_checkoutcom.git
cd ~/Projects/link_checkoutcom
git checkout flow_storefrontnext
ls checkoutcom-storefront-next
```

You should see:

```
README.md   cartridges/   impex/   package.json   scripts/   storefront-next/   test/
```

From here on, **"the integration folder"** means
`~/Projects/link_checkoutcom/checkoutcom-storefront-next`, and **"the storefront repository"**
means your Storefront Next code, e.g. `~/Projects/my-storefront`.

Optional check that the package is intact (runs the unit tests and validates the metadata
against Salesforce's schemas):

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
npm run verify                 # every test passes ("# fail 0") and every impex file is "ok"
```

---

## 4. Prepare the command line tools (`dw.json`)

The `b2c` commands read your instance details from a file called `dw.json` **in the folder
you run them from**. Create it in the integration folder:

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
```

Create `dw.json` with this content and your values (it is git-ignored):

```json
{
    "hostname": "<instance host, e.g. abcd-001.dx.commercecloud.salesforce.com>",
    "username": "<your Business Manager user, e.g. you@example.com>",
    "password": "<your WebDAV access key>",
    "client-id": "<Account Manager API client id>",
    "client-secret": "<API client secret>",
    "tenant-id": "<realm>_<instance>, e.g. abcd_001",
    "short-code": "<SCAPI short code>",
    "code-version": "<the active code version>"
}
```

Where to find each value:

| Value | Where |
| --- | --- |
| `hostname` | The instance host name, without `https://` |
| `username` / `password` | Your Business Manager login, and a **WebDAV access key**: Business Manager → your name (top right) → **Manage Access Keys** → generate a *WebDAV File Access and UX Studio* key |
| `client-id` / `client-secret` | Your Account Manager API client |
| `tenant-id` | Realm and instance joined by an underscore, e.g. `abcd_001` |
| `short-code` | Business Manager → **Administration → Site Development → Salesforce Commerce API Settings**, or `PUBLIC__app__commerce__api__shortCode` in the storefront's `.env` |
| `code-version` | Run `b2c code list` (below) and use the version marked **Active** |

Find the active code version:

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
b2c code list
```

Example output:

```
ID                              Active  Rollback  Last Modified           Cartridges
latest_20261020_133622_f7170bf  Yes     No        10/20/2026, 3:49:45 PM  2
```

> Use the **active** version. On a Storefront Next instance it already holds the storefront's
> own cartridge; activating a different version would switch that off.

---

## 5. Upload the cartridges

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
npm run deploy:cartridges
```

This runs `b2c code deploy cartridges -r`: it uploads both cartridges into the code version
from `dw.json`, then **reloads** it. The reload matters: Salesforce only registers Custom APIs
when a code version is activated or reloaded.

Expected output:

```
INFO:   int_checkoutcom_next (.../cartridges/int_checkoutcom_next)
INFO:   bm_checkoutcom (.../cartridges/bm_checkoutcom)
INFO: Deployed 2 cartridge(s) to latest_20261020_133622_f7170bf
INFO: Code version reloaded
```

> If only one cartridge is listed, a cartridge folder is missing its `.project` file; the CLI
> skips such folders without an error.

---

## 6. Add the cartridges to the cartridge paths

### 6.1 Storefront site

Business Manager → **Administration → Sites → Manage Sites** → click your site → **Settings**
tab → **Cartridges** field. Add `int_checkoutcom_next` at the **front**, separated by a colon:

```
int_checkoutcom_next:app_storefrontnext_base
```

Click **Apply**.

### 6.2 Business Manager

**Administration → Sites → Manage Sites** → **Business Manager** (*Manage the Business Manager
site*) → add `bm_checkoutcom` to the cartridge path, e.g.:

```
bm_checkoutcom
```

Then give your role access to the console: **Administration → Organization → Roles** → your
role → **Business Manager Modules** → select your site → tick **Checkout​.com Manager** →
**Update**.

---

## 7. Import the metadata

The metadata adds the settings, payment method, services and data types. Your site id is in
**Administration → Sites → Manage Sites** (e.g. `my-site`).

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
npm run impex -- <site id>            # prepares dist/impex for your site
b2c job import dist/impex
```

Expected: `Import completed: OK`.

| Imported | Name |
| --- | --- |
| Settings group | **CKO Flow** (step 8) |
| Payment method and processor | `CHECKOUTCOM_FLOW`, imported **disabled** |
| Services | `cko.flow.*` (payments) and `cko.transaction.*` (console), for sandbox and production |
| Data types | `ckoPayment` (links each payment to its order), `ckoWebhookEvent` (ignores repeated webhooks) |
| Order and transaction attributes | Checkout​.com payment ID, transaction type and status |

The import is **safe to repeat**, for example after an upgrade. It never switches payment
methods on or off, never empties a setting you have filled in, and stores no credentials.

> If it fails with *"Access to resource … isn't allowed for the current client"*, your API
> client needs OCAPI permissions: Appendix A.

---

## 8. Configure the CKO Flow settings

Business Manager → select your site (top left) → **Merchant Tools → Site Preferences →
Custom Preferences** → **CKO Flow**. Fill in the fields and click **Save**.

| Setting | What it does | Example |
| --- | --- | --- |
| **Mode** | Which Checkout​.com environment to use. Must match the keys below. | `Sandbox` while testing, `Production` when live |
| **Secret API Key** | Authenticates the instance to Checkout​.com. Needs the `payment-sessions` scope. Never shared with the browser. | `sk_sbox_<…>` (sandbox) |
| **Public Key** | Identifies your account to Flow in the browser. Needs `payment-sessions:pay` and `vault-tokenization`. | `pk_sbox_<…>` |
| **Private Shared Key** | Verifies that webhooks really come from Checkout​.com. Use the **same value** as the webhook signature key (step 14). Choose a long random value. | `<a long random string>` |
| **Processing Channel ID** | Your Checkout​.com processing channel. | `pc_<…>` |
| **Service Endpoint** | Only if Checkout​.com gave you a dedicated or regional API URL; it replaces the API host on every call. Leave empty otherwise. Must be `https://`. | *(empty)* |
| **Enable Debug Mode** | Logs every Checkout​.com call (method, URL, result; secrets are masked) under the `checkoutcom` log category. Turn off in production. | `No` |
| **Allowed Storefront Origins** | The storefront addresses Checkout​.com may send shoppers back to after 3DS or a redirect payment method. Comma separated, scheme and host only, no paths. Requests with any other return address are refused. | `http://localhost:5173,https://www.example.com` |
| **Flow Auto Capture** | Capture payments automatically when authorized. Turn off to capture manually from the console. | `Yes` |
| **3D Secure** | Request 3D Secure authentication for card payments. | `Yes` |
| **3DS Challenge Indicator** | Your preference for a 3DS challenge, sent to the card issuer. | `no_preference` |
| **Attempt Non-3DS** | If 3DS is not available for a card, try the payment without it. | `false` |
| **Risk Assessment** | Run Checkout​.com's fraud check on payments. | `Yes` |
| **Flow Payment Methods** | Limit which methods Flow offers; comma separated. Empty offers every method enabled on your Checkout​.com account. | *(empty)*, or `card,applepay,googlepay,paypal` |
| **Flow Save Payment Details** | Shows a *Save card details* checkbox on the card form to signed-in shoppers. Not the same as Checkout​.com **Remember Me**, which is switched on or off on your Checkout​.com account, not here (ask your account manager). | `No` |
| **Flow Appearance** | Optional. Flow already follows your storefront theme; this JSON overrides colours, fonts and borders. See step 16. | *(empty)*, or `{"colorAction":"#000000","borderRadius":["8px","8px"]}` |
| **Flow Component Options** | Optional. Settings per payment method, as JSON (card fields, wallet buttons, accepted card schemes). See step 16. | *(empty)*, or `{"card":{"displayCardholderName":"top"}}` |
| **Flow Translations** | Optional. Your own wording per language, as JSON. See step 16. | *(empty)*, or `{"en-US":{"pay_button.pay":"Pay now"}}` |

**3DS Challenge Indicator values:**

| Value | Meaning |
| --- | --- |
| `no_preference` | Let the issuer decide (default) |
| `no_challenge_requested` | Prefer a frictionless flow |
| `challenge_requested` | Ask for a challenge |
| `challenge_requested_mandate` | Ask for a challenge because regulation requires it |

---

## 9. Enable the payment method

Business Manager → **Merchant Tools → Ordering → Payment Methods** → click
**`CHECKOUTCOM_FLOW`** → **Enabled: Yes** → **Apply**.

This switch turns Checkout​.com on and off for the site. If you do not want the template's
default card form as well, disable **Credit Card** on the same page.

Optional: restrict the countries or currencies `CHECKOUTCOM_FLOW` is offered for on the same
page.

---

## 10. Check the Custom API is registered

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
b2c scapi custom status -c apiName,endpointPath,httpMethod,status,sites,errorReason
```

Expected:

```
API Name     Path                Method  Status  Sites    Error Reason
checkoutcom  /payment-sessions   POST    active  my-site  -
checkoutcom  /payments/complete  POST    active  my-site  -
checkoutcom  /payments/submit    POST    active  my-site  -
```

| If you see | Do this |
| --- | --- |
| `No Custom API endpoints found` | The cartridge was not uploaded or the code version was not reloaded: repeat step 5 |
| `not_registered` with an error reason | Fix what the reason says; usually the cartridge is missing from the site's cartridge path (step 6.1) |
| Your site missing from *Sites* | Add the cartridge to that site's path (step 6.1), then repeat step 5 |

---

## 11. Allow the storefront to call the API (SLAS scope)

The storefront's SLAS client needs the custom scope **`c_checkoutcom`**, or the payment step
shows *"Payment methods could not be loaded"*.

In Business Manager: **Administration → Sites → Storefronts** → your storefront → **API
Access** → **SLAS Client** → **Manage** → open the client (its id is
`PUBLIC__app__commerce__api__clientId` in the storefront's `.env`) → add **`c_checkoutcom`**
to its scopes → save.

Or, with the SLAS Organization Admin role, from the integration folder:

```bash
cd ~/Projects/link_checkoutcom/checkoutcom-storefront-next
b2c slas client update <SLAS client id> --scopes c_checkoutcom
```

> Shoppers only get the new scope with a new token. When testing, clear the storefront's
> cookies or use a private window.

---

## 12. Install the storefront extension

All commands in this step run in **your storefront repository**. Use a branch:

```bash
cd ~/Projects/my-storefront
nvm use 24.21.0
git checkout -b checkoutcom
pnpm install
```

### 12.1 Copy the extension

```bash
cd ~/Projects/my-storefront
cp -R ~/Projects/link_checkoutcom/checkoutcom-storefront-next/storefront-next/src/extensions/checkoutcom src/extensions/
ls src/extensions/checkoutcom
# components  config.ts  flow-options.ts  lib  locales  routes  target-config.json
```

### 12.2 Register the extension

Open `src/extensions/config.json` and add this entry at the top of `"extensions"`:

```json
"SFDC_EXT_CHECKOUTCOM": {
    "name": "Checkout.com",
    "description": "Checkout.com payments with Flow. Requires the int_checkoutcom_next cartridge and its checkoutcom Custom API.",
    "folder": "checkoutcom",
    "dependencies": []
},
```

### 12.3 Build the translations and check the code

```bash
cd ~/Projects/my-storefront
pnpm locales:aggregate-extensions
pnpm typecheck                         # must finish without errors
```

The extension calls the cartridge's `checkoutcom` Custom API with its own client
(`lib/checkoutcom-api.server.ts`), so you don't need to generate one with `sfnext scapi add`.

The extension shows Flow in the checkout's payment section (UI target
`sfcc.checkout.payment.paymentMethods`) and adds these routes:

| Route | Purpose |
| --- | --- |
| `/action/checkoutcom-session` | Create the payment session |
| `/action/checkoutcom-submit` | Create the order and submit the payment |
| `/action/checkoutcom-complete` | Verify the payment and place the order |
| `/action/checkoutcom-fail-order` | Fail the order and restore the basket |
| `/cko-return` | Where shoppers return after 3DS or a redirect method |

---

## 13. Allow Checkout​.com in the Content Security Policy

Storefront Next sends a strict Content Security Policy that blocks Flow unless the
Checkout​.com hosts are allowed. The extension includes a *CSP contributor* with the exact hosts
Flow needs (`lib/csp-contributor.ts`); you only register it.

In the storefront repository, edit **`src/middlewares/security-headers.server.ts`**:

1. Below the last `import` line, add:

   ```ts
   // @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
   import { createCheckoutcomCspContributor } from '@/extensions/checkoutcom/lib/csp-contributor';
   ```

2. At the end of the `contributors` list, add:

   ```ts
   const contributors = [
       // ... the existing contributors
       // @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
       createCheckoutcomCspContributor(),
   ];
   ```

3. Check, and start the storefront:

   ```bash
   cd ~/Projects/my-storefront
   pnpm typecheck                         # must finish without errors
   pnpm dev                               # http://localhost:5173
   ```

4. Confirm the hosts are in the policy, in a second terminal:

   ```bash
   curl -sI http://localhost:5173/ | grep -i content-security-policy | grep -o 'https://[a-z.-]*checkout.com' | sort -u
   ```

   Expected: the hosts in the table below, production and sandbox.

The contributor adds both the production and the sandbox hosts, because the policy is built
when the storefront starts while **Mode** (step 8) can change at any time:

| Directive | Production | Sandbox |
| --- | --- | --- |
| `script-src` | `checkout-web-components.checkout.com`, `risk.checkout.com` | `checkout-web-components.sandbox.checkout.com`, `risk.sandbox.checkout.com` |
| `connect-src` | `api.checkout.com`, `devices.api.checkout.com`, `checkout-web-components-events.checkout.com`, `risk.checkout.com` | the same with `.sandbox.checkout.com` |
| `frame-src` | `authentication-devices.checkout.com` | `authentication-devices.sandbox.checkout.com` |
| `img-src` | `risk.checkout.com` | `risk.sandbox.checkout.com` |

All hosts use `https://`. Don't add `https://*.checkout.com` yourself: contributors may not
use wildcard origins, and the storefront then fails on **every** page with error 500.

Wallets and some payment methods load content from their own providers (for example Apple
Pay or Google Pay). If the browser console reports a blocked host while you test one of them
(step 15), add that host to the `security.headers.csp.directives` of `config.server.ts`.

**Firewalls.** If your network restricts outbound traffic, allow these hostnames (or their
`.sandbox.checkout.com` equivalents in Sandbox): `checkout-web-components.checkout.com`,
`api.checkout.com`, `devices.api.checkout.com`,
`checkout-web-components-events.checkout.com`, `risk.checkout.com`,
`authentication-devices.checkout.com`. Use hostname rules, not IP addresses: Checkout​.com's CDN
addresses change.

---

## 14. Register the webhook

On the Checkout​.com Dashboard → **Developers → Webhooks** → add an endpoint:

- **URL** (replace host and site id):
  ```
  https://<storefront host of the instance>/on/demandware.store/Sites-<site id>-Site/default/CKOWebhook-Handle
  ```
  On a sandbox the host is `<realm>-<instance>.my.commercecloud.salesforce.com`, e.g.
  `https://abcd-001.my.commercecloud.salesforce.com/on/demandware.store/Sites-my-site-Site/default/CKOWebhook-Handle`.
  (The `…dx.commercecloud…` host redirects to it, and webhooks do not follow redirects.)
- **Events:** `payment_approved`, `payment_captured`, `payment_refunded`, `payment_voided`,
  `payment_declined`, `payment_expired`, `payment_canceled`.
- **Signature key:** the same value as **Private Shared Key** (step 8).

Check the URL answers (a request without a signature is refused with 401, which is correct):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "<the webhook URL>" -H "Content-Type: application/json" -d '{}'
# 401
```

| Code | Meaning |
| --- | --- |
| `401` | The receiver works and refused the unsigned test (expected) |
| `404` | Wrong host, site id or controller in the URL |
| `301` | You used the `dx` host; use the storefront host |

---

## 15. Test

Open the storefront (`http://localhost:5173/<site id>/<locale>/`), add a product to the cart
and go to checkout. At the payment step, Flow appears.

Use [Checkout​.com test cards](https://www.checkout.com/docs/developer-resources/testing/test-cards),
for example **`4242 4242 4242 4242`**, any future expiry date, any CVV.

| Test | Expected result |
| --- | --- |
| Card payment | Order confirmation page. In Business Manager the order is *New*, and on the Checkout​.com Dashboard the payment's reference is the order number |
| 3D Secure (turn on **3D Secure** in step 8, use a 3DS test card) | The challenge screen appears, then the confirmation |
| Declined card | An error at the payment step, the basket is intact, and another try works |
| Redirect method (iDEAL, Klarna, PayPal…) | You leave the site, come back through `/cko-return`, and see the confirmation |
| Cancel at the redirect provider | Back at checkout with an error; the basket is intact |
| Webhook | Within a minute the order gets a note per event and a Capture transaction; payment status **Paid** (with auto capture) |

---

## 16. Customise how Flow looks and behaves

Nothing in this step is required. After installation, Flow already uses your storefront's
theme. Customise it only if you want something different.

Customisation has three levels. Each one applies on top of the one before it:

| Level | Where | Who | Needs a deploy? |
| --- | --- | --- | --- |
| 1. Storefront theme (automatic) | Your storefront's theme colours and fonts | Nobody: it happens by itself | No |
| 2. Business Manager settings | **CKO Flow** site preferences (step 8) | Merchandiser or admin | No |
| 3. Code | `src/extensions/checkoutcom/flow-options.ts` in your storefront repository | Developer | Yes |

Most stores need only level 1 or 2. Use level 3 only for what the settings can't express.

### 16.1 Level 1: the storefront theme

When the payment step opens, the extension reads your storefront's theme and gives Flow the
same colours, corner radius and font:

| Flow setting | Storefront theme variable |
| --- | --- |
| `colorAction` (buttons, selected items) | `--primary` |
| `colorInverse` (text on buttons) | `--primary-foreground` |
| `colorPrimary` (main text) | `--foreground` |
| `colorSecondary` (secondary text) | `--muted-foreground` |
| `colorBackground`, `colorFormBackground` | `--background` |
| `colorBorder` | `--border` |
| `colorFormBorder` (input borders) | `--input` |
| `colorOutline` (focus ring) | `--ring` |
| `colorError` | `--destructive` |
| `colorSuccess` | `--success` |
| `borderRadius` | `--radius-ui` (or `--radius`) |
| Font of `button`, `input`, `label`, `subheading`, `footnote` | `--font-sans` |

If you change your storefront theme, including dark mode, Flow follows it. If Flow ever
rejects the theme, the extension starts Flow with Checkout​.com's default styling instead,
and logs *Flow did not start with the storefront theme* in the browser console.

### 16.2 Level 2: Business Manager settings

Business Manager → select your site → **Merchant Tools → Site Preferences → Custom
Preferences → CKO Flow**. Paste JSON into one of the fields below and click **Save**. The
change applies to the next shopper who opens the payment step, with no deploy.

Invalid JSON is ignored, so a typo never breaks checkout. The instance log then shows
*Invalid Flow … JSON ignored*. To check your JSON first, paste it into any JSON validator.

**Flow Appearance**: colours, fonts and borders. Only the keys you set change; the rest
still come from your theme. For example, for a black button with rounded corners:

```json
{
  "colorAction": "#000000",
  "colorInverse": "#FFFFFF",
  "borderRadius": ["12px", "12px"]
}
```

Underline-style inputs (bottom border only):

```json
{
  "borderWidthTop": "0px",
  "borderWidthRight": "0px",
  "borderWidthLeft": "0px",
  "borderWidthBottom": "1px",
  "colorFormBorderBottom": "#000000"
}
```

A font for one part of Flow (`button`, `input`, `label`, `subheading` or `footnote`). Card
number fields can't use web fonts, so always end with a standard font:

```json
{
  "label": { "fontFamily": "Georgia, serif", "fontSize": "14px", "fontWeight": 600 }
}
```

**Flow Component Options**: settings per payment method. For example, to show the
cardholder name on top, ask for the billing country and postcode with the card, and use
white Google Pay and Apple Pay buttons:

```json
{
  "card": {
    "displayCardholderName": "top",
    "capturedBillingAddressFields": ["country", "zip"],
    "requiredBillingAddressFields": ["country", "zip"]
  },
  "googlepay": { "buttonColor": "white" },
  "applepay": { "buttonColor": "white" },
  "flow": { "expandFirstPaymentMethod": false }
}
```

Other useful keys are `acceptedCardSchemes` and `acceptedCardTypes`, set under `flow` for
all methods or under `card`, `applepay` or `googlepay` for one. Some keys are ignored
because the integration sets them: `amount`, `currency` and `items` (the order sets what is
charged) and `flow.showPayButton` (shoppers pay with the storefront's **Place Order**
button).

**Flow Translations**: your own wording, per language. The keys are Flow's text keys:

```json
{
  "en-US": { "pay_button.pay": "Pay now" },
  "fr-FR": { "pay_button.pay": "Payer maintenant" }
}
```

For every available key, see Checkout​.com's
[Flow customisation guide](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/customize-your-flow-integration)
and the [Checkout Web Components reference](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/flow-library-reference/checkoutwebcomponents).

### 16.3 Level 3: code (`flow-options.ts`)

Use this for what JSON can't express:
- values from the basket or the shopper, such as pre-filling the cardholder name
- your own callbacks, such as `onReady`, `onChange` or `handleClick` (for analytics or
  extra checks)
- different options per locale or device

The extension includes the file `src/extensions/checkoutcom/flow-options.ts` with an empty
function. It is the **only** file of the extension meant to be edited, and new versions of
the integration don't change it. Don't edit the other files of the extension: an upgrade
replaces them.

**How it works:** each time Flow opens, the extension builds the options from the theme and
the Business Manager settings, then calls your `customizeFlowOptions(options, context)`
with them. Whatever your function returns is what Flow starts with. `context` gives you the
shopper's `basket` (Shopper Baskets format) and the `locale`.

Example: pre-fill the cardholder name from the billing address and send an analytics event
when Flow is ready. Edit the file in **your storefront repository**:

```ts
// src/extensions/checkoutcom/flow-options.ts
export function customizeFlowOptions(options: CustomizableFlowOptions, context: FlowContext): CustomizableFlowOptions {
    return {
        ...options,
        componentOptions: {
            ...options.componentOptions,
            card: {
                ...(options.componentOptions?.card as object),
                data: { cardholderName: context.basket?.billingAddress?.fullName ?? '' },
            },
        },
        onReady: () => {
            (window as { dataLayer?: unknown[] }).dataLayer?.push({ event: 'checkoutcom_flow_ready' });
        },
    };
}
```

Always start from `...options` so the theme and Business Manager settings are kept.

**What you can't change.** So a customisation can never break payment, the extension always
replaces these with its own values:
- `publicKey`, `environment` and `paymentSession`: they come from the instance
- `handleSubmit`: it creates the order and submits the payment
- `componentOptions` `amount`, `currency`, `items` and `flow.showPayButton`

If you add `onPaymentCompleted` or `onError`, the extension runs its own first and then
yours. If your function throws an error, it is ignored: Flow starts with the options from
levels 1 and 2, and the browser console shows *flow-options.ts failed*.

**Test and deploy.** In your storefront repository:

```bash
cd ~/Projects/my-storefront
pnpm typecheck                                  # the file must compile
pnpm dev                                        # check the payment step on http://localhost:5173
```

Then deploy as usual (commit, and merge into your deploy branch).

---

## 17. Manage payments in Business Manager

**Merchant Tools → Checkout​.com Manager → Checkout Transactions** lists Checkout​.com orders
for the selected site. The **year** filter starts two years back.

| Button | When it appears | What it does |
| --- | --- | --- |
| **Capture** | The payment is authorized but not (fully) captured | Captures the amount (partial captures allowed) |
| **Void** | The payment is authorized and not captured | Cancels the authorization |
| **Refund** | The payment is captured | Refunds the amount (partial refunds allowed) |

Each action sends a request to Checkout​.com; the order's transactions update when the
webhook arrives.

---

## 18. Go live

1. Get **production** keys and processing channel from the Checkout​.com Dashboard.
2. On the production instance, repeat steps 5–11 and 14.
3. In **CKO Flow**: **Mode: Production**, the production keys, and **Allowed Storefront
   Origins** with your live storefront address (e.g. `https://www.example.com`). Remove
   `http://localhost:5173`. Turn **Enable Debug Mode** off.
4. Register a production webhook with the production URL and a new signature key.
5. Enrol your storefront domain for **Apple Pay** on the Checkout​.com Dashboard, if you offer it.
6. Deploy the storefront (your usual pipeline; on Storefront Next, merging into the deploy
   branch).
7. Place a real low-value order and refund it from the console.

---

## 19. Upgrading, and uninstalling

**Upgrade:** get the new version of the integration folder (step 3), then repeat step 5
(cartridges) and step 7 (metadata, safe to re-import).
Business Manager settings (step 16.2) are kept.

Copy the new extension **without replacing your `flow-options.ts`** (step 16.3). In your
storefront repository:

```bash
cd ~/Projects/my-storefront
rsync -a --delete --exclude flow-options.ts \
  ~/Projects/link_checkoutcom/checkoutcom-storefront-next/storefront-next/src/extensions/checkoutcom/ \
  src/extensions/checkoutcom/
git diff --stat src/extensions/checkoutcom      # flow-options.ts must not be listed
```

If you receive upgrades as a Commerce App pull request instead, check in the review that
it keeps your version of `src/extensions/checkoutcom/flow-options.ts`.

**Uninstall:**

1. Disable `CHECKOUTCOM_FLOW` (step 9).
2. Storefront repository: delete `src/extensions/checkoutcom`, and
   remove the `SFDC_EXT_CHECKOUTCOM` entry from `src/extensions/config.json` and the
   lines marked `SFDC_EXT_CHECKOUTCOM` from `src/middlewares/security-headers.server.ts`.
3. Remove `int_checkoutcom_next` and `bm_checkoutcom` from the cartridge paths.
4. Remove the services: in the integration folder, `b2c job import impex/uninstall`.
5. Delete the webhook on the Checkout​.com Dashboard.

---

## 20. Troubleshooting

Logs: Business Manager → **Administration → Site Development → Development Setup → Log Files**,
or from the integration folder: `b2c logs tail`. The integration logs under the
**`checkoutcom`** category; Checkout​.com calls are in `service-cko-flow-*` files.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Payment step stays on *Loading payment methods…*, then *could not be loaded*; browser console shows `step: "basket"` | The basket has no order total: no tax rate, or no shipping method | Set up taxes and a shipping method for the site |
| … with `step: "session"`, HTTP 502 | The instance could not create the session | Check the instance log (next rows) |
| Log: `Payment session creation failed … HTTP 401` | Checkout​.com rejected the secret key | Check **Secret API Key** and **Mode** match; the key needs the `payment-sessions` scope |
| Log: `The return URLs are not allowed` | The storefront address is not in **Allowed Storefront Origins** | Add it (scheme + host) |
| Log: `Checkout.com Flow is switched off` | `CHECKOUTCOM_FLOW` disabled | Step 9 |
| Browser console: *Loading the script … checkout-web-components … violates the Content Security Policy* | CSP contributor not registered | Step 13 |
| Every storefront page returns 500: *wildcard not allowed in contributor origin* | A wildcard such as `https://*.checkout.com` was added to a CSP contributor | Remove it; the extension's contributor already lists the exact hosts (step 13) |
| Browser console: a wallet or payment method host is blocked by the Content Security Policy | That provider's host is not in the policy | Add it in `config.server.ts` (step 13) |
| *Payment methods could not be loaded* right away, HTTP 403 | SLAS client lacks `c_checkoutcom` | Step 11, then clear cookies |
| `b2c scapi custom status`: *No Custom API endpoints found* | Cartridge not uploaded or code version not reloaded | Step 5 |
| Webhook delivery 404 | Wrong URL | Step 14 |
| Webhook delivery 401 | Signature key on the Dashboard differs from **Private Shared Key** | Make them identical |
| *Checkout Transactions* is empty | Wrong site selected, or the orders predate the installation | Select the site; place a new order |
| Flow ignores a **Flow Appearance**, **Flow Component Options** or **Flow Translations** value; the log shows *Invalid Flow … JSON ignored* | The JSON is invalid, or isn't an object (`{…}`) | Check the JSON in a validator, save again (step 16.2) |
| Browser console: *Flow did not start with the storefront theme* | Flow rejected a value taken from the theme | Set the value yourself in **Flow Appearance** (step 16.2) |
| Browser console: *flow-options.ts failed* | Your customisation throws an error | Fix `flow-options.ts`; Flow uses the other options meanwhile (step 16.3) |
| Command line: *no auth mechanism defined* / *WebDAV credentials required* | No `dw.json` in the folder you ran the command from | `cd` into the integration folder (step 4) |
| Command line: *No valid auth method available* | `dw.json` has no API client | Add `client-id` and `client-secret` |
| Command line: *Access to resource … isn't allowed for the current client* | API client lacks OCAPI permissions | Appendix A |

---

## Appendix A: API client permissions

Business Manager → **Administration → Site Development → Open Commerce API Settings** →
**Type: Data**, **Context: Global**. Add this entry to the `clients` array, keeping existing
entries:

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

**Administration → Organization → WebDAV Client Permissions**:

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
