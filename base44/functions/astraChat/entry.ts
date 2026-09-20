import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { activityLabel, runTool, toolSchemas } from './tools.ts';
import { buildActivityDigest, buildHistory, nextTurn, summarizeToolArgs, summarizeToolResult } from './memory.ts';
import { crewOrder, crewRoles, runSpecialist } from './crew.ts';
import { callOpenAi, resolveModel } from '../../shared/astraOpenAi.ts';

// The manager surveys and delegates; specialists do the writing, so it keeps read tools plus assignJob.
const managerTools = [
  ...toolSchemas.filter(tool => tool.function.name !== 'commitFile'),
  {
    type: 'function',
    function: {
      name: 'assignJob',
      description: 'Assign one scoped job to a crew specialist and get their report back.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: crewOrder, description: 'Which specialist takes the job.' },
          job: { type: 'string', description: 'The single, specific job for this specialist, including repo, branch and files.' },
          context: { type: 'string', description: 'Everything the specialist needs: the owner\u2019s requirement and the reports of earlier specialists.' }
        },
        required: ['role', 'job']
      }
    }
  }
];

const maxIterations = 8;
// Long engineering specs are normal input here, so the cap is generous.
const maxPromptChars = 60000;

const systemPrompt = `You are Astra, the PROTOCOL MANAGER / FOREMAN of an engineering crew working on the owner's GitHub repositories.
You do not write code yourself. You survey with listRepoTree and readFile, break the owner's request into scoped jobs, and delegate each job with assignJob. Only specialists commit.
Your crew and the order of the pipeline:
${crewOrder.map(role => `- ${role}: ${crewRoles[role].title} — ${crewRoles[role].brief}`).join('\n')}
Pipeline: ARCHITECT plans first. Then LOGIC / MATH, FUNCTIONS (in whatever combination the job needs) build against that plan. Then INTEGRATION wires their work together. Then DOCUMENTATION and AUDIT / SECURITY. The audit report comes back to you: if it raises a high or medium finding, assign the fix to the right builder and re-run AUDIT before you reply.
Skip a specialist only when the job genuinely has nothing for them, and say so in your reply.
Every assignJob context must carry the owner's requirement plus the reports of the earlier specialists — workers share no memory with each other.
All work goes to one dedicated test branch, never the default branch: pick astra/<short-feature-slug>, call createBranch once, and name that exact branch in every job you assign. If it already exists, keep using it. Only use another branch if the owner names one.
Reply with a short markdown brief: what each specialist did, the files and branch touched, audit findings with severity (high/medium/low), and the branch the owner should review and merge.
Memory: every message from the owner is numbered [#N]. Whenever you rely on a fact, requirement, snippet, or decision the owner gave you earlier, cite it inline as (#N) — for example "per the spec you shared (#2)". Quote the owner's exact words when precision matters. Never attribute something to the owner that does not appear in a numbered message.
You also receive a digest of your earlier tool activity; use it to avoid re-reading unchanged files and to remember which branch and files you already committed.`;

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
    const model = resolveModel(secrets.get('ASTRA_OPENAI_MODEL'));
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
      const message = await callOpenAi({ apiKey, model, messages, tools: managerTools });
      messages.push(message);
      const calls = message.tool_calls || [];
      if (!calls.length) { finalText = message.content || 'No response.'; break; }
      for (const call of calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const delegating = call.function.name === 'assignJob';
        const label = delegating
          ? `Assigning to ${crewRoles[args.role]?.title || args.role}: ${String(args.job || '').slice(0, 80)}`
          : activityLabel(call.function.name, args);
        const startedAt = Date.now();
        let result;
        try {
          result = delegating
            ? { role: args.role, report: await runSpecialist({ apiKey, model, githubToken, role: args.role, job: String(args.job || ''), context: String(args.context || ''), log: logActivity }) }
            : await runTool(githubToken, call.function.name, args);
        }
        catch (error) { result = { error: error.message }; }
        const durationMs = Date.now() - startedAt;
        const detail = delegating
          ? `${String(args.job || '').slice(0, 300)} → ${String(result.report || result.error || '').slice(0, 600)}`
          : `${summarizeToolArgs(args)} → ${summarizeToolResult(result)}`;
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