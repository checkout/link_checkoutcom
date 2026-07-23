# App icon

Place the Checkout.com app icon here before packaging:

- **Filename:** `checkoutcom.png` (must match the `iconName` used in the registry manifest entry)
- **Format:** PNG, SVG, JPG or JPEG (PNG recommended)
- **Size:** 512x512 px for raster formats, scalable for SVG
- **Content:** official Checkout.com brand mark — icons are shown on the app card in Business Manager and must be unique per ISV

The packaging script (`npm run package:app`) warns if the icon is missing; the
registry CI extracts it into `commerce-apps-manifest/icons/` on merge.
