'use strict';

/**
 * Utility functions.
 */
var sensitiveDataHelper = {

    /**
     * Hide sensitive data from the source_data object
     * @param {Object} sourceDataObject object from request/response
     * @returns {Object} filtered data
     */
    cleanSourceDataObject: function(sourceDataObject) {
        var sourceData = sourceDataObject;
        if (Object.prototype.hasOwnProperty.call(sourceData, 'first_name') && sourceData.first_name != null) { sourceData.first_name = String.prototype.replace.call(sourceData.first_name, /\w/gi, '*'); }

        if (Object.prototype.hasOwnProperty.call(sourceData, 'last_name') && sourceData.last_name != null) { sourceData.last_name = String.prototype.replace.call(sourceData.last_name, /\w/gi, '*'); }

        if (Object.prototype.hasOwnProperty.call(sourceData, 'account_iban') && sourceData.account_iban != null) { sourceData.account_iban = String.prototype.replace.call(sourceData.account_iban, /\w/gi, '*'); }

        return sourceData;
    },

    /**
     * Hide sensitive data from the souce object
     * @param {Object} sourceObject object from request/response
     * @returns {Object} filtered data
     */
    cleanSourceObject: function(sourceObject) {
        var source = sourceObject;
        if (Object.prototype.hasOwnProperty.call(source, 'fingerprint') && source.fingerprint != null) {
            source.fingerprint = String.prototype.replace.call(source.fingerprint, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'authorization_token') && source.authorization_token != null) {
            source.authorization_token = String.prototype.replace.call(source.authorization_token, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'id') && source.id != null) {
            source.id = String.prototype.replace.call(source.id, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'phone') && source.phone != null) {
            source.phone.number = String.prototype.replace.call(source.phone.number, /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'billing_address') && source.billing_address != null) {
            source.billing_address = this.cleanBillingAddress(source.billing_address);
        }
        if (Object.prototype.hasOwnProperty.call(source, 'number') && source.number != null) {
            source.number = String.prototype.replace.call(source.number, /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'cvv') && source.cvv != null) {
            source.cvv = String.prototype.replace.call(source.cvv, /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'name') && source.name != null) {
            source.name = String.prototype.replace.call(source.name, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'expiry_month') && source.expiry_month != null) {
            source.expiry_month = String.prototype.replace.call(String(source.expiry_month), /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'expiry_year') && source.expiry_year != null) {
            source.expiry_year = String.prototype.replace.call(String(source.expiry_year), /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'bin') && source.bin != null) {
            source.bin = String.prototype.replace.call(source.bin, /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'card_type') && source.card_type != null) {
            source.card_type = String.prototype.replace.call(source.card_type, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(source, 'payment_account_reference') && source.payment_account_reference != null) {
            source.payment_account_reference = String.prototype.replace.call(source.payment_account_reference, /\w/gi, '*');
        }

        return source;
    },

    /**
     * Hide sensitive data from the billingAddress object
     * @param {Object} billingAddressObject object from request/response
     * @returns {Object} filtered data
     */
    cleanBillingAddress: function(billingAddressObject) {
        var billingAddress = billingAddressObject;
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'given_name') && billingAddress.given_name != null) {
            billingAddress.given_name = String.prototype.replace.call(billingAddress.given_name, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'family_name') && billingAddress.family_name != null) {
            billingAddress.family_name = String.prototype.replace.call(billingAddress.family_name, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'email') && billingAddress.email != null) {
            billingAddress.email = String.prototype.replace.call(billingAddress.email, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'street_address') && billingAddress.street_address != null) {
            billingAddress.street_address = String.prototype.replace.call(billingAddress.street_address, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'street_address2') && billingAddress.street_address2 != null) {
            billingAddress.street_address2 = String.prototype.replace.call(billingAddress.street_address2, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'postal_code') && billingAddress.postal_code != null) {
            billingAddress.postal_code = String.prototype.replace.call(billingAddress.postal_code, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'phone') && billingAddress.phone != null) {
            billingAddress.phone = String.prototype.replace.call(billingAddress.phone, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'address_line1') && billingAddress.address_line1 != null) {
            billingAddress.address_line1 = String.prototype.replace.call(billingAddress.address_line1, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'address_line2') && billingAddress.address_line2 != null) {
            billingAddress.address_line2 = String.prototype.replace.call(billingAddress.address_line2, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'city') && billingAddress.city != null) {
            billingAddress.city = String.prototype.replace.call(billingAddress.city, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(billingAddress, 'zip') && billingAddress.zip != null) {
            billingAddress.zip = String.prototype.replace.call(billingAddress.zip, /\w/gi, '*');
        }

        return billingAddress;
    },

    /**
     * Hide sensitive data from the customer object
     * @param {Object} customerObject object from request/response
     * @returns {Object} filtered data
     */
    cleanCustomerObject: function(customerObject) {
        var customer = customerObject;
        if (Object.prototype.hasOwnProperty.call(customer, 'id') && customer.id != null) {
            customer.id = String.prototype.replace.call(customer.id, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(customer, 'email') && customer.email != null) {
            customer.email = String.prototype.replace.call(customer.email, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(customer, 'name') && customer.name != null) {
            customer.name = String.prototype.replace.call(customer.name, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(customer, 'phone') && customer.phone != null && customer.phone.number != null) {
            customer.phone.number = String.prototype.replace.call(customer.phone.number, /\d/gi, '*');
        }

        return customer;
    },

    /**
     * Hide sensitive data from the shipping object
     * @param {Object} shippingObject object from request/response
     * @returns {Object} filtered data
     */
    cleanShippingObject: function(shippingObject) {
        var shipping = shippingObject;
        if (Object.prototype.hasOwnProperty.call(shipping, 'address')) {
            if (shipping.address.address_line1 != null) {
                shipping.address.address_line1 = String.prototype.replace.call(shipping.address.address_line1, /\w/gi, '*');
            }
            if (shipping.address.address_line2 != null) {
                shipping.address.address_line2 = String.prototype.replace.call(shipping.address.address_line2, /\w/gi, '*');
            }
            if (shipping.address.city != null) {
                shipping.address.city = String.prototype.replace.call(shipping.address.city, /\w/gi, '*');
            }
            if (shipping.address.zip != null) {
                shipping.address.zip = String.prototype.replace.call(shipping.address.zip, /\w/gi, '*');
            }
        }
        if (Object.prototype.hasOwnProperty.call(shipping, 'phone') && shipping.phone.number != null) {
            shipping.phone.number = String.prototype.replace.call(shipping.phone.number, /\d/gi, '*');
        }

        return shipping;
    },

    /**
     * Hide sensitive data from the 3ds object
     * @param {Object} threeDsObject object from request/response
     * @returns {Object} filtered data
     */
    clean3dsObject: function(threeDsObject) {
        var threeds = threeDsObject;
        if (Object.prototype.hasOwnProperty.call(threeds, 'cryptogram') && threeds.cryptogram != null) {
            threeds.cryptogram = String.prototype.replace.call(threeds.cryptogram, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(threeds, 'xid') && threeds.xid != null) {
            threeds.xid = String.prototype.replace.call(threeds.xid, /\w/gi, '*');
        }

        return threeds;
    },

    /**
     * Hide sensitive data from the metadata object
     * @param {Object} metadataObject object from request/response
     * @returns {Object} filtered data
     */
    cleanMetadataObject: function(metadataObject) {
        var metadata = metadataObject;
        if (Object.prototype.hasOwnProperty.call(metadata, 'payment_processor') && metadata.payment_processor != null) {
            metadata.payment_processor = String.prototype.replace.call(metadata.payment_processor, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(metadata, 'card_uuid') && metadata.card_uuid != null) {
            metadata.card_uuid = String.prototype.replace.call(metadata.card_uuid, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(metadata, 'customer_id') && metadata.customer_id != null) {
            metadata.customer_id = String.prototype.replace.call(metadata.customer_id, /\w/gi, '*');
        }

        return metadata;
    },

    /**
     * Hide sensitive data from the actions array
     * @param {Array} actionsArray array from response
     * @returns {Array} filtered data
     */
    cleanActionsArray: function(actionsArray) {
        if (!actionsArray || !(actionsArray instanceof Array)) {
            return actionsArray;
        }

        for (var i = 0; i < actionsArray.length; i++) {
            if (actionsArray[i] && Object.prototype.hasOwnProperty.call(actionsArray[i], 'id') && actionsArray[i].id != null) {
                actionsArray[i].id = String.prototype.replace.call(actionsArray[i].id, /\w/gi, '*');
            }
        }

        return actionsArray;
    },

    /**
     * Hide sensitive data from the risk object
     * @param {Object} riskObject object from request/response
     * @returns {Object} filtered data
     */
    cleanRiskObject: function(riskObject) {
        var risk = riskObject;

        if (Object.prototype.hasOwnProperty.call(risk, 'device_session_id') && risk.device_session_id != null) {
            risk.device_session_id = String.prototype.replace.call(risk.device_session_id, /\w/gi, '*');
        }

        if (Object.prototype.hasOwnProperty.call(risk, 'device') && risk.device != null) {
            if (Object.prototype.hasOwnProperty.call(risk.device, 'network') && risk.device.network != null) {
                if (Object.prototype.hasOwnProperty.call(risk.device.network, 'ipv4') && risk.device.network.ipv4 != null) {
                    risk.device.network.ipv4 = String.prototype.replace.call(String(risk.device.network.ipv4), /\d/gi, '*');
                }
                if (Object.prototype.hasOwnProperty.call(risk.device.network, 'ipv6') && risk.device.network.ipv6 != null) {
                    risk.device.network.ipv6 = String.prototype.replace.call(String(risk.device.network.ipv6), /[\da-f:]/gi, '*');
                }
            }
        }

        return risk;
    },

    /**
     * Redact payment-related sensitive fields
     * @param {Object} data object from request/response
     * @returns {Object} filtered data
     */
    cleanPaymentFields: function(data) {
        if (Object.prototype.hasOwnProperty.call(data, 'id') && data.id != null) {
            data.id = String.prototype.replace.call(data.id, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(data, 'paymentToken') && data.paymentToken != null) {
            data.paymentToken = String.prototype.replace.call(data.paymentToken, /\w/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(data, 'payment_ip') && data.payment_ip != null) {
            data.payment_ip = String.prototype.replace.call(data.payment_ip, /\d/gi, '*');
        }
        if (Object.prototype.hasOwnProperty.call(data, 'scheme_id') && data.scheme_id != null) {
            data.scheme_id = String.prototype.replace.call(data.scheme_id, /\w/gi, '*');
        }

        return data;
    },

};

/**
 * Module exports
 */
module.exports = sensitiveDataHelper;
