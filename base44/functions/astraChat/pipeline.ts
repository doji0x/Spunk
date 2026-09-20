import { crewOrder, crewRoles } from './crew.ts';

// The crew pipeline is fixed and forward-only: architect → logic → functions →
// integration → documentation → audit. This tracker is the enforcement, so the
// manager cannot run two specialists at once, revisit one, or reorder them.
export function createPipeline() {
  let cursor = 0;
  let auditDone = false;
  let issues = 0;

  return {
    get nextRole() { return crewOrder[cursor] || null; },
    get started() { return cursor > 0; },
    get auditDone() { return auditDone; },
    get issues() { return issues; },
    recordIssue() { issues += 1; },

    // Returns { skipped: [...roles] } when this role may run now, or { error } to
    // hand back to the manager as the tool result so it corrects itself.
    claim(role) {
      if (issues) return { error: 'Audit issues are recorded and awaiting the owner\u2019s approval. Stop delegating: report the findings and your proposed fix plan to the owner.' };
      const index = crewOrder.indexOf(role);
      if (index === -1) return { error: `Unknown role "${role}". The pipeline is: ${crewOrder.join(' → ')}.` };
      if (index < cursor) {
        const next = crewOrder[cursor];
        return { error: `${crewRoles[role].title} already had its turn in this pipeline, which runs forward only. ${next ? `The next role is ${crewRoles[next].title}.` : 'The pipeline is finished — write your brief to the owner.'}` };
      }
      const skipped = crewOrder.slice(cursor, index);
      cursor = index + 1;
      if (role === 'audit') auditDone = true;
      return { skipped };
    }
  };
}