'use strict';

const { assert } = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Checkout Services Controller Tests', () => { //eslint-disable-line
    context('Checkout Services Get', () => { //eslint-disable-line
        const Path = 'CheckoutService-Get';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('Checkout Services SubmitPayment', () => { //eslint-disable-line
        const Path = 'CheckoutService-SubmitPayment';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('Checkout Services PlaceOrder', () => { //eslint-disable-line
        const Path = 'CheckoutService-PlaceOrder';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});
