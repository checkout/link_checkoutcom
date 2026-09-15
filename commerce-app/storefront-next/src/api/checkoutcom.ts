/**
 * SCAPI client helpers for the Checkout.com custom endpoints and the standard
 * Shopper Baskets/Orders payment calls.
 *
 * In a Storefront Next app these calls belong in route loaders/actions using
 * the generated SCAPI clients (`sfnext scapi` against the checkoutcom custom
 * API schema). The fetch-based fallbacks below document the exact wire
 * contract for teams that have not generated typed clients yet.
 */
import type {
    CkoApmEligibilityResponse,
    CkoOrderOutcome,
    CkoPaymentInstrumentCustomProps,
    CkoPaymentMethodId,
    CkoPaymentStatusResponse
} from '../types'

export interface ScapiConfig {
    /** e.g. https://{shortCode}.api.commercecloud.salesforce.com */
    baseUrl: string
    organizationId: string
    siteId: string
    /** Shopper access token (guest or registered). */
    accessToken: string
}

const CUSTOM_API_BASE = (config: ScapiConfig): string =>
    `${config.baseUrl}/custom/checkoutcom/v1/organizations/${config.organizationId}`

const SHOPPER_BASKETS_BASE = (config: ScapiConfig): string =>
    `${config.baseUrl}/checkout/shopper-baskets/v2/organizations/${config.organizationId}`

const SHOPPER_ORDERS_BASE = (config: ScapiConfig): string =>
    `${config.baseUrl}/checkout/shopper-orders/v1/organizations/${config.organizationId}`

async function scapiFetch<T>(config: ScapiConfig, url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
            ...init?.headers
        }
    })
    if (!response.ok) {
        const body = await response.text()
        throw new Error(`SCAPI request failed (${response.status}): ${body}`)
    }
    return (await response.json()) as T
}

/**
 * Add a Checkout.com payment instrument to the basket. The backend
 * basket.payment_instrument hooks translate the c_* custom properties into
 * the gateway payment context.
 */
export async function addPaymentInstrument(
    config: ScapiConfig,
    basketId: string,
    paymentMethodId: CkoPaymentMethodId,
    amount: number,
    customProps: CkoPaymentInstrumentCustomProps
): Promise<unknown> {
    const url = `${SHOPPER_BASKETS_BASE(config)}/baskets/${basketId}/payment-instruments?siteId=${config.siteId}`
    return scapiFetch(config, url, {
        method: 'POST',
        body: JSON.stringify({
            paymentMethodId,
            amount,
            ...customProps
        })
    })
}

/**
 * Create the order. The backend order hooks run Checkout.com authorization:
 * a returned c_ckoRedirectUrl means the shopper must complete 3DS or an APM
 * page before the order is placed.
 */
export async function createOrder(config: ScapiConfig, basketId: string): Promise<CkoOrderOutcome> {
    const url = `${SHOPPER_ORDERS_BASE(config)}/orders?siteId=${config.siteId}`
    const order = await scapiFetch<{
        orderNo: string
        orderToken: string
        c_ckoRedirectUrl?: string
    }>(config, url, {
        method: 'POST',
        body: JSON.stringify({basketId})
    })
    return {
        orderNo: order.orderNo,
        orderToken: order.orderToken,
        redirectUrl: order.c_ckoRedirectUrl
    }
}

/**
 * Poll the async payment status (MB WAY, Bizum, ACH). On 'confirmed' the
 * backend has placed the order. POST because approval places the order.
 */
export async function getPaymentStatus(
    config: ScapiConfig,
    orderNo: string,
    orderToken: string
): Promise<CkoPaymentStatusResponse> {
    const url = `${CUSTOM_API_BASE(config)}/payment-status?siteId=${config.siteId}`
    return scapiFetch<CkoPaymentStatusResponse>(config, url, {
        method: 'POST',
        body: JSON.stringify({orderNo, orderToken})
    })
}

/**
 * Complete the gateway return leg (3DS/APM redirect back to the storefront).
 * Pass the cko-session-id query parameter the gateway appends to the return URL.
 */
export async function completeReturn(
    config: ScapiConfig,
    ckoSessionId: string,
    success: boolean
): Promise<{outcome: 'confirmed' | 'failed' | 'invalid'; orderNo?: string}> {
    const url = `${CUSTOM_API_BASE(config)}/return?siteId=${config.siteId}`
    return scapiFetch(config, url, {
        method: 'POST',
        body: JSON.stringify({ckoSessionId, success})
    })
}

/** Fetch APM eligibility for the shopper's country and basket currency. */
export async function getApmEligibility(
    config: ScapiConfig,
    countryCode: string,
    currencyCode: string
): Promise<CkoApmEligibilityResponse> {
    const url = `${CUSTOM_API_BASE(config)}/apm-eligibility?siteId=${config.siteId}&c_country=${encodeURIComponent(
        countryCode
    )}&c_currency=${encodeURIComponent(currencyCode)}`
    return scapiFetch<CkoApmEligibilityResponse>(config, url)
}

/** Look up scheme metadata for a card BIN (Mada / Cartes Bancaires handling). */
export async function getBinLookup(
    config: ScapiConfig,
    bin: string
): Promise<{isMada: boolean; isCartesBancaires: boolean}> {
    const url = `${CUSTOM_API_BASE(config)}/bin-lookup?siteId=${config.siteId}&c_bin=${encodeURIComponent(bin)}`
    return scapiFetch(config, url)
}

/**
 * Create a gateway payment context (Klarna, Tabby). Operates on the
 * shopper's current basket resolved from the access token.
 */
export async function createPaymentContext(
    config: ScapiConfig,
    type: 'klarna' | 'tabby',
    billingCountry?: string
): Promise<{id: string; paymentType?: string}> {
    const url = `${CUSTOM_API_BASE(config)}/payment-contexts?siteId=${config.siteId}`
    return scapiFetch(config, url, {
        method: 'POST',
        body: JSON.stringify({type, billingCountry})
    })
}
