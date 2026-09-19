import { commitFile, createBranch, listRepoTree, readFile } from '../../shared/astraGithub.ts';

export const toolSchemas = [
  { type: 'function', function: { name: 'listRepoTree', description: 'List the files in a GitHub repository.', parameters: { type: 'object', properties: { repo: { type: 'string', description: 'owner/repo' }, branch: { type: 'string' } }, required: ['repo'] } } },
  { type: 'function', function: { name: 'readFile', description: 'Read one file from a GitHub repository.', parameters: { type: 'object', properties: { repo: { type: 'string' }, path: { type: 'string' }, branch: { type: 'string' } }, required: ['repo', 'path'] } } },
  { type: 'function', function: { name: 'createBranch', description: 'Create a working branch. The name must start with astra/.', parameters: { type: 'object', properties: { repo: { type: 'string' }, branch: { type: 'string' } }, required: ['repo', 'branch'] } } },
  { type: 'function', function: { name: 'commitFile', description: 'Commit the full new contents of one file to an astra/* working branch.', parameters: { type: 'object', properties: { repo: { type: 'string' }, branch: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' } }, required: ['repo', 'branch', 'path', 'content', 'message'] } } }
];

function requireWorkingBranch(branch) {
  if (!String(branch || '').startsWith('astra/')) throw new Error('Working branches must be named astra/<slug>.');
  return branch;
}

export async function runTool(token, name, args) {
  if (name === 'listRepoTree') return await listRepoTree(token, args.repo, args.branch);
  if (name === 'readFile') return await readFile(token, args.repo, args.path, args.branch);
  if (name === 'createBranch') return await createBranch(token, args.repo, requireWorkingBranch(args.branch));
  if (name === 'commitFile') return await commitFile(token, args.repo, requireWorkingBranch(args.branch), args.path, String(args.content || ''), args.message || 'Astra fix');
  throw new Error(`Unknown tool ${name}.`);
}

export function activityLabel(name, args) {
  if (name === 'listRepoTree') return `Listing files in ${args.repo}`;
  if (name === 'readFile') return `Reading ${args.path}`;
  if (name === 'createBranch') return `Preparing branch ${args.branch}`;
  if (name === 'commitFile') return `Committing ${args.path} to ${args.branch}`;
  return name;
}