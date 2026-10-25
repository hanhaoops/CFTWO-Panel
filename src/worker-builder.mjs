import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { minify } from 'terser';
import { zipSync, strToU8 } from 'fflate';
import { settingKeys, settingFlags } from './settings.mjs';
export { settingKeys } from './settings.mjs';

export const BUILDER_VERSION = '2';
export const CORE_VERSION = '2026.10.17.2';
const source = await readFile(new URL('./worker-core.js', import.meta.url), 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const sourceExport = source.match(/export\s*\{\s*([\w$]+)\s+as\s+default\s*\}\s*;?\s*$/);
if (!sourceExport) throw new Error('内置 Worker 的模块格式不受支持');
const coreBody = source.slice(0, sourceExport.index);
const flags = new Set(settingFlags);
const aliases = { freeCpu: ['FREE_CPU'], customDNS: ['CUSTOMDNS', 'CUSTOM_DNS'], customECHDomain: ['CUSTOMECHDOMAIN', 'CUSTOM_ECH_DOMAIN'], yxURL: ['YXURL', 'YX_URL'] };
const hash = value => createHash('sha256').update(value).digest('hex');
let building = 0;

export function validateBuild(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请填写构建设置');
  const uuid = typeof input.uuid === 'string' ? input.uuid.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) throw new Error('请填写有效的 UUID，或点击重新生成');
  if (typeof input.seed !== 'string' || input.seed.length < 8 || input.seed.length > 128) throw new Error('个人构建码需要 8–128 个字符');
  if (!['worker', 'pages'].includes(input.format)) throw new Error('请选择 Worker 文件或 Pages 部署包');
  const settings = input.settings ?? {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('配置格式无效');
  if (Object.keys(settings).some(key => !settingKeys.includes(key))) throw new Error('配置包含不支持的字段');
  const normalized = {};
  for (const key of settingKeys) {
    if (settings[key] === undefined || settings[key] === null) continue;
    const value = settings[key];
    if (flags.has(key)) {
      if (!['yes', 'no', true, false].includes(value)) throw new Error('开关配置无效：' + key);
      normalized[key] = value === 'yes' || value === true ? 'yes' : 'no';
    } else {
      if (typeof value !== 'string' || value.length > (key === 'yx' ? 32768 : 2048) || value.includes('\0')) throw new Error('配置内容过长或格式无效：' + key);
      normalized[key] = value;
    }
  }
  if (normalized.ev === 'no' && normalized.et === 'no' && normalized.ex === 'no') throw new Error('请至少开启一种连接协议');
  if (normalized.d && (/[?#\\\u0000-\u0020\u007f]/.test(normalized.d) || normalized.d.split('/').some(part => part === '.' || part === '..'))) throw new Error('自定义路径不能包含空格、问号或井号');
  return { uuid, seed: input.seed, format: input.format, settings: normalized };
}

export async function buildWorker(input) {
  const { uuid, seed, format, settings } = validateBuild(input);
  const buildId = hash(JSON.stringify([BUILDER_VERSION, sourceHash, uuid, settings, seed])).slice(0, 16);
  const prefix = '_b' + hash('identifiers:' + buildId).slice(0, 5);
  const defaults = JSON.stringify({ u: uuid, ...settings });
  // 配置作为默认环境值注入；用户的 Cloudflare 绑定与环境变量仍拥有更高优先级。
  // 不改属性名、协议字节或数据流，不引入运行时解密和额外执行分支。
  const wrapper = `${coreBody}
const personalDefaults=${defaults};
const personalAliases=${JSON.stringify(aliases)};
export default {
  fetch(request, env={}, ctx) {
    const effective={...env};
    for(const [key,value] of Object.entries(personalDefaults)) {
      const candidates=[key, ...(personalAliases[key] || [key.toUpperCase()])];
      const selected=candidates.find(name => env[name] !== undefined && env[name] !== null && env[name] !== '');
      effective[key]=selected ? env[selected] : value;
    }
    return ${sourceExport[1]}.fetch(request,effective,ctx);
  }
};`;
  const result = await minify(wrapper, {
    module: true,
    compress: false,
    mangle: { toplevel: true, nth_identifier: { get: n => prefix + n.toString(36) } },
    format: { ascii_only: true, comments: false },
  });
  const code = `// UUID: ${uuid}\n` + result.code + '\n';
  return { code, buildId, sha256: hash(code), bytes: Buffer.byteLength(code), format };
}

export async function handleBuildDownload(request) {
  const respond = (message, status) => Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return respond('请通过构建表单下载', 405);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return respond('请使用 JSON 提交设置', 415);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return respond('请从当前面板生成下载', 403);
  if (building >= 2) return respond('当前构建繁忙，请稍后重试', 503);
  let input;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > 65536) return respond('构建设置超过 64 KiB，请减少优选条目', 413);
    input = validateBuild(JSON.parse(body));
  } catch (error) { return respond(error instanceof SyntaxError ? '构建设置不是有效 JSON' : error.message, 400); }
  building++;
  try {
    const result = await buildWorker(input);
    const pages = result.format === 'pages';
    const body = pages ? zipSync({ '_worker.js': strToU8(result.code) }, { level: 6, mtime: new Date('2026-01-20T00:00:00Z') }) : result.code;
    return new Response(body, { headers: {
      'Content-Type': pages ? 'application/zip' : 'text/javascript; charset=utf-8',
      'Content-Disposition': `attachment; filename="${pages ? 'Pages-' + result.buildId + '.zip' : '_worker-' + result.buildId + '.js'}"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Build-Id': result.buildId, 'X-Worker-SHA256': result.sha256, 'X-Worker-Bytes': String(result.bytes),
    } });
  } catch { return respond('构建未完成，请稍后重试', 500); }
  finally { building--; }
}
