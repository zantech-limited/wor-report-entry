import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contentSecurityPolicy,
  createNonce,
} from "../src/lib/content-security";

const nonce = createNonce();
const policy = contentSecurityPolicy({
  nonce,
  https: true,
  allowFrame: false,
  development: false,
});
assert.equal(
  policy.split("; ").find((part) => part.startsWith("script-src")),
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
);
assert.equal(
  policy.split("; ").find((part) => part.startsWith("style-src")),
  "style-src 'self' 'unsafe-inline'",
);
assert.match(policy, /frame-ancestors 'none'/);
assert.match(policy, /upgrade-insecure-requests/);
assert.doesNotMatch(policy, /unsafe-eval/);
assert.doesNotMatch(policy, /default-src \*/);

const framed = contentSecurityPolicy({
  nonce,
  https: false,
  allowFrame: true,
  development: true,
});
assert.match(framed, /frame-ancestors 'self'/);
assert.match(framed, /'unsafe-eval'/);
assert.doesNotMatch(framed, /upgrade-insecure-requests/);
assert.throws(() =>
  contentSecurityPolicy({
    nonce: "bad nonce",
    https: false,
    allowFrame: false,
    development: false,
  }),
);

const middleware = readFileSync("src/middleware.ts", "utf8");
assert.match(middleware, /contentSecurityPolicy/);
assert.match(middleware, /x-desk-path/);
assert.match(middleware, /includeSubDomains/);
const nextConfig = readFileSync("next.config.ts", "utf8");
assert.match(nextConfig, /poweredByHeader:\s*false/);

console.log("Content security policy checks passed.");
