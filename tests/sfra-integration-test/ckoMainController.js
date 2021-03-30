'use strict';

const { assert } = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Main Controller Test', () => { //eslint-disable-line
    context('CKO Main HandleReturn', () => { //eslint-disable-line
        const Path = 'CKOMain-HandleReturn';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main HandleFail', () => { //eslint-disable-line
        const Path = 'CKOMain-HandleFail';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('CKO Main HandleWebhook', () => { //eslint-disable-line
        const Path = 'CKOMain-HandleWebhook';
        it('Should return a null', () => { //eslint-disable-line
            return Request.post(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data, null, 'Should return a null');
                });
        });
    });
    context('CKO Main GetApmFilter', () => { //eslint-disable-line
        const Path = 'CKOMain-GetApmFilter';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});
