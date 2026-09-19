import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { activityLabel, runTool, toolSchemas } from './tools.ts';

const maxIterations = 12;

const systemPrompt = `You are Astra, a senior engineer reviewing GitHub repositories for the app owner.
Use the GitHub tools to list the repository tree, read the files that matter, and reason about real problems.
When you flag issues, report each one as: file path, severity (high/medium/low), the problem, and the fix.
When asked to fix something, write the complete new file contents and commit directly to the repository's working branch (its default branch) unless the owner names a different branch. Always report the branch name and the URL returned by commitFile.
Because commits land straight on the working branch, read the current file with readFile immediately before rewriting it and preserve every part you are not deliberately changing.
Read files before rewriting them; never invent file contents. Keep replies concise and use markdown.`;

async function callOpenAi(apiKey, model, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, tools: toolSchemas, tool_choice: 'auto' })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || `OpenAI ${response.status}`);
  return body.choices[0].message;
}

export default async function(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const conversationId = String(input.conversationId || '').trim();
    const prompt = String(input.message || '').trim();
    if (!conversationId) return Response.json({ error: 'A conversation id is required.' }, { status: 400 });
    if (!prompt || prompt.length > 8000) return Response.json({ error: 'Send a message up to 8,000 characters.' }, { status: 400 });

    const apiKey = secrets.get('ASTRA_OPENAI_API_KEY');
    const githubToken = secrets.get('ASTRA_GITHUB_TOKEN');
    const configuredModel = (secrets.get('ASTRA_OPENAI_MODEL') || '').trim();
    // Only accept real OpenAI model ids; a friendly label like "Astra" falls back to the default.
    const model = /^(gpt|o1|o3|o4|chatgpt)/i.test(configuredModel) ? configuredModel : 'gpt-4o';
    if (!apiKey || !githubToken) return Response.json({ error: 'Astra is missing its OpenAI or GitHub credentials.' }, { status: 503 });

    const stored = await base44.entities.AstraMessage.filter({ conversationId }, 'created_date', 200);
    const history = stored.filter(item => item.role !== 'activity').map(item => ({ role: item.role, content: item.content }));
    await base44.entities.AstraMessage.create({ conversationId, role: 'user', content: prompt, repo: input.repo || undefined });

    const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: prompt }];
    const activity = [];
    let finalText = '';

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const message = await callOpenAi(apiKey, model, messages);
      messages.push(message);
      const calls = message.tool_calls || [];
      if (!calls.length) { finalText = message.content || 'No response.'; break; }
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const label = activityLabel(call.function.name, args);
        let result;
        try { result = await runTool(githubToken, call.function.name, args); }
        catch (error) { result = { error: error.message }; }
        activity.push({ label, failed: !!result.error, detail: result.error || '' });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 80000) });
      }
      if (iteration === maxIterations - 1) finalText = 'I stopped after reaching the maximum number of steps for one message. Ask me to continue and I will pick up from here.';
    }

    const saved = [];
    for (const item of activity) saved.push({ conversationId, role: 'activity', content: item.failed ? `${item.label} — failed: ${item.detail}` : item.label, toolName: item.label, repo: input.repo || undefined });
    saved.push({ conversationId, role: 'assistant', content: finalText, repo: input.repo || undefined });
    await base44.entities.AstraMessage.bulkCreate(saved);

    return Response.json({ reply: finalText, activity }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || 'Astra could not complete that request.' }, { status: 500 });
  }
}