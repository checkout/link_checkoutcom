# Checkout.com for Storefront Next — Migration Plan

**Status:** Draft for review
**Date:** 2026-10-20
**Branch:** `flow_storefrontnext` (target: new standalone repository)
**Scope:** Move the Checkout.com integration from SFRA/SiteGenesis to Salesforce B2C
**Storefront Next**. Backwards compatibility with SFRA and SiteGenesis is explicitly out of
scope: the existing LINK cartridge stays as the product for those storefronts.

---

## 1. Summary

The integration is rebuilt, not ported, as a **Fullstack Commerce App** on **Flow**
(Checkout Web Components + Payment Sessions API):

| Part | What it is | Replaces |
| --- | --- | --- |
| `storefront-next/` extension | React/TypeScript: Flow payment step, express buttons, return route, saved methods | 78 ISML templates, forms, 35 client scripts, SFRA controllers |
| `int_checkoutcom_next` cartridge | Custom SCAPI API (payment session, submit, complete, fail), webhook receiver, order reconciliation | 16 processor + 16 form-processor hooks, CKOMain/PayPal/GooglePay/CKOKlarna/CKOTabby routes |
| `bm_checkoutcom` cartridge | Business Manager capture / void / refund console | Carried over almost unchanged |
| `impex/` | Preferences, services, payment method, custom objects | `metadata/` (re-written, single re-importable package) |

Three facts drive "rebuild on Flow" rather than "port":

1. **Flow collapses the per-method surface.** The legacy cartridge integrates 15 payment
   methods one by one. Flow renders cards, wallets and APMs from one session, and handles
   3DS, redirects and wallet sheets itself. A new method becomes a dashboard toggle, not a
   release.
2. **The legacy card path cannot run headless.** It posts raw card data through SFRA forms
   (SAQ-D). Frames, the interim headless option, was deprecated on 2026-06-30.
3. **The groundwork exists.** A Flow cartridge with a Custom API and hardened webhooks
   (`origin/SFCC-43`), a working Storefront Next extension (`storefront-next-test-3`), and a
   shipped SFRA Flow integration (`origin/flow`) with production lessons learned.

## 2. What we start from

| Source | Contents | Reuse |
| --- | --- | --- |
| `origin/flow` (SFRA Flow, v26.4.0) | `flowHelper` (session payload), `flowPaymentHelper` (verify + place + void), `flow/flowComponent.js` (bundle loading, mount, settle) | **Logic and lessons**, see 2.1 |
| `origin/SFCC-43` → `Cartridges/int_checkoutcom_flow` | Custom API `checkoutcom-flow` (createPaymentSession, completePayment; scope `c_ckoflow`), `sessionHelper`, `completionHelper`, `webhookHelper` (HMAC, 401/500, event dedupe), `CKOFlowWebhook` controller, `ckoFlowService` | **Code base** for the cartridge |
| `origin/SFCC-43` → `metadata-flow/`, `commerce-app/` | Flow impex, CAP manifest/tasksList/translations, `scripts/build-commerce-app.js` | **Starting point** for packaging |
| `origin/SFCC-43` → `Documentation/storefront-next-flow-architecture.md` | Oct 8 architecture draft (session-first design) | Superseded by this plan where they differ (§4.1) |
| `~/Projects/storefront-next-test-3/src/extensions/checkoutcom-flow` | `FlowPaymentSection`, session/complete actions, `_empty.cko-return` (≈410 lines, **uncommitted**) | **Code base** for the extension — commit it first |
| `commerce-apps` registry → `payment/sf-payments` v1.0.1 | Salesforce's own payment app for Storefront Next | **Reference pattern** for order-first payment, failure recovery and express buttons |

### 2.1 Lessons from the SFRA Flow integration that must carry over

- `/payment-sessions` rejects `null` optional fields → prune empty values (`flowHelper.pruneEmpty`).
- `/payment-sessions` rejects `risk.device` fields → send `risk.enabled` only.
- Items must add up to the amount: shipping and tax as separate line items (BNPL requires it).
- The components bundle must load as a **classic script** from `checkout-web-components.checkout.com`
  (the CDN has no CORS headers, so an ES-module import fails); never bundle or self-host it.
- Completion re-reads `GET /payments/{id}` and checks `reference`, `amount` and `currency` against
  the order before placing it; on failure the authorization is **voided**.
- Pending statuses (Multibanco, Fawry…) place the order as *Not Paid*; webhooks settle it.
- Enum site preferences come back as `dw.value.EnumValue` — compare `.value`.

## 3. Target architecture

```
Shopper browser
  │  Flow (Checkout Web Components, loaded from checkout.com)
  ▼
Storefront Next app on Managed Runtime
  │  extension: checkoutcom
  │   UI targets:  sfcc.checkout.payment.paymentMethods   (Flow payment step)
  │                sfcc.{pdp,cart,miniCart}.payments.expressCheckout, sfcc.checkout.expressPayments
  │                sfcc.accountPaymentOptions.payments.savedPaymentMethods
  │   routes:      action.checkoutcom-session / -submit / -complete / -fail-order, _empty.cko-return
  ▼  SCAPI (shopper SLAS token; Shopper Orders + Custom API scope c_ckoflow)
B2C Commerce instance
  │  int_checkoutcom_next: Custom API, webhook controller, reconciliation
  │  bm_checkoutcom:       capture / void / refund console
  ▼  server to server (secret key from site preferences, scope payment-sessions)
Checkout.com
```

Principles:

- **The secret key stays on the instance.** Sessions and payments are created by the Custom
  API, so key management stays in Business Manager. MRT holds only the public key.
- **No card data touches SFCC or MRT** (SAQ-A).
- **Webhooks stay an instance controller.** Checkout.com cannot authenticate to a Custom API
  (SLAS), so the receiver is a plain controller with HMAC verification.

### 3.1 Why not storefront-only, like Salesforce Payments?

`sf-payments` has no cartridge because its gateway back end is Salesforce's. We need instance
code anyway: the secret key in Business Manager, webhook settlement of orders, and the
capture/void/refund console. A storefront-only build would move the secret key into MRT
environment variables and need an admin API client for order updates — more moving parts,
not fewer.

## 4. Checkout design

### 4.1 Order-first at the payment step (replaces the Oct 8 session-first design)

`sf-payments` shows the pattern Salesforce intends: the payment UI renders at the payment
step, and the order is created when the shopper places it, **before** the payment is
confirmed. Flow supports the same sequence through `handleSubmit`:

1. **Payment step** — `sfcc.checkout.payment.paymentMethods` renders `FlowPaymentSection`.
   `action.checkoutcom-session` calls the Custom API, which creates a payment session from the
   **basket**. Flow mounts with its own pay button hidden.
2. **Gate** — the template's Place Order is enabled only when Flow reports `isValid()` (via `onChange`).
3. **Place Order** — `paymentSubmissionRef.onPlaceOrder` calls `flow.submit()`.
4. **`handleSubmit(component, submitData)`** —
   a. `action.checkoutcom-submit` creates the SFCC order through SCAPI Shopper Orders.
   b. It then calls the Custom API, which calls `POST /payment-sessions/{id}/submit` with
      `session_data`, `reference = orderNo` and the order's final amount.
   c. The unmodified response is returned to Flow, which performs any 3DS or redirect action.
5. **Outcome** —
   - in-page: `onPaymentCompleted` → `action.checkoutcom-complete` → verify and mark paid → confirmation;
   - redirect: `success_url` / `failure_url` → `_empty.cko-return` → same completion → confirmation;
   - failure or cancel: `action.checkoutcom-fail-order` fails the order and restores the basket
     (port of `sf-payments`' `attemptFailOrder`).
6. **Webhooks** reconcile captures, refunds and late approvals, keyed by `reference = orderNo`.

This keeps the property the SFRA integration relies on: **the order exists before money
moves and the payment reference is the real order number**, so no charge-then-order
auto-void path is needed for card and APM payments.

### 4.2 Wallets (Apple Pay, Google Pay, PayPal)

Flow's `submit()` is not available for Apple Pay and Google Pay; their buttons start the
payment directly. Planned handling, **to be proven in the spike (§6, phase 0)**:

- `handleClick` creates the order before the wallet sheet opens (`{ continue: true }` once
  it exists, `{ continue: false }` on failure), and the payment flows through `handleSubmit`
  with `reference = orderNo`.
- **Fallback if that cannot be made to work:** wallets use the session-first design from the
  Oct 8 draft (reference = basket UUID, verify then create the order, auto-void on failure).

### 4.3 Express checkout (phase 3)

PDP, cart, mini cart and checkout express buttons (`sfcc.*.payments.expressCheckout`,
`sfcc.checkout.expressPayments`) replace the SFRA PayPal and Google Pay express flows.
`sf-payments` shows the extra plumbing needed: a temporary express basket, shipping
address/method callbacks, and basket clean-up.

## 5. Feature coverage

| Legacy feature | Storefront Next |
| --- | --- |
| Cards, Mada, Cartes Bancaires, 3DS | ✅ Flow |
| Apple Pay, Google Pay | ✅ Flow (domain enrolment only, no merchant-validation endpoint) — wallet sequence per §4.2 |
| PayPal, Klarna, Alma, Tabby, MB WAY, Bizum, Alipay HK, Alipay CN, iDEAL, … | ✅ Flow (per-account enablement) |
| ACH | ✅ Flow's Plaid Link (merchant still needs a Plaid account) |
| Tamara | ❓ confirm Flow support |
| **SeQura** | ❌ not on Flow — merchants needing it stay on the legacy cartridge |
| Saved cards (account wallet) | Phase 3: Flow stored cards (`store_payment_details`) + `savedPaymentMethods` target; Remember Me later |
| Express PayPal / Google Pay (PDP, cart, mini cart) | Phase 3 (§4.3) |
| BM capture / void / refund | ✅ `bm_checkoutcom` carried over |
| Webhooks (status updates, refunds, captures) | ✅ hardened receiver from SFCC-43 |
| Async polling (MB WAY / Bizum / ACH via `webhookNotification`) | Dropped — Flow handles the waiting UX; webhooks settle |
| ABC-platform accounts | ❌ Flow requires current-platform keys — stay on legacy |
| SiteGenesis, SFRA | Out of scope (legacy cartridge) |

**Explicitly not migrated:** per-method processors and form processors, APM filter/Mada/Cartes
Bancaires configs, Risk.js snippet, SFRA controllers, templates, forms and client JS, the
Plaid service, `webhookNotification` polling, and the dead legacy APM preferences (Alipay
legacy, Benefit, Boleto, Giropay, OXXO, POLi, SEPA, Sofort).

## 6. Phases

Each phase ends with a demo on a sandbox Storefront Next app.

| # | Phase | Deliverables | Exit criteria |
| --- | --- | --- | --- |
| 0 | **Foundations + spike** (1 wk) | New repo; import SFCC-43 cartridge + test-3 extension; environment re-verified (§8). Spike: hide Flow's pay button; `submit()` → `handleSubmit` → order → `/submit`; wallet `handleClick` behaviour | Card payment with `reference = orderNo` on sandbox; written answer to §4.2 |
| 1 | **Cartridge** (1–2 wks) | Custom API ops: `payment-sessions` (from basket), `submit`, `complete`, `fail`; port SFRA Flow payload rules (§2.1); webhook receiver; single re-importable impex | API exercised via curl + unit tests; impex passes XSD validation |
| 2 | **Checkout extension** (2 wks) | `FlowPaymentSection` on `sfcc.checkout.payment.paymentMethods`, Place Order gating, submit/complete/fail-order actions, `cko-return` route, i18n, error states | E2E: card, 3DS, redirect APM (iDEAL/Klarna), decline, cancel → basket restored |
| 3 | **Wallets, express, saved cards** (2 wks) | Wallet sequence per spike; express buttons on PDP/cart/mini cart/checkout; stored cards + account page | E2E Apple Pay, Google Pay, PayPal; express from PDP; returning shopper pays with saved card |
| 4 | **Operations** (1 wk) | BM console against Flow orders; webhook replay, idempotency, refunds/captures; logging; `ckoWebhookEvent` clean-up job | Capture, partial refund, void from BM; duplicate webhook ignored |
| 5 | **Package + submit** (1 wk) | CAP `checkoutcom-payments` for Storefront Next (`storefrontSupport.storefrontNext`), tasksList, translations, icon, README; `cap-dev` validate → package → submit | Registry validation and security scan pass; install on a clean instance from the CAP |

Estimated total: **8–10 weeks** for one engineer, assuming the phase-0 spike confirms §4.1.

## 7. Repository and tooling

```
checkoutcom-storefront-next/
├── cartridges/
│   ├── int_checkoutcom_next/     # Custom API, webhook controller, scripts, services
│   └── bm_checkoutcom/
├── storefront-next/src/extensions/checkoutcom/
├── impex/{install,uninstall}/
├── app-configuration/            # tasksList.json, translations
├── commerce-app.json
└── test/                         # cartridge unit tests (mocha + proxyquire), extension tests (vitest)
```

- **TypeScript strict** for the extension; follow the template's ESLint/Prettier rules.
- **`cap-dev` skills** for the packaging work: `scaffold-app` (fullstack layout), `generate-service-impex`,
  `generate-site-preferences-impex`, `generate-custom-object-impex`, `validate-impex`, `validate-app`,
  `package-app`, `submit-app`.
- **CI:** typecheck, lint, unit tests, impex validated against the official XSDs (shipped in
  `@salesforce/b2c-tooling-sdk/data/xsd`), CAP validation. No committed build output, so the
  stale-bundle problem from the SFRA repo (v25.2.0) cannot recur.
- **Impex rules learned in SFRA:** no `enabled-flag` on payment methods, no credential
  placeholders, no shipped preference values — the package must be safe to re-import.

## 8. Environment prerequisites

To re-verify in phase 0. Last known state (2026-10-08) of sandbox **zzxp-002**:

- Custom API returned 404 — check the site cartridge path includes the API cartridge and the
  code version is active.
- SLAS client lacks the custom scope (`c_ckoflow`): needs a user with the **SLAS Organization
  Admin** role.
- Flow-enabled Checkout.com account with current-platform keys (`payment-sessions` scope on
  the secret key; `payment-sessions:pay` and `vault-tokenization` on the public key).
- Apple Pay domain enrolment for the MRT hostname; webhook endpoint registered on the
  Checkout.com dashboard pointing at the instance controller.

## 9. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Wallets cannot be made order-first (§4.2) | Two payment sequences to maintain | Spike in phase 0; session-first fallback is already designed |
| Flow's pay button cannot be hidden | Two buttons at checkout | Spike; else drive payment from Flow's button and hide the template's Place Order for Flow |
| Salesforce publishes `sfcc.app.payment.*` extension points mid-project | Rework of the order/payment seam | Keep the order and payment logic behind the Custom API so only its caller changes |
| Template checkout contract changes (`paymentSubmissionRef`) | Breaks the payment step | Pin the template version; contract tests on `onPlaceOrder` |
| SeQura and ABC merchants | Cannot migrate | State it in the listing; they stay on the legacy cartridge |
| Sandbox access (SLAS admin) | Blocks E2E | Request the role in week 1 |

## 10. Decisions needed

1. Approve order-first at the payment step (§4.1) over the Oct 8 session-first design.
2. Product name and app id: replace `checkoutcom-payments` or publish a second app?
3. SeQura: accept the gap, or plan a non-Flow add-on?
4. Is express checkout (§4.3) required for the first release, or a fast-follow?
5. New repository name and ownership.

## Sources

- [FlowComponent reference](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/flow-library-reference/flowcomponent)
- [Collect payment details without an initial payment session](https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/extend-your-flow-integration/collect-payment-details-without-an-initial-payment-session)
- [Configure Salesforce Payments for Storefront Next](https://developer.salesforce.com/docs/commerce/commerce-solutions/guide/sfnext-salesforce-payments.html)
- [Commerce Apps registry](https://github.com/SalesforceCommerceCloud/commerce-apps) (`payment/sf-payments` v1.0.1, `scaffold-app` references)
