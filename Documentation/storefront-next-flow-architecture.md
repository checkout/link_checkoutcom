# Checkout.com for Salesforce B2C Storefront Next — Flow-based Architecture (Draft for review)

**Status:** Draft v1 — for internal review
**Date:** 2026-10-08
**Scope:** A new, slim integration package for Salesforce B2C Commerce **Storefront Next**, built on **Flow** (Checkout Web Components + Payment Sessions API). The existing LINK cartridge remains the product for SFRA / SiteGenesis storefronts.

---

## 1. Summary and recommendation

We recommend building a new two-part package — a minimal B2C cartridge plus a Storefront Next extension — on Flow, instead of continuing to port the legacy cartridge's 12 per-method integrations to the headless stack.

Three facts drive this:

1. **Frames is deprecated (June 30, 2026).** The interim headless card path we built uses Frames tokenization; it works, but it is built on a sunset product. Flow is the mandated replacement.
2. **Flow collapses the per-method surface.** One web component renders cards, wallets, and APMs from a server-created payment session; 3DS, APM redirects, and wallet sheets are handled inside the component. The legacy cartridge's largest cost — per-method processors, form processors, eligibility filters, BIN lookups, async polling UX — disappears. New methods become a dashboard toggle, not a cartridge release.
3. **Apple Pay merchant validation goes away.** Flow handles it; the merchant only enrolls the domain. This removes the one piece of the current headless design that required a bespoke server endpoint on Managed Runtime.

The legacy cartridge is **not** retired: it remains required for SFRA/SiteGenesis merchants, for ABC-platform merchants (Flow requires the current platform's scoped keys), and for **Sequra**, which Flow does not support.

## 2. Two-track product strategy

| Track | Storefronts | Card entry | Package |
|---|---|---|---|
| **Legacy (existing)** | SFRA, SiteGenesis | Frames*/direct API | `checkoutcom-payments` CAP (current repo) |
| **Flow (new)** | Storefront Next (and future headless) | Flow | `checkoutcom-payments-flow` CAP (new) |

\* Frames deprecation also needs a plan on the legacy track, but that is a separate workstream.

Both tracks share the Business Manager transactions console (`bm_checkoutcom`) and the webhook subsystem.

## 3. Architecture overview

```
Shopper browser
   │  Flow web component (checkout-web-components.checkout.com)
   │  — cards, wallets, APMs, 3DS, redirects all inside the component
   ▼
Storefront Next app (Managed Runtime / localhost)
   │  extension: checkoutcom-flow
   │  — FlowPaymentSection (mounts Flow, template onPlaceOrder contract)
   │  — server routes: create-session, complete, cko-return
   ▼  SCAPI (shopper token; custom API scope c_ckopayments)
B2C Commerce instance (zzxp-002 etc.)
   │  cartridge: int_checkoutcom_next
   │  — Custom API: POST /payment-sessions, POST /complete, POST /payment-status
   │  — webhook receiver (HMAC, idempotent) + order reconciliation
   │  — services: payment-sessions, payments (verify), captures/voids/refunds
   ▼  server-to-server (secret key, scope payment-sessions)
Checkout.com
```

The B2C instance never sees card data (SAQ-A posture). The storefront server never holds the secret key — payment sessions are created by the **instance** via the Custom API, so key management stays in Business Manager exactly as today.

## 4. Components

### 4.1 `int_checkoutcom_next` (B2C cartridge — small by design)

| Piece | Contents |
|---|---|
| `cartridge/rest-apis/checkoutcom-flow/` | OAS 3.0 Custom API: `POST /payment-sessions` (create session from the shopper's basket: amount/currency/billing from basket, `success_url`/`failure_url` from site prefs, `processing_channel_id`, `metadata.basket_id`), `POST /complete` (verify `GET /payments/{id}`, create+place the SFCC order, bind payment id ↔ orderNo), `POST /payment-status` (poll for webhook-resolved asynchronous outcomes) |
| `cartridge/scripts/` | Session builder (basket → payment-session payload), completion/verification script, webhook event handlers (port of the hardened receiver: HMAC check, non-200 on failure, event-id dedupe) |
| `hooks.json` | Webhook route registration only — **no** `app.payment.processor.*` chain, no SCAPI basket/order hooks needed (ordering is explicit in `/complete`) |
| metadata/impex | ~10 site preferences (keys, mode, channel id, return URLs), 2 payment methods (`CHECKOUTCOM_FLOW`, processor for BM display), services (payment-sessions, payments, transaction ops), `ckoWebhookEvent` custom object |

Explicitly **not** carried over: 12 processor hooks + 12 form processors, APM filter/Mada/Cartes Bancaires configs, per-method helpers, SFRA controllers/templates/forms/client JS, the Plaid service (Flow drives Plaid Link itself).

### 4.2 `checkoutcom-flow` (Storefront Next extension)

| Piece | Contents |
|---|---|
| `components/FlowPaymentSection.tsx` | Bound to `sfcc.checkout.payment`. Mounts Flow (manual mount in an effect — no official React wrapper exists; script must load from checkout.com, never bundled; CSP allowances for `*.checkout.com`). Integrates with the template's `paymentSubmissionRef.onPlaceOrder` contract using `showPayButton: false` + `flow.submit()`, so the template's own Place Order button drives payment. |
| `routes/action.checkoutcom-session.ts` | Server route → Custom API `POST /payment-sessions`; returns the session object for component init |
| `routes/action.checkoutcom-complete.ts` | Server route → Custom API `POST /complete` after `onPaymentCompleted`; returns `orderNo` for the template's finalize step |
| `routes/_empty.cko-return.tsx` | Return leg for redirect methods: reads `cko-payment-id` from the query string, calls `/complete`, redirects to confirmation (polls client-side while asynchronous payments resolve) |
| `config.ts` | `publicKey`, `environment` (PUBLIC__ overridable) |

### 4.3 Shared with the legacy product

Only `bm_checkoutcom` (the capture/void/refund Business Manager console) and the account-level site preferences (mode, keys, processing channel) are shared, so a merchant running both tracks configures credentials once. Everything else in the Flow package is new, standalone code with no dependency on the legacy cartridge.

## 5. Payment sequences

### 5.1 Key design decision: session-first (recommended)

Flow must render at the **payment step**, before an SFCC order exists. We therefore create the payment session from the **basket** and key reconciliation on the **payment id**, not the order number:

1. Payment step renders → storefront calls `/payment-sessions` (instance builds it from the basket; `metadata.basket_id` set) → Flow mounts with the session.
2. Shopper clicks the template's Place Order → prepare action → `onPlaceOrder` → `flow.submit()`.
3. **Synchronous outcome**: `onPaymentCompleted` fires with `payment.id` → storefront calls `/complete` → instance verifies `GET /payments/{id}` (amount/currency/status), creates and places the SFCC order with the payment id on the transaction → `orderNo` returns through the template's finalize step.
4. **Redirect outcome** (3DS, redirect APMs): the component redirects; the shopper returns to `success_url`/`failure_url` (= the `cko-return` route) with `cko-payment-id` → same `/complete` verification path.
5. **Webhooks** reconcile capture/refund/decline lifecycle; Flow events carry `metadata.cko_payment_session_id`, and we add `basket_id`/`order_no` metadata for lookup.

Trade-off, stated honestly: payment happens **before** order creation (charge-then-order). Mitigations: `/complete` creates the order idempotently; on order-creation failure the instance **voids/refunds** the payment automatically and the webhook handler acts as backstop; amount verification prevents basket-drift charges (`checkout.update({amount})` on basket changes, session recreated on currency change). The alternative (order-first) requires a two-phase UI that fights both the template's checkout and Flow's design, and was rejected.

### 5.2 Saved cards

Phase 1: `payment_method_configuration.card.store_payment_details: "collect_consent"` + `stored_card.customer_id` for returning registered shoppers (instrument ids held SFCC-side as today). **Remember Me** (network vault, OTP) as a fast-follow — it is a dashboard enablement plus `customer.email`, no architecture change.

## 6. Method coverage vs. legacy cartridge

| Legacy method | Via Flow? |
|---|---|
| Cards (+ Mada, Cartes Bancaires) | ✅ (scheme logic inside Flow) |
| Apple Pay / Google Pay | ✅ (no merchant-validation endpoint; domain enrollment only) |
| PayPal, Klarna, Alma, Tabby | ✅ |
| MB WAY, Bizum | ✅ |
| ACH | ✅ via Flow's Plaid Link (Plaid account still required) |
| **Sequra** | ❌ not on Flow — merchants needing Sequra stay on the legacy track (or a custom add-on later) |

## 7. Open questions for product/AM review

1. Confirm platform entitlement wording (Flow enablement per merchant account; scoped keys imply current platform only — "NAS-only" is not stated verbatim in docs).
2. Google Pay: confirm whether merchants still provide their own Google Pay Merchant ID with Flow (docs ambiguous).
3. Sequra roadmap on Flow, or accept the gap.
4. Frames deprecation handling for the **legacy SFRA** track (out of scope here but linked).
5. Charge-then-order risk appetite + auto-void policy sign-off.

## 8. Milestones (engineering estimate)

| M | Deliverable |
|---|---|
| 1 | Cartridge skeleton: payment-sessions + complete Custom API, webhook receiver port — demo payment via curl + Flow test page |
| 2 | Storefront extension: FlowPaymentSection + routes, E2E card + 3DS on a Storefront Next sandbox app |
| 3 | Redirect/async APMs E2E, webhook reconciliation, auto-void path, saved cards phase 1 |
| 4 | CAP packaging (`checkoutcom-payments-flow`, `storefrontSupport.storefrontNext`), registry validation, docs, merchant task list |

The package is deliberately small — two Custom API endpoints, four scripts, one webhook controller, one storefront component — which is why the estimate is weeks, not months.
