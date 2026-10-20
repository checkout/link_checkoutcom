# Checkout.com for Storefront Next

Checkout.com payments for Salesforce B2C Commerce **Storefront Next**, built on **Flow**
(Checkout Web Components + Payment Sessions API). One component renders cards, wallets and
local payment methods; 3DS, redirects and wallet sheets are handled by Checkout.com.

This folder is self-contained and is meant to become its own repository. Design and roadmap:
[`../Documentation/StorefrontNext/MIGRATION_PLAN.md`](../Documentation/StorefrontNext/MIGRATION_PLAN.md).

| Folder | What it is |
| --- | --- |
| `cartridges/int_checkoutcom_next/` | Instance code: the `checkoutcom` Custom API (payment session, submit, complete), the webhook controller, the transaction ledger |
| `cartridges/bm_checkoutcom/` | Business Manager console: capture, void and refund (unchanged from the LINK cartridge) |
| `storefront-next/src/extensions/checkoutcom/` | Storefront Next extension: Flow at the payment step, server actions, gateway return route |
| `impex/` | Site preferences, services, payment method, custom object; `install/` is safe to re-import |
| `test/cartridge/` | Unit tests for the instance code (Node test runner, no dependencies) |

## How a payment works

The order is created **before** money moves, and the payment reference is the order number.

```
payment step   storefront ──► Custom API POST /payment-sessions   (session from the basket)
               Flow mounts, its own pay button hidden
Place Order    template: place-order-prepare ──► onPlaceOrder ──► flow.submit()
handleSubmit   storefront: SCAPI createOrder ──► Custom API POST /payments/submit (reference = orderNo)
               Flow runs 3DS / wallet / redirect as needed
completed      storefront ──► Custom API POST /payments/complete ──► order placed
               template: place-order-finalize ──► order confirmation
redirect       Checkout.com ──► /cko-return?cko-payment-id=… ──► same completion
failure        order failed, basket reopened, shopper can pay again
webhooks       Checkout.com ──► CKOWebhook-Handle ──► captures, refunds, voids, late declines
```

A wallet payment that skips `handleSubmit` still works: the storefront creates the order from
the basket through SCAPI, and `/payments/complete` accepts the payment for it (same basket and
amount) or voids it.

Each payment is bound to its order (number and token) in a `ckoPayment` custom object when it is
submitted. Webhooks arrive without a shopper session, and with *Limit Storefront Order Access*
enabled (the default) an order can then only be loaded with its token.

The instance never reads baskets itself. In a Custom API script the `BasketMgr` lookups are
agent-only (`getBasket`, `getBaskets`) or unsupported (`getCurrentBasket`), so the storefront sends
the SCAPI basket with the session request. That is safe: the session only shapes what Flow shows,
the amount charged is taken from the order at submission, and completion verifies it.

---

## Setup runbook

You need, once:

- **Node 24.13+ and pnpm 10.28+** (the Storefront Next template requires them).
- **The b2c CLI:** `npm install -g @salesforce/b2c-cli`.
- **An Account Manager API client** with the *Sandbox API User* role for your realm, for
  creating sandboxes and running the CLI.
- **A Checkout.com sandbox account with Flow enabled**, and from its Dashboard:
  - a secret key with the `payment-sessions` scope;
  - a public key with the `payment-sessions:pay` and `vault-tokenization` scopes;
  - the processing channel id (`pc_…`).

### 1. Create a sandbox

```bash
b2c sandbox create --realm <realm> --wait          # add --ttl <hours> for a temporary one
b2c sandbox list                                   # note the hostname, e.g. abcd-001.dx.commercecloud.salesforce.com
```

Then create `dw.json` in this folder (it is git-ignored) so the CLI targets that sandbox:

```json
{
    "hostname": "abcd-001.dx.commercecloud.salesforce.com",
    "client-id": "<Account Manager API client id>",
    "client-secret": "<its secret>",
    "tenant-id": "abcd_001",
    "short-code": "<SCAPI short code, PUBLIC__app__commerce__api__shortCode in env.txt>",
    "code-version": "<the active code version, from b2c code list>"
}
```

> Uploading code needs a WebDAV permission for that client. `--set-permissions` on
> `sandbox create` (on by default) grants it; on an older sandbox add the client in
> *Administration → Organization → WebDAV Client Permissions*.

### 2. Create the Storefront Next storefront

In Business Manager: **Administration → Sites → Storefronts → New Storefront**. Pick a
template (Market Street or Beauty Street). The wizard creates, in one go:

- the B2C site (note its **site id**);
- a Managed Runtime project and environment;
- a **SLAS client**. Download `env.txt` when offered: it is the only time the secret is shown;
- a GitHub repository with the storefront code, and its first deployment.

Clone that repository: it is "the storefront repo" below.

### 3. Upload the cartridges

```bash
b2c code list                              # use the version marked Active as code-version in dw.json
npm run deploy:cartridges                  # b2c code deploy cartridges -r  (uploads, then reloads the code version)
```

Deploy into the **active** code version (on a Storefront Next sandbox, the one the
wizard created) and keep the reload: SFCC only registers Custom APIs when a code version is
activated or reloaded. Each cartridge folder needs its `.project` file, or the CLI skips it
without an error.

Then in Business Manager:

- **Storefront site:** *Administration → Sites → Manage Sites → `<site>` → Settings*, then add
  `int_checkoutcom_next` to the **cartridge path**. The Custom API only registers for sites that
  have its cartridge on their path.
- **Business Manager:** *Administration → Sites → Manage Sites → Business Manager → Manage*, then
  add `bm_checkoutcom`. Grant the *Checkout.com* module to your role in *Administration →
  Organization → Roles*.

### 4. Import the metadata

```bash
npm run impex -- <siteId>                  # stages dist/impex with the real site id
b2c job import dist/impex
```

`impex/install` is safe to re-import later (upgrades): it ships no on/off flags, credentials or
preference values, so it never switches off a payment method or blanks a setting.

### 5. Configure Business Manager

*Merchant Tools → Site Preferences → Custom Preferences → CKO Flow*:

| Preference | Value |
| --- | --- |
| Mode | Sandbox (or Production) |
| Secret API Key | `sk_…` for that mode, from the Checkout.com Dashboard (*Developers → Keys*), with the `payment-sessions` scope |
| Public Key | `pk_…` for that mode, with the `payment-sessions:pay` and `vault-tokenization` scopes |
| Private Shared Key | the webhook signature key you set in step 9 |
| Processing Channel ID | `pc_…` |
| Service Endpoint | empty, unless you use a regional endpoint |
| Enable Debug Mode | off; on logs every Checkout.com API call (category `checkoutcom`) |
| Allowed Storefront Origins | `http://localhost:5173` and the storefront URL, comma separated |
| Flow Auto Capture | on (default) |
| 3D Secure | on to request 3DS for cards |
| 3DS Challenge Indicator | `no_preference` (default), `no_challenge_requested`, `challenge_requested` or `challenge_requested_mandate` |
| Attempt Non-3DS | `false` (default); `true` attempts the payment without 3DS when it is not available |
| Risk Assessment | on (default) |
| Flow Payment Methods | empty: every method enabled on the Checkout.com account |
| Flow Save Payment Details | off (default) |
| Flow Appearance | empty (Flow follows the storefront theme), or JSON such as `{"colorAction":"#000000"}` |
| Flow Component Options | empty, or JSON such as `{"card":{"displayCardholderName":"top"}}` |
| Flow Translations | empty, or JSON such as `{"en-US":{"pay_button.pay":"Pay now"}}` |

Flow's look: by default the storefront theme; these three JSON settings override it per
site; code-level customisation goes in `storefront-next/src/extensions/checkoutcom/flow-options.ts`,
the one extension file merchants edit. See *Customise how Flow looks and behaves* in
`Documentation/StorefrontNext/INSTALLATION_GUIDE.md`.

*Merchant Tools → Ordering → Payment Methods*: **enable `CHECKOUTCOM_FLOW`**. This is how Flow is
switched on and off; it is imported disabled. Disable the template's default credit card method if
you do not want it as well.

### 6. Check the Custom API is registered

```bash
b2c scapi custom status -c apiName,endpointPath,httpMethod,status,sites,errorReason
```

All three `checkoutcom` endpoints must be **active** for your site. When one shows
`not_registered`, `errorReason` says why. The usual causes are a cartridge path without
`int_checkoutcom_next`, or an inactive code version.

### 7. Allow the storefront to call it (SLAS scope)

The Custom API requires the custom scope `c_checkoutcom` on the storefront's SLAS client
(its id is `PUBLIC__app__commerce__api__clientId` in `env.txt`):

```bash
b2c slas client update <slasClientId> --tenant-id <tenant, e.g. abcd_001> --scopes c_checkoutcom
```

This needs a user with the **SLAS Organization Admin** role in Account Manager. Shoppers only
receive the new scope with a new token: log out, or clear the site's cookies.

### 8. Install the extension in the storefront repo

From the storefront repo:

```bash
cp -R <this folder>/storefront-next/src/extensions/checkoutcom src/extensions/

# Typed client for the Custom API, generated from the cartridge's schema
npx sfnext scapi add \
    --schema <this folder>/cartridges/int_checkoutcom_next/cartridge/rest-apis/checkoutcom/schema.yaml \
    --name checkoutcom --base-path /custom/checkoutcom/v1 --no-supports-locale
```

Register it at the top of `src/extensions/config.json`:

```json
"SFDC_EXT_CHECKOUTCOM": {
    "name": "Checkout.com",
    "description": "Checkout.com payments with Flow. Requires the int_checkoutcom_next cartridge and its checkoutcom Custom API.",
    "folder": "checkoutcom",
    "dependencies": []
}
```

Then:

```bash
pnpm locales:aggregate-extensions && pnpm typecheck
```

Allow Checkout.com in the storefront's Content Security Policy. The template ships a strict CSP
that blocks the Flow script otherwise. Add this to `config.server.ts`; it is the template's own
recipe for extending the CSP. A CSP *contributor* cannot be used, because contributors may not
use wildcard origins, and Checkout.com documents `https://*.checkout.com`:

```ts
// after the existing import of defaultSecurityHeaders
// @sfdc-extension-block-start SFDC_EXT_CHECKOUTCOM
import { defaultCspDirectives } from '@salesforce/storefront-next-runtime/security';

const CHECKOUTCOM_ORIGIN = 'https://*.checkout.com';
const checkoutcomCspDirectives = {
    ...defaultCspDirectives,
    'script-src': [...(defaultCspDirectives['script-src'] ?? []), CHECKOUTCOM_ORIGIN],
    'connect-src': [...(defaultCspDirectives['connect-src'] ?? []), CHECKOUTCOM_ORIGIN],
    'frame-src': [...(defaultCspDirectives['frame-src'] ?? []), CHECKOUTCOM_ORIGIN],
    'img-src': [...(defaultCspDirectives['img-src'] ?? []), CHECKOUTCOM_ORIGIN],
};
// @sfdc-extension-block-end SFDC_EXT_CHECKOUTCOM

// and in app.security, replace `headers: defaultSecurityHeaders,` with:
headers: {
    ...defaultSecurityHeaders,
    // @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
    csp: { ...defaultSecurityHeaders.csp, directives: checkoutcomCspDirectives },
},
```

### 9. Register the webhook

On the Checkout.com Dashboard, add a webhook endpoint:

- **URL:** `https://<sandbox-host>/on/demandware.store/Sites-<siteId>-Site/default/CKOWebhook-Handle`
- **Events:** `payment_captured`, `payment_refunded`, `payment_voided`, `payment_declined`,
  `payment_expired`, `payment_canceled`
- **Key:** use the same value for the endpoint's signature or authorization key and for the
  **Private Shared Key** preference.

### 10. Run and test locally

```bash
pnpm dev                                   # http://localhost:5173, with the .env from env.txt
```

Add a product to the cart, go through checkout, and at the payment step Flow loads. Use
[Checkout.com test cards](https://www.checkout.com/docs/developer-resources/testing/test-cards).

| Test | Expected |
| --- | --- |
| Card, no 3DS | Order confirmation; BM order *New*, Checkout.com payment `reference` = order number |
| Card with 3DS challenge | Challenge, then confirmation |
| Declined card | Error at the payment step, basket intact, a retry works |
| Redirect method (iDEAL, Klarna…) | Leaves the site, returns through `/cko-return`, confirmation |
| Cancel at the redirect provider | Back at checkout with an error, basket intact |
| Capture / refund in BM (*Ordering → Checkout.com*) | Webhook arrives; the order's transactions and payment status update |
| Same webhook sent twice | Second delivery acknowledged as `duplicate-ignored` |

Logs: `b2c logs tail` (category `checkoutcom`); the service communication log is on for sandbox
services, with session secrets masked.

### 11. Deploy to Managed Runtime

```bash
pnpm push                                  # from the storefront repo
```

Add the MRT URL to **Allowed Storefront Origins** (step 5), and the Apple Pay domain on the
Checkout.com Dashboard if you test Apple Pay there.

---

## Developing

```bash
npm run verify          # syntax check, unit tests, impex validated against the official XSDs
npm test                # unit tests only
npm run impex -- <site> # stage the impex for a Site Import
```

## Status

Built and verified offline: unit tests, schema validation, and a full typecheck and lint of the
extension inside the Storefront Next template (2026.9.2). **Not yet run end to end on an
instance.** Open items, in plan order:

- **Spike (plan §4.2):** whether Flow honours `showPayButton: false`, and how Apple Pay / Google
  Pay behave with `handleSubmit`.
- **Phase 3:** express checkout buttons, saved cards and the account page.
- **Phase 5:** Commerce App packaging (`commerce-app.json`, tasks list, registry submission).
- **File headers:** the template's `header-format` lint rule requires a Salesforce copyright
  header on every file; a licensing decision is needed for this code.
