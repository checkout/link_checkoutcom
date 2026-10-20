/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Flow's default look: the storefront theme. Reads the theme's CSS custom
 * properties when Flow mounts and maps them to Flow `appearance` keys, so Flow
 * matches the storefront (including a custom or dark theme) with nothing to
 * configure. The Flow Appearance site preference and flow-options.ts apply on
 * top of this.
 */

/** Flow appearance colour key -> storefront theme variable. */
const COLOR_TOKENS: Record<string, string> = {
    colorAction: '--primary',
    colorBackground: '--background',
    colorBorder: '--border',
    colorError: '--destructive',
    colorFormBackground: '--background',
    colorFormBorder: '--input',
    colorInverse: '--primary-foreground',
    colorOutline: '--ring',
    colorPrimary: '--foreground',
    colorSecondary: '--muted-foreground',
    colorSuccess: '--success',
};

/** Flow appearance font keys; each gets the theme's font family. */
const FONT_KEYS = ['button', 'footnote', 'input', 'label', 'subheading'];

let canvasContext: CanvasRenderingContext2D | null | undefined;

function readCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Convert any colour the browser understands (hex, rgb(), hsl(), oklch()...)
 * to the #RRGGBB form Flow expects, by painting it on a 1x1 canvas.
 * @returns The hex colour, or undefined when it is not a colour or fully transparent
 */
export function toHexColor(value: string): string | undefined {
    if (!value) {
        return undefined;
    }

    if (canvasContext === undefined) {
        const canvas = document.createElement('canvas');

        canvas.width = 1;
        canvas.height = 1;
        canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    }

    const context = canvasContext;

    if (!context) {
        return /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
    }

    // An invalid colour leaves fillStyle unchanged: detect it with two sentinels
    context.fillStyle = '#000001';
    context.fillStyle = value;
    const first = context.fillStyle;

    context.fillStyle = '#000002';
    context.fillStyle = value;

    if (first !== context.fillStyle) {
        return undefined;
    }

    context.clearRect(0, 0, 1, 1);
    context.fillRect(0, 0, 1, 1);

    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;

    if (alpha === 0) {
        return undefined;
    }

    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** A CSS length in px (Flow's borderRadius), from px or rem; anything else (calc()...) is skipped. */
function toPixels(value: string): string | undefined {
    const match = /^(\d+(?:\.\d+)?)(px|rem)?$/.exec(value);

    if (!match) {
        return undefined;
    }

    const size =
        match[2] === 'rem'
            ? Number(match[1]) * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)
            : Number(match[1]);

    return `${size}px`;
}

/** @returns The Flow appearance derived from the storefront theme; empty on the server */
export function getThemeAppearance(): Record<string, unknown> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return {};
    }

    const appearance: Record<string, unknown> = {};

    Object.entries(COLOR_TOKENS).forEach(([key, variable]) => {
        const color = toHexColor(readCssVar(variable));

        if (color) {
            appearance[key] = color;
        }
    });

    const radius = toPixels(readCssVar('--radius-ui') || readCssVar('--radius'));

    if (radius) {
        appearance.borderRadius = [radius, radius];
    }

    const fontFamily = readCssVar('--font-sans');

    if (fontFamily) {
        FONT_KEYS.forEach((key) => {
            appearance[key] = { fontFamily };
        });
    }

    return appearance;
}
