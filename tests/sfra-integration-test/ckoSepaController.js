'use strict';

const { assert } = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Sepa Controller Tests', () => { //eslint-disable-line
    context('Sepa Mandate', () => { //eslint-disable-line
        const Path = 'CKOSepa-Mandate';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
    context('Sepa Handle Mandate', () => { //eslint-disable-line
        const Path = 'CKOSepa-HandleMandate';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.post(Url + Path)
                .set('content-type', 'application/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});
