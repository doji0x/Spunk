import { parseRepo } from '../../shared/astraGithub.ts';

export async function blockingIssues(base44, conversationId) {
  const rows = [];
  for (let skip = 0; ; skip += 100) {
    const batch = await base44.entities.AstraAuditIssue.filter({ conversationId, status: { $in: ['pending', 'approved', 'rejected'] } }, 'created_date', 100, skip);
    rows.push(...batch.filter(row => !row.supersededBy));
    if (batch.length < 100) return rows;
  }
}

export function validateFinding(args) {
  const { owner, repo } = parseRepo(args.repo);
  const branch = String(args.branch || '').trim();
  const finding = String(args.finding || '').trim();
  const proposedFix = String(args.proposedFix || '').trim();
  if (!Array.isArray(args.filePaths)) throw new Error('The fix plan must list its affected files.');
  const filePaths = [...new Set(args.filePaths)];
  if (!['high', 'medium', 'low'].includes(args.severity) || !finding || !proposedFix || finding.length > 12000 || proposedFix.length > 12000) throw new Error('Provide a severity, finding and bounded fix plan.');
  if (!branch.startsWith('astra/') || branch.length > 200) throw new Error('Audit fixes require an astra/* test branch.');
  if (!filePaths.length || filePaths.length > 30 || filePaths.some(path => typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..'))) throw new Error('List the exact repository-relative files this plan may change.');
  return { severity: args.severity, finding, proposedFix, repo: `${owner}/${repo}`, branch, filePaths };
}

export async function claimDecision(base44, input, user) {
  if (!['approve', 'reject', 'retry'].includes(input.decision) || typeof input.issueId !== 'string') throw new Error('Choose approve or reject for an audit issue.');
  const issue = await base44.entities.AstraAuditIssue.get(input.issueId);
  if (!issue || issue.conversationId !== input.conversationId || issue.supersededBy) throw new Error('This audit plan is no longer available in this conversation.');
  const retry = input.decision === 'retry';
  if (retry ? issue.runStatus !== 'failed' || !['approved', 'rejected'].includes(issue.status) : issue.status !== 'pending') throw new Error('This decision has already been recorded.');
  validateFinding(issue);
  const runId = crypto.randomUUID();
  const status = retry ? issue.status : input.decision === 'approve' ? 'approved' : 'rejected';
  await base44.entities.AstraAuditIssue.updateMany({ id: issue.id, status: issue.status, ...(retry ? { runStatus: 'failed' } : {}) }, { $set: { status, runId, runStatus: 'running', runError: '', decidedBy: user.id, decidedAt: new Date().toISOString() } });
  const claimed = await base44.entities.AstraAuditIssue.get(issue.id);
  if (claimed.runId !== runId) throw new Error('Another request already handled this decision.');
  return claimed;
}

export async function assertAuditWrite(base44, conversationId, decision, args) {
  if (decision) {
    const current = await base44.entities.AstraAuditIssue.get(decision.id);
    if (current.status !== 'approved' || current.runId !== decision.runId || current.runStatus !== 'running' || current.supersededBy) throw new Error('No active approval for this change.');
    if (args.repo !== decision.repo || args.branch !== decision.branch || (args.path && !decision.filePaths.includes(args.path))) throw new Error('Change is outside the approved repository, test branch or file list.');
  } else if ((await blockingIssues(base44, conversationId)).length) throw new Error('Audit approval required: use the inline Approve or Reject controls before more changes.');
}