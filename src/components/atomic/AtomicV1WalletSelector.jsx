import React from 'react';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';

export default function AtomicV1WalletSelector({ disabled = false }) {
  const state = useAtomicV1Wallet();
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="Atomic launch wallet">
    <h2 className="font-semibold">Phantom transaction approval</h2>
    <button type="button" className="rounded-full border border-primary px-5 py-2 text-sm text-primary disabled:opacity-50"
      disabled={disabled || state.connecting} onClick={() => state.connect(state.phantom)}>
      {state.connecting ? 'Connecting...' : 'Connect Phantom - native request'}
    </button>
    <p className="text-xs leading-5 text-muted-foreground">The native route asks Phantom to sign the actual V1 transaction message. A missing Wallet Standard V1 flag does not disable this request. Phantom may still reject the format; its original response will be displayed.</p>
    {!state.phantom && <p className="text-sm text-muted-foreground">Open the published HTTPS site in Phantom's in-app browser or a browser with the Phantom extension. Wallet injection may be unavailable inside an embedded preview.</p>}
    {state.account && <>
      <p className="break-all font-mono text-xs">Payer and creator: {state.address}</p>
      <p className="text-xs">Route: {state.nativeRequest ? 'Phantom provider.request / signTransaction' : `Wallet Standard / ${state.method || 'unavailable'}`}</p>
      {!state.nativeRequest && state.selected?.accounts?.length > 1 && <label className="block text-sm">Account<select className="ml-2 rounded border bg-background p-2" disabled={disabled} value={state.address} onChange={e => state.selectAccount(e.target.value)}>
        {state.selected.accounts.filter(a => a.chains.includes('solana:mainnet')).map(a => <option key={a.address} value={a.address}>{a.address}</option>)}
      </select></label>}
      {!state.nativeRequest && state.methods.length > 1 && <label className="block text-sm">Signing route<select className="ml-2 rounded border bg-background p-2" disabled={disabled} value={state.method} onChange={e => state.setMethod(e.target.value)}>
        {state.methods.map(method => <option key={method} value={method}>{method}</option>)}
      </select></label>}
      <button type="button" className="text-sm text-primary" disabled={disabled} onClick={state.disconnect}>Disconnect</button>
    </>}
    {state.nativeRequest && state.config.phantomRequestEnabled === false && <p role="alert" className="text-sm text-destructive">The operator explicitly disabled native Phantom requests. This is not a wallet capability result.</p>}
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <details className="text-xs"><summary className="cursor-pointer">Other wallets and capability diagnostics</summary>
      <div className="my-3 flex flex-wrap gap-2">{state.wallets.map((wallet, index) => <button key={`${wallet.name}-${index}`} type="button" disabled={disabled || state.connecting}
        onClick={() => state.connect(wallet)} className="rounded border border-border px-3 py-2">{wallet.name} / Wallet Standard</button>)}</div>
      <pre className="overflow-auto">{JSON.stringify(state.wallets.map(wallet => ({ name: wallet.name,
        signTransaction: wallet.features['solana:signTransaction']?.supportedTransactionVersions || [],
        signAndSendTransaction: wallet.features['solana:signAndSendTransaction']?.supportedTransactionVersions || [] })), null, 2)}</pre>
      <p className="mt-2">The displayed versions are the wallet's actual advertised values. Native Phantom request availability does not assert V1 support.</p>
    </details>
  </section>;
}
