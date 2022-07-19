'use strict';

var constants = require('*/cartridge/config/constants');
// Utility
var ckoHelper = require('*/cartridge/scripts/helpers/ckoHelper');
var ckoMADABINConfig = ckoHelper.getValue(constants.CKO_MADA_BINS);

// Returns bins for mada cards
var ckoMadaConfig = ckoMADABINConfig ? JSON.parse(ckoMADABINConfig) || {} : {};

module.exports = ckoMadaConfig;
