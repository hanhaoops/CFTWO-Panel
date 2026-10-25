import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CORE_VERSION, readCoreVersion } from '../worker-source.mjs';

const path = resolve(process.argv[2] || '../cfnew/_worker.js');
const source = await readFile(path, 'utf8');
const version = readCoreVersion(source);
if (!/export\s*\{\s*[\w$]+\s+as\s+default\s*\}\s*;?\s*$/.test(source)) throw new Error('该内核的模块格式与个人构建器不兼容，未写入');
await writeFile(new URL('../worker-core.js', import.meta.url), source);
console.log(`已同步内核：${CORE_VERSION} → ${version}。页面、更新判断和安装包版本将从此内核读取；请运行 npm test 后再发布面板。`);
