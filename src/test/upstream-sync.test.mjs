import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const workflow = await readFile(new URL('../../.github/workflows/sync-upstream.yml', import.meta.url), 'utf8');
// 运行真正的工作流脚本，在独立 Git 仓库中验证快照同步和推送行为。
function script(id) {
  const step = workflow.split('\n      - name:').find(part => part.includes('\n        id: ' + id + '\n'));
  assert.ok(step, 'missing step ' + id);
  const block = step.match(/\n        run: \|\n((?: {10}[^\n]*\n|\n)*)/);
  assert.ok(block, 'missing script ' + id);
  return block[1].replace(/^ {10}/gm, '');
}
const isolatedEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
function git(cwd, ...args) { return execFileSync('git', args, { cwd, env: isolatedEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
async function file(root, path, contents) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), contents); }
async function repo(root) { await mkdir(root); git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'sync-test'); git(root, 'config', 'user.email', 'sync-test@example.invalid'); }
function commit(root, message) { git(root, 'add', '-f', '.'); git(root, 'commit', '-m', message); return git(root, 'rev-parse', 'HEAD'); }
function run(id, cwd, env) { return execFileSync('bash', ['-c', script(id)], { cwd, env: { ...isolatedEnv, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

test('同步按钮只接受默认分支和明确确认，不接受其它分支或未确认的运行', () => {
  const env = { TARGET_BRANCH: 'main', GITHUB_REF: 'refs/heads/main', CONFIRM_UPDATE: 'true' };
  assert.doesNotThrow(() => run('guard', undefined, env));
  assert.throws(() => run('guard', undefined, { ...env, CONFIRM_UPDATE: 'false' }), /请先勾选/);
  assert.throws(() => run('guard', undefined, { ...env, GITHUB_REF: 'refs/heads/dev' }), /默认分支/);
});

test('独立私有副本可更新、删除旧文件，保留凭据文件与工作流及提交历史，重复运行无提交', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cftwo-sync-'));
  try {
    const upstream = join(root, 'upstream'), copy = join(root, 'copy'), remote = join(root, 'remote.git');
    await repo(upstream); await repo(copy);
    await file(upstream, 'src/app.js', 'new code\n');
    await file(upstream, 'new.txt', 'added\n');
    await file(upstream, '.env.example', 'UPSTREAM=example\n');
    await file(upstream, '.github/workflows/other.yml', 'official workflow\n');
    const upstreamSha = commit(upstream, 'upstream release');
    await file(copy, 'src/app.js', 'old local edit\n');
    await file(copy, 'removed.txt', 'old\n');
    await file(copy, '.env', 'PRIVATE=local\n');
    await file(copy, 'config/.env.local', 'PRIVATE=nested\n');
    await file(copy, '.env.example', 'LOCAL=example\n');
    await file(copy, '.github/workflows/sync-upstream.yml', workflow);
    await file(copy, '.github/workflows/custom.yml', 'local workflow\n');
    await file(copy, '.vercel/project.json', '{"projectId":"local-test-only"}\n');
    const initial = commit(copy, 'independent initial commit');
    git(root, 'init', '--bare', remote); git(copy, 'remote', 'add', 'origin', remote); git(copy, 'push', 'origin', 'main');
    const output = join(root, 'output'), summary = join(root, 'summary');
    const env = { UPSTREAM_URL: upstream, UPSTREAM_BRANCH: 'main', TARGET_BRANCH: 'main', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
    run('prepare', copy, env);
    assert.match(await readFile(output, 'utf8'), /changed=true/);
    assert.equal(await readFile(join(copy, 'src/app.js'), 'utf8'), 'new code\n');
    assert.equal(await readFile(join(copy, 'new.txt'), 'utf8'), 'added\n');
    assert.ok(!git(copy, 'ls-files', 'removed.txt'));
    for (const [path, content] of [['.env', 'PRIVATE=local\n'], ['config/.env.local', 'PRIVATE=nested\n'], ['.env.example', 'LOCAL=example\n'], ['.github/workflows/custom.yml', 'local workflow\n'], ['.vercel/project.json', '{"projectId":"local-test-only"}\n']]) assert.equal(await readFile(join(copy, path), 'utf8'), content);
    assert.equal(await readFile(join(copy, '.github/workflows/sync-upstream.yml'), 'utf8'), workflow);
    assert.ok(!git(copy, 'ls-files', '.github/workflows/other.yml'));
    // 替代凭据助手，最终推送到本地 bare remote，绝不访问真实用户仓库。
    const bin = join(root, 'bin'); await mkdir(bin);
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const publishEnv = { ...env, PATH: bin + ':' + process.env.PATH, UPSTREAM_SHA: upstreamSha, GITHUB_ACTOR: 'sync-test', GITHUB_ACTOR_ID: '123' };
    run('publish', copy, publishEnv);
    assert.equal(git(copy, 'rev-parse', 'HEAD^'), initial);
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), git(copy, 'rev-parse', 'HEAD'));
    assert.equal(git(copy, 'show', '-s', '--format=%ae'), '123+sync-test@users.noreply.github.com');
    assert.equal(git(copy, 'show', initial + ':src/app.js'), 'old local edit');
    await writeFile(output, '');
    run('prepare', copy, env);
    assert.match(await readFile(output, 'utf8'), /changed=false/);
    assert.match(await readFile(summary, 'utf8'), /已是最新代码/);

    // 更新期间别人推送新提交时，应拒绝覆盖远程历史。
    const other = join(root, 'other'); git(root, 'clone', '-b', 'main', remote, other);
    git(other, 'config', 'user.name', 'other-test'); git(other, 'config', 'user.email', 'other@example.invalid');
    await file(other, 'other.txt', 'concurrent change\n'); const concurrent = commit(other, 'concurrent change'); git(other, 'push', 'origin', 'main');
    await file(upstream, 'src/app.js', 'next release\n'); const next = commit(upstream, 'next release');
    run('prepare', copy, env);
    assert.throws(() => run('publish', copy, { ...publishEnv, UPSTREAM_SHA: next }), /未能推送/);
    assert.equal(git(remote, 'rev-parse', 'refs/heads/main'), concurrent);
  } finally { await rm(root, { recursive: true, force: true }); }
});
