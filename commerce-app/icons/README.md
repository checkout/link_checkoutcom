# App icon

`checkoutcom.svg` is the Checkout.com brand mark shown on the app card in
Business Manager. The filename must match the `iconName` in the registry
manifest entry (`scripts/build-commerce-app.js` auto-detects
`checkoutcom.<svg|png|jpg|jpeg>` when generating `dist/manifest-entry.json`).

Registry CI extracts image files from this directory into
`commerce-apps-manifest/icons/` on merge; this README is not extracted.
Keep the icon square (SVG, or ≥176px raster) and unique to Checkout.com.
