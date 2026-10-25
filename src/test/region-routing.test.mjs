import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createSubscriptionEngine } from '../engine.mjs';

const uuid = '351c9981-04b6-4103-aa4b-864aa9c91469';
const target = 'destination.example';
const bridgeKey = '__cftwo_region_routing_test';
const bridge = globalThis[bridgeKey] = {};
const prefix = alias => `
const ${alias} = (...args) => globalThis.${bridgeKey}.current.connect(...args);
const WebSocketPair = class { constructor() { return globalThis.${bridgeKey}.current.pair(); } };
const Response = class extends globalThis.Response {
  constructor(body, init) {
    if (init?.status === 101) return { status: 101, webSocket: init.webSocket };
    super(body, init);
  }
};
const setTimeout = (...args) => { const timer = globalThis.setTimeout(...args); timer.unref?.(); return timer; };
`;

function frame() {
  return new Uint8Array([0, ...Buffer.from(uuid.replaceAll('-', ''), 'hex'), 0, 1, 1, 187, 2, target.length, ...new TextEncoder().encode(target), 1]);
}
function harness({ direct = false, failAll = false } = {}) {
  const calls = [], peers = [], sockets = [];
  let sent;
  const received = new Promise(resolve => { sent = resolve; });
  class Peer {
    readyState = 1;
    listeners = new Map();
    accept() {}
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
    send(data) { sent(data); }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
  }
  return {
    calls, received,
    pair() { const client = new Peer(), server = new Peer(); peers.push(server); return { 0: client, 1: server }; },
    connect({ hostname, port }) {
      calls.push({ hostname, port });
      if (failAll || hostname === target && !direct) throw new Error('模拟直连失败');
      let finish;
      const socket = {
        opened: Promise.resolve(), closed: new Promise(resolve => { finish = resolve; }),
        readable: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([79, 75])); controller.close(); } }),
        writable: new WritableStream({ write() {} }),
        close() { finish(); }
      };
      sockets.push(socket); return socket;
    },
    close() { for (const peer of peers) peer.close(); for (const socket of sockets) socket.close(); }
  };
}
function kv(initial = {}) {
  const values = new Map([['c', JSON.stringify(initial)]]);
  return { get: async key => JSON.parse(values.get(key) || 'null'), put: async (key, value) => values.set(key, value) };
}

const cores = [];
for (const [name, path] of [['个人构建内核', new URL('../worker-core.js', import.meta.url)], ['配置的测试内核', process.env.CFNEW_TEST_CORE || new URL('../../test/core-fixture.mjs', import.meta.url)]]) {
  const source = await readFile(path, 'utf8');
  const isolated = source.replace(/import\s*\{\s*connect\s+as\s+([\w$]+)\s*\}\s*from\s*['"]cloudflare:sockets['"];?/, (_, alias) => prefix(alias));
  assert.notEqual(isolated, source);
  cores.push({ name, worker: (await import('data:text/javascript;base64,' + Buffer.from(isolated + '\n//' + name).toString('base64'))).default });
}

async function route(worker, env, { transport = 'ws', query = '', ...options } = {}) {
  const network = harness(options); bridge.current = network;
  try {
    if (transport === 'ws') {
      const response = await worker.fetch(new Request('https://worker.example/' + query, { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': Buffer.from(frame()).toString('base64url') } }), { u: uuid, ...env });
      assert.equal(response.status, 101);
      if (!options.failAll) await Promise.race([network.received, new Promise((_, reject) => setTimeout(() => reject(new Error('未收到代理响应')), 1000))]);
      else await new Promise(resolve => setImmediate(resolve));
    } else {
      const packet = frame();
      // XHTTP 为双向长连接；下行结束前保持上传流打开，避免模拟成客户端已断开。
      const body = { getReader: () => ({ readAtLeast: async () => ({ value: packet, done: false }), read: async () => new Promise(() => {}), releaseLock() {} }) };
      const response = await worker.fetch({ url: 'https://worker.example/' + uuid.slice(0, 8), method: 'POST', headers: new Headers(), body }, { u: uuid, ex: 'yes', ...env }, { waitUntil() {} });
      assert.equal(response.status, 200);
      const data = new Uint8Array(await response.arrayBuffer());
      assert.deepEqual([...data], [0, 0, 79, 75]);
    }
    return [...new Set(network.calls.map(call => call.hostname))];
  } catch (error) {
    throw new Error('隔离传输失败：' + transport + '，已连接 ' + network.calls.map(call => call.hostname).join(', '), { cause: error });
  } finally { network.close(); }
}

for (const { name, worker } of cores) {
  test(name + '：美国、韩国设置可保存读回；WS和XHTTP直连失败后选择对应地区回退域名', async () => {
    const C = kv();
    for (const wk of ['US', 'KR']) {
      const saved = await worker.fetch(new Request('https://worker.example/' + uuid + '/api/config', { method: 'POST', body: JSON.stringify({ wk }) }), { u: uuid, C });
      assert.equal((await saved.json()).success, true);
      const config = await (await worker.fetch(new Request('https://worker.example/' + uuid + '/api/config'), { u: uuid, C })).json();
      assert.equal(config.wk, wk);
      for (const transport of ['ws', 'xhttp']) {
        const calls = await route(worker, { C }, { transport });
        assert.equal(calls[0], target);
        assert.match(calls[1], new RegExp('^ProxyIP\\.' + wk + '\\.', 'i'));
      }
    }
  });
  test(name + '：直连成功不使用地区回退；手填p、关闭rm和节点path覆盖均优先于wk', async () => {
    for (const transport of ['ws', 'xhttp']) {
      assert.deepEqual(await route(worker, { wk: 'US' }, { transport, direct: true }), [target]);
      assert.deepEqual(await route(worker, { wk: 'KR', p: 'manual.example:8443' }, { transport }), [target, 'manual.example']);
      assert.match((await route(worker, { wk: 'KR', rm: 'no' }, { transport }))[1], /^ProxyIP\.HK\./i);
    }
    assert.match((await route(worker, { wk: 'US' }, { query: '?wk=KR' }))[1], /^ProxyIP\.KR\./i);
    assert.deepEqual(await route(worker, { wk: 'US' }, { query: '?p=node.example:8443' }), [target, 'node.example']);
    assert.match((await route(worker, {}))[1], /^pp\.xy\.kg$/);
  });
  test(name + '：有效代理配置的only模式在代理失败后不使用地区回退', async () => {
    const calls = await route(worker, { wk: 'US', s: 'http://proxy.example:8080', qj: 'only' }, { failAll: true });
    assert.deepEqual(calls, ['proxy.example']);
  });
}

test('地区状态只报告配置，不把偏好伪装成出口实测；关闭匹配和手填ProxyIP有准确提示', async () => {
  const config = { wk: 'KR', rm: '', p: '', s: '', kvEnabled: true };
  const html = await (await createSubscriptionEngine(config, uuid).render(new Request('https://worker.example/' + uuid))).text();
  const fn = html.slice(html.indexOf('async function 检查系统状态()'), html.indexOf('async function 测试接口()'));
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  const context = vm.createContext({ document: { getElementById: get }, window: { CFNEW: { apiBase: '/test' } }, fetch: async () => Response.json(config) });
  vm.runInContext(fn, context);
  await vm.runInContext('检查系统状态()', context);
  assert.match(get('regionStatus').textContent, /回退地区偏好.*韩国/);
  assert.match(get('currentIP').textContent, /未检测/);
  assert.match(get('backupStatus').textContent, /未实测/);
  assert.ok(![...elements.values()].some(element => /10\/10|同地区IP可用/.test(element.textContent)));
  config.rm = 'no';
  await vm.runInContext('检查系统状态()', context);
  assert.match(get('regionMatch').textContent, /已关闭/);
  config.p = '<img src=x onerror=alert(1)>';
  await vm.runInContext('检查系统状态()', context);
  assert.match(get('regionMatch').textContent, /手填 ProxyIP 优先/);
  assert.equal(get('backupStatus').innerHTML, undefined, '用户配置只使用文本输出');
});
