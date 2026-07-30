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
const globalConfig = require('snowflake-sdk/lib/global_config');

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

  await test('disableOCSPChecks reaches the SDK and flips OCSP off', () => {
    globalConfig.setDisableOCSPChecks(false);
    new Snowflake(BASE, {}, { disableOCSPChecks: true });
    assert.strictEqual(globalConfig.isOCSPChecksDisabled(), true);
  });

  await test('ocspFailOpen still reaches the SDK', () => {
    globalConfig.setOcspFailOpen(false);
    new Snowflake(BASE, {}, { ocspFailOpen: true });
    assert.strictEqual(globalConfig.getOcspFailOpen(), true);
  });

  await test('boolean configureOptions warns and does NOT disable OCSP', () => {
    globalConfig.setDisableOCSPChecks(false);
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
    assert.strictEqual(
      globalConfig.isOCSPChecksDisabled(),
      false,
      'boolean form must not silently disable OCSP'
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

  await test('execute() rejects once on failure (no double-settle)', async () => {
    const sf = new Snowflake({ ...BASE, retryTimeout: 1, sfRetryMaxLoginRetries: 1 });
    const stmt = sf.createStatement({ sqlText: 'SELECT 1' });
    let settles = 0;
    await stmt.execute().then(
      () => settles++,
      () => settles++
    );
    // give any stray second settlement a tick to land
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(settles, 1);
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
