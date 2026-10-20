/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * MERCHANT CUSTOMISATION POINT for Checkout.com Flow. Optional.
 *
 * This is the one file of the Checkout.com extension meant to be edited, and
 * new versions of the app do not change it: keep your Flow code here rather
 * than in the extension's components, which change with every release. When
 * you review an app upgrade pull request, make sure it keeps your version of
 * this file.
 *
 * `customizeFlowOptions` runs every time Flow mounts, after the defaults
 * (the storefront theme) and the Business Manager JSON preferences (Flow
 * Appearance, Flow Component Options, Flow Translations) are applied. Use it
 * for what JSON cannot express: values from the basket, extra callbacks
 * (onReady, onChange, handleClick, onPaymentCompleted, onError), logic per
 * locale or device. Plain styling is easier in the Flow Appearance preference.
 *
 * The integration keeps control of what makes payment work: publicKey,
 * environment, paymentSession and handleSubmit are always its own, and
 * componentOptions amount, currency, items and showPayButton are removed (the
 * order sets what is charged; the storefront's Place Order button pays). Your
 * onPaymentCompleted and onError run after the integration's own. If this
 * function throws, it is ignored and the options before it are used.
 *
 * Reference: https://www.checkout.com/docs/payments/accept-payments/accept-a-payment-on-your-website/flow-library-reference/checkoutwebcomponents
 *
 * Example (pre-fill the cardholder name, track when Flow is ready):
 *
 *     export function customizeFlowOptions(options: CustomizableFlowOptions, { basket }: FlowContext) {
 *         return {
 *             ...options,
 *             componentOptions: {
 *                 ...options.componentOptions,
 *                 card: { data: { cardholderName: basket?.billingAddress?.fullName ?? '' } },
 *             },
 *             onReady: () => (window as { dataLayer?: unknown[] }).dataLayer?.push({ event: 'cko_flow_ready' }),
 *         };
 *     }
 */
import type { ShopperBasketsV2 } from '@/scapi';
import type { CustomizableFlowOptions } from '@/extensions/checkoutcom/lib/checkout-web-components';

export type { CustomizableFlowOptions };

/** What the customisation can read. */
export interface FlowContext {
    /** The shopper's basket (Shopper Baskets V2). */
    basket: ShopperBasketsV2.schemas['Basket'] | undefined;
    /** The storefront locale, e.g. en-US. */
    locale: string;
}

/**
 * @param options The Flow options so far (theme, then the Business Manager preferences)
 * @param _context The basket and locale (rename to `context` when you use it)
 * @returns The options to start Flow with
 */
export function customizeFlowOptions(options: CustomizableFlowOptions, _context: FlowContext): CustomizableFlowOptions {
    return options;
}
