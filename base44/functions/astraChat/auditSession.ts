import { blockingIssues, claimDecision, assertAuditWrite, validateFinding } from './auditGate.ts';
import { callOpenAi } from '../../shared/astraOpenAi.ts';

export async function createAuditSession(base44, input, user) {
  const existing = await blockingIssues(base44, input.conversationId);
  if (existing.some(issue => issue.runStatus === 'running')) throw new Error('An audit follow-up is already running in this conversation.');
  const decision = input.decision ? await claimDecision(base44, input, user) : null;
  const created = [];
  const record = async args => {
    const fields = validateFinding(args);
    const duplicate = created.find(issue => issue.finding === fields.finding && issue.repo === fields.repo && issue.branch === fields.branch);
    if (duplicate) return duplicate;
    const issue = await base44.entities.AstraAuditIssue.create({ ...fields, conversationId: input.conversationId, status: 'pending', ...(decision ? { parentIssueId: decision.id } : {}) });
    created.push(issue);
    if (decision && created.length === 1) await base44.entities.AstraAuditIssue.update(decision.id, { supersededBy: issue.id });
    return issue;
  };
  return {
    decision, created, blocked: !decision && existing.length > 0,
    directive: decision ? `OWNER BUTTON DECISION: ${decision.status}. Only work on this exact stored plan: ${JSON.stringify(decision)}. No other fixes are approved. Read current files before writing. Commit only listed files in its repository and astra/* branch. Re-run AUDIT once after applying this fix; report any remaining findings without fixing them.` : existing.length ? `AUDIT GATE CLOSED. Code changes are blocked until the owner uses an inline approval button. Open findings: ${JSON.stringify(existing.map(({ id, finding, proposedFix }) => ({ id, finding, proposedFix })))}` : '',
    record,
    assertWrite: args => assertAuditWrite(base44, input.conversationId, decision, args),
    async revise(apiKey, model) {
      const message = await callOpenAi({ apiKey, model, responseFormat: { type: 'json_object' }, messages: [
        { role: 'system', content: 'The owner REJECTED this audit fix plan. Propose a substantively different, safer approach for the SAME finding. Do not execute anything. Return JSON with proposedFix (string) and filePaths (array of exact repository paths). Explain what changed from the rejected approach; if there is not enough information, propose an investigation-only plan rather than claiming a fix. No tools are available.' },
        { role: 'user', content: JSON.stringify(decision) }
      ] });
      const revised = JSON.parse(message.content || '{}');
      if (String(revised.proposedFix || '').trim() === decision.proposedFix.trim()) throw new Error('Astra repeated the rejected plan. Retry to request a different approach.');
      await record({ ...decision, proposedFix: revised.proposedFix, filePaths: revised.filePaths });
      return `I have proposed a revised plan for the same finding. No code was changed. Review the new approval card below.`;
    },
    async finish(messageId, auditPassed, executionFailed) {
      if (created.length) await base44.entities.AstraAuditIssue.bulkUpdate(created.map(issue => ({ id: issue.id, messageId })));
      if (!decision) return;
      const succeeded = decision.status === 'rejected' ? created.length > 0 : (auditPassed && !executionFailed) || created.length > 0;
      await base44.entities.AstraAuditIssue.update(decision.id, { runStatus: succeeded ? 'completed' : 'failed', runError: succeeded ? '' : 'The fix or its audit did not complete. Review the activity before retrying.', ...(decision.status === 'approved' && auditPassed && !executionFailed && !created.length ? { status: 'resolved' } : {}) });
    },
    async fail(error) {
      if (decision) await base44.entities.AstraAuditIssue.update(decision.id, { runStatus: 'failed', runError: String(error).slice(0, 1000) });
    }
  };
}