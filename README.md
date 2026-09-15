# Validate

> Verify whether an image is authentically inscribed on Solana—not merely referenced by off-chain metadata.

Validate accepts a Solana token mint or transaction signature, resolves its Metaplex inscription accounts, reads the image bytes directly from the network, and presents a clear verification result with supporting evidence.

## Why Validate

NFT metadata can point to mutable web servers, gateways, or third-party storage. Validate focuses on a narrower, verifiable question: **are the actual image bytes stored on Solana and linked to this token through the Metaplex inscription protocol?**

## Features

- Accepts Solana token mint addresses and transaction signatures
- Resolves linked Metaplex inscription metadata and image accounts
- Reads and decodes image bytes directly from Solana mainnet
- Verifies token-to-inscription linkage and supported image formats
- Produces a SHA-256 digest of the verified image bytes
- Reports update-authority and immutability status
- Cross-checks indexed asset metadata through Helius
- Discovers real image inscriptions for one-click testing
- Displays proof details with direct Solana explorer links

## How Verification Works

1. **Resolve input** — determine whether the submitted value is a mint or transaction signature.
2. **Find inscription accounts** — derive canonical program addresses and inspect transaction-linked accounts.
3. **Verify linkage** — confirm the metadata and image inscription belong to the resolved token.
4. **Read image bytes** — retrieve the inscription data directly from finalized Solana accounts.
5. **Validate content** — detect the image format, enforce size limits, decode the image, and calculate its hash.
6. **Present evidence** — return the mint, metadata account, image account, storage size, mutability, and verification timestamp.

## What a Successful Check Proves

A successful result confirms that, at lookup time:

- actual supported image bytes were stored in Solana accounts;
- those bytes were connected to the submitted token through the supported inscription structure; and
- the returned hash represents the exact bytes read during verification.

It does **not** prove ownership, authorship, originality, market value, legal rights, or safety.

## Architecture

```text
React client
    │
    ├── validateInscription ── Solana RPC ── Metaplex inscription accounts
    │                                  └──── image bytes + cryptographic hash
    │
    └── findInscriptionExamples ── Helius index + on-chain re-verification
```

### Application

- **Frontend:** React, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Base44 serverless functions and shared TypeScript modules
- **Protocol:** Metaplex `mpl-inscription` v0.8.1
- **Network:** Solana mainnet
- **Indexing:** Helius API

## Project Structure

```text
src/
├── pages/Home.jsx                     # Main validator experience
└── components/                        # Input, result, explainer, and example UI

base44/
├── functions/
│   ├── validateInscription/            # Address verification endpoint
│   └── findInscriptionExamples/        # Verified example discovery
└── shared/
    ├── verifyInscription.ts            # Verification pipeline
    ├── inscriptionMetadata.ts          # Metaplex decoding and PDA resolution
    └── solanaServices.ts               # Solana RPC and Helius access
```

## Local Development

### Prerequisites

- Node.js and npm
- [Deno](https://docs.deno.com/runtime/getting_started/installation/)
- Base44 CLI: `npm install -g base44@latest`

### Setup

```bash
git clone <repository-url>
cd <repository-directory>
npm install
base44 login
base44 link
base44 dev
```

Use the frontend URL printed by `base44 dev`. A fresh clone must be linked before its first local run.

### Required Secrets

Configure these in the Base44 app's Secrets settings—never commit their values:

```text
SOLANA_RPC_URL
INSCRIPTION_API_URL
INSCRIPTION_API_KEY
```

## Deployment

This repository uses Base44's two-way GitHub sync. Push changes to the connected repository, review them in Base44, and publish from the Base44 dashboard. The application must be published before it has a public URL.

## Current Scope

- Solana mainnet only
- Metaplex inscriptions only
- Supported image formats are validated from their byte signatures
- Images larger than the verifier's safety limit are rejected
- Verification reflects network state at the recorded lookup time

## Security and Privacy

- RPC and indexing credentials remain in server-side secrets.
- Private API credentials are never sent to the browser.
- Submitted addresses are public blockchain identifiers, not private keys.
- The validator never requests wallet signing or custody of assets.

## Documentation

- [Base44 GitHub integration](https://docs.base44.com/developers/app-code/local-development/github)
- [Base44 local development](https://docs.base44.com/developers/backend/overview/local-dev/local-development-overview)
- [Metaplex inscriptions](https://developers.metaplex.com/inscription)

---

**Validate** — Less trust. More truth.