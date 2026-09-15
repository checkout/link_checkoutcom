# Checkout.com — Storefront Next components

React payment components for Salesforce B2C Commerce **Storefront Next**,
shipped as part of the Checkout.com Commerce App Package. Together with the
backend cartridge's SCAPI hooks and the `checkoutcom` Custom API they replace
the SFRA controllers/ISML/jQuery integration for headless storefronts.

## How the headless flow works

1. **Tokenize client-side** — `CheckoutcomCardPayment` mounts Checkout.com
   Frames hosted fields; raw card data never reaches the storefront or the
   B2C instance (SAQ-A style scope instead of SAQ-D).
2. **Add the payment instrument** via SCAPI Shopper Baskets with `c_*` custom
   properties (`c_ckoToken`, `c_deviceSessionId`, `c_saveCard`, …). The
   cartridge's `dw.ocapi.shop.basket.payment_instrument` hooks translate them
   into the gateway payment context.
3. **Create the order** via SCAPI Shopper Orders. The cartridge's
   `dw.ocapi.shop.order.afterPOST` hook runs the same
   `app.payment.processor.*` Authorize chain as SFRA:
   - synchronous success → the order is placed and confirmed
   - 3DS/APM redirect → the response carries `c_ckoRedirectUrl`; redirect the
     shopper and complete via the return route
   - async APMs (MB WAY, Bizum, ACH) → poll the `payment-status` endpoint
4. **Return leg** — configure the `ckoReturnSuccessUrl` /
   `ckoReturnFailureUrl` site preferences to point at your storefront route
   that mounts `CheckoutcomReturnHandler` (or calls the `/return` custom
   endpoint from a route loader).

## Custom API

The backend exposes `/custom/checkoutcom/v1/organizations/{orgId}/…` with a
`ShopperToken` security scheme and the `c_ckopayments` custom scope — **add
that scope to your SLAS client**. Endpoints: `POST /payment-status`,
`GET /apm-eligibility`, `GET /bin-lookup`, `POST /payment-contexts`,
`POST /return`. Generate typed clients with `sfnext scapi` against
`cartridge/rest-apis/checkoutcom/schema.yaml`.

## Components

| Component | Purpose |
|---|---|
| `CheckoutcomPaymentMethods` | Method selector bound to the checkout payment UI target |
| `CheckoutcomCardPayment` | Frames hosted card fields + 3DS redirect handling |
| `CheckoutcomRedirectApm` | Redirect APMs (Klarna, Tabby, Alma, Sequra, generic) |
| `CheckoutcomAsyncApm` | MB WAY / Bizum / ACH with payment-status polling |
| `CheckoutcomGooglePay` | Google Pay JS button (gateway `checkoutltd`) |
| `CheckoutcomApplePay` | Apple Pay JS session (requires an MRT merchant-validation route) |
| `CheckoutcomReturnHandler` | Completes the gateway return leg client-side |

## Known follow-ups

- **PayPal** is not yet wired for headless: it needs the PayPal JS SDK button
  flow on top of the payment-context leg.
- **Apple Pay merchant validation** requires a server route on MRT holding the
  Apple merchant certificate; the SFRA `dw.extensions.applepay` hooks do not
  apply to headless storefronts.
- The `target-config.json` UI target names must be confirmed against the
  Storefront Next template version in use; payment-domain extension points
  (`sfcc.app.payment.*`) were not yet published when this package was built —
  revisit once Salesforce ships them.

## Development

```bash
npm install
npx tsc -p tsconfig.json   # strict typecheck
```
