// 原界面的订阅和配置入口连接到各自的服务器。
// 登录后用真实 UUID 保持连接，修改自定义入口不会使重载失效。
const panelLocation = new URL(location.href);
const access = (panelLocation.searchParams.get('uuid') || '').trim();
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
  const builderCard = document.createElement('section');
  builderCard.className = 'card console-builder-card';
  const builderDescription = document.createElement('div');
  const builderTitle = document.createElement('h2');
  builderTitle.textContent = '构建个人 Worker';
  const builderHint = document.createElement('p');
  builderHint.textContent = '带入已保存的配置，生成个人版本并下载到本地。';
  const builderError = document.createElement('small');
  builderError.setAttribute('role', 'status');
  const buildButton = document.createElement('button');
  buildButton.type = 'button';
  buildButton.className = 'button-primary';
  buildButton.id = 'buildFromSaved';
  buildButton.textContent = '用已保存配置生成 ↗';
  buildButton.addEventListener('click', async () => {
    buildButton.disabled = true;
    builderError.textContent = '';
    try {
      const response = await fetch(window.CFNEW.apiBase + '/api/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('读取失败，请刷新后重试。');
      const config = await response.json();
      const keys = ['freeCpu','wk','ev','et','ex','ech','tp','customDNS','customECHDomain','alpn','d','p','yx','yxURL','s','homepage','scu','ena','epd','epi','egi','ae','rm','qj','dkby','yxby','ipv4','ipv6','ispMobile','ispUnicom','ispTelecom','jk'];
      const settings = Object.fromEntries(keys.filter(key => config[key] !== undefined && config[key] !== null).map(key => [key, config[key]]));
      sessionStorage.setItem('cfnew-builder-draft', JSON.stringify({ uuid: window.CFNEW.uuid, settings }));
      location.assign('/builder#import');
    } catch (error) {
      builderError.textContent = error.message || '浏览器暂时无法带入配置，请直接打开个人 Worker 页面。';
      buildButton.disabled = false;
    }
  });
  builderDescription.append(builderTitle, builderHint, builderError);
  builderCard.append(builderDescription, buildButton);
  document.querySelector('.container .header')?.after(builderCard);
  const release = window.CFNEW.release;
  const ignoredUpdateKey = 'cfnew-panel-ignored-update';
  let ignoredVersion = '';
  try { ignoredVersion = localStorage.getItem(ignoredUpdateKey) || ''; } catch {}
  if (release.needsUpdate && ignoredVersion !== release.panelVersion) {
    const notice = document.createElement('section');
    notice.id = 'coreVersionStatus';
    notice.dataset.updateRequired = String(release.needsUpdate);
    notice.setAttribute('role', 'status');
    const title = document.createElement('strong');
    title.textContent = '内核需要更新';
    const versions = document.createElement('div');
    versions.textContent = '面板版本 ' + release.panelVersion + ' · 内核版本 ' + (release.coreVersion || '未标版本（旧内核）');
    notice.append(title, versions);
    if (release.needsUpdate) {
      const hint = document.createElement('p');
      hint.textContent = '当前内核与面板版本不一致。请上传配套内核，保留原来的 u 和 C/c 绑定，然后刷新此页。';
      notice.append(hint);
    }
    const details = document.createElement('details');
    details.open = release.needsUpdate;
    const summary = document.createElement('summary');
    summary.textContent = '本次更新了什么';
    const changes = document.createElement('ul');

    for (const text of release.changes) {
      const item = document.createElement('li'); item.textContent = text; changes.append(item);
    }
    const downloads = document.createElement('div');
    downloads.className = 'release-downloads';
    for (const [label, url] of [['下载 pages.zip', release.zipUrl], ['下载 _worker.js', release.workerUrl]]) {
      const link = document.createElement('a');
      link.textContent = label; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      downloads.append(link);
    }
    details.append(summary, changes, downloads);
    const actions = document.createElement('div');
    actions.className = 'release-actions';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.id = 'dismissCoreUpdate';
    dismiss.textContent = '知道了';
    dismiss.addEventListener('click', () => notice.remove());
    const ignore = document.createElement('button');
    ignore.type = 'button';
    ignore.id = 'ignoreCoreUpdate';
    ignore.textContent = '本次更新不再提醒';
    const storageError = document.createElement('p');
    storageError.hidden = true;
    storageError.setAttribute('role', 'status');
    ignore.addEventListener('click', () => {
      try {
        localStorage.setItem(ignoredUpdateKey, release.panelVersion);
        notice.remove();
      } catch {
        storageError.textContent = '浏览器未能保存，请用“知道了”关闭提示。';
        storageError.hidden = false;
      }
    });
    actions.append(dismiss, ignore);
    notice.append(details, actions, storageError);
    document.body.prepend(notice);
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
