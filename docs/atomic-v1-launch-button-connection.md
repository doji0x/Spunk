# Atomic V1: connect and initialize from the actual Launch button

## Observed failure and scope

The owner's live screenshot reports `Application / RPC (400): Connect Phantom
using the native request button.` That string came from the launch hook's check
of `wallet.canLaunch && sessionRef.current`, before the native signature request.
It is not proof of a Phantom transaction-format rejection or of an RPC response.
The screenshot alone cannot establish which side of that combined condition was
false: connection state, session initialization, or both.

Baseline: main `06d6a0c23553ce574fbe52f48f82f904ab137071`. This baseline also
introduced `launchDisabled={busy || !wallet.canLaunch || !session}` in the page.
That disabled state made a separate prior Connect action a prerequisite instead
of allowing the Launch action to finish connection and initialization.

New branch: `fix/atomic-launch-connect-on-submit`. PR #10. This is a frontend
connection/session orchestration correction. No backend functions, entity schema,
Pump instructions, transaction bytes/codecs, mint co-signature algorithm, native
`signTransaction` payload, size limits, or signature checks are changed. The root
application dependency manifest and lockfile are unchanged. Main is not updated
or merged by this work.

## Corrected sequence

The actual form submit handler now:

1. Captures the entered form values and selected File before any connection-driven
   React rerender can replace them.
2. Calls `ensureLaunchWallet()` from the click stack. It discovers the injected
   provider again rather than relying solely on an earlier detection interval.
3. Reuses an already-connected account, or awaits `provider.connect()` (with the
   documented `request({method:'connect'})` form only when the method is absent).
4. Receives a usable account/provider/method snapshot directly. It does not read
   the old React closure immediately after calling state setters.
5. Uses the resolved payer address for the Web Lock and awaits the same mint/session
   initializer used by the connection effect. Overlapping initialization shares
   one promise; it does not generate another request/mint or overwrite newer state.
6. Continues through the existing upload, preparation, mint-signature, native
   Phantom transaction request, signature verification and submission path.

A first-time connection permission prompt and a transaction approval prompt are
separate wallet operations. One Launch action drives the sequence; it does not
promise a single wallet popup or silently approve either prompt. Merely rendering
the page, detecting a wallet, or completing the optional Connect button does not
sign a transaction.

The public form is disabled only while an action is running, not because the
wallet/session is not yet initialized. The optional Connect button remains useful
but is not required for a normal new launch. Cached-size previews remain advisory;
actual validation in the existing preparation/signing path is retained. The
existing admin form's size requirement remains unchanged.

## Races, account changes and recovery

- Connection attempts for the same selected provider share one in-flight promise.
- Account snapshots check the live provider key, provider identity, connection
  state, selected method and operation generation, not just rendered state.
- A real account change or disconnect invalidates an in-progress launch. Duplicate
  notifications for the same connected account do not unnecessarily invalidate it.
- The launch handler owns session setup while busy. A background connection effect
  cannot clear the File or adopt an obsolete preparation over the active request.
- Form values entered before connection remain available. Resuming an old frozen
  preparation is intentionally different: an undisplayed existing preparation is
  shown for review first, not silently signed instead of the user's new form.
- Corrupt recovery is preserved and reported rather than automatically discarded.
  It might describe an already-submitted transaction; deleting it is not a safe
  way to recover from the screenshot's connection-state guard.
- Wrong-account, invalid input, expired blockhash, oversize, failed simulation,
  invalid signature and explicit operator-disable conditions still fail honestly.
  This patch does not bypass those checks to manufacture a Phantom error.
- Connection rejections retain the Phantom error code/message and are tagged
  `wallet-connection`. Existing signing errors remain `wallet-signing`.

## Regression coverage

`tests/atomic-v1/launch-connection.test.mjs` adds dependency-free tests for immediate
connection invocation, already-connected reuse, request-only connection, wallet
rejection, disconnect during connection, mismatched accounts, shared session
initialization, corrupt recovery, missing mint recovery, preserving newer fields,
and refusing overwritten request identities. Together with the existing protocol
and signing tests, this suite contains 50 tests.

`tests/atomic-v1-react/launch.test.cjs` uses **real React 18.3.1** and renders the
actual public page, actual form, actual wallet context, actual launch hook and
actual native signing adapter. Presentational components, provider, network and
mint storage are test doubles. Temporary Ed25519 keys and the existing synthetic
V1 transaction fixture verify that the request signs the intended message.

The 12 React regressions cover first-click connection through submission, an
already-connected provider with empty app state, a deferred connection with
rerenders, duplicate clicks, session initialization still in progress, connection
rejection, signing rejection, account change during upload, harmless duplicate
account events, no implicit signing on render/connect, corrupt recovery, and an
explicit operator disable. Assertions include the actual page's submit button,
retention of the selected File/name/description/social links, one native signature
request, and zero network submissions after a wallet rejection.

The test-only React renderer and TypeScript dependencies are pinned in their own
isolated test manifest. CI does not add them to the production application.
The established SDK/Kit integration, form rendering, build, lint and full typecheck
jobs remain enabled; pre-existing full-project typecheck failures are not hidden.

Initial implementation CI run `35952783073` on
`86703d17c7047930e9d331562e50536e81fe5857` passed the 12 React flow tests, existing
protocol tests and SDK integration. Its baseline/head typecheck artifacts have
identical SHA-256 digests: no typecheck diagnostics changed. The final PR body
records the latest run after the additional helper regressions are committed.

## Live test after merge/publish

Publish the frontend from this branch (or merge it into main and publish that
revision). Fill the coin details, select the image, and press **Launch atomic V1
coin** without first pressing Connect. Accept the connection permission if Phantom
asks, then review the separate transaction approval. A saved unresolved preparation
must be reviewed/continued rather than replaced with a different mint.

No new backend deployment, schema update, secret or API key is introduced by this
patch, assuming the existing matching native-launch backend from main is already
deployed. Genuine backend/RPC errors can still occur before signing. This correction
removes the observed connection/session prerequisite; it does not establish live
Phantom V1 support. Automated tests have no real wallet, no RPC broadcasts and no
spending. The live wallet/browser and deployed Base44 execution remain untested.

## Primary references

- Phantom connection lifecycle, Promise result, isConnected, publicKey and account
  events: https://docs.phantom.com/solana/establishing-a-connection
- Phantom native transaction request remains unchanged:
  https://docs.phantom.com/solana/sending-a-transaction
- React state setters update the next render, not the current handler's values:
  https://react.dev/reference/react/useState#ive-updated-the-state-but-logging-gives-me-the-old-value
