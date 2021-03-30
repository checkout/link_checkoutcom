'use strict';

const request = require('request-promise');
const { expect } = require('chai');
const config = require('../config');
const Url = config.sgUrl;

describe('CKO Klarna Controller Test', function() { //eslint-disable-line
    this.timeout(25000);
    beforeEach(function() { //eslint-disable-line
        // ...some logic before each test is run
    });
    var options = {
        method: '',
        uri: '',
        json: true,
        headers: {
            'User-Agent': 'Request-Promise',
        },
    };
    context('CKO Klarna Session', function() { //eslint-disable-line
        const path = 'CKOKlarna-KlarnaSession';
        it('CKOKlarna-KlarnaSession should return a string that includes: Basket Not Found', function() { //eslint-disable-line
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function(response) {
                    expect(response).to.be.a('string').that.include('Basket Not Found');
                });
        });
    });
});
