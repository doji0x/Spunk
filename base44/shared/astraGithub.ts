const apiBase = 'https://api.github.com';
const maxFileChars = 60000;

function headers(token) {
  return { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'astra-agent', 'x-github-api-version': '2022-11-28' };
}

async function github(token, path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { ...options, headers: { ...headers(token), ...(options.body ? { 'content-type': 'application/json' } : {}) } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body.message || text.slice(0, 200)}`);
  return body;
}

export function parseRepo(value) {
  const match = String(value || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) throw new Error('Use the owner/repo form, for example octocat/hello-world.');
  return { owner: match[1], repo: match[2] };
}

export async function defaultBranch(token, repoRef) {
  const { owner, repo } = parseRepo(repoRef);
  const info = await github(token, `/repos/${owner}/${repo}`);
  return info.default_branch;
}

export async function listRepoTree(token, repoRef, branch) {
  const { owner, repo } = parseRepo(repoRef);
  const ref = branch || await defaultBranch(token, repoRef);
  const tree = await github(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const files = (tree.tree || []).filter(node => node.type === 'blob').map(node => ({ path: node.path, size: node.size }));
  return { branch: ref, truncated: !!tree.truncated, count: files.length, files: files.slice(0, 600) };
}

export async function readFile(token, repoRef, path, branch) {
  const { owner, repo } = parseRepo(repoRef);
  const ref = branch || await defaultBranch(token, repoRef);
  const file = await github(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  if (Array.isArray(file) || !file.content) throw new Error(`${path} is not a readable file.`);
  const content = atob(file.content.replace(/\n/g, ''));
  const decoded = new TextDecoder().decode(Uint8Array.from(content, char => char.charCodeAt(0)));
  return { path, sha: file.sha, truncated: decoded.length > maxFileChars, content: decoded.slice(0, maxFileChars) };
}

export async function createBranch(token, repoRef, branchName) {
  const { owner, repo } = parseRepo(repoRef);
  const base = await defaultBranch(token, repoRef);
  const existing = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branchName)}`).catch(() => null);
  if (existing) return { branch: branchName, created: false, baseBranch: base };
  const baseRef = await github(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`);
  await github(token, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseRef.object.sha }) });
  return { branch: branchName, created: true, baseBranch: base };
}

export async function commitFile(token, repoRef, branchName, path, content, message) {
  const { owner, repo } = parseRepo(repoRef);
  const base = await defaultBranch(token, repoRef);
  if (branchName === base) throw new Error('Commits to the default branch are not allowed. Use an astra/* working branch.');
  await createBranch(token, repoRef, branchName);
  const current = await readFile(token, repoRef, path, branchName).catch(() => null);
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  const result = await github(token, `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content: btoa(binary), branch: branchName, ...(current ? { sha: current.sha } : {}) })
  });
  return { path, branch: branchName, commit: result.commit?.sha, compareUrl: `https://github.com/${owner}/${repo}/compare/${base}...${branchName}` };
}