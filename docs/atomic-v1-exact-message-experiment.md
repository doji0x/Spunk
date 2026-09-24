# Experimental Phantom exact-message transaction authorization

Status: **experimental, not verified against a live Phantom wallet**.
Baseline: `f2cbb9992fae06932e64950f7fede2ff2fa06afc`.
Branch: `experiment/phantom-exact-message-signing`. Review: PR #12.

## Correction to the proposed workaround

An Ed25519 signature over the exact compiled V1 message can authorize that
transaction once every required signature is attached and it is submitted.
That cryptographic fact does NOT establish that Phantom permits the request.
Phantom has explicitly explained that signMessage checks for input that can be
decoded as a Solana transaction and rejects it to protect users. The earlier
suggestion that this definitely bypasses parsing and produces an approval prompt
was too strong. It is not evidence of live-wallet support.

This branch makes one ordinary `provider.signMessage(bytes, 'hex')` attempt only
after a separate, explicit transaction-and-spending review. It never tries to evade
a refusal by changing the bytes, adding a prefix, encoding them differently,
selecting another API, or suppressing wallet warnings. A wallet rejection is
retained verbatim and stops this attempt. Do not describe this experiment as a
supported Phantom V1 integration or deploy it as a login/ownership check.

The relevant Phantom explanation is a historical answered discussion, not proof
about every currently installed build. It is sufficient reason not to promise
that this will show a signing prompt or succeed.

## Launch flow

The actual public Launch action still connects Phantom if necessary, initializes
the original wallet/mint session and prepares the same atomic coin/image/optional
buy transaction. For the selected native Phantom route only, the hook explicitly
selects `experimental-exact-message`. The ordinary helper default remains native
transaction signing for other callers; this experiment is never an automatic
fallback after a failed native request.

Before calling signMessage, the new helper independently checks the existing local
transaction-intent policy, verifies the mint signature and immutable prepared
message, then presents the validated coin, payer/creator, mint, metadata URI,
first-buy maximum, priority fee cap, image bytes/hash, message bytes/hash, complete
transaction size, and last valid block height. Rent and base fees are additional;
the priority fee is not described as the total transaction cost.

The review says this is NOT a login, that approval authorizes coin creation and
spending, and that Phantom may show binary/hex data rather than a normal transaction
preview. Cancel makes no wallet signing request. Approval is bound to this exact
message digest and is never saved or reused for a refreshed blockhash. Freshness
and the live selected account are checked again after the user reviews the summary.
Unmounting cancels a pending review rather than letting it sign in the background.

The input is an owned Uint8Array copy of the compiled transaction MESSAGE:

```js
const result = await provider.signMessage(new Uint8Array(messageBytes), 'hex');
```

`hex` is a display hint, not a conversion of the input into text. Neither the
warning, the digest, Base58/Base64 text nor a prefix is signed in place of the
raw bytes. The full transaction envelope/signature trailer is not the message.
No private key from the connected wallet is loaded by the app.

## Signature checks and execution

On response, check the returned account when supplied, the exact bytes including
any returned signedMessage field, the 64-byte signature length, and the Ed25519
signature against the expected payer and original compiled message. A signature
over a hash or a wallet-prefixed message is rejected. Mutation of the provider's
input copy is rejected without modifying the original transaction.

Re-verify the mint signature and assemble the same V1 transaction with Kit. The
existing caller then verifies both signatures, persists the signed identity,
checks lifetime, and submits through the existing backend. Backend signature
verification, simulation and finalized image/coin proof remain unchanged.

signMessage itself does not create the coin. If the wallet returns a valid exact
signature and the fully signed transaction is successfully submitted/executed,
the unchanged coin creation, image inscription and optional first buy execute
atomically. A returned signature alone is not proof of successful creation.

The persisted `phantom-request` transport and `signTransaction` submission-mode
labels are retained for existing backend/recovery compatibility. They designate
the sign-only backend submission flow, not the actual wallet API on this branch.
The UI explicitly labels the wallet API as experimental signMessage.

## Recovery and failure behavior

Phantom errors retain their original text/code and use `wallet-message-signing`
as the stage. A refused request is no longer displayed as a currently pending
wallet approval. The underlying prepared record is retained for recovery.

A rejected request does not persist a payer signature, submit the transaction,
or trigger an alternative API. Actual signature/intent/size checks, explicit
operator disables and stale blockhash checks are preserved. The first-buy and
image instructions are not rewritten and no V0 fallback is introduced.

The existing timeouts added on baseline main for connection/upload/backend calls
remain. The connection helper's timeout import changes from a Vite-only alias to
a relative `.js` path so native Node tests can load it; timeout behavior is unchanged.
No wallet timeout is added that pretends to cancel a pending approval or starts
another signing request automatically.

This branch does not add a database-wide unique initial preparation guarantee or
alter existing ingress/rate limits. Browser recovery and signature integrity do
not solve those separate operational concerns.

## Tests and observed evidence

CI run `35963197664` tested implementation `a75c479fe68a9b37336d5da8fcbf7457cff1e33f`.
The offline, React launch-flow, SDK, actual form rendering, application build and
lint jobs/steps passed. A new modal focus-restoration type error was identified
and corrected in the final follow-up commit; the final PR body records the latest
post-correction CI result and comparison with existing baseline type errors.

- 69 dependency-free protocol/signature/connection/state tests, including 12 new
  exact-message tests: exact bytes, explicit review, cancellation, wallet refusal,
  wrong signatures/accounts, hash/prefix/text signing, mutation, lifetime and full
  4096-byte signed transaction boundaries.
- 15 real React page/provider/hook flow tests, including no signing before consent,
  no signing after cancellation, and no submission/fallback after the documented
  transaction-shaped-input refusal. Presentational children including the modal
  are stubbed in this harness; this is not browser UI approval testing.
- 6 actual form/review component rendering tests. Review rendering checks the
  spending warning, coin/hash/size details and explicit Cancel/Authorize controls.
- 5 actual Pump/Kit/web3 SDK tests. The create-only and create-plus-buy fixtures
  additionally verify that the experimental exact-byte signature produces the
  same final wire bytes as the native signature for the same message.

The providers are mocked and use temporary real Ed25519 keys. SDK tests use actual
codecs and instruction builders but synthetic global/quote data. None is a live
Phantom acceptance, live Pump execution or deployed Base44 integration test. The
full-project typecheck remains visible; errors are not suppressed to make CI green.

## Testing this branch

After reviewing/merging this PR and publishing the frontend, press Launch, review
the explicit authorization, then choose **Authorize this transaction and open
Phantom**. Any actual message approval still belongs to the user in Phantom.
Cancel makes no wallet call. Connection permission is separate from message
approval and the app's disclosure does not replace the wallet's consent.

No new backend function, entity schema, API key, root dependency change or secret
is introduced. This assumes the existing matching backend from main is deployed.
Keep unresolved recovery data instead of creating a replacement mint following
an uncertain submission. The app can still report genuine preparation/RPC errors
before it reaches the wallet.

Main is not changed or merged by this work. No deployment, live wallet approval,
RPC broadcast or funds spending occurred. The experiment's acceptance remains a
live-wallet question; the application does not defeat or suppress Phantom policy.

## Primary references checked September 24, 2026

- Phantom message input and Ed25519 verification:
  https://docs.phantom.com/solana/signing-a-message
- Phantom's transaction-shaped-input rejection explanation:
  https://github.com/orgs/phantom/discussions/189
- Solana exact-message partial signing and signature immutability:
  https://solana.com/docs/core/transactions/partial-signing
