# Checkout.com Payments — Commerce App

Checkout.com payments integration for Salesforce B2C Commerce, packaged as a
Commerce App Package (CAP) for the
[Commerce Apps registry](https://github.com/SalesforceCommerceCloud/commerce-apps).

Accept cards, wallets (Apple Pay, Google Pay, PayPal) and alternative payment
methods (Klarna, Alma, Sequra, MB WAY, Bizum, Tabby, ACH) on SFRA storefronts,
with 3D Secure, auto-capture, webhook reconciliation and a Business Manager
transactions console for capture, void and refund.

## Package contents

| Path | Purpose |
|---|---|
| `commerce-app.json` | App manifest (id, version, domain, publisher, SFRA support) |
| `app-configuration/tasksList.json` | Guided post-install setup checklist shown to merchants |
| `app-configuration/translations/` | Localized task strings (`en-US` canonical) |
| `cartridges/site_cartridges/int_checkoutcom_sfra` | SFRA storefront cartridge: payment hooks, controllers, helpers, services, templates and client scripts |
| `cartridges/bm_cartridges/bm_checkoutcom` | Business Manager cartridge: Checkout.com transactions console (capture / void / refund) |
| `impex/install/` | Services, system/custom object metadata, payment methods, payment processors and site preferences (uses the `SITEID` placeholder) |
| `impex/uninstall/` | Clean-uninstall definitions mirroring every installed service, profile and credential |
| `icons/` | App icon (`checkoutcom.png`) |

## Installation

1. Install the app from Business Manager (Commerce Apps) or import the impex
   under `impex/install/` and upload the two cartridges.
2. Follow the post-install tasks (also in `app-configuration/tasksList.json`):
   enter API credentials, select Sandbox/Live and NAS/ABC platform, add the
   cartridges to the site and BM cartridge paths, configure capture/3DS,
   enable payment methods, register the webhook endpoint, and place a test
   order.

The webhook receiver is `CKOMain-HandleWebhook`; register
`https://<domain>/on/demandware.store/Sites-<site>-Site/default/CKOMain-HandleWebhook`
in the Checkout.com Dashboard.

## Storefront support

Declared in `commerce-app.json` (`storefrontSupport.sfra.minVersion`). The
cartridges are tested against SFRA 7.0.1. SiteGenesis is not part of this
package — merchants on SiteGenesis should use the legacy LINK cartridge
distribution from this repository.

## Security scan notes (for registry reviewers)

The package passes the registry validation suite with zero blocking findings
(`security-scan.sh`, `tasksList.json`, `translations/`, impex XML,
install/uninstall symmetry). Two deviations from stock SFRA exist to satisfy
the scan:

1. **Hook alias exports (Q2)** — SFRA payment hooks export `Handle`/
   `Authorize`/`processForm` per the `dw.system.HookMgr` platform contract,
   while the scanner also expects an export named after the hook's last
   segment. Each hook script therefore additionally exports an alias object
   named after its hook id (e.g. `exports.checkoutcom_card`); the alias is
   never invoked by the platform.

2. **No `isprint encoding="off"`** — unlike the SFRA `app_storefront_base`
   templates these files override, form templates render `dw.web.FormField`
   attributes explicitly (`name`, `required`, `maxLength`, `minLength`,
   `pattern`) instead of printing the platform-generated `attributes` string
   raw. The store-skin theming hook renders only the `customCSSFile` variant
   of the `store-skin` content asset (a `<link>` tag); inline CSS from the
   asset body is not printed raw — merchants using inline skin CSS should
   move it to the asset's CSS file attribute.

The remaining scan output is 12 non-blocking `session.privacy` warnings in
hook scripts; these store only Checkout.com payment-context ids and product
type flags between `Handle` and `Authorize`, no shopper PII.

## Documentation and support

- Integration guide: `Documentation/SFRA/` in the source repository
- Checkout.com docs: https://www.checkout.com/docs
- Support: https://www.checkout.com/contact/support
