# Phantom V1 signing: complete transaction object

## Report and scope

The owner reports `Phantom: Reached end of buffer unexpectedly`, stage
`wallet-signing`, after merging the Launch-driven connection/session fix. The
attached screenshot still depicts the earlier connection error; the diagnosis
here follows the owner's explicit new error text and the checked current code.

Baseline: `41610b1fa4add9c405739cdb82b00e8526549d28` (PR #10 merged).
Branch: `fix/phantom-v1-versioned-signing`. Review: PR #11.

The Launch action already invoked a native wallet API. This is not fixed by adding
another Connect button, calling signMessage, or removing transaction validation.
The change is at the wallet input/response boundary. The existing Launch-driven
connect -> session -> prepare -> mint-sign -> wallet-sign -> submit path remains.
No backend, entity, transaction builder, image commitment, first-buy instruction,
root dependency manifest/lockfile, or production deployment is changed.

## What the research establishes

Phantom's current traditional-provider page is explicitly titled **Send a legacy
transaction**. Its raw `request({ method: 'signTransaction', params: { message } })`
example uses `new Transaction()` and `serializeMessage()`. That is not evidence
that the same message-only request is a valid V1 integration. The previous patch
applied that example to V1 without a live-wallet proof.

Phantom's public injected SDK delegates its transaction-object path to
`provider.signTransaction(transaction)`. This establishes the native object API,
not the installed wallet's V1 support or its internal wire-format implementation.

The project's root web3.js is already 1.99.x. In 1.99.0, VersionedTransaction can
deserialize V1 and MessageV1 retains the real numeric `version = 1`, header,
accounts, instructions, blockhash and resource configuration. However,
MessageV1.serialize() deliberately throws because V1 support in this release is
**read-only**. The default VersionedTransaction serializer also retains the legacy
signature-first layout and a 2048-byte scratch buffer. Passing a bare decoded
1.99.0 instance to the wallet would create another application serialization error.

The Solana Foundation recommends Kit for V1 building/sending. This repository
already uses Kit 8.3.0 to encode the correct complete V1 transaction. The correction
keeps that encoder and uses web3.js only for its actual decoded wallet object.

## Implementation

`atomicV1Kit.js` supplies `toWalletTransaction(wire)` using the root
VersionedTransaction class plus the existing Kit codec.

`atomicV1WalletTransaction.js`:

- Canonically decodes the **complete** wire transaction, including both signature
  slots, using Kit and the actual web3.js V1 decoder.
- Retains a real VersionedTransaction instance with a MessageV1, numeric version
  1, public-key objects and correct decoded fields. It does not disguise V1 as V0.
- Supplies instance-local serializers. The message serializer returns an owned
  copy of the original compiled message. The transaction serializer uses Kit to
  encode that message followed by its signatures in V1 order.
- Binds the complete decoded message view to the original bytes. A changed header,
  account, instruction, blockhash, version, lookup table or resource setting is
  rejected. Only signature slots may change.
- Validates a returned read-only V1 object without calling its unsupported
  serializer, then re-encodes its signature slots with Kit.
- Does not modify a library prototype, global wallet provider, or another
  transaction. Legacy and V0 application flows are untouched.

`atomicV1PhantomRequest.js` calls exactly:

```js
const result = await provider.signTransaction(adapter.transaction);
```

The input includes the blank payer signature slot and the existing mint signature.
It is not only a compiled message passed to a full-transaction decoder. Its total
length remains `messageBytes + 2 * 64`, within the complete 4096-byte limit.

The adapter checks the connected payer and both signer slots. It verifies returned
message fields, payer signature and any supplied mint signature before using the
original mint signature to build the final transaction. It never calls signMessage,
blindly accepts a 64-byte value, relabels the transaction version, changes the image,
or tries an alternate signing method after an error. Existing local and server
signature validation and simulation remain in place.

The persisted `phantom-request` label is kept solely for saved-record/backend
compatibility. The visible route now says **Phantom signTransaction / V1 transaction
object**. No new capability flag, enabling secret or API key is introduced.

## Reproducing the buffer error honestly

The real-SDK tests reproduce the exact error in two distinct ways:

1. Feed a complete valid V1 transaction to the older web3.js 1.98.4 deserializer.
   Its signature-first parsing does not understand the V1 layout.
2. Feed only a compiled V1 message to web3.js 1.99.0's complete-transaction decoder.
   That decoder expects the signature trailer; the truncated view cannot decode.

Feeding the complete transaction to 1.99.0 instead succeeds. The tests also expose
the read-only V1 serialization exception and verify the Kit bridge avoids it.

**Neither reproduction proves which code path the user's installed Phantom build
uses.** The old low-level request may dispatch differently, or the wallet may still
have an incompatible decoder. A structured call can still be rejected by an old
wallet-side parser. A successful mock is not proof that Phantom will show approval
or accept V1. The application cannot force a wallet that does not support V1 to
sign it. No automatic downgrade or image split is introduced.

## Tests

The native-signing tests now forbid the previous raw request path. They verify one
native object signing call, exact message and full-envelope lengths, preservation
of the mint signature, copied byte buffers, invalid signatures, account changes,
message-field changes, signature-slot counts, and the exact wallet error/code.

The React suite still renders the actual page/form/provider/hook. Its mocked wallet
now receives the full versioned object from the real signing adapter. The test
covers Launch with no previous Connect action and asserts exactly one signature
request and one submission. A mocked buffer error is surfaced at wallet-signing
with zero submissions and no alternative signing request.

The Deno SDK suite uses actual web3.js 1.98.4 and 1.99.0, actual Kit and actual Pump
SDK instructions. Create-only and create-plus-buy transactions with a complete PNG
are encoded, passed to the adapter, decoded again using the actual wallet-facing
class, and signed with ephemeral keys. Returned read-only objects are handled by
the production result path. A complete 4096-byte fixture is also tested. The global
account/quote data and provider are synthetic; no real program execution occurs.

Initial CI run `35954348444` at `d9575fb1ba0dd8ded7f88a4705c96b2ebfa2e285`
passed the native protocol tests, actual SDK tests, React flow tests and application
build. The final PR body records the latest validation, including unchanged
baseline typecheck failures where applicable. A configured or mocked test is not
reported as live wallet verification.

## Live test and failure boundary

After merging and publishing the frontend revision, use the actual **Launch atomic
V1 coin** action. The connection behavior from PR #10 remains: connect when needed,
then prepare and request a transaction signature. The route label above the form
identifies this object-based implementation, helping distinguish a stale frontend.
Do not clear unresolved recovery storage or create another mint after an uncertain
submission. No additional backend deployment is required by this frontend-only
patch when the existing matching backend from main is already deployed.

Phantom errors retain their original text/code. The thrown error also carries only
safe request metadata: method, transport, numeric version, message length, full
transaction length and signature-slot count. It does not log encoded transactions,
wallet seeds, recovery credentials or raw private-key data. These metadata fields
are available on the error object for debugging; the existing UI continues to show
the original error and stage.

If the same buffer error persists through the complete-object path, further evidence
must come from the installed Phantom version and its decoder behavior. This patch
removes the known legacy-style message transport and read-only serializer hazards;
it does not claim to update Phantom's own parser. No live wallet approval, RPC
broadcast, fund spending, or deployment was performed during implementation.

## Primary references

- https://docs.phantom.com/solana/sending-a-transaction
- https://github.com/phantom/phantom-connect-sdk/blob/main/packages/browser-injected-sdk/src/solana/strategies/injected.ts
- https://github.com/solana-foundation/solana-web3.js/blob/v1.99.0/src/message/v1.ts
- https://github.com/solana-foundation/solana-web3.js/blob/v1.99.0/src/transaction/versioned.ts
- https://github.com/solana-foundation/solana-web3.js/blob/v1.98.4/src/transaction/versioned.ts
- https://solana.com/upgrades/larger-transaction-sizes
