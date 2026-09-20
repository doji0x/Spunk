import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { secrets } from 'base44:runtime';
import { activityLabel, runTool, toolSchemas } from './tools.ts';
import { buildActivityDigest, buildHistory, nextTurn, summarizeToolArgs, summarizeToolResult } from './memory.ts';
import { crewOrder, crewRoles, runSpecialist } from './crew.ts';
import { createPipeline } from './pipeline.ts';
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
          role: { type: 'string', enum: crewOrder, description: 'Which specialist takes the job. The pipeline is forward-only and runs in order.' },
          job: { type: 'string', description: 'The single, specific job for this specialist, including repo, branch and files.' },
          context: { type: 'string', description: 'Everything the specialist needs, in full: the owner\u2019s requirement, the complete contents of every file they must work from, and the reports of earlier specialists. They cannot read the repository themselves.' }
        },
        required: ['role', 'job', 'context']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recordAuditIssue',
      description: 'Record one audit finding in the owner\u2019s permanent issue log. Recording an issue ends the run: no further delegation until the owner approves a fix plan.',
      parameters: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Severity reported by the audit specialist.' },
          finding: { type: 'string', description: 'What is wrong, and where (file and branch).' },
          proposedFix: { type: 'string', description: 'The fix you propose for the owner to approve. Do not apply it.' }
        },
        required: ['severity', 'finding', 'proposedFix']
      }
    }
  }
];

// The full pipeline is six specialists plus the manager's own survey reads, so the
// step budget has to cover one turn per specialist with room to read files first.
const maxIterations = 20;
// Long engineering specs are normal input here, so the cap is generous.
const maxPromptChars = 60000;

const systemPrompt = `You are Astra, the PROTOCOL MANAGER / FOREMAN of an engineering crew working on the owner's GitHub repositories.
You do not write code yourself. You survey the repository with listRepoTree and readFile, break the owner's request into scoped jobs, and delegate them one at a time with assignJob. Only specialists commit.
Your crew, in pipeline order:
${crewOrder.map(role => `- ${role}: ${crewRoles[role].title} — ${crewRoles[role].brief}`).join('\n')}

THE PIPELINE IS FIXED AND STRICTLY SEQUENTIAL: ${crewOrder.join(' → ')}.
- One specialist at a time. Assign a job, read the report that comes back, confirm that job is actually complete, and only then assign the next role. Never assign two roles before reading the first report.
- The order runs forward only. You cannot go back to a role that already had its turn in this run.
- AUDIT / SECURITY always runs last and is never skipped.
- Skip a middle role only when the job genuinely has nothing for it, and name every role you skipped in your final brief.
- If a report says the job is incomplete or that context is missing, do not advance: read the missing files and re-assign that same role with a complete context.

SPECIALISTS ARE BLIND. They cannot read the repository — no file access at all. Everything they know comes from the context you pass. So before you assign a job you must readFile every file that specialist needs and paste the full relevant contents into the context, along with the owner's requirement and the reports of the earlier specialists. An under-briefed specialist is your mistake, not theirs.

AUDIT FINDINGS ARE NEVER AUTO-FIXED. When the audit report contains a high or medium finding, call recordAuditIssue once per finding (severity, the finding, and the fix you propose), then stop delegating and reply to the owner with the findings and a clear proposed fix plan for them to approve. Only after the owner approves in a later message do you run the specialists needed to apply that approved fix, then re-run AUDIT once.

All work goes to one dedicated test branch, never the default branch: pick astra/<short-feature-slug>, call createBranch once, and name that exact branch in every job you assign. If it already exists, keep using it. Only use another branch if the owner names one.
Reply with a short markdown brief: what each specialist did in order, any roles skipped and why, the files and branch touched, the audit verdict with severities, and the branch the owner should review and merge.
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

    const pipeline = createPipeline();
    let auditNudged = false;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const message = await callOpenAi({ apiKey, model, messages, tools: managerTools, parallelToolCalls: true });
      const calls = message.tool_calls || [];
      if (!calls.length) {
        messages.push(message);
        // The manager may not finish a run of real work without the audit gate.
        if (pipeline.started && !pipeline.auditDone && !pipeline.issues && !auditNudged) {
          auditNudged = true;
          messages.push({ role: 'user', content: 'AUDIT / SECURITY has not run yet and it is never skipped. Assign the audit job now, with the full context of what the crew changed, before you write your brief.' });
          continue;
        }
        finalText = message.content || 'No response.';
        break;
      }
      // Exactly one specialist runs per iteration, so the foreman reads each report before
      // assigning the next job. Extra calls are dropped rather than fanned out in parallel.
      const call = calls[0];
      messages.push({ ...message, tool_calls: [call] });
      {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
        const delegating = call.function.name === 'assignJob';
        const auditing = call.function.name === 'recordAuditIssue';
        const label = delegating
          ? `Assigning to ${crewRoles[args.role]?.title || args.role}: ${String(args.job || '').slice(0, 80)}`
          : auditing
            ? `Audit issue (${args.severity}): ${String(args.finding || '').slice(0, 80)}`
            : activityLabel(call.function.name, args);
        const startedAt = Date.now();
        let result;
        try {
          if (delegating) {
            // The pipeline decides whether this role may run now; a violation comes back to
            // the manager as the tool result instead of running the specialist.
            const claim = pipeline.claim(args.role);
            if (claim.error) result = { error: claim.error };
            else {
              for (const role of claim.skipped) await logActivity({ label: `Skipped ${crewRoles[role].title}`, toolName: 'assignJob', detail: `Manager skipped ${role} in the pipeline.`, durationMs: 0 });
              result = {
                role: args.role,
                skipped: claim.skipped,
                report: await runSpecialist({ apiKey, model, githubToken, role: args.role, job: String(args.job || ''), context: String(args.context || ''), log: logActivity }),
                next: pipeline.nextRole ? `Read this report. If the job is complete, the next pipeline role is ${pipeline.nextRole}.` : 'The pipeline is finished.'
              };
            }
          } else if (auditing) {
            pipeline.recordIssue();
            result = { recorded: true, instruction: 'Issue logged for the owner. Do not fix it and do not delegate further: reply with the findings and your proposed fix plan for approval.' };
          } else {
            result = await runTool(githubToken, call.function.name, args);
          }
        }
        catch (error) { result = { error: error.message }; }
        const durationMs = Date.now() - startedAt;
        const detail = delegating
          ? `${String(args.job || '').slice(0, 300)} → ${String(result.report || result.error || '').slice(0, 600)}`
          : auditing
            ? `${args.severity?.toUpperCase()} — ${String(args.finding || '')}\nProposed fix: ${String(args.proposedFix || '')}`
            : `${summarizeToolArgs(args)} → ${summarizeToolResult(result)}`;
        console.log(`[astra][${conversationId}] ${call.function.name} ${detail} in ${durationMs}ms`);
        await logActivity({ label, toolName: auditing ? 'audit_issue' : call.function.name, failed: !!result.error, detail, durationMs, error: result.error || '' });
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