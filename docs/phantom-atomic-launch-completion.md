# Phantom atomic launch completion

## Purpose and authorization

This update implements the owner's approved request to test the **real atomic
V1 coin-and-image transaction through Phantom on main**, without rejecting the
attempt merely because Wallet Standard does not advertise V1. The previous
application capability check was not proof that the traditional Phantom
provider could not accept a native request.

Baseline: `1cbb9f5433080cf1fa8fc837a786ba92b6d71ec4`.
Implementation/test revision: `87fc6d08b573e3b3e97d4490a1380badb88281be`.
Review workspace: PR #8, `fix/phantom-atomic-launch-completion`.
No wallet approval, mainnet broadcast or deployment was performed by the agent.
The owner is performing the live test after the complete revision is synced.

## 1. Exact native request

`src/lib/atomicV1PhantomRequest.js` calls:

```js
provider.request({
  method: 'signTransaction',
  params: { message: base58Encode(compiledV1MessageBytes) },
});
```

This follows Phantom's documented injected-provider `request` form. The `message`
parameter is **the serialized transaction message encoded as Base58**. It is not
the full wire transaction, the image hash, Base64 text, a human-readable statement,
or an authentication message. The actual message still begins with the V1 marker.

The browser already has the mint key. It signs the same final message with that
key and retains that signature locally. Phantom supplies only the payer signature.
After approval the application verifies the payer signature against the expected
public key and exact bytes, retains the original mint signature, and uses the
existing Kit codec to assemble and verify the complete two-signer V1 transaction.

The adapter handles detached Base58/byte-array signatures and serialized signed
transaction objects. Any returned public key must match the connected payer.
Returned transaction messages must match exactly. A missing/zero mint signature
in a message-only response is completed locally; a conflicting nonzero one is
rejected. No signature is accepted solely because it has 64 bytes.

**This is a native transaction request, not a wallet security bypass.** There is
no `signMessage` fallback, V0 wrapper, transaction-version relabeling, forged
capability registration, wallet-warning suppression or wallet-private-key access.
If Phantom's implementation cannot parse/sign V1, that native call can still fail.
A successful unit test with a mock provider is not proof of live wallet support.

## 2. Frontend availability and actual failure reporting

The primary button is **Connect Phantom - native request**. It detects the
Phantom extension or mobile injected provider separately from Wallet Standard.
The connected address is displayed as payer and creator; the selected transport
is shown explicitly.

The native route does not depend on `supportedTransactionVersions.includes(1)`,
the older Wallet Standard allowlist, or a successful prior settings read.
The application never advertises a made-up V1 capability on Phantom's behalf.
Other wallets and their actual advertised versions remain visible under advanced
diagnostics.

The public launch button is not disabled by an absent, stale, negative or currently
loading size preview. Clicking it reads the selected file again and performs a
fresh preparation. A preview error does not silently make the button unusable.
The form remains disabled while a launch action is in progress to prevent double
clicks. Existing admin form behavior is preserved, as is the homepage launch link.

Required form data, actual final-size limits, local intent/signature validation,
blockhash freshness, and real simulation failures still matter. The update does
not send known-invalid transactions just to manufacture a wallet error. A failed
upload, RPC request or backend initialization is reported as an application/RPC
failure, not falsely attributed to Phantom.

Native wallet exceptions retain their original `message` and `code` and are
identified as **Phantom / wallet-signing**. No alternate signing request is made
automatically after rejection or timeout. A wallet-side format rejection may
occur before a visible approval popup; the app cannot force Phantom to show one.

## 3. Launch content and first buy

The existing V1 builder, Pump program, metadata URI and Noop commitment format
remain in use. Coin creation, optional first buy and the exact image bytes are
included in one transaction. The connected account remains payer/creator/buyer;
the separate mint key stays in the browser. No temporary funded payer or second
inscription transaction is introduced.

Resource limits are finalized before signing. Both signatures authorize those
same immutable bytes. The 4,096-byte limit applies to the full signed transaction,
including instructions, accounts, metadata URI and signatures, not to the image
alone. A first buy adds transaction overhead and can reduce the image budget.

The optional first-buy maximum remains bounded by the entered SOL amount. The
real SDK integration test covers the actual create-plus-buy instruction output
and the existing maximum-quote clamp, not only a handcrafted instruction fixture.
The test's synthetic global account data and token amount are for offline encoding;
they are not a real liquidity/fee quote or an executed purchase.

The prior hard-coded 0.03 SOL balance rejection was replaced with actual simulation
and a check against the requested buy amount. The UI still presents 0.03 SOL as a
planning reserve, not an exact price or a forced minimum. Simulation determines
whether the prepared transaction can pay its actual rent and fees.

## 4. Metadata readiness

The browser's mint key signs a domain-separated preparation authorization over
request ID, payer, mint, name, symbol, description, first-buy amount, image hash
and length, uploaded image URL and social links. The backend independently
reconstructs and verifies those bytes. This proves control of the mint key; it
neither proves payer approval nor authorizes spending from the connected wallet.

An authorized preparation can provide metadata for wallet/indexer preview before
finalization. A verified finalized record has priority over any preview. Public
unverified arbitrary drafts cannot replace verified metadata. Preview and not-ready
responses use `no-store` so a temporary 404 is not cached as the final result.
`atomicV1Verified` remains false until the actual on-chain proof passes.

The entity explicitly declares `signingTransport` and `metadataAuthorized`.
An authenticated, unsent prepared record can move to the native Phantom sign-only
route after its mint authorization is checked; the transaction message itself is
not changed by that route migration.

## 5. Recovery and concurrency

The original request, mint and recovery credential survive reload in browser
storage. Missing/corrupt recovery keys cause an explicit error instead of silently
creating a different mint. Signed transaction bytes and the computable transaction
ID are saved before a post-approval RPC check can fail. The backend persists its
transaction identity before broadcasting.

Backend retries can only rebroadcast identical signed bytes. There is no automatic
replacement transaction after a timeout. Expired preparations are refreshed only
when the existing safety checks establish expiry and an absent mint. All old
signatures are discarded when a fresh message is accepted.

Wallet-submitted callbacks are idempotent for a known signature even after terminal
states. Server arming precedes the browser's `broadcastStarted` marker, avoiding
the previous false marker when arming itself failed. Submitted states receive
bounded automatic confirmation checks; these polls do not sign, send or refresh.
Manual recovery remains available after the polling window.

Browser Web Locks, when supported, prevent overlapping same-wallet actions in
normal tabs. Conditional per-record updates protect later server transitions.
**Initial creation is still not a database-wide unique insert.** Concurrent first
preparations can create multiple immutable rows without a deployed unique claim.
The on-chain mint prevents two successful creations of the same coin, but that is
not a guarantee against duplicate failed-transaction fees or duplicate database
rows. Browser locks also do not replace backend ingress/rate limiting. These are
operational hardening limits, not concealed claims of exactly-once execution.

## 6. Configuration for the approved live test

The native request is available by default. No new secret needs to be set to `true`.
Only an explicit value below disables that route:

```
ATOMIC_V1_PHANTOM_REQUEST_ENABLED=false
```

The older `ATOMIC_V1_NATIVE_ENABLED` and `ATOMIC_V1_NATIVE_WALLETS` continue to
control Wallet Standard paths. They do not block the dedicated native Phantom
request. `ATOMIC_V1_FIRST_BUY_ENABLED` retains the prior main-branch behavior and
can still disable first buys explicitly. No Jupiter API key participates in
signing, and no wallet seed/private key is requested by the new code.

Use the published top-level HTTPS app in Phantom's in-app browser or in a browser
with the Phantom extension. An embedded Base44 preview or a browser without a
provider is not a usable Phantom signing context. Open `/atomic-v1` and select
the primary native-request button, not the optional Wallet Standard route.

The frontend, `publicAtomicV1Launch`, `atomicV1Metadata` and entity schema must be
synced from the same revision. Base44 deploys copies of shared files with each
function, so an updated frontend with an older function bundle is not a completed
rollout. The agent did not verify a deployed Base44 app or change secret values.

## 7. Actual validation evidence

GitHub Actions run `35948644391` tested revision
`87fc6d08b573e3b3e97d4490a1380badb88281be` against baseline
`1cbb9f5433080cf1fa8fc837a786ba92b6d71ec4`:

| Check | Observed result |
| --- | --- |
| Offline protocol, signatures, native request, authorization and recovery | 39 tests passed |
| Actual Pump SDK/Kit create-only + image + native-request adapter | Passed |
| Actual Pump SDK/Kit create-plus-buy + image + native-request adapter | Passed |
| Schema declaration/RLS integration check | Passed |
| Actual form rendering/button-gating regressions | 4 tests passed |
| Application dependency installation | Passed |
| Application build | Passed |
| Lint | Passed |
| Full typecheck | Still fails on existing project diagnostics: baseline 314, head 312 |
| New type diagnostics after normalizing source line positions | None |

The earlier intermittent 4,096-byte boundary failure is fixed: independent test
keys now have equal Base58 text widths so metadata URI lengths do not randomly
change the fixture size. The real protocol size checks were not weakened.

The SDK test workspace installs only explicitly declared test dependencies rather
than resolving the entire frontend graph. Dependency-age safeguards were not
disabled. Its Deno test loads the SDK's published CommonJS entrypoint to avoid a
reproduced Anchor `BN` named-export inference error on the ESM import chain.
This tests actual SDK behavior, but **is not a deployed Base44 bundle test**;
the existing production SDK import paths/admin builder were not rewritten.

The native provider in automated tests is a mock signing with ephemeral Ed25519
keys. Tests exercise the production request adapter and Kit codecs, but no real
Phantom extension, mobile approval, RPC broadcast, fee payment or Pump execution
occurred. UI rendering tests validate actual submit-button conditions with
presentational children stubbed; they are not a full browser end-to-end test.

CI retains baseline/head diagnostics rather than suppressing the pre-existing
typecheck failures. A workflow with those failures is not described as all green.
The main branch also runs these checks on pushes. Test artifacts contain tracked
source/diagnostics only, not environment files, wallet secrets or Git credentials.

## 8. Live success criteria

Live acceptance requires a real Phantom payer signature for the exact compiled
message, a valid retained mint signature, successful submission, and a finalized
transaction whose decoded instructions create the intended coin and contain the
exact image commitment. Reconstructed image hash and length must match the file.
The optional buy must remain within its spending bound and use the intended buyer.
History, confirmation and metadata must reflect that verified outcome.

A Phantom error is useful evidence but not successful creation. A transaction ID
alone is not proof of finalization. Conversely, lack of a Wallet Standard numeric
V1 flag is no longer used by the dedicated native route as a reason not to ask
Phantom at all.

## Primary references

- Phantom native signTransaction request: https://docs.phantom.com/solana/sending-a-transaction
- Phantom injected-provider detection: https://docs.phantom.com/solana/detecting-the-provider
- Solana larger V1 transactions: https://solana.com/upgrades/larger-transaction-sizes
- Solana simulation signature-verification options: https://solana.com/docs/rpc/http/simulatetransaction
- Deno Node/CommonJS interoperability: https://docs.deno.com/runtime/fundamentals/node/
- Base44 backend function/shared-file deployment: https://docs.base44.com/developers/backend/resources/backend-functions/overview
- Base44 entity query/conditional-update API: https://docs.base44.com/developers/references/sdk/docs/type-aliases/entities
