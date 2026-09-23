import React from 'react';
import { useAtomicV1Wallet } from '@/contexts/AtomicV1WalletContext';

export default function AtomicV1WalletSelector({ disabled = false }) {
  const state = useAtomicV1Wallet();
  return <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="Atomic launch wallet">
    <h2 className="font-semibold">Atomic V1 wallet</h2>
    <div className="flex flex-wrap gap-2">{state.wallets.map((wallet, i) => <button key={`${wallet.name}-${i}`} type="button" className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
      disabled={disabled || state.connecting} onClick={() => state.connect(wallet)}>{wallet.name}{state.supportedMethods(wallet).length ? ' (V1)' : ''}</button>)}</div>
    {!state.wallets.length && <p className="text-sm text-muted-foreground">No Solana Wallet Standard wallet was detected. Install a V1-capable wallet and reload this page.</p>}
    {state.account && <><p className="break-all font-mono text-xs">Payer and creator: {state.address}</p>
      {state.selected.accounts.length > 1 && <label className="block text-sm">Account<select className="ml-2 rounded border bg-background p-2" disabled={disabled} value={state.address} onChange={e => state.selectAccount(e.target.value)}>
        {state.selected.accounts.filter(a => a.chains.includes('solana:mainnet')).map(a => <option key={a.address} value={a.address}>{a.address}</option>)}</select></label>}
      {state.methods.length > 1 && <label className="block text-sm">Signing route<select className="ml-2 rounded border bg-background p-2" disabled={disabled} value={state.method} onChange={e => state.setMethod(e.target.value)}>
        {state.methods.map(method => <option key={method} value={method}>{method === 'signTransaction' ? 'Wallet signs; application submits' : 'Wallet signs and submits'}</option>)}</select></label>}
      {!state.supportedMethods(state.selected, state.account).length && <p className="text-sm text-muted-foreground">This account does not advertise native V1 transaction signing. Message signing will not be used as a substitute.</p>}
      <button type="button" className="rounded-lg px-4 py-2 text-sm text-primary disabled:opacity-50" disabled={disabled} onClick={state.disconnect}>Disconnect</button></>}
    {!state.configLoading && !state.config.enabled && <p className="text-sm text-muted-foreground">Public native launching is disabled pending acceptance tests. Existing launch recovery and history remain available.</p>}
    {state.config.enabled && state.account && !state.method && <p className="text-sm text-muted-foreground">This wallet/method has not been enabled for this launcher.</p>}
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <details className="text-xs"><summary className="cursor-pointer">Wallet capability diagnostics</summary><pre className="mt-2 overflow-auto">{JSON.stringify(state.wallets.map(wallet => ({ name: wallet.name,
      signTransaction: wallet.features['solana:signTransaction']?.supportedTransactionVersions || [],
      signAndSendTransaction: wallet.features['solana:signAndSendTransaction']?.supportedTransactionVersions || [] })), null, 2)}</pre>
      <p className="mt-2 text-muted-foreground">Numeric 1 means advertised transaction V1 support. It is not a recorded wallet release or proof of a completed launch.</p></details>
  </section>;
}
