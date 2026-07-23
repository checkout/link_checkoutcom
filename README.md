# Salesforce CommerceCloud Cartridge

## Prerequisites

- [Node.js 18.20.4](https://nodejs.org/en/download/)

## Install dependencies

```
npm install
```

Then
```
npm run build
```

Create dw.json file in the root of the project(SFCC folder).

```
{
    "hostname": "your-sandbox-hostname.demandware.net", //(find it in the swagger sandbox information)
    "username": "AM username like me.myself@company.com", //(your sfcc login id)
    "password": "your_webdav_access_key", //(your passowrd)
    "code-version": "version_to_upload_to" //(find it in Administration > Site development > Code Deployment )
}
```

Upload the configuration using the Prophet Debugger and VS Code.

## Commerce App packaging

This repository can also be packaged as a **Commerce App Package (CAP)** for the
[Salesforce Commerce Apps registry](https://github.com/SalesforceCommerceCloud/commerce-apps)
(the successor to the LINK marketplace):

```
npm run package:app
```

This assembles `dist/commerce-checkoutcom-payments-app-v<version>/` from
[commerce-app/](commerce-app/) (manifest, merchant setup tasks, impex
install/uninstall) plus the `int_checkoutcom_sfra` and `bm_checkoutcom`
cartridges, produces the submission ZIP with its SHA256, and writes the
registry manifest entry to `dist/manifest-entry.json`. See
[commerce-app/README.md](commerce-app/README.md) for the package layout and
submission steps. The SiteGenesis cartridge (`int_checkoutcom`) is not part of
the CAP; it remains available through this repository for legacy installs.

## Documentation

- [Link](https://github.com/checkout/link_checkoutcom/blob/master/Documentation/SFRA/SFRA_Integration_Guide_v26.1.0.docx)