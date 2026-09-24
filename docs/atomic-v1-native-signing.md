# Atomic V1 native signing

The current implementation and live-test instructions are documented in
[Phantom atomic launch completion](phantom-atomic-launch-completion.md).
That document supersedes the earlier draft's default-off/wallet-allowlist-only design.

## Current signing paths

The public Atomic V1 page exposes a **Connect Phantom - native request** button.
This selects the injected provider's documented native `signTransaction` JSON-RPC
request. It sends Base58 of the exact compiled V1 message. It does not require
Wallet Standard to advertise numeric V1, and does not fabricate that capability.
The wallet itself decides whether it accepts the format.

The browser keeps the mint co-signature, verifies Phantom's payer signature over
the original message, assembles the final V1 wire using Kit, and submits through
the backend. The connected account remains payer, creator and optional buyer.
The complete image and original `VALIDATE-v1` commitment remain in the same
transaction. The public path never loads the admin payer key.

Wallet Standard signing remains a separate optional integration, with its real
method-specific advertised versions and existing operator configuration. There
is no automatic switch between routes after an uncertain wallet response.

## Configuration

`ATOMIC_V1_PHANTOM_REQUEST_ENABLED` is the dedicated native-request control.
It defaults to enabled unless explicitly set to the string `false`.
The older `ATOMIC_V1_NATIVE_ENABLED` and `ATOMIC_V1_NATIVE_WALLETS` control the
Wallet Standard routes; they do not stand in for Phantom's native request API.
`ATOMIC_V1_FIRST_BUY_ENABLED` retains its existing behavior/default from main.
No Jupiter API key is needed for wallet signing.

A lack of a cached size estimate, an in-progress preview, a stale negative size
preview, or a missing V1 capability flag does not disable the public submit
button. Clicking it performs a fresh preparation. Correctness checks still
reject malformed input, oversized final transactions, wrong signer/coin/image
intent, invalid signatures, expired preparations and actual simulation errors.
Those are not disguised as Phantom errors. Busy protection prevents accidental
duplicate clicks. The existing admin form retains its prior sizing behavior.

## Security and evidence boundaries

Native requests use `signTransaction`, never `signMessage`. The code does not
mislabel V1 as V0, modify wallet capabilities, bypass wallet warnings, export
wallet keys, fund a temporary payer, or split the image into a second transaction.

Mint-key authorization binds preview metadata to the preparation without adding
a Phantom message-signing prompt. Preview availability is not an on-chain
verification claim. Success requires exact finalized-message/signature/instruction
and image proof, not merely receipt of a transaction ID.

Recovery retains the original mint, request identity and signed transaction.
Per-record state transitions use conditional writes; browser Web Locks protect
normal same-wallet actions across supported tabs. **This does not establish a
database-wide unique initial preparation claim.** Concurrent initial creates can
still produce duplicate rows without a deployed unique constraint. Retain ingress
rate limits; browser locking is not server abuse protection.

The checked-in tests include actual SDK/Kit create-only and create-plus-buy
encoding, real ephemeral Ed25519 signatures, mocked native-provider responses,
recovery/state tests, and rendering tests for the actual form's button gating.
They do not prove live Phantom extension acceptance or deployed Base44 behavior.
No mainnet transaction was broadcast during implementation.

See the completion document for exact tested revisions, CI results, deployment
requirements, known limitations and primary documentation references.
