# Checkout.com Flow for SFRA

Flow is Checkout.com's drop-in payment component ([Checkout Web Components](https://www.checkout.com/docs/payments/accept-payments/flow)).
It renders every payment method enabled on the Checkout.com account — cards, wallets,
Buy Now Pay Later, local methods — from a single embedded form, and handles 3DS,
redirects and wallet sheets itself.

This component lives alongside the existing integrations. **Nothing in the SiteGenesis
cartridge (`int_checkoutcom`) or in the direct SFRA integration (Card, APM, Apple Pay,
Google Pay, PayPal, Klarna, Alma, MB WAY, SeQura, Bizum, Tabby, ACH) is changed or
replaced.** Flow is registered as one more payment method and can be switched on or off
independently of the others.

> Flow and the individual Checkout.com payment methods both offer the same underlying
> methods, so merchants normally enable *either* Flow *or* the direct methods, not both.
> Having both enabled works, but shoppers will see the same method twice.

---

## Architecture

Flow is an order-first integration, which means the SFRA order always exists before any
money moves and the Checkout.com `reference` is always the real SFCC order number.

```
Billing step              Place Order                       Place order step         Confirmation
───────────────────────────────────────────────────────────────────────────────────────────────
Shopper picks the   →  CheckoutServices-PlaceOrder  →  CKOFlow-Session (AJAX)   →  Order-Confirm
"Checkout.com Flow"    creates the order and calls     POST /payment-sessions;
tab                    the Authorize hook, which       Flow is mounted inline
                       returns flowSessionUrl (and     below the payment summary
                       CKOFlow-Show as fallback)
                                                       Shopper pays
                                                          │
                                        ┌─────────────────┴──────────────────┐
                                        │                                    │
                              onPaymentCompleted                   offsite redirect
                                        │                                    │
                              CKOFlow-Complete (AJAX)          CKOFlow-HandleReturn (GET)
                                        └─────────────────┬──────────────────┘
                                                          │
                                        GET /payments/{id}, verify, place order
```

Both settlement routes converge on `flowPaymentHelper.completeOrder()`, which re-reads the
payment from the gateway, checks that its `reference`, `amount` and `currency` match the
order, and only then places it. If the order cannot be placed the authorization is voided
so the shopper's funds are never stranded.

Because `reference` is the order number, the existing `CKOMain-HandleWebhook` handlers
settle Flow payments (captures, refunds, voids, delayed `payment_approved`) with no extra
work — the metadata carries `payment_processor: CHECKOUTCOM_FLOW`.

### Why Flow is mounted after Place Order

SFRA takes the payment authorization server side, during `CheckoutServices-PlaceOrder`,
while Flow takes it client side. Creating the order first and only then mounting Flow is
what lets both be true at once.

Where Flow is shown is chosen with the `ckoFlowDisplayMode` preference.

**Inline (default).** After Place Order, `js/flow/flowInline.js` (bundled into `checkout.js`) fetches the payment
session from `CKOFlow-Session` and mounts Flow in a panel below the payment summary, on the
same checkout page. Because the order now exists and the basket has been consumed, the
step *Edit* buttons and *Place Order* are hidden; the panel's cancel link
(`CKOFlow-HandleFail`) fails the order and restores the basket. A shopper who reloads or
leaves the page gets their basket back from the existing `Cart-Show` / `Cart-MiniCart`
reclaim.

**Separate page.** The shopper is redirected to `CKOFlow-Show`, a standalone Flow page.
In inline mode that page is also used as the fallback whenever the inline mount is not
possible (for example a network error while fetching the session), so
an order can always still be paid for.

---

## Files

### Added

| File | Purpose |
| --- | --- |
| `cartridge/config/ckoFlowConfig.js` | Flow preference ids, service id prefixes and gateway status constants |
| `cartridge/scripts/services/flowSessions.js` | `POST /payment-sessions` service wrapper (sandbox + live) |
| `cartridge/scripts/helpers/flowHelper.js` | Builds the payment session, reads payments back, voids |
| `cartridge/scripts/helpers/flowPaymentHelper.js` | Turns a confirmed payment into a placed order |
| `cartridge/scripts/hooks/payment/processor/CHECKOUTCOM_FLOW.js` | `Handle` / `Authorize` |
| `cartridge/scripts/hooks/payment/processor/CHECKOUTCOM_FLOW_form_processor.js` | `processForm` |
| `cartridge/controllers/CKOFlow.js` | `Session`, `Show`, `Complete`, `HandleReturn`, `HandleFail` |
| `cartridge/templates/default/checkout/flow/flowPayment.isml` | The standalone Flow page (fallback) |
| `cartridge/templates/default/checkout/billing/paymentOptions/tabs/flowTab.isml` | Billing step tab |
| `cartridge/templates/default/checkout/billing/paymentOptions/contents/flowContent.isml` | Billing step tab content |
| `cartridge/client/default/js/flow/flowComponent.js` | Loads the bundle, mounts the component, settles the order |
| `cartridge/client/default/js/flow/flowInline.js` | Mounts Flow inline in the place order step |
| `cartridge/client/default/js/flow.js` | Boots the component on the standalone Flow page |
| `cartridge/static/default/css/flow.css` | Flow page, inline panel and tab styles |

### Modified (additive only)

| File | Change |
| --- | --- |
| `cartridge/scripts/hooks.json` | Two new hook registrations |
| `cartridge/controllers/CheckoutServices.js` | `PlaceOrder` passes `flowSessionUrl` through to the client |
| `cartridge/client/default/js/checkout/checkout.js` | Place order step mounts Flow inline when `flowSessionUrl` is returned |
| `.../paymentOptions/paymentOptionsTabs.isml` | One new `isif` block |
| `.../paymentOptions/paymentOptionsContent.isml` | One new `isif` block |
| `cartridge/templates/resources/cko.properties` | New `cko.flow.*` keys |
| `metadata/services.xml` | `cko.flow.sessions.{sandbox,live}` credentials and services |
| `metadata/meta/system-object-definitions.xml` | `ckoFlow*` site preferences and the "CKO [19] Flow Settings" group |
| `metadata/sites/{RefArch,RefArchGlobal}/payment-processors.xml` | `CHECKOUTCOM_FLOW` processor |
| `metadata/sites/{RefArch,RefArchGlobal}/payment-methods.xml` | `CHECKOUTCOM_FLOW` method, disabled by default |

The SiteGenesis site metadata (`metadata/sites/SiteGenesis*`) is deliberately untouched —
Flow is SFRA only.

---

## Installation

1. **Build and upload the cartridge**

   ```bash
   npm run build
   npm run upload:sfra
   ```

   `npm run build` compiles `client/default/js/flow.js` to
   `static/default/js/flow.js`, the same way the MB WAY, Bizum and ACH scripts are built.

2. **Import the metadata** in Business Manager
   (_Administration → Site Development → Site Import & Export_).

   Import `metadata.zip` from the repository root. The same file is used for a **new
   install** and for **upgrading** an existing one (for example to add Flow): there is no
   separate Flow or upgrade package. It installs the whole cartridge in one pass — Flow
   and every individual Checkout.com payment method.

   `metadata.zip` is safe to re-import over an existing configuration:

   - **Payment methods ship without an `enabled-flag`.** New methods, such as
     `CHECKOUTCOM_FLOW` on an upgrade, are created disabled, and methods that already
     exist keep whatever the merchant set. Step 3 is where you choose what to enable.
   - **Service credentials ship without `user-id` / `password`.** The secret key is read
     from the site preferences at runtime, so there is nothing to set there, and an
     import never blanks a value.
   - **No site preference values are shipped.** Preference definitions and groups are
     imported, with their defaults, but existing values are left alone.

   What an import does still reset to the shipped values: each payment method's name,
   processor and **country / currency restrictions**, and each service's settings
   (enabled, logging, profile, URL). Re-apply any customisation of those after importing.

   To rebuild the archive after changing anything under `metadata/`:

   ```bash
   rm -f metadata.zip && zip -rq metadata.zip metadata -x "*.DS_Store"
   ```

   The archive's root folder name must match the zip file name or BM rejects the import.

3. **Choose Flow or the individual payment methods**
   (_Merchant Tools → Ordering → Payment Methods_).
   - **Flow:** enable `CHECKOUTCOM_FLOW` and leave the individual Checkout.com methods
     (`CHECKOUTCOM_CARD`, `CHECKOUTCOM_APM`, `CHECKOUTCOM_KLARNA`, …) disabled.
     Optionally upload a thumbnail; the billing tab renders without one. Restrict
     countries and currencies here if you need to.
   - **Individual methods:** leave `CHECKOUTCOM_FLOW` disabled and enable the methods
     you want, as in previous releases.

   Switching later is just a matter of flipping these flags; no re-import is needed.

4. **Configure the preferences**
   (_Merchant Tools → Site Preferences → Custom Preferences → Checkout.com Flow Settings_):

   | Preference | Type | Default | Notes |
   | --- | --- | --- | --- |
   | `ckoFlowEnabled` | boolean | `false` | Master switch. The billing tab is hidden while this is off. |
   | `ckoFlowCapture` | boolean | `true` | Auto capture. The cartridge-wide `ckoAutoCaptureTime` also applies. |
   | `ckoFlowPaymentMethods` | string | empty | Optional comma separated allow-list, e.g. `card,googlepay,klarna`. Empty means "everything enabled on the account". |
   | `ckoFlowAppearance` | text | empty | Optional JSON for the Flow `appearance` option, e.g. `{"colorAction":"#000000"}`. Invalid JSON is logged and ignored. |
   | `ckoFlowDisplayMode` | enum | `inline` | `inline` shows Flow in the checkout place order step, below the payment summary; `page` redirects to the separate Flow page. |

   Flow reuses the existing cartridge configuration for everything else: `ckoMode`,
   the ABC/NAS keys, `ckoProcessingChannelId`, `ckoBusinessName`, the billing descriptor,
   `cko3ds` / `ckoN3ds`, `ckoEnableRiskFlag` and `ckoDebugEnabled`.

5. **Set the service credentials**. The imported services point at
   `https://api.sandbox.checkout.com/payment-sessions` and
   `https://api.checkout.com/payment-sessions`. The secret key is taken from the site
   preferences at runtime, so the credential user id and password stay empty. If you use
   a regional endpoint, `ckoRegionEndPoint` is applied to these services too.

6. **Keep the webhook configured.** Flow payments use the same
   `CKOMain-HandleWebhook` endpoint as the rest of the cartridge; no additional webhook
   is needed.

---

## Notes and limitations

- **Processing channel.** `ckoProcessingChannelId` is required on NAS accounts. It is
  only sent when set, so ABC accounts are unaffected.
- **Risk / device data.** The session sends `risk.enabled` only. The Flow component
  collects the device and network signals itself on the storefront, so — unlike the
  direct card and APM flows, which send `risk.device.network` and the Risk.js
  `risk.device_session_id` to `/payments` — there is nothing for the server to add.
  `/payment-sessions` rejects those fields (`risk_device_invalid`). `riskJsEnabled` and
  the Risk.js snippet in `htmlHead.isml` are therefore not involved in the Flow flow.
- **Blank optional fields.** SFCC returns `null` for address fields the shopper left
  empty (address line 2, state for countries that have none, the phone country code) and
  `/payment-sessions` rejects those keys rather than ignoring them. `flowHelper.pruneEmpty()`
  strips them from the request; `false` and `0` are preserved. The customer, billing and
  shipping projections themselves are the same `ckoHelper` helpers the direct card
  integration uses, with the phone built as a bare `{ number }` exactly as
  `cardHelper.buildRequest()` does.
- **Line items.** Shipping is always sent as its own item, and tax is sent as its own
  item under a net taxation policy, so the items always add up to the session amount.
  BNPL methods rendered by Flow require this.
- **Pending methods.** Delayed notification methods (Multibanco, Fawry, …) return
  `Pending`. The order is placed with payment status *Not Paid* and the existing webhook
  handlers mark it paid when the shopper settles the voucher.
- **Saved cards.** Flow stores credentials on the Checkout.com side, not in the SFCC
  customer wallet. The cartridge's own saved-card feature (`CHECKOUTCOM_CARD`) is
  unchanged and continues to use the SFCC wallet.
- **Browser support.** Checkout Web Components ships as an ES module, so the Flow page
  requires a browser with ES module support. The repository `browserslist` still lists
  `ie >= 10` for the rest of the storefront; IE cannot render Flow. Merchants who must
  support it should keep the direct card integration enabled for those shoppers.
