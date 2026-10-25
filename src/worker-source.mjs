import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// 与 cfnew 的发行脚本使用相同版本规则；缺失或歧义时停止构建，避免展示错误版本。
export function readCoreVersion(source) {
  const versions = [...new Set([...source.matchAll(/["'](20\d{2}\.\d{1,2}\.\d{1,2}\.\d+)["']/g)].map(match => match[1]))];
  if (versions.length !== 1) throw new Error('内核版本标记缺失或不唯一，请检查同步的 cfnew 内核');
  return versions[0];
}

export const source = await readFile(new URL('./worker-core.js', import.meta.url), 'utf8');
export const CORE_VERSION = readCoreVersion(source);
export const sourceHash = createHash('sha256').update(source).digest('hex');
