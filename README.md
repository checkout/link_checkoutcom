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

## Documentation

- [Link](https://github.com/checkout/link_checkoutcom/blob/master/Documentation/SFRA/SFRA_Integration_Guide_v24.2.0.docx)