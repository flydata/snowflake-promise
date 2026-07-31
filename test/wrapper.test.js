/*
 * Dependency-free smoke tests for the promise wrapper against the real snowflake-sdk.
 *
 * These do not require Snowflake credentials: they exercise construction, the
 * configure() pass-through, the id getter, promise settlement on failure, and the
 * error guards. Run with: npm test
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const SDK = require('snowflake-sdk');
const { Snowflake, Statement } = require('../build/src/index');

// Capture what the wrapper forwards to SDK.configure(). Asserting on the
// pass-through keeps these tests to this package's actual contract; whether a
// given key flips OCSP internally is the SDK's business, and reaching into
// snowflake-sdk/lib/global_config to check it would couple us to its internals.
let configureCalls = [];
const realConfigure = SDK.configure;
SDK.configure = function (options) {
  configureCalls.push(options);
  return realConfigure.call(this, options);
};

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}\n         ${err && err.message}`);
    failed++;
  }
}

const BASE = {
  account: 'nonexistent-account-sfp-test',
  username: 'u',
  password: 'p',
};

// A real PKCS8 key: the SDK validates privateKey format at construction time.
const PRIVATE_KEY_PEM = crypto
  .generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });

// Silence the SDK's own INFO chatter for the duration of the run.
SDK.configure({ logLevel: 'ERROR' });

(async () => {
  console.log(`snowflake-sdk ${require('snowflake-sdk/package.json').version}\n`);

  await test('constructs with the documented connection options', () => {
    const sf = new Snowflake({
      ...BASE,
      accessUrl: 'https://example.snowflakecomputing.com',
      warehouse: 'w',
      database: 'd',
      role: 'r',
      clientSessionKeepAlive: true,
      application: 'TestApp',
    });
    assert.ok(sf);
  });

  await test('accepts key-pair auth options', () => {
    const sf = new Snowflake({
      account: BASE.account,
      username: 'u',
      authenticator: 'SNOWFLAKE_JWT',
      privateKey: PRIVATE_KEY_PEM,
    });
    assert.ok(sf);
  });

  await test('id getter returns a non-empty string', () => {
    const sf = new Snowflake(BASE);
    assert.strictEqual(typeof sf.id, 'string');
    assert.ok(sf.id.length > 0);
  });

  await test('disableOCSPChecks is forwarded to SDK.configure', () => {
    configureCalls = [];
    new Snowflake(BASE, {}, { disableOCSPChecks: true });
    assert.deepStrictEqual(configureCalls, [{ disableOCSPChecks: true }]);
  });

  await test('ocspFailOpen is forwarded to SDK.configure', () => {
    configureCalls = [];
    new Snowflake(BASE, {}, { ocspFailOpen: true });
    assert.deepStrictEqual(configureCalls, [{ ocspFailOpen: true }]);
  });

  await test('no configureOptions means configure() is not called', () => {
    configureCalls = [];
    new Snowflake(BASE);
    assert.deepStrictEqual(configureCalls, []);
  });

  await test('boolean configureOptions warns and forwards nothing', () => {
    configureCalls = [];
    const warnings = [];
    const orig = console.warn;
    console.warn = (m) => warnings.push(m);
    try {
      new Snowflake(BASE, {}, true);
    } finally {
      console.warn = orig;
    }
    assert.strictEqual(warnings.length, 1, 'expected exactly one warning');
    assert.ok(
      /disableOCSPChecks/.test(warnings[0]),
      'warning should point at disableOCSPChecks'
    );
    assert.deepStrictEqual(
      configureCalls,
      [],
      'boolean form must not silently configure anything'
    );
  });

  await test('logLevel option is applied without throwing', () => {
    new Snowflake(BASE, { logLevel: 'ERROR' });
  });

  await test('createStatement returns a Statement', () => {
    const sf = new Snowflake(BASE);
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    assert.ok(stmt instanceof Statement);
  });

  await test('getRows() before execute() throws StatementNotExecutedError', () => {
    const sf = new Snowflake(BASE);
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    assert.throws(() => stmt.getRows(), /not executed yet/i);
  });

  await test('accessor methods before execute() throw', () => {
    const sf = new Snowflake(BASE);
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    for (const m of ['getSqlText', 'getStatus', 'getColumns', 'getNumRows']) {
      assert.throws(() => stmt[m](), /not executed yet/i, m);
    }
  });

  await test('connect() rejects (does not hang or resolve) on a bad account', async () => {
    const sf = new Snowflake({ ...BASE, retryTimeout: 1, sfRetryMaxLoginRetries: 1 });
    let settled = 'pending';
    await sf.connect().then(
      () => (settled = 'resolved'),
      () => (settled = 'rejected')
    );
    assert.strictEqual(settled, 'rejected');
  });

  await test('execute() does not run logSql on the error path', async () => {
    // Regression test for the fall-through bug: execute()'s complete callback
    // called reject(err) without returning, so it went on to run logSql against a
    // statement that had failed. Counting promise settlements cannot detect this —
    // a promise settles once by spec — so assert on the observable side effect.
    let logged = 0;
    const sf = new Snowflake(
      { ...BASE, retryTimeout: 1, sfRetryMaxLoginRetries: 1 },
      { logSql: () => logged++ }
    );
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    await stmt.execute().catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(logged, 0, 'logSql must not run after reject()');
  });

  await test('execute() twice throws StatementAlreadyExecutedError', () => {
    const sf = new Snowflake(BASE);
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    stmt.execute().catch(() => {});
    assert.throws(() => stmt.execute(), /already executed/i);
  });

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed === 0 ? 0 : 1);
})();
