'use strict';

const { assert } = require('chai');
const Request = require('superagent');
const config = require('../config');
const Url = config.sfraUrl;

describe('CKO Klarna Controller Tests', () => { //eslint-disable-line
    context('Klarna Session', () => { //eslint-disable-line
        const Path = 'CKOKlarna-KlarnaSession';
        it('Should return a 500 response statusCode', () => { //eslint-disable-line
            return Request.get(Url + Path)
                .set('content-type', 'applicaiton/json')
                .end((data) => {
                    assert.equal(data.response.statusCode, 500, 'Should return a 500 response statusCode');
                });
        });
    });
});
