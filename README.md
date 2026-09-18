# Punks

**Version 2.0.0** · [What's New](#whats-new)

> **Less trust. More truth.** Punks (Solana Cypher Punks) is a curation platform for one-of-one on-chain works: inscribe images permanently on Solana, verify the bytes are really there, launch pump.fun coins with inscribed metadata, and share the work in a wallet-native social feed.

Punks combines these capabilities built on the same on-chain inscription foundation:

1. **Inscribe and verify images on-chain.** Upload an image, write its bytes on-chain in ordered version 1 transactions through the Metaplex inscription program, and finalize a single-supply NFT whose image lives entirely in Solana account data. Every inscription is read back and hash-verified before it is called complete. See [Flagship: Inscribing on V1 with Metaplex](#flagship-inscribing-on-v1-with-metaplex).
2. **Launch pump.fun coins with mutable, on-chain-anchored metadata.** The coin's URI points to the app's resolver, which reads the current source inscription state. While the controlled source inscription remains updateable, its image, name, ticker, and description can change without replacing the launched coin. See [Mutable On-Chain Metadata for pump.fun Coins](#mutable-on-chain-metadata-for-pumpfun-coins).
3. **Curate and share on a wallet-native social layer.** Collectors and creators claim a wallet profile, publish posts, and browse a shared feed. Every social write is authorized by a wallet signature over a server-issued single-use nonce, with per-wallet rate limiting.
4. **Inscribe and launch without an admin.** Public inscribe and public launch pages let any connected wallet pay for and drive its own inscription and coin launch.

Verification is the proof layer beneath both capabilities. Submit a token mint address or transaction signature and the application independently checks four supported inscription paths:

- **Metaplex inscriptions** (`mpl-inscription`)
- **LibrePlex inscriptions**, including `InscriptionV3`
- **Images embedded in versioned Solana transactions**, including transaction version 1
- **Inscriptions held by a token's own mint address**, which lets a fungible token carry a verifiable on-chain image

When an image is found, Validate reads the bytes from finalized chain data, confirms that they form a complete supported image, calculates a SHA-256 digest, and presents the associated accounts and verification evidence.

## Table of Contents

- [What's New](#whats-new)
- [Flagship: Inscribing on V1 with Metaplex](#flagship-inscribing-on-v1-with-metaplex)
- [Mutable On-Chain Metadata for pump.fun Coins](#mutable-on-chain-metadata-for-pumpfun-coins)
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

## What's New

### 2.0.0 — Punks

**Curation platform and brand**

- Rebranded from Validate to **Punks** (Solana Cypher Punks), reframed as a curation platform for one-of-one on-chain works by collectors and creators.
- Dark, gold-accented design system on Space Grotesk and JetBrains Mono, with shimmer skeleton loaders instead of spinners.
- Five-tab bottom navigation: Punks, Inscribe, Launch, Feed, Profile.

**Wallet-native social layer**

- Phantom wallet connection, wallet profiles (handle, display name, bio, avatar, banner), a shared post feed, and per-wallet profile pages.
- Every signed social action requires a server-issued single-use nonce, and posting is rate limited to one post per minute per wallet.

**Public inscribe and public launch**

- Any connected wallet can pay for and drive its own inscription and pump.fun launch, using a public signing wallet separate from the admin wallet.
- Dual-wallet architecture: `ADMIN_MINT_WALLET_SECRET_KEY` signs all admin actions, `MINT_WALLET_SECRET_KEY` signs public ones.

**Durable background inscription worker**

- Inscriptions no longer depend on an open browser tab. A `MintRecord` job stores the private source image, chunk size, offset, and confirmed offsets, and a scheduled worker writes chunks server-side.
- Append-only, per-record event log with the signing wallet's public key, exposed in the admin console and exportable as JSON or CSV.
- The source image is archived to private storage when a mint completes, with a signed download link from the admin console.
- **Resume correctness:** re-submitting a mint keeps its saved offset and confirmed offsets — only a different source image size restarts at zero — and a failed run persists every chunk it confirmed, so retries continue from the last confirmed offset instead of restarting the progress bar.

**Verification and metadata**

- Partial-inscription preview with progressive reveal and an on-chain-verified placeholder when the browser cannot decode partial bytes.
- The metadata resolver serves a real composited PNG for incomplete images so external platforms render partial status correctly.
- Metadata repair flow to rewrite name, ticker, and description on an existing inscription.

## Purpose

Conventional token metadata can point to mutable websites, gateways, or third-party storage. A metadata field containing an image URL does not prove that the image itself is stored on-chain.

Punks answers a narrower, independently verifiable question:

> **Do finalized Solana data or supported inscription accounts contain a complete image connected to this mint or transaction?**

The application deliberately distinguishes fungible token metadata from NFT-style on-chain inscriptions. A fungible token logo exposed by an indexer is not treated as an inscription unless supported on-chain image bytes are found.

## Features

- Inscribes images on-chain with Metaplex across ordered version 1 transactions
- Writes image bytes in resumable chunks, so an interrupted inscription continues on the same mint
- Runs inscriptions server-side in a durable background worker that survives closed browser tabs
- Keeps an append-only event log per mint, exportable as JSON or CSV, and archives the source image on completion
- Lets any connected wallet inscribe and launch publicly, or an admin do so from the console
- Provides wallet profiles and a shared social feed, with signature- and nonce-authorized writes
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

## Mutable On-Chain Metadata for pump.fun Coins

Standard token launches commonly point to content-addressed or otherwise fixed metadata. That is useful for permanence, but it prevents a creator from changing the displayed image, name, ticker, or description after launch.

Punks introduces a different model: **a stable coin URI backed by controlled, on-chain inscription data**.

### How it works

1. An image and its descriptive metadata are written into a source inscription on Solana.
2. A pump.fun coin is launched with a URI pointing to Validate's public `inscriptionMetadata` resolver.
3. The resolver reads the current on-chain state of the source inscription and returns pump.fun-compatible metadata.
4. While the admin mint wallet retains the required inscription authority, the source image bytes or metadata can be rewritten.
5. Consumers that fetch the stable URI receive the latest verified inscription state without any change to the coin's mint address.

The current resolver URI has this form:

```text
https://solvalidate.base44.app/functions/inscriptionMetadata?mint=<inscribedMint>
```

### What can change

| Served by the inscription-backed URI | Controlled by the launched coin |
| --- | --- |
| Image | Coin mint address |
| Name | Token supply and program state |
| Ticker / symbol | Bonding curve |
| Description | Launch transaction history |

This does not rewrite the pump.fun coin account. It changes the metadata returned by the coin's existing URI, with the latest values still anchored in the controlled on-chain inscription.

### Authority is the key constraint

Post-launch editing is possible only while the operator retains the authority required to update the source inscription. Permanently transferring or relinquishing that control freezes the source and ends the ability to make further metadata changes. This creates a deliberate choice between an evolving metadata source and a permanently locked artifact.

### Production durability

The launched URI is a long-lived dependency. Before treating it as permanent infrastructure, the resolver should use a stable custom domain controlled by the project rather than relying indefinitely on the current hosted app address.

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
| Solana decoding and inscription writes | `@solana/web3.js`, Metaplex `mpl-inscription` v0.8.1 |
| pump.fun launches | `@pump-fun/pump-sdk` v2 create-and-buy and fee-sharing instructions |
| Network | Solana mainnet |
| RPC and indexing | Private Solana RPC and Helius |

### Design Principles

- **Chain data is the proof.** Indexer content helps discovery and naming but never replaces byte verification.
- **Standards remain independent.** One valid path does not suppress the evidence from the other checks.
- **Ambiguity is visible.** Provider failures and inconclusive structures return `unknown`, not a false negative.
- **Credentials stay server-side.** RPC and indexing secrets are never included in browser code.
- **Public verification is read-only.** Authenticated admin workflows separately sign inscription and launch transactions with the configured mint wallet.

## Project Structure

```text
src/
├── pages/
│   ├── Home.jsx                         # Punks landing and verification experience
│   ├── PublicInscribe.jsx               # Wallet-paid public inscription
│   ├── PublicLaunch.jsx                 # Wallet-paid public pump.fun launch
│   ├── Feed.jsx                         # Shared social feed
│   ├── SocialProfile.jsx                # Wallet profile page
│   ├── AdminMint.jsx                    # Admin inscription and launch console
│   └── AdminMints.jsx                   # Admin mint history and recovery
├── contexts/
│   └── PhantomWalletContext.jsx         # Wallet connection state
├── components/
│   ├── ValidationForm.jsx               # Address input and client validation
│   ├── ValidationResult.jsx             # Combined four-check result
│   ├── social/                          # Feed, composer, profile panels, skeletons
│   └── admin/
│       ├── MintForm.jsx                 # Inscription details and image input
│       ├── MintStatus.jsx               # Progress, recovery controls, and logs
│       ├── BackgroundMintJobs.jsx        # Live background job progress
│       ├── InscriptionLog.jsx            # Durable server-side event log
│       ├── MintLogExport.jsx             # JSON/CSV export and image archive
│       ├── MetadataRepairForm.jsx        # Rewrite on-chain metadata fields
│       ├── PumpLaunchPanel.jsx           # pump.fun launch form
│       ├── AdvancedLaunchOptions.jsx     # Guided market and fee settings
│       ├── PairAssetSelect.jsx           # Supported pair selector
│       ├── FeeShareEditor.jsx            # Custom fee allocation
│       └── PumpLaunchResult.jsx          # Launch status and next actions
├── hooks/
│   ├── useInscribedMint.js              # Resumable inscription lifecycle
│   └── usePumpLaunch.js                 # Launch-attempt lifecycle
└── api/
    └── base44Client.js                  # Preconfigured Base44 SDK client

base44/
├── functions/
│   ├── validateInscription/             # Public validation endpoint
│   ├── findInscriptionExamples/         # Verified discovery endpoint
│   ├── inscriptionMetadata/             # Metadata and image resolver
│   ├── mintInscribedNft/                # Admin and public inscription pipeline
│   ├── processInscriptionJobs/          # Background chunk-writing worker
│   ├── mintArchiveLink/                 # Signed archive download links
│   ├── socialWallet/                    # Nonce issuance and signed social writes
│   ├── launchPumpCoin/                  # Admin pump.fun launch endpoint
│   ├── publicPumpLaunch/                # Wallet-paid pump.fun launch endpoint
│   └── confirmLaunches/                 # Pending-launch settlement
├── workflows/
│   ├── Background Inscription Queue.jsonc  # Scheduled inscription worker
│   └── Confirm Pump Launches.jsonc      # Scheduled confirmation
└── shared/
    ├── verifyAllInscriptions.ts         # Combined verification orchestration
    ├── verifyInscription.ts             # Metaplex verification
    ├── verifyLibreplex.ts               # LibrePlex verification
    ├── v1Transaction.ts                 # Versioned transaction parser
    ├── mintWallet.ts                    # Admin signer and network checks
    ├── pumpLaunch.ts                    # Stable mint and settlement helpers
    └── pumpPairs.ts                     # Supported pair catalog
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
| `SOLANA_RPC_URL` | Private Solana mainnet JSON-RPC endpoint used for finalized reads, inscription writes, and launches. |
| `SOLANA_RPC_URL_DEVNET` | Optional Solana devnet endpoint used for non-launch development. |
| `INSCRIPTION_API_URL` | Helius-compatible RPC/indexing endpoint used for discovery and historical resolution. |
| `INSCRIPTION_API_KEY` | Credential for the inscription/indexing endpoint. |
| `ADMIN_MINT_WALLET_SECRET_KEY` | Admin wallet key. Signs **all** admin inscription writes, finalizations, and pump.fun launches, and retains control of editable sources. |
| `MINT_WALLET_SECRET_KEY` | Public wallet key used to sign wallet-paid public inscriptions and launches. |

Both configured providers must target Solana mainnet. Example discovery verifies the mainnet genesis hash before scanning accounts.

## Backend Functions

### `validateInscription`

Verifies a mint address or transaction signature and returns independent evidence for each supported inscription path.

### `inscriptionMetadata`

Public metadata and image resolver used by launched coins. It validates the requested source inscription, reads current on-chain data, and returns either pump.fun-compatible JSON metadata or verified image bytes. Bounded in-memory caching and per-IP rate limiting reduce repeated RPC work.

### `mintInscribedNft`

Resumable inscription pipeline. It prepares the Metaplex NFT and inscription accounts, writes image bytes in ordered chunks, verifies the completed image, finalizes the single-supply edition, and supports recovery on the same mint. Admin requests always sign with the dedicated admin wallet; public requests sign with the public wallet after their payment is verified.

### `processInscriptionJobs`

Background worker for queued `MintRecord` jobs. It loads the private source image, writes a bounded number of chunks per run, records every step in the record's durable event log with the signing wallet's public key, verifies the finished image against its SHA-256 digest, finalizes the edition, and archives the source image. Progress is preserved across failures so a retry continues from the last confirmed offset.

### `mintArchiveLink`

Issues a short-lived signed URL for a mint's archived or source image, for admin download.

### `socialWallet`

Issues single-use wallet nonces and verifies wallet signatures for profile and post writes, enforcing a one-post-per-minute-per-wallet limit.

### `publicPumpLaunch`

Wallet-paid pump.fun launch endpoint for the public launch page, mirroring the admin launch flow with payment verification instead of admin authentication.

### `launchPumpCoin`

Admin-only pump.fun V2 launch endpoint. It verifies the source inscription and admin control, checks that the public resolver is ready, derives a retry-stable coin mint, and creates and buys the coin. The guided launch supports pump.fun-enabled pair assets, configurable creator fees, holder rewards, and post-launch fee-sharing configuration.

### `confirmLaunches`

Settles pending launch records against Solana account, signature, and block-height state. It is designed to run through the scheduled confirmation workflow rather than hold a server request open while a transaction settles.

### `findInscriptionExamples`

Discovers candidate Metaplex and LibrePlex image inscriptions, performs full verification, and returns only valid examples with a cursor for continued discovery.

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
- The public verifier never requests seed phrases, private keys, wallet connections, or transaction signatures.
- Verification performs no writes to Solana; authenticated admin minting and launch actions are separate, explicit workflows.

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

**Punks** — Less trust. More truth. · v2.0.0