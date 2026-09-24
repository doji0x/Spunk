# Atomic V1 signing on this experimental branch

## Explicit Phantom signMessage experiment

The public native-Phantom Launch flow on this branch explicitly selects the
[exact-message authorization experiment](atomic-v1-exact-message-experiment.md).
It prepares the original transaction, requires a separate transaction/spending
review, then attempts `provider.signMessage(rawCompiledMessageBytes, 'hex')`.

Phantom has documented rejecting transaction-shaped input to signMessage. This
is an experiment, not a supported or proven Phantom V1 integration, and not a
promise of an approval popup. A refusal is retained and stops the attempt. No
prefix, digest, encoded text, alternative API, V0 downgrade or hidden fallback
is used to evade a rejection. The review states that signing authorizes coin
creation and spending, not login or wallet ownership verification.

Every accepted signature must verify against the exact original message and
expected payer. The existing mint co-signature is retained, verified and combined
using Kit. Both signatures and the final transaction are rechecked by the caller
and backend before normal submission and finalized image/coin verification.

## Retained native and other-wallet behavior

The [V1 transaction-object adapter](atomic-v1-wallet-object-signing.md) is retained
for callers selecting native transaction signing. It is still the signing helper's
default; the public experiment explicitly chooses its own mode. Native signing is
NOT tried automatically after an experimental request fails.

Wallet Standard flows retain their method-specific behavior and the actual
[Launch connection/session setup](atomic-v1-launch-button-connection.md) remains.
The [existing metadata/recovery implementation](phantom-atomic-launch-completion.md)
is unchanged except for the public error/experiment labels documented in PR #12.

The connected account remains payer/creator/buyer. The mint key stays in the
browser. Coin/image/first-buy instructions, image commitment, backend schema and
submission, exact signed transaction limit, and finalized proof remain unchanged.
The persisted transport label `phantom-request` and submission mode `signTransaction`
remain for backend compatibility; UI labels state the actual experimental API.

`ATOMIC_V1_PHANTOM_REQUEST_ENABLED=false` continues to disable the dedicated route.
No new flag, Jupiter API key, dependency update or connected-wallet private key
is required. Cached size previews and connection-state initialization do not gate
the Launch button, but actual integrity, account, lifetime and simulation checks
are preserved. Existing admin and unrelated wallet features remain unchanged.

Browser locks/per-record conditional writes do not establish a unique initial
database insert; this experiment does not change those guarantees or rate limits.
Automated tests use mock providers and temporary keys, not live wallets or funds.
Read the experiment document and PR #12 for the latest observed CI results and
limitations. No deployed Base44 or mainnet success is claimed.
