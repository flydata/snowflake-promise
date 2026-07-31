import * as SDK from 'snowflake-sdk';

/**
 * Connection options, derived from snowflake-sdk's own typings rather than
 * hand-maintained here.
 *
 * The previous hand-written copy drifted: it was missing `accessUrl`, so consumers
 * overriding the default host could not type-check it. Deriving picks up every
 * option the installed SDK supports, including ones added in future releases.
 *
 * The SDK marks `account` and `username` optional (they can come from a config
 * file or env). This wrapper has always required them, so that is preserved
 * explicitly rather than silently relaxed.
 */
export type ConnectionOptions = SDK.ConnectionOptions &
  Required<Pick<SDK.ConnectionOptions, 'account' | 'username'>>;
