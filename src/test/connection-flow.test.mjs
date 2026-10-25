import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createServer } from 'node:http';
import test from 'node:test';
import { settingDefinitions, settingDefaults } from '../settings.mjs';
import { buildWorker } from '../worker-builder.mjs';
import { createSubscriptionEngine } from '../engine.mjs';

process.env.CFNEW_ALLOW_PRIVATE = 'yes';
const { handlePanel } = await import('../server.mjs');
const source = await readFile(new URL('../connection-flow.js', import.meta.url), 'utf8');
const uuid = '351c9981-04b6-4103-aa4b-864aa9c91469';
const record = (buildId = '1234567890abcdef') => ({ uuid, buildId, settings: { d: '/管理/Panel', yx: '104.16.1.1:443#测试', ev: 'yes', s: 'socks5://user:pass@proxy.example:1080' }, createdAt: '2026-10-25T01:00:00.000Z', seed: 'must-not-store' });
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data };
}
function client(localStorage = storage(), sessionStorage = storage()) {
  const window = { CFNEW_SETTINGS: settingDefinitions, localStorage, sessionStorage };
  vm.runInNewContext(source, { window });
  return window.CFConnectionFlow;
}

test('安装包记录保存成功快照，刷新可恢复，默认不进入长期存储也不保存构建码', () => {
  const local = storage(), session = storage(), flow = client(local, session), snapshot = record();
  flow.save(snapshot);
  snapshot.uuid = 'changed'; snapshot.settings.d = '/changed';
  const restored = client(local, session).records()[0];
  assert.equal(restored.uuid, uuid); assert.equal(restored.settings.d, '/管理/Panel');
  assert.equal(local.data.size, 0);
  assert.equal(JSON.stringify([...session.data]).includes('must-not-store'), false);
  assert.equal(client(local).records().length, 0, '新标签页会话不使用临时记录');
});

test('多个安装包独立保留，长期记住、取消记住和删除均可恢复验证', () => {
  const local = storage(), session = storage();
  let flow = client(local, session);
  flow.save(record(), true); flow.save(record('abcdef1234567890'));
  assert.equal(flow.records().length, 2);
  assert.equal(client(local).records().length, 1);
  flow.save(record(), false);
  assert.equal(client(local).records().length, 0);
  flow = client(local, session); assert.equal(flow.records().length, 2);
  flow.remove('1234567890abcdef'); flow.remove('abcdef1234567890');
  assert.equal(client(local, session).records().length, 0);
});

test('存储被禁用仍保留当前页内存记录，损坏记录不影响其他记录', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const flow = client(blocked, blocked);
  assert.throws(() => flow.save(record()));
  assert.equal(flow.records()[0].uuid, uuid);
  const local = storage(); local.setItem('cftwo-pending-builds', JSON.stringify([{ uuid: 'invalid' }, record()]));
  assert.equal(client(local).records().length, 1);
});

test('核对配置忽略路径边斜杠与优选换行差异，但报告旧KV覆盖的字段且不泄露代理密码', () => {
  const flow = client(), snapshot = record();
  const config = { ...snapshot.settings, d: '管理/Panel/', yx: '\n104.16.1.1:443#测试\n' };
  assert.equal(flow.differences(snapshot, config).length, 0);
  config.d = '/old'; config.s = 'another';
  assert.deepEqual(Array.from(flow.differences(snapshot, config)), ['自定义管理路径', '出站代理']);
  assert.equal(flow.differences(snapshot, config).join().includes('pass'), false);
});

test('连接备份可导出并恢复，保留域名与配置但剔除构建码，拒绝非备份文件', async () => {
  let blob, downloaded = false;
  const window = { CFNEW_SETTINGS: settingDefinitions, localStorage: storage(), sessionStorage: storage() };
  const link = { click() { downloaded = true; }, remove() {} };
  vm.runInNewContext(source, { window, Blob, URL: { createObjectURL(value) { blob = value; return 'blob:backup'; } }, document: { createElement: () => link, body: { append() {} } }, setTimeout() {} });
  const flow = window.CFConnectionFlow;
  flow.downloadBackup({ ...record(), host: 'https://worker.example' });
  assert.equal(downloaded, true);
  const text = await blob.text();
  assert.equal(text.includes('must-not-store'), false);
  assert.equal(link.download, 'connection-1234567890abcdef.json');
  const restored = flow.parseBackup(text); flow.save(restored);
  assert.equal(flow.records()[0].host, 'https://worker.example');
  assert.equal(flow.records()[0].settings.s, record().settings.s);
  assert.throws(() => flow.parseBackup('{}'), /连接备份/);
  assert.throws(() => flow.parseBackup(JSON.stringify({ type: 'cftwo-connection', version: 1, ...record(), uuid: 'wrong' })), /格式/);
});

test('未绑定KV仍把实际配置填入全部控件，并禁止在线保存；绑定后可操作', async () => {
  for (const kvEnabled of [false, true]) {
    const config = { ...settingDefaults, d: '/管理/Panel', p: 'proxy.example:443', yx: '104.16.1.1:443#测试,104.16.1.2:8443#第二条', s: 'socks5://user:pass@proxy.example:1080', et: 'yes', freeCpu: 'yes', kvEnabled };
    const html = await (await createSubscriptionEngine(config, uuid).render(new Request('https://worker.example/' + uuid))).text();
    const nodes = new Map();
    const get = id => { if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, style: {}, disabled: false }); return nodes.get(id); };
    const context = vm.createContext({ document: { getElementById: get, cookie: '' }, localStorage: storage(), navigator: { language: 'zh-CN' }, fetch: async () => Response.json(config), window: { CFNEW: { config } }, 更新路径类型状态() {}, 更新工作器地区状态() {}, 加载当前配置: async () => {} });
    const apply = html.slice(html.indexOf('function 读取字段值('), html.indexOf('async function 加载当前配置('));
    const check = html.slice(html.indexOf('async function 检查键值状态('), html.indexOf('function 读取字段值('));
    vm.runInContext(apply + '\n' + check, context);
    await vm.runInContext('检查键值状态()', context);
    assert.equal(get('configContent').style.display, 'block');
    assert.equal(get('customPath').value, config.d); assert.equal(get('socksConfig').value, config.s);
    assert.equal(get('yx').value, config.yx.replace(',', '\n'));
    assert.equal(get('et').checked, true); assert.equal(get('freeCpu').checked, true);
    assert.equal(get('cpBtnSaveAll').disabled, !kvEnabled); assert.equal(get('cpBtnReset').disabled, !kvEnabled);
    assert.equal(vm.runInContext('收集界面配置().d', context), config.d);
  }
});

test('真实个人构建部署后经panel读回安装包配置，旧KV优先，在线保存继续覆盖', async () => {
  const settings = { ...settingDefaults, d: '/Admin/Panel', yx: '104.16.1.1:443#已填写', p: 'fallback.example:443', s: 'socks5://user:pass@proxy.example:1080', et: 'yes', egi: 'no', epd: 'no', customDNS: 'https://dns.example/dns-query' };
  const built = await buildWorker({ uuid, settings, seed: 'integration-seed', format: 'worker' });
  const isolated = built.code.replace(/import\s*\{\s*connect as ([^}]+)\}\s*from\s*['"]cloudflare:sockets['"];?/, (_, name) => 'const ' + name.trim() + ' = () => { throw new Error("不建立代理连接"); };');
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(isolated).toString('base64'))).default;
  let env = {};
  const values = new Map([['c', JSON.stringify({ d: '/Old/Entry', p: 'old.example:443' })]]);
  const C = { get: async key => JSON.parse(values.get(key) || 'null'), put: async (key, value) => values.set(key, value) };
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const response = await worker.fetch(new Request('http://127.0.0.1' + incoming.url, { method: incoming.method, ...(body.length ? { body } : {}) }), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const host = 'http://127.0.0.1:' + server.address().port;
  const api = 'https://panel.example/worker-api/' + Buffer.from(host).toString('base64url') + '/' + uuid + '/api/config';
  try {
    const initial = await (await handlePanel(new Request(api))).json();
    assert.equal(initial.kvEnabled, false);
    for (const key of Object.keys(settings)) assert.equal(initial[key], settings[key], key);
    const page = await handlePanel(new Request('https://panel.example/panel?' + new URLSearchParams({ host, uuid })));
    assert.equal(page.status, 200);
    const html = await page.text();
    const boot = JSON.parse(html.match(/window\.CFNEW=(.*?);window\.CFNEW\.subUrl/)[1]);
    assert.equal(boot.config.d, settings.d); assert.equal(boot.config.s, settings.s);
    env = { C };
    const old = await (await handlePanel(new Request(api))).json();
    assert.equal(old.d, '/Old/Entry'); assert.equal(old.p, 'old.example:443');
    assert.deepEqual(Array.from(client().differences({ settings }, old)), ['自定义管理路径', 'ProxyIP']);
    const saved = await handlePanel(new Request(api, { method: 'POST', body: JSON.stringify({ d: '/Updated/Entry', p: 'new.example:443' }) }));
    assert.equal((await saved.json()).success, true);
    const current = await (await handlePanel(new Request(api))).json();
    assert.equal(current.d, '/Updated/Entry'); assert.equal(current.p, 'new.example:443');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
