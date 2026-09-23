# Atomic V1 native signing: implementation and release gates

Status: **draft implementation; public launching disabled by default**.
Baseline: `465d0f244e71954585f722004e635dfa242b839c`.
No deployment, merge, wallet approval, or blockchain broadcast is authorized by this change.

## Architecture

The existing admin builder and signer remain unchanged. The public flow uses native Wallet Standard transaction signing, not `signMessage`. The atomic transaction still contains Pump creation, optional first buy, and the original Noop `VALIDATE-v1` image payload. The connected account is payer/creator/buyer; the browser holds only the separate mint key.

`atomicV1WalletRegistry.js` implements the standard's two discovery events directly, without a new dependency or CDN script. The selected wallet/account is shared only between the atomic launch and history routes. Other Phantom pages are not migrated. Each method checks **numeric 1** in its own `supportedTransactionVersions`; advertised support does not enable a method by itself.

The backend adapter pins Kit 8.3.0; the frontend uses the existing repository lockfile (CI records resolved versions). Kit performs canonical transaction encoding/decoding and PDA derivation. The dependency-free protocol inspector independently checks boundaries, signer order, config, and commitment. `atomicV1Intent.js` validates Pump identity and critical accounts against local inputs/PDAs, rejects unknown instructions, bounds the SOL buy, and verifies the exact image bytes. Future Pump SDK layouts must update both policy and real-SDK fixtures; do not weaken the policy to make an unknown transaction pass.

The public builder finalizes resource settings with unsigned simulation before approval. Sign-only responses must preserve the message and mint signature exactly; every signature is verified locally and server-side, followed by `sigVerify: true` simulation. V1 never passes through `phantomTransaction.js` (a legacy/V0 helper).

### Native sign-only

Prepare -> validate -> mint sign -> native wallet sign -> persist signed bytes locally -> backend validates/simulates -> conditional persistence of transaction ID and bytes -> broadcast -> finalized verification. RPC timeouts retain the known transaction identity. Retry can only rebroadcast those identical bytes.

### Native sign-and-send

Prepare -> validate/simulate -> mint sign -> persist local uncertainty -> conditionally arm the server record -> wallet signs/broadcasts -> persist callback ID -> register -> independently verify finalized bytes.

The backend **cannot** inspect the final payer signature before broadcast on this route. The wallet integration must preserve the supplied message and mint signature. This route has its own allowlist and acceptance tests; it is not an automatic fallback. Timeout/cancellation after arming is conservatively treated as uncertain until checked or finalized expiry is proved. A known callback ID is retained even if the selected account changes. When the callback is lost, reconciliation scans the mint's finalized history and matches the prepared message hash. A full result page blocks expiry rather than pretending history was complete.

## Rollout configuration (backend secrets only)

Defaults, including missing/malformed configuration, keep new public actions disabled:

```
ATOMIC_V1_NATIVE_ENABLED=false
ATOMIC_V1_NATIVE_WALLETS={}
ATOMIC_V1_FIRST_BUY_ENABLED=false
```

After the gates below pass, an operator can separately approve a method, for example `{"Jupiter":["signTransaction"]}` or `{"Jupiter":["signAndSendTransaction"]}`. This is an example, **not a tested production setting**. Do not enable a method because another method worked. Do not enable Phantom based on the brand name or version string alone. First buy has its own default-off gate.

`SOLANA_RPC_URL` remains the existing backend RPC. No Jupiter API key is used or sent to the browser. Jupiter Wallet signing is not a Jupiter swap/API integration. The wallet-name allowlist is a rollout control, not proof of identity; transaction signatures establish authority.

Turning the feature off prevents prepare/size/preflight/arm/submit/retry/refresh. History, private resume/confirm and callback registration remain available so disabling new launches does not strand submitted transactions.

## State, authorization and recovery

Native records are marked `nativeProtocol: 2`; legacy records are not silently promoted. Entity RLS remains admin-only; public endpoints use service role but return an explicit safe field allowlist. The client generates a random recovery capability before preparing. Only its SHA-256 binding to request ID, wallet and mint is stored server-side. Public status/history never return the capability hash, message, or signed bytes. The bearer capability remains in the user's recovery storage; message signing validity is bounded by its blockhash. Protect browser storage and do not log recovery payloads.

Prepared intent is immutable. Writes use Base44 `updateMany({id,stateVersion,messageHash}, {$set:...})` and require exactly one update. There is **no** fallback to a non-atomic read/update or an in-memory server lock. Read-back checks detect missing persistence before approval. Conditional-write failures require a reload. Base44 documents this query/update contract, but atomic conflict behavior must still be exercised against the deployed backend before enabling it.

The backend has no documented create-if-absent primitive in this implementation. Concurrent *initial* prepare requests may produce more than one immutable row for the same mint. Existing preparations are never overwritten; subsequent transitions are conditional; the same mint cannot be created twice successfully on-chain. This is **not** a claim of exactly-once database creation or zero duplicate failed-transaction fees. Before public rollout, prove/create a unique initial-preparation claim in the deployed storage layer and load-test it, or retain the gate. Edge rate limits for unauthenticated size/prepare requests are also a rollout requirement; the per-wallet authorized-launch limit is not DDoS protection.

Refresh requires finalized block height past expiry, an invalid old blockhash, and an absent mint. Missing/incomplete RPC evidence must not authorize refresh. The same mint and local intent are reused; all prior signatures are discarded only after a fresh preparation succeeds. Known landed failures do not silently relaunch. An existing mint without matching proof requires investigation.

The request ID, mint and recovery capability survive reload. Original mint keys are not regenerated for an already prepared launch. Keys are removed only after verified completion or deliberate discard of a never-signed/never-broadcast draft. Existing shared mint-key callers keep the same storage format, but corrupt storage now fails visibly instead of silently replacing keys. This storage is not encrypted and does not protect against XSS; it never contains the user's wallet private key.

## Verification and metadata

Native success requires a finalized V1 transaction whose exact message matches the saved digest, valid payer/mint signatures, expected Pump creation and optional buy, and the image commitment inside the intended Noop instruction. The decoded image hash and byte length must match. Finalized mint and bonding-curve ownership are also checked. Mere transaction-ID receipt or a raw byte-pattern search is insufficient.

The existing generic/admin inscription scanner remains unchanged. The native public confirmation path uses the stronger codec/intent verification instead. Metadata does not allow an unverified public preparation to shadow a verified record; existing admin preparation preview remains available. Test wallet metadata preview behavior because public native metadata is unavailable until verified.

## Tests and evidence

Local command:

```
node --test tests/atomic-v1/native.test.mjs
```

The initial run passed **27 offline tests** on Node 22.16.0. These use real ephemeral Ed25519 keys but synthetic wire fixtures and mocked wallet, codec and entity/RPC adapters. They test policy, signatures, size boundaries, account/lifetime failures, state transitions, concurrency, sanitized DTOs, discovery and recovery. They are **not** a real wallet, Base44, or Pump execution test.

`tests/atomic-v1/sdk.test.ts` uses actual pinned Kit 8.3.0, Compat 8.3.0, Pump SDK 2.0.0, a complete generated PNG, real Pump create instruction and real signing keys. It never connects to RPC or requests runtime network permission. It was not run locally because dependency downloads and cloning were unavailable. The CI workflow runs it and application checks for both base and head. The `--no-check` integration run is a runtime test, not Deno typechecking.

The local partial workspace was not a repository clone. Full `npm ci`, application build, lint and typecheck have **not** been established locally. No live Jupiter or Phantom approval has been performed. No live Base44 conditional-write semantics have been established. Do not describe a configured workflow as a passing workflow.

### Required evidence before enabling

1. CI SDK round-trip and application checks; compare pre-existing baseline failures separately. Add an actual SDK create-and-buy fixture using approved global/fee data and validate every supported SOL instruction variant before enabling first buys.
2. Deployed Base44 schema round-trip, conditional-update conflict tests, cross-request/cross-wallet overwrite tests, unique initial preparation claim, endpoint load/rate limits, no private fields in responses.
3. Record wallet name/build, browser/platform, selected method/capabilities, native approval behavior, mint signature preservation, >1232-byte transaction behavior, cancellation/account switching/expiry and timeout recovery. Each wallet/method/platform is a separate acceptance target.
4. Explicitly authorized end-to-end Pump create+image and create+buy+image tests on a cluster with the required programs/accounts. Generic devnet wallet signing does not prove mainnet Pump compatibility. Check finalized exact image reconstruction and public metadata.
5. Recovery across reload/navigation/disconnect, lost callback handling, schema migration compatibility and unchanged admin/other Phantom flows. Verify WebCrypto Ed25519 support in targeted browsers; fail closed when unavailable.

No CI test is permitted to broadcast or consume secrets. Mainnet testing requires a separate explicit approval and wallet confirmation.

## Primary references (checked during September 23, 2026 research)

- https://solana.com/upgrades/larger-transaction-sizes
- https://github.com/solana-foundation/transaction-v1-examples/tree/main/ts/wallet-table
- https://github.com/solana-foundation/transaction-v1-examples/blob/main/ts/wallet-table/src/known-wallets.ts (hand-maintained Jupiter 1.18.0 note; not this app's acceptance evidence)
- https://github.com/anza-xyz/wallet-standard/blob/master/packages/core/features/src/signTransaction.ts
- https://github.com/wallet-standard/wallet-standard/blob/master/packages/core/app/src/wallets.ts
- https://github.com/solana-foundation/solana-improvement-documents/blob/main/proposals/0385-transaction-v1.md
- https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
- https://docs.base44.com/developers/references/sdk/docs/type-aliases/entities
- https://solana.com/docs/rpc/http/simulatetransaction
- https://docs.phantom.com/solana/sending-a-transaction-1

This document supersedes older README claims that the public Atomic V1 flow is already Phantom-compatible. The admin path remains separate; production native-wallet compatibility remains gated on the evidence above.
