import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { activityLabel, runTool, toolSchemas } from './tools.ts';
import { buildActivityDigest, buildHistory, nextTurn, summarizeToolArgs, summarizeToolResult } from './memory.ts';

const maxIterations = 12;
// Long engineering specs are normal input here, so the cap is generous.
const maxPromptChars = 60000;

const systemPrompt = `You are Astra, a senior engineer reviewing GitHub repositories for the app owner.
Use the GitHub tools to list the repository tree, read the files that matter, and reason about real problems.
When you flag issues, report each one as: file path, severity (high/medium/low), the problem, and the fix.
All of your commits go to a dedicated test branch, never the repository's default branch.
Pick one branch for the whole task, named astra/<short-feature-slug> (for example astra/atomic-v1-launch), call createBranch once with it, then pass that exact same branch to every commitFile call. If the branch already exists, keep using it. Only use a different branch if the owner names one.
Write the complete new file contents on every commit, and always report the branch name and the URL returned by commitFile so the owner can review and merge it.
Read the current file with readFile immediately before rewriting it and preserve every part you are not deliberately changing.
Read files before rewriting them; never invent file contents. Keep replies concise and use markdown.
Memory: every message from the owner is numbered [#N]. Whenever you rely on a fact, requirement, snippet, or decision the owner gave you earlier, cite it inline as (#N) — for example "per the spec you shared (#2)". Quote the owner's exact words when precision matters. Never attribute something to the owner that does not appear in a numbered message.
You also receive a digest of your earlier tool activity; use it to avoid re-reading unchanged files and to remember which branch and files you already committed.`;

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
  let logBreak = null;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });

    const input = await req.json().catch(() => ({}));
    const conversationId = String(input.conversationId || '').trim();
    const prompt = String(input.message || '').trim();
    if (!conversationId) return Response.json({ error: 'A conversation id is required.' }, { status: 400 });
    if (!prompt) return Response.json({ error: 'Send a message.' }, { status: 400 });
    if (prompt.length > maxPromptChars) return Response.json({ error: `That message is ${prompt.length.toLocaleString()} characters; Astra accepts up to ${maxPromptChars.toLocaleString()}. Trim it or split it across two messages.` }, { status: 400 });

    logBreak = async text => {
      await base44.entities.AstraMessage.create({ conversationId, role: 'activity', content: `Run stopped — ${text}`, toolName: 'run', repo: input.repo || undefined }).catch(() => {});
    };

    const apiKey = secrets.get('ASTRA_OPENAI_API_KEY');
    const githubToken = secrets.get('ASTRA_GITHUB_TOKEN');
    const configuredModel = (secrets.get('ASTRA_OPENAI_MODEL') || '').trim();
    // Only accept real OpenAI model ids; a friendly label like "Astra" falls back to the default.
    const model = /^(gpt|o1|o3|o4|chatgpt)/i.test(configuredModel) ? configuredModel : 'gpt-4o';
    if (!apiKey || !githubToken) return Response.json({ error: 'Astra is missing its OpenAI or GitHub credentials.' }, { status: 503 });

    const stored = await base44.entities.AstraMessage.filter({ conversationId }, 'created_date', 200);
    const history = buildHistory(stored);
    const digest = buildActivityDigest(stored);
    const turn = nextTurn(stored);
    await base44.entities.AstraMessage.create({ conversationId, role: 'user', content: prompt, turn, repo: input.repo || undefined });

    const messages = [{ role: 'system', content: systemPrompt }];
    if (digest) messages.push({ role: 'system', content: digest });
    messages.push(...history, { role: 'user', content: `[#${turn}] ${prompt}` });
    const activity = [];
    let finalText = '';
    // Each step is written as it happens, so a crash or timeout still leaves the trail
    // Astra reads back as memory on the next message.
    const logActivity = async item => {
      activity.push(item);
      await base44.entities.AstraMessage.create({
        conversationId, role: 'activity',
        content: item.failed ? `${item.label} — failed: ${item.error}` : item.label,
        toolName: item.toolName, detail: item.detail, durationMs: item.durationMs, repo: input.repo || undefined
      }).catch(() => {});
    };

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const message = await callOpenAi(apiKey, model, messages);
      messages.push(message);
      const calls = message.tool_calls || [];
      if (!calls.length) { finalText = message.content || 'No response.'; break; }
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const label = activityLabel(call.function.name, args);
        const startedAt = Date.now();
        let result;
        try { result = await runTool(githubToken, call.function.name, args); }
        catch (error) { result = { error: error.message }; }
        const durationMs = Date.now() - startedAt;
        const detail = `${summarizeToolArgs(args)} → ${summarizeToolResult(result)}`;
        console.log(`[astra][${conversationId}] ${call.function.name} ${detail} in ${durationMs}ms`);
        await logActivity({ label, toolName: call.function.name, failed: !!result.error, detail, durationMs, error: result.error || '' });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 80000) });
      }
      if (iteration === maxIterations - 1) finalText = 'I stopped after reaching the maximum number of steps for one message. Ask me to continue and I will pick up from here.';
    }

    await base44.entities.AstraMessage.create({ conversationId, role: 'assistant', content: finalText, repo: input.repo || undefined });

    return Response.json({ reply: finalText, activity }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    // Record the break in the conversation itself so the next message shows where it stopped.
    const message = error.message || 'Astra could not complete that request.';
    if (logBreak) await logBreak(message);
    return Response.json({ error: message }, { status: 500 });
  }
}