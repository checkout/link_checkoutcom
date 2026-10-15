const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

// AlipayHK has no dedicated controller of its own - it is authorized via the
// CHECKOUTCOM_ALIPAYHK processor hook and returns through the generic CKOMain
// routes, so this file exercises that shared surface for an unauthenticated
// caller with no valid order/session context.
describe('CKO AlipayHK (CKOMain shared routes) Tests', () => {
    context('CKO Main HandleReturn for an AlipayHK redirect', () => {
        const Path = "CKOMain-HandleReturn";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path + "?cko-session-id=test")
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main HandleWebhook for an AlipayHK payment_captured event', () => {
        const Path = "CKOMain-HandleWebhook";
        it('Should return a null', () => {
            return Request.post(Url + Path)
                .set('content-type', 'application/json')
                .send({
                    type: 'payment_captured',
                    data: {
                        id: 'pay_test',
                        reference: 'TEST-ORDER',
                        metadata: { payment_processor: 'CHECKOUTCOM_ALIPAYHK' },
                    },
                })
                .end((data) => {
                    assert.equal(data, null, 'Should return a null');
                });
        });
    });
});
