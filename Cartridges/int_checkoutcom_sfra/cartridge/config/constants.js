'use strict';

var constants = {
    CKO_BUSINESS_NAME: 'ckoBusinessName',
    CKO_BILLING_DESCRIPTOR1: 'ckoBillingDescriptor1',
    CKO_BILLING_DESCRIPTOR2: 'ckoBillingDescriptor2',
    CKO_BUSINESS_ADDRESS_LINE1: 'ckoBusinessAddressLine1',
    CKO_BUSINESS_ADDRESS_LINE2: 'ckoBusinessAddressLine2',
    CKO_BUSINESS_CITY: 'ckoBusinessCity',
    CKO_BUSINESS_COUNTRY: 'ckoBusinessCountry',
    CKO_MODE: 'ckoMode',
    CKO_DEBUG_ENABLED: 'ckoDebugEnabled',
    CKO_AUTO_CAPTURE: 'ckoAutoCapture',
    CKO_AUTO_CAPTURE_TIME: 'ckoAutoCaptureTime',
    CKO_ENABLE_RISK_FLAG: 'ckoEnableRiskFlag',
    CKO_3DS: 'cko3ds',
    CKO_N3DS: 'ckoN3ds',
    CKO_GOOGLE_PAY_3DS: 'cko3dsGooglePay',
    CKO_SANDBOX_NAS_ENABLED: 'ckoSandboxNASEnabled',
    CKO_LIVE_NAS_ENABLED: 'ckoLiveNASEnabled',
    CKO_SFRA_PLATFORM_DATA: 'ckoSfraPlatformData',
    CKO_IDEAL_ENABLED: 'ckoIdealEnabled',
    CKO_BOLETO_ENABLED: 'ckoBoletoEnabled',
    CKO_BANCONTACT_ENABLED: 'ckoBancontactEnabled',
    CKO_BENEFIT_ENABLED: 'ckoBenefitEnabled',
    CKO_EPS_ENABLED: 'ckoEpsEnabled',
    CKO_KNET_ENABLED: 'ckoKnetEnabled',
    CKO_QPAY_ENABLED: 'ckoQpayEnabled',
    CKO_FAWRY_ENABLED: 'ckoFawryEnabled',
    CKO_MULTIBANCO_ENABLED: 'ckoMultibancoEnabled',
    CKO_POLI_ENABLED: 'ckoPoliEnabled',
    CKO_SEPA_ENABLED: 'ckoSepaEnabled',
    CKO_P24_ENABLED: 'ckoP24Enabled',
    CKO_ALIPAY_ENABLED: 'ckoAlipayEnabled',
    CKO_OXXO_ENABLED: 'ckoOxxoEnabled',
    CKO_MADA_BINS: 'ckoMADABins',
    CKO_MADA_PAYMENTS_ENABLED: 'ckoMada',
    CKO_REGION: 'ckoRegion',
    CKO_REGION_END_POINT: 'ckoRegionEndPoint',
    CKO_END_POINTS: /^https?:\/\/[^\/]+/,
    CKO_KLARNA_PAYMENTINSTRUMENT: 'CHECKOUTCOM_KLARNA',
};

/*
* Module exports
*/
module.exports = constants;
