const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Main Controller Test', () => {
    context('CKO Main HandleReturn', () => {
        const Path = "CKOMain-HandleReturn";
        it('Should return a 500 response statusCode', () => {
            return Request.post(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main HandleFail', () => {
        const Path = "CKOMain-HandleFail";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main HandleWebhook', () => {
        const Path = "CKOMain-HandleWebhook";
        it('Should return a null', () => {
            return Request.post(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data, null, 'Should return a null');
                });
        });
    });
    context('CKO Main GetApmFilter', () => {
        const Path = "CKOMain-GetApmFilter";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main GetShippingMethods', () => {
        const Path = "CKOMain-GetShippingMethods";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});