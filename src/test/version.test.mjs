import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { CORE_VERSION, readCoreVersion } from '../worker-source.mjs';
import { coreRelease, compareCoreVersions } from '../release.mjs';
import { buildWorker } from '../worker-builder.mjs';
import vm from 'node:vm';

process.env.CFNEW_ALLOW_PRIVATE = 'yes';
const { handlePanel } = await import('../server.mjs');
const version = CORE_VERSION;
const uuid = '351c9981-04b6-4103-aa4b-864aa9c91469';
const source = await readFile(process.env.CFNEW_TEST_CORE || new URL('../../明文源吗', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source.replace(/import\s*\{\s*connect as ([^}]+)\}\s*from\s*['"]cloudflare:sockets['"];/, (_, name) => 'const ' + name.trim() + ' = () => { throw new Error("此测试不建立代理连接"); };')).toString('base64'))).default;

test('核心声明只读版本，保存后继续回传且不写入KV', async () => {
  let stored = '{}';
  const env = { u: uuid, C: { get: async () => JSON.parse(stored), put: async (_, value) => { stored = value; } } };
  const request = init => new Request('https://worker.example/' + uuid + '/api/config', init);
  const reportedVersion = (await (await worker.fetch(request(), env)).json()).coreVersion;
  assert.match(reportedVersion, /^20\d{2}\.\d{1,2}\.\d{1,2}\.\d+$/);
  const response = await worker.fetch(request({ method: 'POST', body: '{"yx":"104.16.1.1:443"}' }), env);
  assert.equal((await response.json()).config.coreVersion, reportedVersion);
  assert.ok(!Object.hasOwn(JSON.parse(stored), 'coreVersion'));
  assert.equal((await worker.fetch(request({ method: 'POST', body: '{"coreVersion":"fake"}' }), env)).status, 400);
});

test('首页显示面板版本', async () => {
  const html = await (await handlePanel(new Request('https://panel.example/'))).text();
  assert.ok(html.includes(version));
});

test('面板对照当前、旧版、新版和无版本内核，只有已确认的旧版本提示升级', async () => {
  for (const coreVersion of [version, '2020.1.1.1', '2099.1.1.1', undefined]) {
    const fixture = { uuid, kvEnabled: true, yx: '104.16.1.1:443', ...(coreVersion ? { coreVersion } : {}) };
    const server = createServer((_, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(fixture)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const host = 'http://127.0.0.1:' + server.address().port;
    try {
      const response = await handlePanel(new Request('https://panel.example/panel?' + new URLSearchParams({ host, uuid })));
      assert.equal(response.status, 200);
      const html = await response.text();
      for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(script);
      const context = JSON.parse(html.match(/window\.CFNEW=(.*?);window\.CFNEW\.subUrl/)[1]);
      assert.equal(context.release.panelVersion, version);
      assert.equal(context.release.coreVersion, coreVersion || '');
      assert.equal(context.release.availableCoreVersion, version);
      assert.equal(context.release.needsUpdate, coreVersion === '2020.1.1.1');
      assert.equal(context.release.changes.length, 2);
      assert.ok(context.release.changes.some(text => text.includes('CPU')));
      assert.ok(context.release.changes.some(text => text.includes('配套内核')));
      assert.equal(context.release.zipUrl, 'https://raw.githubusercontent.com/byJoey/cfnew/core-only/pages.zip');
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
});

test('版本来自实际内核，生成文件首部、API和平台更新判断保持一致', async () => {
  assert.throws(() => readCoreVersion('export default {}'), /版本/);
  assert.throws(() => readCoreVersion('const a="2026.1.1.1", b="2026.2.1.1";'), /版本/);
  assert.equal(compareCoreVersions('2026.9.30.1', '2026.10.1.1'), -1);
  assert.equal(compareCoreVersions('2026.10.1.10', '2026.10.1.2'), 1);
  assert.equal(compareCoreVersions('', version), null);
  const result = await buildWorker({ uuid, seed: 'version-test-seed', format: 'worker', settings: {} });
  const isolated = result.code.replace(/import\s*\{\s*connect as ([^}]+)\}\s*from\s*['"]cloudflare:sockets['"];?/, (_, name) => 'const ' + name.trim() + ' = () => { throw new Error("测试不建立代理连接"); };');
  const generated = (await import('data:text/javascript;base64,' + Buffer.from(isolated).toString('base64'))).default;
  const config = await (await generated.fetch(new Request('https://worker.example/' + uuid + '/api/config'), {})).json();
  assert.equal(config.coreVersion, version);
  assert.equal(result.coreVersion, version);
  assert.equal(result.code.split('\n')[1], '// Core version: ' + version);
  assert.equal(coreRelease(config).needsUpdate, false);
});

test('控制台同版本时折叠重建入口，旧版本突出更新，新版本禁止降级，KV只影响配置说明', async () => {
  const bridge = await readFile(new URL('../bridge.js', import.meta.url), 'utf8');
  for (const [coreVersion, kvEnabled] of [[version, true], [version, false], ['2020.1.1.1', true], ['2099.1.1.1', true], [undefined, true]]) {
    const elements = [];
    const element = tag => { const node = { tag, children: [], dataset: {}, attributes: {}, append(...nodes) { this.children.push(...nodes); }, after(node) { this.next = node; }, before() {}, addEventListener() {}, setAttribute(name, value) { this.attributes[name] = value; } }; elements.push(node); return node; };
    const config = { coreVersion, kvEnabled };
    const context = vm.createContext({
      URL, location: { href: 'https://panel.example/panel?host=https%3A%2F%2Fworker.example&uuid=' + uuid },
      history: { replaceState() {} }, localStorage: { getItem: () => null, setItem() {} },
      window: { CFNEW: { host: 'https://worker.example', uuid, config, release: coreRelease(config) }, CFConnectionFlow: { connectionNotice: () => '' } },
      document: { createElement: element, querySelector: () => element('header'), querySelectorAll: () => [], addEventListener: (_, callback) => { context.start = callback; } },
    });
    vm.runInContext(bridge, context); context.start();
    const card = elements.find(node => node.id === 'workerMaintenance');
    const button = elements.find(node => node.id === 'buildFromSaved');
    assert.equal(card.tag, coreVersion === '2020.1.1.1' ? 'section' : 'details');
    assert.equal(button.disabled, coreVersion === '2099.1.1.1');
    if (coreVersion === version) assert.ok(elements.some(node => node.textContent?.includes(kvEnabled ? '日常修改配置直接保存' : '未绑定 KV')));
  }
});

test('生成页仅生成和下载，记录统一由连接控制台管理，并展示实际内核版本', async () => {
  const builder = await (await handlePanel(new Request('https://panel.example/builder'))).text();
  const connect = await (await handlePanel(new Request('https://panel.example/connect'))).text();
  assert.ok(!builder.includes('id="pendingFlow"'));
  assert.ok(builder.includes('生成的 Worker 内核版本：' + version));
  assert.ok(builder.includes('id="downloadBuildBackup"'));
  assert.ok(connect.includes('id="pendingFlow"'));
  for (const page of [builder, connect]) for (const [, script] of page.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new Function(script);
});
