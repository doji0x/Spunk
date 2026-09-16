// Confirms the app-hosted metadata URI already serves usable pump.fun metadata for this inscription.
// The image bytes were verified on-chain by verifyInscription; they are not downloaded again here.
export async function checkMetadataProxy(uri, expectedImage) {
  try {
    const response = await fetch(uri, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`The app metadata endpoint returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 65536) throw new Error('The metadata response is unexpectedly large.');
    const metadata = JSON.parse(text);
    if (!metadata.name || !metadata.symbol) throw new Error('The metadata has no name or symbol.');
    if (metadata.image !== expectedImage) throw new Error('The metadata image field does not point at the app image endpoint.');
    return { ready: true };
  } catch (error) {
    return { ready: false, message: `Launch blocked: the metadata URI is not serving usable inscription metadata. ${error.message} No SOL was spent.` };
  }
}