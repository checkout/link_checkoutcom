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

The package passes the registry validation suite (`tasksList.json`,
`translations/`, impex XML, install/uninstall symmetry). Two categories of
`security-scan.sh` findings remain by design and are justified:

1. **`Hook '<name>' expects export '<suffix>'` (Q2)** — the scanner assumes a
   hook exports a function named after the hook's last segment. SFRA payment
   hooks follow the platform contract instead: `app.payment.processor.*`
   scripts export `Handle`/`Authorize` and `app.payment.form.processor.*`
   scripts export `processForm`, invoked explicitly via
   `dw.system.HookMgr.callHook(hookName, 'Handle' | 'Authorize' | 'processForm', ...)`
   by SFRA's `checkoutHelpers`. Renaming these exports would break the
   platform integration. All hook scripts exist, parse, and contain
   try/catch error handling.

2. **`ISML isprint with encoding="off"`** — every occurrence prints
   `dw.web.FormField.attributes` (platform-generated HTML attribute strings
   such as `name=... maxlength=... required`) or the SFRA theming hook
   (`skin.js renderSkin()`). This is the same pattern used by the SFRA
   `app_storefront_base` templates these files override; HTML-encoding the
   values would break form rendering. No user-controlled data is printed
   with encoding disabled.

## Documentation and support

- Integration guide: `Documentation/SFRA/` in the source repository
- Checkout.com docs: https://www.checkout.com/docs
- Support: https://www.checkout.com/contact/support
