import { activityLabel, runTool, toolSchemas } from './tools.ts';
import { summarizeToolArgs, summarizeToolResult } from './memory.ts';
import { callOpenAi } from '../../shared/astraOpenAi.ts';

// The manager delegates to these specialists. `writes` decides whether the worker
// may commit; reviewers stay read-only so only builders touch the branch.
export const crewRoles = {
  architect: {
    title: 'ARCHITECT',
    writes: false,
    brief: 'You design structure. Map the existing modules, decide where new code belongs, and hand back a concrete file-by-file plan (paths, responsibilities, interfaces). You do not write code.'
  },
  logic: {
    title: 'LOGIC / MATH ENGINEER',
    writes: true,
    brief: 'You own algorithms, math, state transitions and edge cases. Verify correctness by reasoning through concrete values, then implement the logic.'
  },
  functions: {
    title: 'FUNCTIONS ENGINEER',
    writes: true,
    brief: 'You own backend functions, handlers and API surfaces: validation, auth, error handling and response shapes.'
  },
  integration: {
    title: 'INTEGRATION ENGINEER',
    writes: true,
    brief: 'You wire the specialists\u2019 work together: imports resolve, shared modules are reused instead of duplicated, callers and callees agree, nothing is left half-connected.'
  },
  documentation: {
    title: 'DOCUMENTATION ENGINEER',
    writes: true,
    brief: 'You document what shipped: purpose, usage, parameters and gotchas. Keep it accurate to the committed code, never aspirational.'
  },
  audit: {
    title: 'AUDIT / SECURITY',
    writes: false,
    brief: 'You are the last gate before the manager. Hunt for security holes, missing authorization, unvalidated input, leaked secrets, and logic that can corrupt data. Report findings with severity (high/medium/low) and the exact fix. You do not commit.'
  }
};

export const crewOrder = ['architect', 'logic', 'functions', 'integration', 'documentation', 'audit'];

const maxWorkerSteps = 5;

// Runs one specialist as its own short agent loop and returns the report the manager reads.
export async function runSpecialist({ apiKey, model, githubToken, role, job, context, log }) {
  const spec = crewRoles[role];
  if (!spec) throw new Error(`Unknown crew role ${role}. Use one of: ${crewOrder.join(', ')}.`);
  const tools = spec.writes ? toolSchemas : toolSchemas.filter(tool => tool.function.name !== 'commitFile');
  const system = `You are the ${spec.title} on Astra's engineering crew. ${spec.brief}
The manager assigned you one job; do exactly that job and nothing else.
Read files with the GitHub tools before relying on their contents; never invent code.
${spec.writes ? 'Commit only to the working branch the manager gave you, writing complete file contents.' : 'You have read-only access: no commits.'}
Finish with a tight report for the manager: what you found or changed, the files and branch touched, and anything the next specialist must know. No pleasantries.`;

  const messages = [{ role: 'system', content: system }, { role: 'user', content: `JOB: ${job}\n\nCONTEXT FROM MANAGER:\n${context || 'none'}` }];
  for (let step = 0; step < maxWorkerSteps; step++) {
    const message = await callOpenAi({ apiKey, model, messages, tools });
    messages.push(message);
    const calls = message.tool_calls || [];
    if (!calls.length) return message.content || 'No report.';
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { args = {}; }
      const startedAt = Date.now();
      let result;
      try { result = await runTool(githubToken, call.function.name, args); }
      catch (error) { result = { error: error.message }; }
      const detail = `${summarizeToolArgs(args)} → ${summarizeToolResult(result)}`;
      await log({
        label: `${spec.title} · ${activityLabel(call.function.name, args)}`,
        toolName: call.function.name, failed: !!result.error, detail,
        durationMs: Date.now() - startedAt, error: result.error || ''
      });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 60000) });
    }
  }
  return 'I hit my step limit before finishing this job. Re-assign it with a narrower scope.';
}