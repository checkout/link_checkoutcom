# Checkout.com for Storefront Next

Accept cards, Apple Pay, Google Pay, PayPal and local payment methods at the payment step
of a Storefront Next checkout, with [Checkout.com Flow](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/get-started-with-flow).

- **One component** for every payment method enabled on your Checkout.com account; card
  data never touches your storefront or instance.
- **Order first:** the order is created when the shopper places it, and the payment's
  reference is the order number. A failed payment fails the order and gives the shopper
  their basket back.
- **3D Secure and redirect methods** return through the storefront's `/cko-return` route.
- **Business Manager console** (*Merchant Tools → Checkout.com Manager*): capture, void and
  refund, with every action recorded on the order.
- **Signed webhooks** (HMAC) update the order's payment status and transactions; repeated
  events are ignored.

## What the app installs

| Part | Where |
| --- | --- |
| `int_checkoutcom_next` cartridge: the `checkoutcom` Custom API (payment session, submit, complete) and the webhook controller | Site cartridge path |
| `bm_checkoutcom` cartridge: the Checkout.com Manager console | Business Manager cartridge path |
| Metadata: the **CKO Flow** site preferences, the `CHECKOUTCOM_FLOW` payment method and processor, the Checkout.com services, the `ckoWebhookEvent` and `ckoPayment` custom objects, order and transaction attributes | Your instance |
| Storefront extension `checkoutcom`, shown at `sfcc.checkout.payment.paymentMethods` | `src/extensions/checkoutcom` in your storefront repository |

## Requirements

- A Checkout.com account with Flow, and from its Dashboard: a secret key with the
  `payment-sessions` scope, a public key with `payment-sessions:pay` and
  `vault-tokenization`, and a processing channel.
- A Storefront Next storefront on B2C Commerce, with taxes and shipping methods set up for
  the site (Flow needs the basket's order total).

## After installing

Business Manager lists the setup tasks. In short:

1. **CKO Flow** site preferences: Mode, Secret API Key, Public Key, Private Shared Key,
   Processing Channel ID, and **Allowed Storefront Origins**.
2. Enable the `CHECKOUTCOM_FLOW` payment method.
3. Add the `c_checkoutcom` scope to the storefront's SLAS client.
4. Register the extension's Content Security Policy contributor (below).
5. Register the webhook on the Checkout.com Dashboard:
   `https://<instance-host>/on/demandware.store/Sites-<site-id>-Site/default/CKOWebhook-Handle`,
   with the Private Shared Key as its signature key.
6. Place a test order.

### Content Security Policy

Flow needs these Checkout.com hosts in the storefront's Content Security Policy. The
extension ships a CSP contributor with the exact list (`lib/csp-contributor.ts`, production
and sandbox hosts, no wildcards); register it in `src/middlewares/security-headers.server.ts`:

```ts
// @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
import { createCheckoutcomCspContributor } from '@/extensions/checkoutcom/lib/csp-contributor';

// at the end of the contributors list:
// @sfdc-extension-line SFDC_EXT_CHECKOUTCOM
createCheckoutcomCspContributor(),
```

| Directive | Hosts (production; sandbox uses `.sandbox.checkout.com`) |
| --- | --- |
| `script-src` | `checkout-web-components.checkout.com`, `risk.checkout.com` |
| `connect-src` | `api.checkout.com`, `devices.api.checkout.com`, `checkout-web-components-events.checkout.com`, `risk.checkout.com` |
| `frame-src` | `authentication-devices.checkout.com` |
| `img-src` | `risk.checkout.com` |

If your network restricts outbound traffic, allow the same hostnames (hostname rules, not
IP addresses: Checkout.com's CDN addresses change).

## Settings (CKO Flow)

| Setting | Purpose |
| --- | --- |
| Mode | `sandbox` or `production`; the keys must belong to it |
| Secret API Key, Public Key, Private Shared Key, Processing Channel ID | Your Checkout.com account |
| Service Endpoint | Only for a dedicated or regional Checkout.com API URL |
| Enable Debug Mode | Logs every Checkout.com call (secrets masked) under the `checkoutcom` category |
| Allowed Storefront Origins | Where Checkout.com may send shoppers back after 3DS or a redirect |
| Flow Auto Capture | Capture on authorization (on by default) |
| 3D Secure, 3DS Challenge Indicator, Attempt Non-3DS | 3D Secure behaviour |
| Risk Assessment | Checkout.com fraud check |
| Flow Payment Methods | Limit the methods Flow offers (empty: all enabled on the account) |
| Flow Save Payment Details | A "save card details" checkbox for signed-in shoppers |
| Flow Appearance, Flow Component Options, Flow Translations | Optional JSON to customise Flow |

## Customising Flow

Flow follows the storefront theme (colours, corner radius, font) with nothing to configure.
To change it:

- **Business Manager:** the **Flow Appearance**, **Flow Component Options** and **Flow
  Translations** preferences take JSON in the formats of
  [Checkout Web Components](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/flow-library-reference/checkoutwebcomponents).
  No deploy needed; invalid JSON is ignored.
- **Code:** `src/extensions/checkoutcom/flow-options.ts` in your storefront repository is the
  one file of the extension meant to be edited (values from the basket, callbacks such as
  `onReady`). Keep it when you review an upgrade pull request.

Keys, the payment session, payment submission, the amount and the items can't be
overridden.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Payment step stays on *Loading payment methods…*; browser console `step: "basket"` | The basket has no order total: set up taxes and a shipping method |
| HTTP 403 when the payment step loads | Add `c_checkoutcom` to the SLAS client, clear cookies |
| Browser console: CSP violation for a `checkout.com` host | Register the CSP contributor (above) |
| Instance log: `HTTP 401` from Checkout.com | Secret API Key and Mode don't match |
| Instance log: `The return URLs are not allowed` | Add the storefront address to Allowed Storefront Origins |
| Webhook delivery 401 | The Dashboard signature key differs from Private Shared Key |

Logs: category `checkoutcom`; Checkout.com calls are in the `service-cko-flow-*` log files.

## Uninstalling

Uninstalling removes the services. Also remove the two `SFDC_EXT_CHECKOUTCOM` lines from
`src/middlewares/security-headers.server.ts` and delete the webhook on the Checkout.com Dashboard.

## Support

[Checkout.com support](https://www.checkout.com/contact/support)
