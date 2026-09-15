/**
 * Shared types for the Checkout.com Storefront Next payment components.
 */

/** Payment methods exposed by the backend cartridge via SCAPI. */
export type CkoPaymentMethodId =
    | 'CREDIT_CARD'
    | 'CHECKOUTCOM_CARD'
    | 'CHECKOUTCOM_APM'
    | 'CHECKOUTCOM_GOOGLE_PAY'
    | 'CHECKOUTCOM_APPLE_PAY'
    | 'CHECKOUTCOM_PAYPAL'
    | 'CHECKOUTCOM_KLARNA'
    | 'CHECKOUTCOM_ALMA'
    | 'CHECKOUTCOM_MBWAY'
    | 'CHECKOUTCOM_BIZUM'
    | 'CHECKOUTCOM_SEQURA'
    | 'CHECKOUTCOM_TABBY'
    | 'CHECKOUTCOM_ACH'

/** Result of client-side Frames tokenization. */
export interface CkoCardToken {
    token: string
    bin?: string
    scheme?: string
    expiresOn?: string
}

/** Custom properties sent on the SCAPI payment-instrument request. */
export interface CkoPaymentInstrumentCustomProps {
    c_ckoToken?: string
    c_deviceSessionId?: string
    c_saveCard?: boolean
    c_storedPaymentUUID?: string
    c_cardType?: string
    c_cardBin?: string
    c_ckoTabbyContextId?: string
    c_ckoTabbyPaymentType?: string
    c_sequraProductType?: string
    c_apmType?: string
}

/** Order creation outcome mapped from the SCAPI order response. */
export interface CkoOrderOutcome {
    orderNo: string
    orderToken: string
    /** Present when the shopper must complete 3DS or an APM page. */
    redirectUrl?: string
}

/** Async payment polling status returned by the payment-status custom endpoint. */
export type CkoAsyncPaymentStatus = 'pending' | 'confirmed' | 'failed' | 'error' | 'unsupported'

export interface CkoPaymentStatusResponse {
    status: CkoAsyncPaymentStatus
}

/** APM filter configuration returned by the apm-eligibility custom endpoint. */
export interface CkoApmEligibilityResponse {
    country: string
    currency: string
    /** Method key (e.g. 'klarna') to eligibility. */
    methods: Record<string, boolean>
}
