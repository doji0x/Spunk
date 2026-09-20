import { callOpenAi } from '../../shared/astraOpenAi.ts';
import { validateFinding } from './auditGate.ts';

export async function auditReview({ apiKey, model, job, context }) {
  const message = await callOpenAi({ apiKey, model, responseFormat: { type: 'json_object' }, messages: [
    { role: 'system', content: 'You are Astra\'s AUDIT / SECURITY reviewer. You cannot write or browse. Review only the supplied full file contents. Return JSON: {"complete":boolean,"summary":string,"findings":[{"severity":"high|medium|low","finding":string,"proposedFix":string,"repo":"owner/repo","branch":"astra/test-branch","filePaths":["exact/file/path"]}]}. Include EVERY finding that needs a code change, including low severity. Mark complete false if the supplied contents are missing or insufficient to verify the work. Never claim a clean audit with incomplete context. Fixes must use an astra/* test branch and an explicit list of affected files.' },
    { role: 'user', content: `JOB: ${job}\n\nCONTEXT: ${context}` }
  ] });
  const review = JSON.parse(message.content || '{}');
  if (review.complete !== true || typeof review.summary !== 'string' || !Array.isArray(review.findings) || review.findings.length > 30) throw new Error('Audit did not finish with sufficient evidence. No fix is marked resolved.');
  return { ...review, findings: review.findings.map(validateFinding) };
}