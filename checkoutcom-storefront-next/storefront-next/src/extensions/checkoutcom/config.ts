/** @sfdc-extension-file SFDC_EXT_CHECKOUTCOM */

/**
 * Checkout.com extension configuration, available at
 * `config.app.extension.checkoutcom`.
 *
 * Intentionally empty: the public key and the sandbox/production environment
 * come from the instance (Business Manager site preferences) with every payment
 * session, so they are configured in one place and cannot drift from the
 * secret key. Nothing secret ever belongs here.
 */
export default {};
