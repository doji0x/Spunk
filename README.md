# Validate

> **Less trust. More truth.** Inscribe images on Solana with Metaplex on transaction version 1—and prove the bytes are really there.

**Flagship: inscribing on V1 with Metaplex.** Validate's primary product is a permanent, wallet-based inscription pipeline: upload an image, write its bytes on-chain in ordered version 1 transactions through the Metaplex inscription program, and finalize a single-supply NFT whose image lives entirely in Solana account data. No gateways, no IPFS, no hosted URLs. Every inscription is hash-verified against the uploaded file before it is called done. See [Flagship: Inscribing on V1 with Metaplex](#flagship-inscribing-on-v1-with-metaplex).

Verification is the proof layer beneath it. Submit a token mint address or transaction signature and the application independently checks four supported inscription paths:

- **Metaplex inscriptions** (`mpl-inscription`)
- **LibrePlex inscriptions**, including `InscriptionV3`
- **Images embedded in versioned Solana transactions**, including transaction version 1
- **Inscriptions held by a token's own mint address**, which lets a fungible token carry a verifiable on-chain image

When an image is found, Validate reads the bytes from finalized chain data, confirms that they form a complete supported image, calculates a SHA-256 digest, and presents the associated accounts and verification evidence.

## Table of Contents

- [Flagship: Inscribing on V1 with Metaplex](#flagship-inscribing-on-v1-with-metaplex)
- [Purpose](#purpose)
- [Features](#features)
- [Supported Standards](#supported-standards)
- [Fungible Token Verification](#fungible-token-verification)
- [How Verification Works](#how-verification-works)
- [Result Semantics](#result-semantics)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Configuration](#configuration)
- [Backend Functions](#backend-functions)
- [Build and Quality Checks](#build-and-quality-checks)
- [Deployment and Repository Sync](#deployment-and-repository-sync)
- [Security and Privacy](#security-and-privacy)
- [Scope and Limitations](#scope-and-limitations)
- [Troubleshooting](#troubleshooting)
- [Reference Documentation](#reference-documentation)

## Purpose

Conventional token metadata can point to mutable websites, gateways, or third-party storage. A metadata field containing an image URL does not prove that the image itself is stored on-chain.

Validate answers a narrower, independently verifiable question:

> **Do finalized Solana data or supported inscription accounts contain a complete image connected to this mint or transaction?**

The application deliberately distinguishes fungible token metadata from NFT-style on-chain inscriptions. A fungible token logo exposed by an indexer is not treated as an inscription unless supported on-chain image bytes are found.

## Features

- Inscribes images on-chain with Metaplex across ordered version 1 transactions
- Writes image bytes in resumable chunks, so an interrupted inscription continues on the same mint
- Confirms every inscription by reading the bytes back from chain and matching the SHA-256 digest
- Finalizes a single-supply Master Edition, and can bind an inscription permanently to a fungible token
- Accepts Solana mint addresses and transaction signatures
- Always runs Metaplex, LibrePlex, versioned-transaction, and token-held checks
- Verifies fungible tokens by inspecting inscribed NFTs held by the token's own mint address
- Resolves canonical program-derived addresses and inscription relationships
- Supports direct transaction inspection and mint-history scanning
- Reads image bytes from finalized Solana accounts or transaction instructions
- Detects complete PNG, JPEG, GIF, and WebP files by byte structure
- Generates a SHA-256 digest from the exact verified bytes
- Reports inscription accounts, image-data accounts, byte size, and lookup time
- Reports authority or immutability evidence when the protocol exposes it
- Cross-checks indexed asset context through Helius without accepting indexer metadata as proof
- Discovers real Metaplex and LibrePlex inscriptions for one-click verification
- Links proof details to the Solana explorer
- Returns explicit `valid`, `invalid`, or `unknown` outcomes for each standard

## Supported Standards

### Metaplex Inscriptions

The Metaplex verifier resolves inscription metadata and associated image accounts using the Metaplex inscription program. It validates program ownership, account structure, mint linkage, the image association, byte limits, and the resulting image payload.

For transaction inputs, the verifier inspects transaction accounts, identifies plausible token mints, and resolves direct or indexed inscription relationships. Historical inscription lookup is available through Helius when older records do not expose an immediately usable mint link.

### LibrePlex

The LibrePlex verifier supports the program:

```text
inscokhJarcjaEs59QbQ7hYjrKz25LEPRfCbP8EmdUp
```

It decodes legacy and `InscriptionV3` account layouts, derives the expected inscription and data PDAs, confirms that the decoded root matches the submitted mint, validates image content declarations, and reads the associated data account.

LibrePlex data may contain raw image bytes even when the account declares base64 encoding. Validate safely checks the raw payload first and then attempts base64 decoding when necessary.

### Versioned Transaction Images

The transaction verifier requests transactions with `maxSupportedTransactionVersion: 1`, parses instruction data, and searches for complete image payloads embedded in the transaction.

- A transaction signature is inspected directly.
- A mint address triggers a bounded scan of recent mint-related transaction history.
- Findings include a confidence level because instruction-level byte detection may not provide the same canonical mint relationship as a protocol-defined inscription PDA.

This check is always reported independently from the Metaplex and LibrePlex results.

### Inscriptions Held By A Token Address

The token-held verifier lists single-supply, zero-decimal token accounts owned by the submitted address, then runs full Metaplex inscription verification against each held mint. A valid result reports the held NFT mint alongside the usual image evidence.

## Fungible Token Verification

Fungible tokens cannot embed an image in their own mint account. Validate supports a permanent alternative: an inscribed NFT is transferred into a token account owned by the fungible token's mint address.

Because no private key exists for a mint address, the inscribed NFT can never be moved again. The image therefore becomes an irreversible, on-chain property of that token.

Submitting the fungible token's contract address returns:

- the held inscribed NFT mint;
- the inscription and image accounts;
- the decoded image bytes, MIME type, and byte length; and
- the SHA-256 digest of the exact verified bytes.

This verifies image bytes and their permanent linkage only. It does not verify the token's team, liquidity, distribution, or safety.

## Flagship: Inscribing on V1 with Metaplex

Inscribing an image with Metaplex on transaction version 1 is Validate's flagship capability. The pipeline is live today in an administrator-only console and is **coming soon for all users** with wallet-based signing. The user workflow is:

1. **Connect a wallet** — the user connects a Solana wallet instead of relying on a server-side signer.
2. **Upload an image** — PNG, JPEG, GIF, or WebP up to the supported size limit, validated by byte signature and browser decode before any transaction is created.
3. **Enter token details** — name, ticker, and description stored in the inscription metadata.
4. **Review the preflight estimate** — account rent, per-chunk transaction fees, and the total inscription cost are shown before signing.
5. **Create the NFT** — a Metaplex NonFungible mint is created with print supply limited to 1.
6. **Initialize the inscription** — the mint-derived inscription account, inscription metadata, and the associated `image` inscription account are created.
7. **Write the image** — image bytes are written in ordered chunks across version 1 transactions, with resumable progress so an interrupted upload continues instead of restarting.
8. **Verify on-chain** — the written bytes are read back from finalized chain data and hashed; the SHA-256 digest must match the uploaded file.
9. **Finalize the edition** — the Master Edition is finalized at `maxSupply` 1 and `supply` 1.
10. **Optionally bind to a fungible token** — the finalized inscribed NFT can be sent to a fungible token's mint address, making it permanently verifiable through the token-held check.

Every step is idempotent and resumable by design: a stalled inscription is always resumed on the same mint rather than replaced by a new one.

### Detailed Workflow

#### 0. Preconditions

- The RPC endpoint's genesis hash is checked against mainnet (`5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`) before any transaction is built. Any other cluster aborts the run.
- The caller must be authenticated and hold the `admin` role while the console remains administrator-only.
- The signer is loaded server-side today (64-byte secret key); in the public release the connected wallet becomes the signer and fee payer.

#### 1. Image validation

| Rule | Enforcement |
| --- | --- |
| Size | 1 MB maximum |
| Type | `image/png`, `image/jpeg`, `image/gif`, `image/webp` |
| Byte signature | PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, GIF `GIF87a`/`GIF89a`, WebP `RIFF`…`WEBP` |
| Decodability | The browser must fully decode the file into an image before minting is allowed |

The declared MIME type and the actual leading bytes must agree. A mismatch is rejected in the browser and again on the first server-side write.

#### 2. Address derivation

Every account is program-derived, so the same input always resolves to the same addresses and a resumed run cannot drift:

```text
mint                         → new keypair, or an existing mint being resumed
inscriptionAccount           → findMintInscriptionPda(mint)
inscriptionMetadataAccount   → findInscriptionMetadataPda(inscriptionAccount)
associatedInscriptionAccount → findAssociatedInscriptionPda(inscriptionMetadataAccount, tag: "image")
masterEditionAccount         → findMasterEditionPda(mint)
uri                          → https://igw.metaplex.com/mainnet/<inscriptionAccount>
```

The `uri` is a convenience gateway for wallets, never a source of truth: the image bytes live in `associatedInscriptionAccount`.

#### 3. Preparation transactions (`start`)

Each step is skipped when the chain already reflects it, which is what makes resuming safe:

| Step | Instruction | Skip condition |
| --- | --- | --- |
| Create the NFT | `createV1` — `NonFungible`, `sellerFeeBasisPoints` 0, `printSupply: Limited(1)` | mint account already exists |
| Mint the token | `mintV1` — amount 1 to the signer | token supply already 1 |
| Open the inscription | `initializeFromMint` | inscription account already exists |
| Write metadata and open the image slot | `writeData` (JSON `{ name, symbol, description }` at offset 0) plus `initializeAssociatedInscription` (tag `image`), in one transaction | associated inscription account already exists |

`start` returns the mint address, the owner, the write chunk size, and `writtenBytes` — the current on-chain length of the image account — so the client knows exactly where to continue from.

#### 4. Chunked image writes (`append`)

- Chunk size is **800 bytes**: one `writeData` instruction per version 1 transaction.
- Writes are strictly ordered and offset-addressed. The offset must be a multiple of 800, and `offset + length` may never exceed the declared total size.
- The offset-0 chunk is re-validated against the image byte signature server-side.
- Before each write, the image account's current data length is read. If it already covers the target range, the chunk is treated as applied and skipped.
- Each transaction is sent with a fresh blockhash and retried up to three times. On a `block height exceeded` or expired-signature error, the on-chain length is re-checked before retrying, so a transaction that actually landed is never written twice.
- The response returns `nextOffset` and a `complete` flag. The client tracks progress as `offset / totalSize` and keeps the pending state, so an interrupted run resumes instead of restarting.

A 1 MB image is roughly 1,300 sequential transactions — which is why progress tracking and resumability are part of the protocol, not a nicety.

#### 5. On-chain verification

After the final chunk:

1. The client computes SHA-256 over the exact uploaded bytes.
2. `validateInscription` is polled (up to 12 attempts, 2 seconds apart) until the Metaplex check reports `valid`.
3. The digest returned by the verifier — computed from the bytes read back off the chain — must equal the local digest.

A mismatch is a hard failure: the run stops and explicitly instructs the operator to resume the same mint rather than create a new one. Nothing is reported as successful until the chain-read bytes match the upload.

#### 6. Finalization (`finalize`)

- The Master Edition account is decoded to read `supply` and `maxSupply`.
- `maxSupply` must be exactly 1. An existing mint that cannot satisfy this returns `409`, with the embedded image left intact.
- When `supply` is 0, `printV1` prints edition number 1 using a signer derived deterministically from `SHA-256("master-edition-1:" + mint + walletKey)`, so a retried finalize reuses the same edition mint instead of printing a second one.
- The run only succeeds at `maxSupply` 1 and `supply` 1.

#### 7. Optional binding to a fungible token (`transfer`)

- `transferV1` sends the finalized NFT to the associated token account owned by the fungible token's **mint address**.
- Delivery is confirmed by reading a balance of exactly 1 in that destination token account, and the transfer is skipped when it already holds.
- No private key exists for a mint address, so the NFT can never leave. The image becomes an irreversible property of the token, discoverable through the token-held check.

#### Failure and resume rules

| Symptom | Correct action |
| --- | --- |
| Transaction expired | Automatic retry with a fresh blockhash after re-checking chain state |
| Interrupted upload | Resume the same mint; `start` recomputes the offset from `writtenBytes` |
| Verifier not yet `valid` | Keep polling, then resume the same mint — never create a new one |
| Digest mismatch | Stop and resume the same mint; a new mint would orphan paid-for chain data |
| `maxSupply` cannot be set to 1 | The image stays verifiable; only the edition cannot be finalized on that mint |

## How Verification Works

1. **Validate the input** — accept a Base58 Solana mint address or transaction signature.
2. **Run independent checks** — execute Metaplex, LibrePlex, versioned-transaction, and token-held verification in parallel.
3. **Resolve candidate mints** — use the supplied mint directly or inspect transaction account keys for token mints.
4. **Verify protocol linkage** — derive expected PDAs, decode account layouts, and confirm root or metadata relationships.
5. **Read finalized bytes** — retrieve account data or transaction instruction bytes from Solana mainnet.
6. **Detect a complete image** — validate PNG, JPEG, GIF, or WebP boundaries rather than trusting a filename or MIME label.
7. **Calculate evidence** — compute the SHA-256 digest and assemble account, size, authority, and timestamp details.
8. **Return every check** — preserve the outcome of all four checks even when one already produced a valid result.
9. **Render the image** — the client decodes the returned image before displaying a successful overall result.

### Successful Verification Proves

At the recorded lookup time, a `valid` result proves that:

- complete supported image bytes were present in finalized Solana data;
- those bytes satisfied the linkage rules of the reported standard, or were detected in the reported transaction; and
- the displayed SHA-256 hash represents the exact bytes read by the verifier.

It does **not** prove ownership, authorship, originality, provenance outside the supported linkage, intellectual-property rights, token value, or safety.

## Result Semantics

Each standard returns one of three states:

| Status | Meaning |
| --- | --- |
| `valid` | A supported, complete on-chain image was found and verified. |
| `invalid` | The check completed and found no qualifying image, or found a definite protocol/linkage failure. |
| `unknown` | The check could not reach a definitive conclusion, such as an unavailable provider, ambiguous transaction, oversized image, incomplete payload, or unsupported response. |

The combined result is:

- `valid` when any standard is valid;
- `unknown` when none is valid and at least one check is unknown; or
- `invalid` only when every check completed without finding a supported inscription.

The UI never hides the unsuccessful checks behind the successful result.

## Architecture

```text
React / Vite client
        │
        ├── validateInscription
        │       │
        │       ├── Metaplex verifier ───── inscription metadata + image accounts
        │       ├── LibrePlex verifier ──── legacy/V3 inscription + data PDAs
        │       ├── v1 transaction parser ─ direct lookup or mint-history scan
        │       └── token-held verifier ─── inscribed NFTs owned by the mint address
        │
        └── findInscriptionExamples
                │
                ├── paginated Helius program-account discovery
                └── full on-chain re-verification before display

Server-side providers
        ├── private Solana mainnet RPC
        └── Helius RPC / indexing API
```

### Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, React Router |
| Styling | Tailwind CSS, shadcn/ui, Lucide icons |
| Data fetching | Base44 SDK, TanStack Query |
| Backend | Base44 serverless functions running TypeScript |
| Solana decoding | `@solana/web3.js`, Metaplex `mpl-inscription` v0.8.1 |
| Network | Solana mainnet |
| RPC and indexing | Private Solana RPC and Helius |

### Design Principles

- **Chain data is the proof.** Indexer content helps discovery and naming but never replaces byte verification.
- **Standards remain independent.** One valid path does not suppress the evidence from the other checks.
- **Ambiguity is visible.** Provider failures and inconclusive structures return `unknown`, not a false negative.
- **Credentials stay server-side.** RPC and indexing secrets are never included in browser code.
- **Verification is read-only.** The app does not connect wallets, request signatures, or move assets.

## Project Structure

```text
src/
├── pages/
│   └── Home.jsx                         # Main verification experience
├── components/
│   ├── ValidationForm.jsx               # Address input and client validation
│   ├── ValidationResult.jsx             # Combined four-check result
│   ├── StandardCheck.jsx                # Evidence card for one standard
│   ├── InscriptionExamples.jsx          # Paginated verified examples
│   ├── ValidationAbout.jsx              # Methodology and limitations
│   ├── ValidationExplainer.jsx          # User-facing verification flow
│   └── ValidateHeader.jsx               # Brand and network status
└── api/
    └── base44Client.js                   # Preconfigured Base44 SDK client

base44/
├── functions/
│   ├── validateInscription/
│   │   └── entry.ts                     # Public validation endpoint
│   └── findInscriptionExamples/
│       └── entry.ts                     # Verified discovery endpoint
└── shared/
    ├── verifyAllInscriptions.ts          # Combined result orchestration
    ├── verifyInscription.ts              # Metaplex verification
    ├── verifyLibreplex.ts                # LibrePlex legacy/V3 verification
    ├── v1Transaction.ts                  # Versioned transaction image parser
    ├── verifyHeldInscription.ts          # Inscriptions held by a token address
    ├── inscriptionMetadata.ts            # Metaplex PDA and metadata utilities
    └── solanaServices.ts                 # Solana and Helius service access
```

## Local Development

### Prerequisites

- Node.js 20 or newer
- npm
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) for the backend runtime
- A Base44 account with access to the linked app
- A Solana mainnet RPC endpoint
- A Helius API endpoint and key
- Base44 CLI:

```bash
npm install -g base44@latest
```

### Setup

```bash
git clone <repository-url>
cd <repository-directory>
npm install
base44 login
base44 link
base44 dev
```

Open the local URL printed by `base44 dev`. A fresh clone must be linked to the correct Base44 app before backend functions and secrets are available.

For frontend-only work, the standard Vite command is also available:

```bash
npm run dev
```

Features that call Base44 backend functions require a linked Base44 development environment.

## Configuration

Configure secrets in the Base44 app's **Secrets** settings. Never add secret values to source control or client-side environment files.

| Secret | Purpose |
| --- | --- |
| `SOLANA_RPC_URL` | Private Solana mainnet JSON-RPC endpoint used for finalized account and transaction reads. |
| `INSCRIPTION_API_URL` | Helius-compatible RPC/indexing endpoint used for discovery and historical resolution. |
| `INSCRIPTION_API_KEY` | Credential for the inscription/indexing endpoint. |

Both configured providers must target Solana mainnet. Example discovery verifies the mainnet genesis hash before scanning accounts.

## Backend Functions

### `validateInscription`

Verifies a mint address or transaction signature.

Request:

```json
{
  "address": "<solana-mint-or-transaction-signature>"
}
```

Representative response shape:

```json
{
  "status": "valid",
  "standard": "LibrePlex Inscription",
  "mint": "<mint-address>",
  "image": "data:image/png;base64,...",
  "hash": "<sha256-hex>",
  "checkedAt": "<iso-8601-timestamp>",
  "checks": {
    "metaplex": { "status": "invalid" },
    "v1": { "status": "invalid" },
    "libreplex": { "status": "valid" },
    "held": { "status": "invalid" }
  }
}
```

Valid proof objects can additionally include protocol-specific account addresses, MIME type, byte length, authority/immutability information, confidence, transaction signature, and indexer context.

### `findInscriptionExamples`

Discovers candidate image inscriptions from paginated Metaplex and LibrePlex program accounts, then performs full verification before returning anything to the client.

Request:

```json
{
  "cursor": null
}
```

Pass the returned cursor unchanged to request the next page:

```json
{
  "cursor": {
    "metaplexKind": 2,
    "metaplexKey": "<pagination-key-or-null>",
    "libreplexKey": "<pagination-key-or-null>"
  }
}
```

Only `valid` results become clickable examples. The response also reports how many program accounts were scanned and how many candidate checks remained inconclusive.

## Build and Quality Checks

```bash
npm run dev        # Start the Vite development server
npm run build      # Create a production build
npm run preview    # Preview the production build locally
npm run lint       # Run ESLint
npm run lint:fix   # Apply safe ESLint fixes
npm run typecheck  # Check JavaScript/TypeScript declarations
```

Before synchronizing a release, run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment and Repository Sync

This project uses Base44's two-way GitHub Repository Sync.

1. Make changes in Base44 or in the connected GitHub repository.
2. Allow Repository Sync to synchronize the branch and app workspace.
3. Review the synchronized changes in Base44.
4. Run the quality checks above when working locally.
5. Publish the app from Base44 when the synchronized version is ready.

Repository synchronization does not publish the application automatically. Until the app is published, it has no public production URL.

## Security and Privacy

- RPC and Helius credentials are read only by server-side modules.
- The browser receives verification results, never provider credentials.
- User input is restricted to plausible Base58 Solana identifiers before network work begins.
- Verification uses finalized commitment where supported.
- Transaction candidate counts and account batch sizes are bounded.
- Images larger than 5 MB are not rendered by the account-based verifiers.
- Image status is established from byte signatures and complete file boundaries, not untrusted MIME metadata alone.
- Submitted addresses and signatures are already public blockchain identifiers.
- The app never requests seed phrases, private keys, wallet connections, or transaction signatures.
- The verifier performs no writes to Solana and never takes custody of assets.

## Scope and Limitations

- Solana **mainnet only**
- Metaplex, LibrePlex, versioned-transaction, and token-held image paths only
- The token-held check inspects up to ten single-supply tokens owned by an address
- PNG, JPEG, GIF, and WebP only
- Account-based images are limited to 5 MB by the verifier
- Mint-history detection is intentionally bounded and may not inspect every historical transaction
- Indexer availability can affect discovery and historical mint resolution
- RPC pruning, rate limits, temporary provider errors, or unusual account layouts can produce `unknown`
- Versioned-transaction byte detection carries confidence metadata and is not equivalent to a canonical protocol PDA relationship
- Verification represents chain state at the returned `checkedAt` time
- Authority status should not be interpreted as authorship, legitimacy, or legal ownership
- The application does not audit token contracts, creators, marketplaces, links, or executable content

## Troubleshooting

### The result is `unknown`

Review the individual standard cards. One provider or standard can be inconclusive while the others complete normally. Confirm that both RPC endpoints are available, use Solana mainnet, and permit the required JSON-RPC methods.

### A token has a visible logo but verification is invalid

The logo may come from off-chain token metadata or an indexer. Validate requires actual supported image bytes in a recognized inscription account or versioned transaction.

### A fungible token holds an inscribed NFT but the check is invalid

Confirm the inscribed NFT is held in a token account owned by the fungible token's mint address, that its balance is exactly 1 with zero decimals, and that the NFT itself verifies when submitted on its own.

### A known inscription is not found from its mint

Try the original inscription transaction signature. Very old relationships may depend on historical index data, and mint-history scanning is intentionally bounded.

### Example discovery returns no items

Discovery is paginated and only returns candidates that pass full verification. Continue the search with the returned cursor, and confirm that the Helius-compatible endpoint supports `getProgramAccountsV2` pagination.

### Local frontend works but verification does not

Run the app through `base44 dev`, confirm the project is linked to the correct Base44 app, and verify that all required secrets are configured server-side.

## Reference Documentation

- [Base44 GitHub integration](https://docs.base44.com/developers/app-code/local-development/github)
- [Base44 local development](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)
- [Metaplex inscriptions](https://developers.metaplex.com/inscription)
- [Solana JSON-RPC methods](https://solana.com/docs/rpc)
- [Helius documentation](https://www.helius.dev/docs)

---

**Validate** — Less trust. More truth.