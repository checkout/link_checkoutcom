/**
 * Typings and loader for Checkout.com Checkout Web Components (Flow).
 *
 * There is no official package with web typings, so only the surface this
 * extension uses is declared. The bundle must be loaded from
 * checkout-web-components.checkout.com (never bundled or self-hosted), and as a
 * classic script: the CDN sends no CORS headers, so an ES module import fails.
 * The bundle is UMD and registers `window.CheckoutWebComponents`.
 *
 * CSP: the hosts Flow needs come from lib/csp-contributor.ts (register it in
 * src/middlewares/security-headers.server.ts).
 */

export interface FlowComponent {
    mount(selectorOrElement: string | HTMLElement): FlowComponent;
    unmount(): void;
    submit(): void;
    isValid(): boolean;
    isAvailable(): Promise<boolean>;
}

export interface PaymentResponse {
    id: string;
    status?: string;
}

export interface CheckoutError {
    code?: string;
    message?: string;
}

export interface SubmitData {
    session_data: string;
}

/** What `handleClick` returns for wallets: `continue: false` stops the payment. */
export interface ClickResult {
    continue: boolean;
}

export interface CheckoutWebComponentsOptions {
    publicKey: string;
    environment: 'sandbox' | 'production';
    paymentSession: unknown;
    locale?: string;
    /** Colours, fonts and borders: the storefront theme, then the Flow Appearance site preference. */
    appearance?: Record<string, unknown>;
    /** Per payment method settings (card, applepay, googlepay, flow...): the Flow Component Options site preference. */
    componentOptions?: Record<string, unknown>;
    /** Custom text per locale: the Flow Translations site preference. */
    translations?: Record<string, Record<string, string>>;
    /** Called when the shopper or `submit()` submits; must return the submit response unmodified. */
    handleSubmit?: (component: FlowComponent, submitData: SubmitData) => Promise<unknown>;
    /** Called when a wallet button (Apple Pay, Google Pay, PayPal) is clicked. */
    handleClick?: (component: FlowComponent) => Promise<ClickResult> | ClickResult;
    onReady?: (component: FlowComponent) => void;
    onChange?: (component: FlowComponent) => void;
    onPaymentCompleted?: (component: FlowComponent, paymentResponse: PaymentResponse) => void | Promise<void>;
    onError?: (component: FlowComponent, error: CheckoutError) => void | Promise<void>;
}

/**
 * The options the integration controls: the session, keys and payment
 * submission. Whatever a customisation sets for these is replaced.
 */
export type LockedFlowOption = 'publicKey' | 'environment' | 'paymentSession' | 'handleSubmit';

/** The options a merchant can customise in flow-options.ts. */
export type CustomizableFlowOptions = Omit<CheckoutWebComponentsOptions, LockedFlowOption>;

export interface CheckoutInstance {
    create(name: 'flow', options?: { showPayButton?: boolean }): FlowComponent;
    /**
     * Update the amount shown by Flow (Apple Pay and Google Pay sheets) after it
     * has mounted, in minor units. The amount actually charged is set when the
     * payment is submitted (handleSubmit), from the order.
     */
    update?(options: { amount: number }): void;
}

export type LoadCheckoutWebComponents = (options: CheckoutWebComponentsOptions) => Promise<CheckoutInstance>;

declare global {
    interface Window {
        CheckoutWebComponents?: LoadCheckoutWebComponents;
    }
}

const SCRIPT_SRC = 'https://checkout-web-components.checkout.com/index.js';

let loading: Promise<LoadCheckoutWebComponents> | null = null;

/** Load the bundle from the Checkout.com CDN once and return its loader function. */
export function loadCheckoutWebComponents(): Promise<LoadCheckoutWebComponents> {
    if (window.CheckoutWebComponents) {
        return Promise.resolve(window.CheckoutWebComponents);
    }

    loading ??= new Promise<LoadCheckoutWebComponents>((resolve, reject) => {
        const script = document.createElement('script');

        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => {
            if (window.CheckoutWebComponents) {
                resolve(window.CheckoutWebComponents);
            } else {
                reject(new Error('Checkout Web Components did not initialize'));
            }
        };
        script.onerror = () => {
            loading = null;
            reject(new Error('Checkout Web Components could not be loaded'));
        };
        document.head.appendChild(script);
    });

    return loading;
}
