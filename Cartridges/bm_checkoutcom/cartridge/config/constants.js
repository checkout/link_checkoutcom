'use strict';

var constants = {
    CKO_BUSINESS_NAME: 'ckoBusinessName',
    CKO_MODE: 'ckoMode',
    CKO_DEBUG_ENABLED: 'ckoDebugEnabled',
    CKO_SANDBOX_NAS_ENABLED: 'ckoSandboxNASEnabled',
    CKO_LIVE_NAS_ENABLED: 'ckoLiveNASEnabled',
    CKO_REGION: 'ckoRegion',
    CKO_REGION_END_POINT: 'ckoRegionEndPoint',
    CKO_END_POINTS: /^https?:\/\/[^\/]+/,
};

/*
* Module exports
*/
module.exports = constants;
