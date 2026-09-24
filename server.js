const path = require('node:path');
const express = require('express');
const dotenv = require('dotenv');
const { Octokit } = require('@octokit/rest');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const htmlFile = 'index.html';

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, githubConfigured: Boolean(process.env.GITHUB_TOKEN) });
});

app.get('/', (_request, response) => {
  response.sendFile(path.join(__dirname, htmlFile));
});

app.post('/api/github/push', async (request, response) => {
  const { content, message, path: targetPath = htmlFile, branch } = request.body || {};
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  const targetBranch = branch || process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return response.status(503).json({
      error: 'GitHub is not configured. Copy .env.example to .env and fill in the repository settings.'
    });
  }

  if (typeof content !== 'string' || content.length === 0) {
    return response.status(400).json({ error: 'A non-empty file content value is required.' });
  }

  if (typeof targetPath !== 'string' || targetPath.startsWith('/') || targetPath.includes('..')) {
    return response.status(400).json({ error: 'The file path is invalid.' });
  }

  const octokit = new Octokit({ auth: token });
  const commitMessage = typeof message === 'string' && message.trim()
    ? message.trim()
    : `Update ${targetPath}`;

  try {
    let sha;
    try {
      const existing = await octokit.repos.getContent({ owner, repo, path: targetPath, ref: targetBranch });
      if (!Array.isArray(existing.data) && existing.data.type === 'file') {
        sha = existing.data.sha;
      }
    } catch (error) {
      if (error.status !== 404) throw error;
    }

    const result = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: targetPath,
      message: commitMessage,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: targetBranch,
      ...(sha ? { sha } : {})
    });

    return response.json({
      ok: true,
      commit: result.data.commit.html_url,
      file: result.data.content.html_url
    });
  } catch (error) {
    const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
    return response.status(status).json({ error: error.message || 'GitHub push failed.' });
  }
});

app.listen(port, () => {
  console.log(`MarketPulse running at http://localhost:${port}`);
});