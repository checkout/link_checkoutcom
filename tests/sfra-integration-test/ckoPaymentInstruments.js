const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO PaymentInstruments Tests', () => {
    context('PaymentInstruments SavePayment', () => {
        const Path = "PaymentInstruments-SavePayment";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });

    context('PaymentInstruments List', () => {
        const Path = "PaymentInstruments-List";
        it('Should return a null', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data, null, 'Should return a null');
                });
        });
    });
});