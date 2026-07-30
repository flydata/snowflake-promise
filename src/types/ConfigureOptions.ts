export interface ConfigureOptions {
  /**
   * If true, don’t fail the connection if OCSP validation doesn’t provide a valid
   * response. (Default: true)
   */
  ocspFailOpen?: boolean;

  /**
   * If true, skip the OCSP revocation check entirely at connection time. See
   * https://community.snowflake.com/s/article/How-to-turn-off-OCSP-checking-in-Snowflake-client-drivers
   * for additional details. (Default: false)
   *
   * Replaces `insecureConnect`, which snowflake-sdk renamed in 2.0.0. `insecureConnect`
   * is deliberately no longer declared: the SDK ignores unknown configure keys silently,
   * so passing it would leave OCSP checks *enabled* with no error and no test failure.
   * Dropping it from the type surfaces the mistake at compile time instead.
   */
  disableOCSPChecks?: boolean;
}
