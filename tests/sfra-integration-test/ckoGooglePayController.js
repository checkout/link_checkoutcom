const {assert, expect} = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO GooglePay Controller Tests', () => {
    context('GooglePay ExpressCheckout', () => {
        const Path = "GooglePay-ExpressCheckout";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('GooglePay CreateBasketForPDP', () => {
        const Path = "GooglePay-CreateBasketForPDP";
        it('Should return a 500 response statusCode', () => {
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});