# Atomic V1 native signing

## Current wallet transport

The current Phantom transaction-object correction is documented in
[Phantom V1 wallet-object signing](atomic-v1-wallet-object-signing.md).
It supersedes the raw-message `provider.request` signing transport described in
the earlier completion document.

The public **Launch atomic V1 coin** action connects Phantom when necessary,
awaits the correct wallet's session, prepares the coin/image transaction, adds
the browser-held mint signature, and calls `provider.signTransaction` with a real
V1 VersionedTransaction object. Kit supplies canonical message/wire serialization;
web3.js 1.99.0's V1 reader supplies the decoded object but is not used as a V1
transaction encoder. Both original message intent and returned signatures are
validated before submission.

The native route does not require Wallet Standard to advertise V1. It also does
not pretend that a wallet supports V1: the installed wallet may still reject it.
There is no signMessage fallback, V0 relabeling, alternate automatic signing
request or separate image transaction. The `phantom-request` stored label remains
for compatibility with existing backend policy and saved launches.

## Existing lifecycle and configuration

- [Launch-driven connection/session behavior](atomic-v1-launch-button-connection.md)
- [Earlier preparation, metadata and recovery implementation](phantom-atomic-launch-completion.md)

Only the signing transport in the older completion document is superseded. The
connected account remains payer/creator/buyer, the mint key stays in the browser,
and the image commitment, metadata authorization, first-buy limit, signature
verification and finalized launch proof retain their existing behavior.

`ATOMIC_V1_PHANTOM_REQUEST_ENABLED=false` explicitly disables the dedicated native
route. Older native-wallet flags continue controlling the separate Wallet Standard
routes. No new secret, Jupiter API key or connected-wallet private key is required.

Cached size previews and a missing rendered connection/session do not gate the
Launch action. Actual transaction integrity, size, expiry, simulation and account
checks remain. Existing admin and unrelated wallet features are unchanged.

Browser Web Locks/per-record conditional writes still do not establish a unique
initial database insert; ingress rate limiting remains operational hardening.
The new object adapter does not change those backend guarantees.

Tests exercise real codecs/instructions and real ephemeral signatures, but wallet
providers are mocked. No test result here is evidence of a live Phantom approval,
a successful mainnet creation, or a deployed Base44 application. See the current
PR and wallet-object document for the exact test results and their limits.
