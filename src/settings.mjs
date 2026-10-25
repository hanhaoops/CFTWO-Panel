// 构建、配置回填和导出共用同一份字段定义。
export const settingDefinitions = [
  ['freeCpu', 'Free CPU 保护', 'no', 'freeCpu', 'flag'],
  ['wk', '回退地区偏好 (wk)', '', 'wkRegion', ['', 'HK', 'US', 'SG', 'JP', 'KR', 'DE', 'SE', 'NL', 'FI', 'GB']],
  ['ev', 'VLESS · WS', 'yes', 'ev', 'flag'],
  ['et', 'Trojan · WS', 'no', 'et', 'flag'],
  ['ex', 'VLESS · XHTTP', 'no', 'ex', 'flag'],
  ['ech', 'ECH', 'no', 'ech', 'flag'],
  ['tp', 'Trojan 自定义密码', '', 'tp', 'password'],
  ['customDNS', 'DoH DNS', 'https://223.5.5.5/dns-query', 'customDNS'],
  ['customECHDomain', 'ECH 域名', 'cloudflare-ech.com', 'customECHDomain'],
  ['alpn', 'TLS ALPN', '', 'alpn', ['', 'h3', 'h2', 'http/1.1', 'h3,h2', 'h2,http/1.1', 'h3,h2,http/1.1']],
  ['d', '自定义管理路径', '', 'customPath'],
  ['p', 'ProxyIP', '', 'customIP'],
  ['yx', '优选地址', '', 'yx', 'textarea'],
  ['yxURL', '在线优选列表 URL', '', 'yxURL'],
  ['s', '出站代理', '', 'socksConfig', 'password'],
  ['homepage', '自定义主页（内核兼容保留）', '', 'customHomepage'],
  ['scu', '订阅转换地址（兼容保留）', 'https://url.v1.mk/sub', 'scu'],
  ['ena', '加入 Worker 原生地址', 'no', 'ena', 'flag'],
  ['epd', '加入优选域名', 'yes', 'epd', 'flag'],
  ['epi', '加入优选 IP', 'yes', 'epi', 'flag'],
  ['egi', '启用在线优选来源', 'yes', 'egi', 'flag'],
  ['ae', '允许优选 API 管理（需保存到 KV）', '', 'apiEnabled', ['', 'yes']],
  ['rm', '回退地区匹配', '', 'regionMatching', ['', 'no']],
  ['qj', '出站方式', '', 'downgradeControl', ['', 'no', 'only']],
  ['dkby', '仅生成 TLS 节点', 'no', 'portControl', ['no', 'yes']],
  ['yxby', '关闭优选来源', '', 'preferredControl', ['', 'yes']],
  ['ipv4', '默认 IP 来源：IPv4', 'yes', 'ipv4Enabled', 'flag'],
  ['ipv6', '默认 IP 来源：IPv6', 'yes', 'ipv6Enabled', 'flag'],
  ['ispMobile', '默认 IP 来源：移动', 'yes', 'ispMobile', 'flag'],
  ['ispUnicom', '默认 IP 来源：联通', 'yes', 'ispUnicom', 'flag'],
  ['ispTelecom', '默认 IP 来源：电信', 'yes', 'ispTelecom', 'flag'],
  ['jk', '家宽链式订阅', 'no', 'jk', 'flag'],
].map(([key, label, value, control, type = 'text']) => ({ key, label, value, control, type, ...(key === 'wk' ? { hint: '只影响回退地址选择，不会固定出口国家或 Worker 运行地区。手填 ProxyIP 或关闭地区匹配时不参与选择。' } : {}) }));

export const settingKeys = settingDefinitions.map(field => field.key);
export const settingDefaults = Object.fromEntries(settingDefinitions.map(field => [field.key, field.value]));
export const settingFlags = settingDefinitions.filter(field => field.type === 'flag').map(field => field.key);
