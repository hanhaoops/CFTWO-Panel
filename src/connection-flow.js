(() => {
  const fields = window.CFNEW_SETTINGS;
  const keys = new Set(fields.map(field => field.key));
  const storageKey = 'cftwo-pending-builds';
  const memory = new Map();
  // 将浏览器可能抛出的存储访问异常留在读写操作内部处理。
  const localStore = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) };
  const tabStore = { getItem: key => window.sessionStorage.getItem(key), setItem: (key, value) => window.sessionStorage.setItem(key, value), removeItem: key => window.sessionStorage.removeItem(key) };
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const read = storage => {
    try {
      const records = JSON.parse(storage.getItem(storageKey) || '[]');
      return Array.isArray(records) ? records.flatMap(record => { try { return [validate(record)]; } catch { return []; } }).slice(0, 20) : [];
    } catch { return []; }
  };
  function validate(input) {
    if (!input || !uuidPattern.test(input.uuid) || !/^[a-f0-9]{16}$/.test(input.buildId) || !Number.isFinite(Date.parse(input.createdAt))) throw new Error('连接备份格式无效');
    if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) throw new Error('连接备份缺少配置');
    const settings = {};
    for (const [key, value] of Object.entries(input.settings)) {
      if (!keys.has(key) || typeof value !== 'string' || value.length > (key === 'yx' ? 32768 : 2048)) throw new Error('连接备份包含无效配置');
      settings[key] = value;
    }
    return { uuid: input.uuid, buildId: input.buildId, createdAt: input.createdAt, settings, host: typeof input.host === 'string' ? input.host.slice(0, 2048) : '' };
  }
  function records() {
    const merged = new Map();
    for (const [storage, remember] of [[localStore, true], [tabStore, false]]) {
      for (const record of read(storage)) merged.set(record.buildId, { ...record, remember });
    }
    for (const [id, record] of memory) merged.set(id, record);
    return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  }
  function save(input, remember = false) {
    const record = validate(input);
    memory.set(record.buildId, { ...record, remember });
    const target = remember ? localStore : tabStore;
    const other = remember ? tabStore : localStore;
    target.setItem(storageKey, JSON.stringify([record, ...read(target).filter(item => item.buildId !== record.buildId)].slice(0, 20)));
    // 临时记录不触碰不相关的长期记录；主动取消记住时才迁移这一项。
    const remaining = read(other).filter(item => item.buildId !== record.buildId);
    if (remaining.length) other.setItem(storageKey, JSON.stringify(remaining));
    else other.removeItem(storageKey);
    return record;
  }
  function remove(id) {
    for (const storage of [localStore, tabStore]) {
      const remaining = read(storage).filter(record => record.buildId !== id);
      if (remaining.length) storage.setItem(storageKey, JSON.stringify(remaining));
      else storage.removeItem(storageKey);
    }
    memory.delete(id);
  }
  function normalized(key, value) {
    const field = fields.find(field => field.key === key);
    if (value === undefined || value === null || value === '') value = field?.value || '';
    if (field?.type === 'flag') return ['yes', 'true', '1', 'on'].includes(String(value).toLowerCase()) ? 'yes' : 'no';
    if (key === 'd') return String(value).replace(/^\/+|\/+$/g, '');
    if (key === 'yx') return String(value).split(/[,\r\n]+/).map(line => line.trim()).filter(Boolean).join(',');
    if (key === 'wk') return String(value).trim().toUpperCase();
    return String(value).trim();
  }
  function differences(record, config) {
    return fields.filter(field => Object.hasOwn(record.settings, field.key) && normalized(field.key, record.settings[field.key]) !== normalized(field.key, config[field.key])).map(field => field.label);
  }
  function downloadBackup(record) {
    const blob = new Blob([JSON.stringify({ type: 'cftwo-connection', version: 1, ...validate(record) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'connection-' + record.buildId + '.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function parseBackup(text) {
    const data = JSON.parse(text);
    if (data.type !== 'cftwo-connection' || data.version !== 1) throw new Error('请选择本面板导出的连接备份');
    return validate(data);
  }
  function mount(container) {
    container.innerHTML = `<details class="card pending-card">
      <summary>部署后继续连接</summary><p>选择刚下载的安装包，部署后只需粘贴 Worker 域名。</p>
      <label>安装包记录<select data-role="records" aria-label="选择安装包记录"></select></label>
      <small data-role="identity"></small>
      <form><label>部署后的 Worker 域名<input data-role="host" required placeholder="worker.example.com" autocomplete="off" spellcheck="false"></label>
      <label class="remember"><input data-role="remember" type="checkbox">在这台设备记住此记录和连接身份</label>
      <small>默认仅当前标签页临时保留。记录和备份含 UUID 与配置，请妥善保管。</small>
      <div class="pending-actions"><button type="submit" class="button-primary" data-role="connect">验证并打开控制台</button><button type="button" data-role="backup">下载连接备份</button><button type="button" data-role="delete">删除记录</button></div></form>
      <label class="backup-import">恢复连接备份<input data-role="import" type="file" accept=".json,application/json"></label>
      <p data-role="status" role="status" aria-live="polite"></p>
    </details>`;
    const get = role => container.querySelector('[data-role="' + role + '"]');
    const select = get('records'), host = get('host'), remember = get('remember'), status = get('status'), connect = get('connect');
    let selected, busy = false;
    function render(preferred) {
      const all = records();
      container.querySelector('details').open = all.length > 0;
      select.replaceChildren();
      if (!all.length) select.add(new Option('暂无记录，可导入连接备份', ''));
      for (const record of all) select.add(new Option(new Date(record.createdAt).toLocaleString() + ' · ' + record.buildId, record.buildId));
      select.value = all.some(record => record.buildId === preferred) ? preferred : all[0]?.buildId || '';
      choose();
    }
    function choose() {
      selected = records().find(record => record.buildId === select.value);
      host.value = selected?.host || ''; remember.checked = !!selected?.remember;
      get('identity').textContent = selected ? 'UUID：' + selected.uuid : '下载成功后会在这里保留对应记录。';
      for (const role of ['connect', 'backup', 'delete']) get(role).disabled = !selected;
      host.disabled = remember.disabled = !selected;
      status.textContent = '';
    }
    select.addEventListener('change', choose);
    get('backup').addEventListener('click', () => { if (selected) downloadBackup({ ...selected, host: host.value.trim() }); });
    get('delete').addEventListener('click', () => {
      try { remove(selected.buildId); render(); status.textContent = '已删除安装包记录；已导出的备份和首页记住的节点需分别删除。'; }
      catch { status.textContent = '浏览器未能删除记录，请检查存储权限后重试。'; }
    });
    remember.addEventListener('change', () => {
      try { save({ ...selected, host: host.value.trim() }, remember.checked); selected.remember = remember.checked; status.textContent = remember.checked ? '已在这台设备记住。' : '已改为当前标签页临时保留。'; }
      catch { status.textContent = '浏览器未能保存偏好，请下载连接备份。'; }
    });
    get('import').addEventListener('change', async event => {
      try {
        const file = event.target.files[0]; if (!file) return;
        if (file.size > 100000) throw new Error('连接备份过大');
        const record = parseBackup(await file.text());
        let warning = '';
        try { save(record); } catch { warning = '浏览器无法保存记录，请保留备份文件。'; }
        render(record.buildId); status.textContent = warning || '已恢复连接身份，请填写部署域名。';
      } catch (error) { status.textContent = error.message || '连接备份读取失败'; }
      event.target.value = '';
    });
    container.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); if (!selected || busy) return;
      busy = true; connect.disabled = select.disabled = host.disabled = remember.disabled = true;
      get('delete').disabled = get('import').disabled = true;
      const record = { ...selected }, keep = remember.checked;
      status.textContent = '正在核对部署后的 UUID 和配置…';
      try {
        const value = host.value.trim();
        const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) throw new Error('只填写 Worker 根域名，不要带 UUID 或路径');
        record.host = url.origin;
        const encoded = btoa(url.origin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const response = await fetch('/worker-api/' + encoded + '/' + record.uuid + '/api/config', { cache: 'no-store' });
        const config = await response.json();
        if (!response.ok) throw new Error(config.message || '连接失败，请检查域名和部署是否完成');
        if (config.uuid !== record.uuid) throw new Error('此域名的 UUID 与所选安装包不一致，请检查部署文件或 Cloudflare 的 u/U 设置');
        const changed = differences(record, config);
        let storageWarning = false;
        try { save(record, keep); } catch { storageWarning = true; }
        if (keep) {
          try {
            const saved = JSON.parse(localStorage.getItem('cfnew-panel-nodes') || '[]');
            const nodes = Array.isArray(saved) ? saved.filter(node => node && typeof node.host === 'string' && typeof node.uuid === 'string') : [];
            localStorage.setItem('cfnew-panel-nodes', JSON.stringify([{ host: record.host, uuid: record.uuid }, ...nodes.filter(node => node.host !== record.host)].slice(0, 20)));
          } catch { storageWarning = true; }
        }
        // 只读核对，不把安装包快照自动覆盖到线上 KV。
        const target = '/panel?' + new URLSearchParams({ host: record.host, uuid: record.uuid });
        if (changed.length || storageWarning) {
          status.textContent = (changed.length ? '当前生效配置与安装包不同：' + changed.join('、') + '。可能由旧 KV 或环境变量覆盖。控制台会显示实际值，不会自动覆盖。' : '') + (storageWarning ? ' 浏览器未能保存记录，请先下载连接备份。' : '');
          const link = document.createElement('a'); link.href = target; link.className = 'button-primary'; link.textContent = '查看当前生效配置';
          status.append(document.createElement('br'), link);
        } else location.assign(target);
      } catch (error) { status.textContent = error.message || '连接未完成，请稍后重试'; }
      finally {
        busy = false; connect.disabled = select.disabled = host.disabled = remember.disabled = false;
        get('delete').disabled = get('import').disabled = false;
      }
    });
    render();
    return { refresh: render };
  }
  window.CFConnectionFlow = { records, save, remove, differences, mount, downloadBackup, parseBackup };
})();
