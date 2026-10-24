import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { buildWorker, handleBuildDownload, validateBuild } from '../worker-builder.mjs';

const uuid = '351c9981-04b6-4103-aa4b-864aa9c91469';
const settings = { ev: 'yes', et: 'no', ex: 'no', d: 'Admin/Panel' };

test('个人构建可重复，构建码会改变代码但不会出现在产物中', async () => {
  const one = await buildWorker({ uuid, seed: 'a-private-seed', format: 'worker', settings });
  const same = await buildWorker({ uuid, seed: 'a-private-seed', format: 'worker', settings });
  const other = await buildWorker({ uuid, seed: 'another-seed', format: 'worker', settings });
  assert.equal(one.sha256, same.sha256);
  assert.notEqual(one.sha256, other.sha256);
  assert.ok(one.code.includes(uuid));
  assert.equal(one.code.includes('a-private-seed'), false);
  assert.match(one.code, /CFnew personal build/);
});

test('下载接口返回 Worker 与只含 _worker.js 的 Pages 压缩包', async () => {
  const input = { uuid, seed: 'download-seed', format: 'pages', settings };
  const response = await handleBuildDownload(new Request('https://panel.example/api/builder/download', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://panel.example' }, body: JSON.stringify(input),
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  assert.deepEqual(Object.keys(files), ['_worker.js']);
  assert.match(strFromU8(files['_worker.js']), /CFnew personal build/);
  assert.equal((await handleBuildDownload(new Request('https://panel.example/api/builder/download', { method: 'GET' }))).status, 405);
  assert.equal((await handleBuildDownload(new Request('https://panel.example/api/builder/download', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.example' }, body: '{}' }))).status, 403);
});

test('构建输入严格限制协议、字段和路径', () => {
  assert.throws(() => validateBuild({ uuid, seed: 'short', format: 'worker', settings }), /8/);
  assert.throws(() => validateBuild({ uuid, seed: 'long-enough', format: 'worker', settings: { nope: 'x' } }), /不支持/);
  assert.throws(() => validateBuild({ uuid, seed: 'long-enough', format: 'worker', settings: { ev: 'no', et: 'no', ex: 'no' } }), /至少/);
  assert.throws(() => validateBuild({ uuid, seed: 'long-enough', format: 'worker', settings: { ev: 'yes', d: '../x' } }), /路径/);
});
