import * as SDK from 'snowflake-sdk';

/**
 * Global configure() options, derived from snowflake-sdk's own typings rather
 * than hand-maintained here.
 *
 * Hand-copying this interface is what let `insecureConnect` survive after the SDK
 * renamed it to `disableOCSPChecks` in 2.0.0 — the copy kept advertising a key the
 * SDK silently ignores, which left OCSP checks enabled with no error. Deriving
 * means a future rename shows up as a compile error instead.
 */
export type ConfigureOptions = SDK.ConfigureOptions;
