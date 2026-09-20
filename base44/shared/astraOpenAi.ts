// Single place Astra's manager and specialists talk to OpenAI, so the model id and
// the rate-limit retry behave identically for both.
const maxRetries = 4;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export function resolveModel(configured) {
  // The owner's configured model is used exactly as set; only a blank secret falls back.
  const model = String(configured || '').trim();
  return model || 'gpt-4o';
}

export async function callOpenAi({ apiKey, model, messages, tools }) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' })
    });
    if (response.ok) return (await response.json()).choices[0].message;

    const body = await response.json().catch(() => ({}));
    const detail = body.error?.message || `OpenAI ${response.status}`;
    const rateLimited = response.status === 429 || body.error?.code === 'rate_limit_exceeded';
    if (!rateLimited || attempt >= maxRetries) {
      if (rateLimited) throw new Error(`OpenAI rate limit still hit after ${maxRetries} retries: ${detail}`);
      throw new Error(detail);
    }
    // Honour the server's own wait when it sends one, otherwise back off 1s, 2s, 4s, 8s.
    const retryAfter = Number(response.headers.get('retry-after'));
    await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
  }
}