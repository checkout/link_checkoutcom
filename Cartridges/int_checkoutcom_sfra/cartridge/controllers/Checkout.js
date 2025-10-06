'use strict';

var server = require('server');
server.extend(module.superModule);

var CKOHelper = require('bm_checkoutcom/cartridge/scripts/helpers/CKOHelper');

server.append(
    'Begin',
    function (req, res, next) {
        var accountKeys = CKOHelper.getAccountKeys();
        var servicePublicKey = accountKeys.publicKey;

        res.setViewData({
            servicePublicKey: servicePublicKey
        });

        return next();
    });

module.exports = server.exports();