'use strict';

var constants = {
    CKO_MODE: 'ckoMode',
    CKO_SECRET_KEY: 'ckoSecretKey',
    CKO_PUBLIC_KEY: 'ckoPublicKey',
    CKO_PRIVATE_SHARED_KEY: 'ckoPrivateSharedKey',
    CKO_DEBUG_ENABLED: 'ckoDebugEnabled',
    CKO_REGION_END_POINT: 'ckoServiceEndpoint',
    CKO_END_POINTS: /^https?:\/\/[^\/]+/,
    // Sent as the User-Agent of the Business Manager requests, in the SFRA cartridge's format
    CKO_PLATFORM_DATA: 'Checkout.com Business Manager Cartridge - Version: 26.5.0',
    // How many years back the transactions year filter starts
    CKO_FILTER_YEARS_BACK: 2,
};

/*
* Module exports
*/
module.exports = constants;
