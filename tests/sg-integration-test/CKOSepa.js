'use strict';

const request = require('request-promise');
const { expect } = require('chai');
const config = require('../config');
const Url = config.sgUrl;

describe('CKO Sepa Controller Test', function() { //eslint-disable-line
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
    context('CKO Sepa Mandate', function() { //eslint-disable-line
        const path = 'CKOSepa-Mandate';
        it('CKOSepa-Mandate should return a string that includes: Error', function() { //eslint-disable-line
            options.uri = Url + path;
            options.method = 'GET';
            return request(options)
                .then(function(response) {
                    expect(response).to.be.a('string').that.include('Error');
                });
        });
    });

    context('CKO Sepa HandleMandate', function() { //eslint-disable-line
        const path = 'CKOSepa-HandleMandate';
        it('CKOSepa-HandleMandate should return: undefined', function() { //eslint-disable-line
            options.uri = Url + path;
            options.method = 'POST';
            return request(options)
                .then(function(response) {
                    expect(response).to.be.an('undefined');
                });
        });
    });
});
