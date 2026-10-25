import { CORE_VERSION } from './worker-source.mjs';
export const PANEL_VERSION = CORE_VERSION;

export function compareCoreVersions(current, available) {
  const pattern = /^20\d{2}\.\d{1,2}\.\d{1,2}\.\d+$/;
  if (!pattern.test(current) || !pattern.test(available)) return null;
  const left = current.split('.').map(Number), right = available.split('.').map(Number);
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return Math.sign(left[index] - right[index]);
  return 0;
}

export function coreRelease(config) {
  const coreVersion = typeof config.coreVersion === 'string' ? config.coreVersion.trim() : '';
  const comparison = compareCoreVersions(coreVersion, CORE_VERSION);
  const state = comparison === null ? 'unknown' : comparison < 0 ? 'update-available' : comparison > 0 ? 'newer' : 'current';
  return {
    panelVersion: PANEL_VERSION,
    coreVersion,
    availableCoreVersion: CORE_VERSION,
    state,
    needsUpdate: state === 'update-available',
    changes: [
      '新增 Free CPU 保护开关，按单连接双向流量和数据块预算提前断开。',
      '默认关闭；开启后可能中断下载和视频，需客户端重连。更新配套内核后生效。',
    ],
    zipUrl: 'https://raw.githubusercontent.com/byJoey/cfnew/core-only/pages.zip',
    workerUrl: 'https://raw.githubusercontent.com/byJoey/cfnew/core-only/_worker.js',
  };
}
