// 原界面的订阅和配置入口连接到各自的服务器。
// 登录后用真实 UUID 保持连接，修改自定义入口不会使重载失效。
const panelLocation = new URL(location.href);
const access = (panelLocation.searchParams.get('uuid') || '').trim();
const connectionBuildId = panelLocation.searchParams.get('build');
const connectionStorageWarning = panelLocation.searchParams.get('storage') === 'failed';
panelLocation.searchParams.delete('build');
panelLocation.searchParams.delete('storage');
try {
  const nodes = JSON.parse(localStorage.getItem('cfnew-panel-nodes') || '[]');
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      const origin = new URL(/^https?:\/\//i.test(node.host) ? node.host : 'https://' + node.host).origin;
      if (origin === window.CFNEW.host && node.uuid === access) node.uuid = window.CFNEW.uuid;
    }
    localStorage.setItem('cfnew-panel-nodes', JSON.stringify(nodes));
  }
} catch {}
if (window.CFNEW.panelPath) history.replaceState(null, '', window.CFNEW.panelPath);
else {
  panelLocation.searchParams.set('uuid', window.CFNEW.uuid);
  history.replaceState(null, '', panelLocation);
}
document.addEventListener('DOMContentLoaded', () => {
  const release = window.CFNEW.release;
  const updateAvailable = release.needsUpdate;
  const builderCard = document.createElement(updateAvailable ? 'section' : 'details');
  builderCard.className = updateAvailable ? 'card console-builder-card' : 'card core-maintenance';
  builderCard.id = 'workerMaintenance';
  builderCard.dataset.updateAvailable = String(updateAvailable);
  const builderDescription = document.createElement('div');
  const builderTitle = document.createElement(updateAvailable ? 'h2' : 'summary');
  const stateLabels = { current: '与平台版本一致', newer: '运行版本较新', unknown: '运行版本未识别' };
  builderTitle.textContent = updateAvailable ? '有可更新的 Worker 内核' : 'Worker 内核 ' + (release.coreVersion || '版本未知') + ' · ' + (stateLabels[release.state] || '版本与维护');
  if (!updateAvailable) builderCard.append(builderTitle);
  const versions = document.createElement('small');
  versions.textContent = '当前 Worker：' + (release.coreVersion || '未标版本') + ' · 平台生成版本：' + release.availableCoreVersion;
  const builderHint = document.createElement('p');
  builderHint.textContent = updateAvailable ? '升级内核需要重新生成并上传安装包。保留原 UUID 和 KV 绑定，已保存配置可继续使用。' : window.CFNEW.config.kvEnabled ? 'KV 已启用，日常修改配置直接保存即可，无需重新生成。仅升级内核或另存安装包时使用下方入口。' : '当前未绑定 KV。调整固化配置或升级内核时可重新生成安装包；绑定 KV 后日常配置可直接在线保存。';
  if (release.state === 'newer') builderHint.textContent = '你的 Worker 内核比平台内置版本新。请先更新生成平台，避免重新生成后降级。';
  if (release.state === 'unknown') builderHint.textContent += ' 当前 Worker 未报告可识别的版本，无法判断是否需要升级。';
  const builderError = document.createElement('small');
  builderError.setAttribute('role', 'status');
  const buildButton = document.createElement('button');
  buildButton.type = 'button';
  buildButton.className = 'button-primary';
  buildButton.id = 'buildFromSaved';
  buildButton.textContent = updateAvailable ? '保留配置，生成更新包 ↗' : '手动重新生成（保留 UUID） ↗';
  buildButton.disabled = release.state === 'newer';
  buildButton.addEventListener('click', async () => {
    buildButton.disabled = true;
    builderError.textContent = '';
    try {
      const response = await fetch(window.CFNEW.apiBase + '/api/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('读取失败，请刷新后重试。');
      const config = await response.json();
      const keys = window.CFNEW_SETTINGS.map(field => field.key);
      const settings = Object.fromEntries(keys.filter(key => config[key] !== undefined && config[key] !== null).map(key => [key, config[key]]));
      sessionStorage.setItem('cfnew-builder-draft', JSON.stringify({ uuid: window.CFNEW.uuid, settings, coreVersion: config.coreVersion }));
      location.assign('/builder#import');
    } catch (error) {
      builderError.textContent = error.message || '浏览器暂时无法带入配置，请直接打开个人 Worker 页面。';
      buildButton.disabled = false;
    }
  });
  if (updateAvailable) builderDescription.append(builderTitle);
  builderDescription.append(versions, builderHint, builderError);
  builderCard.append(builderDescription, buildButton);
  document.querySelector('.container .header')?.after(builderCard);
  const connectionNotice = window.CFConnectionFlow.connectionNotice({ host: window.CFNEW.host, uuid: window.CFNEW.uuid, config: window.CFNEW.config, buildId: connectionBuildId, storageWarning: connectionStorageWarning });
  if (connectionNotice) {
    const notice = document.createElement('section');
    notice.className = 'card info-banner';
    notice.setAttribute('role', 'status');
    notice.textContent = connectionNotice;
    builderCard.before(notice);
  }
  const links = document.querySelectorAll('[onclick]');
  for (const link of links) {
    const action = link.getAttribute('onclick');
    if (action.includes('window.location.href') && action.includes('/sub')) {
      link.removeAttribute('onclick');
      link.addEventListener('click', () => navigator.clipboard.writeText(window.CFNEW.subUrl));
    }
  }
});
