/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Assembles the options Flow starts with, in this order (later wins):
 *
 *   1. the storefront theme (lib/flow-theme.ts)
 *   2. the Business Manager JSON preferences, sent with the payment session
 *   3. the merchant's flow-options.ts
 *   4. the options the integration controls, which nothing can replace
 */
import { createLogger } from '@/lib/logger';
import { customizeFlowOptions, type FlowContext } from '@/extensions/checkoutcom/flow-options';
import type {
    CheckoutWebComponentsOptions,
    CustomizableFlowOptions,
} from '@/extensions/checkoutcom/lib/checkout-web-components';

const logger = createLogger({ extension: 'checkoutcom' });

type PlainObject = Record<string, unknown>;

/** componentOptions keys that would change what is charged or show Flow's own pay button. */
const LOCKED_COMPONENT_OPTIONS = ['amount', 'currency', 'items'];

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge of plain objects; arrays and other values from `override` replace. */
export function mergeDeep(base: unknown, override: unknown): PlainObject | undefined {
    if (!isPlainObject(override)) {
        return isPlainObject(base) ? base : undefined;
    }

    if (!isPlainObject(base)) {
        return override;
    }

    const merged: PlainObject = { ...base };

    Object.entries(override).forEach(([key, value]) => {
        merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? mergeDeep(merged[key], value) : value;
    });

    return merged;
}

function nonEmpty<T extends PlainObject>(value: T | undefined): T | undefined {
    return value && Object.keys(value).length > 0 ? value : undefined;
}

/** Drop the componentOptions the integration controls (amount, currency, items, flow.showPayButton). */
export function sanitizeComponentOptions(componentOptions: unknown): PlainObject | undefined {
    if (!isPlainObject(componentOptions)) {
        return undefined;
    }

    const cleaned: PlainObject = { ...componentOptions };

    LOCKED_COMPONENT_OPTIONS.forEach((key) => delete cleaned[key]);

    if (isPlainObject(cleaned.flow)) {
        const flow: PlainObject = { ...cleaned.flow };

        delete flow.showPayButton;
        cleaned.flow = flow;
    }

    return nonEmpty(cleaned);
}

type Callback<A extends unknown[]> = ((...args: A) => void | Promise<void>) | undefined;

/** Run the integration's callback, then the merchant's; a failing merchant callback is only logged. */
function chain<A extends unknown[]>(own: Callback<A>, theirs: Callback<A>): Callback<A> {
    if (!theirs || theirs === own) {
        return own;
    }

    return async (...args: A) => {
        await own?.(...args);

        try {
            await theirs(...args);
        } catch (error) {
            logger.warn('A flow-options.ts callback failed', { error: String(error) });
        }
    };
}

export interface FlowConfigInput {
    /** From the instance with the payment session. */
    session: {
        publicKey: string;
        environment: 'sandbox' | 'production';
        paymentSession: unknown;
        appearance?: PlainObject | null;
        componentOptions?: PlainObject | null;
        translations?: Record<string, Record<string, string>> | null;
    };
    /** The storefront theme appearance; empty to start Flow without it. */
    theme: PlainObject;
    locale: string;
    context: FlowContext;
    /** The integration's own payment callbacks. */
    own: Pick<CheckoutWebComponentsOptions, 'handleSubmit' | 'onPaymentCompleted' | 'onError'>;
    /** Replaced in tests. */
    customize?: typeof customizeFlowOptions;
}

/** @returns The options to start Flow with */
export function buildFlowOptions(input: FlowConfigInput): CheckoutWebComponentsOptions {
    const { session, own } = input;
    const defaults: CustomizableFlowOptions = {
        locale: input.locale,
        appearance: nonEmpty(mergeDeep(input.theme, session.appearance)),
        componentOptions: nonEmpty(session.componentOptions ?? undefined),
        translations: session.translations ?? undefined,
    };

    let options = defaults;

    try {
        options = (input.customize ?? customizeFlowOptions)({ ...defaults }, input.context) ?? defaults;
    } catch (error) {
        logger.error('flow-options.ts failed; Flow starts without it', { error: String(error) });
    }

    const result: CheckoutWebComponentsOptions = {
        ...options,
        componentOptions: sanitizeComponentOptions(options.componentOptions),
        publicKey: session.publicKey,
        environment: session.environment,
        paymentSession: session.paymentSession,
        handleSubmit: own.handleSubmit,
        onPaymentCompleted: chain(own.onPaymentCompleted, options.onPaymentCompleted),
        onError: chain(own.onError, options.onError),
    };

    (Object.keys(result) as (keyof CheckoutWebComponentsOptions)[]).forEach((key) => {
        if (result[key] === undefined) {
            delete result[key];
        }
    });

    return result;
}
