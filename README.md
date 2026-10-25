# CFTWO-Panel

[![Node.js 22](https://img.shields.io/badge/Node.js-22-43853d)](https://nodejs.org/)

## 简介

CFTWO-Panel 是一个独立面板，提供连接管理、配置管理、优选地址和客户端订阅功能。面板可以运行在 Vercel、Docker 或自有服务器上；代理数据直接在用户的 Cloudflare Worker 与客户端之间传输，不经过面板。

在线地址：[https://cftwo-panel.vercel.app/](https://cftwo-panel.vercel.app/)

![CFTWO-Panel 个人 Worker 构建页](docs/images/cftwo-panel-builder.png)

## 个人 Worker

每个用户都可以在面板首页打开“个人 Worker”，填写自己的 UUID、个人构建码和连接设置，然后下载属于自己的 `_worker.js` 或 `Pages.zip`。UUID 和所填配置已写入文件，不需要在 Cloudflare 重复设置同名环境变量；`_worker.js` 第一行保留 `// UUID: ...`，第二行标注内核版本，方便找回和识别版本。下载后在 Cloudflare Dashboard 中创建自己的 Worker 或 Pages 项目并上传文件，兼容日期设为 `2026-01-20`。

下载文件名带构建编号，便于与记录对应；ZIP 内仍是 `_worker.js`。生成页只负责配置和下载，不再显示连接表单。下载成功后，可下载连接备份并点击“前往连接控制台”；安装包记录统一在连接控制台 `/connect` 管理，默认选中本次构建。部署回来只需选择记录、粘贴 Worker 根域名，面板会核对 UUID 并读取实际生效配置。控制台自动显示这些设置，没有绑定 KV 也可查看；在线保存仍需绑定 `C` 或 `c`。UUID 验证通过后立即进入控制台；如果旧 KV 或环境变量覆盖了安装包配置，差异提示直接显示在控制台中，不需要二次点击，也不会自动覆盖线上配置。

安装包记录默认仅在当前标签页的会话中保留，勾选“在这台设备记住”才写入浏览器长期存储；记录不会跨面板域名或设备同步。可以单独下载、导入连接备份 JSON。记录、备份和安装包都含访问凭据，填写出站代理时还包含其账号密码，请妥善保管；部署 ZIP 仍然只包含 `_worker.js`。删除安装包记录不会删除已导出的备份或首页另外记住的节点，后者可在首页分别删除。

个人构建会为不同构建码生成不同的代码命名和版本结果，同时保留原有协议、订阅格式、KV 配置和客户端兼容性。构建码、配置与下载文件不会写入面板服务器存储，构建码也不会写入浏览器的安装包记录或连接备份。生成文件保留 UUID 和内核版本注释，不包含项目说明、来源地址或其他构建注释；代码混淆用于构建差异和源码整理，不是流量加密，也不保证规避平台规则或滥用判断。

已经部署的用户可以在控制台的版本维护入口，将当前 Worker 的有效配置带入构建页。这样可以保留原 UUID，再生成更新包或另存安装包。

## 一键部署

[![部署到 Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fhanhaoops%2FCFTWO-Panel&project-name=cftwo-panel&repository-name=cftwo-panel)

点击顶部按钮后，Vercel 会创建一个私有 GitHub 仓库并部署独立面板。按钮使用小写的 `cftwo-panel` 作为默认项目名和仓库名，符合 GitHub 命名习惯。若希望每次使用不同的私有仓库名，可在 Vercel 创建页面把 **Private Repository Name** 改成类似 `cftwo-panel-7m4k` 的随机小写名称。

部署时选择 **Other**（旧界面叫 Framework），根目录保持仓库根目录，不需要填写额外构建命令。部署完成后打开分配的域名，进入个人 Worker 页面或连接已有 Worker。

如果 Vercel 提示需要 GitHub 授权，请先在 Vercel 的 Authentication → Sign-in Methods 连接 GitHub。订阅客户端需要访问公开的面板域名；如果被 Vercel 登录保护拦截，请在 Deployment Protection 中调整设置。

## 更新自己部署的面板

一键部署生成的私有仓库是独立副本，不会自动跟随官方更新。仓库已内置手动的 **同步上游** 按钮，不要求 Fork，也不需要额外填写 GitHub Token：

1. 打开自己的 GitHub 仓库 → **Actions** → **同步上游**。
2. 点击 **Run workflow**，选择仓库默认分支（通常是 `main`），勾选更新确认，再运行。
3. 等待结果变绿。工作流从 `hanhaoops/CFTWO-Panel` 的 `main` 取得代码，先安装依赖、运行测试并验证部署包，全部通过才提交到自己的默认分支；没有变化时不会创建重复提交。
4. 到 Vercel 查看部署结果。请确认项目的 Git 关联和 Production Branch 指向自己的仓库及该分支。若未自动部署，从分支的最新提交创建部署；对旧 `Initial commit` 点 Redeploy 不会取得新代码。

同步会替换面板代码，包括自己对这些文件的修改；被删除的上游文件也会同步删除。原提交历史保留，不会强制推送，旧代码可以从历史找回。`.env*`、`.github/` 和 `.vercel/` 不参与替换；Vercel 项目中的域名、环境变量及 Cloudflare Worker 的 KV 配置不受影响。GitHub 分支保护或组织策略可能阻止写入，此时工作流会报错，不会绕过保护。

提交使用点击运行的 GitHub 用户身份。Vercel Hobby 用户应由已关联 Vercel 的项目所有者运行；若部署被拒绝，请检查 Vercel 的 Git 账号关联和提交者权限。此工作流使用内置 `GITHUB_TOKEN`，不会连带触发仓库中其它基于 `push` 的 GitHub Actions；Vercel 的 Git 集成部署按其项目设置处理。

**自己的仓库没有这个按钮时**，先在副本的默认分支新建 `.github/workflows/sync-upstream.yml`，完整复制[官方工作流文件](https://github.com/hanhaoops/CFTWO-Panel/blob/main/.github/workflows/sync-upstream.yml)并提交，即可按上述步骤更新。已经创建的旧副本需要首次添加；一键部署若未复制 `.github/workflows/`，也按此步骤处理。若 GitHub 提示 Actions 未启用，先启用；若组织策略限制 `GITHUB_TOKEN` 写入，需要仓库管理员按策略处理。工作流文件自身及其它 Actions 不会被同步覆盖，后续调整工作流时需要重新复制该文件。

同步更新的是面板和它内置的生成内核；用户已经部署的个人 Worker 仍需重新生成、上传安装包才会升级，KV 只保存配置。

## 固定一个面板只管理指定 Worker

在 Vercel 项目的 Settings → Environment Variables 中设置小写变量 `w`，填 Worker 的 HTTPS 根地址，例如 `https://your-worker.example.com`，然后重新部署。留空时是公共面板，可以连接任意兼容 Worker；设置后只接受这个 Worker。

`w` 只限制面板接入对象，不代替 UUID 验证，也不会隐藏 Worker 的网络路径。不要在值中加入 UUID、路径、查询参数或账号密码。

## 连接与订阅

首页连接已有 Worker 时填写域名和 UUID 或自定义路径。常用入口如下：

```text
控制台：https://面板域名/你的UUID
订阅：  https://面板域名/你的UUID/sub
Clash： https://面板域名/你的UUID/sub?target=clash
```

如果 Worker 的 `d` 是 `/Admin/Panel`，也可以使用该路径进入。大小写必须一致。支持 base64、v2ray、clash、stash、singbox、surge、loon 和 quanx 格式；开启家宽链式后可使用 `target=vg`。

## 配置与 Free CPU 保护

在线保存配置时，在 Cloudflare Worker 中绑定 KV，变量名称使用 `C` 或 `c`。没有 KV 时仍可以读取环境变量并生成订阅，但面板不能保存修改。

配套内核兼容日期为 `2026-01-20`。配置管理中的 Free CPU 保护默认关闭；开启后按单连接的数据量和数据块预算提前断开，客户端需要重连，下载和视频可能中断。这是资源保护估算，不能保证所有免费账号都不会超限。

## 内核版本与更新

生成页、下载结果、连接记录、文件第二行注释和更新判断，都从实际打包的 `src/worker-core.js` 读取内核版本，与 cfnew 精简内核中的版本号一致，不另编个人 Worker 版本。构建编号只用来区分安装包。

控制台当前内核比平台内置版本旧时，突出显示“有可更新的 Worker 内核”，用当前有效配置与原 UUID 生成更新包。相同版本时只保留折叠的版本维护入口；运行内核更高时提示先更新平台并禁止降级重建；没有版本号时明确显示无法判断，不把它当成已确认有更新。

KV 保存配置，不能更新运行代码。绑定 KV 后日常改设置直接保存即可；升级内核仍需生成并重新上传安装包，保留原 UUID 和 KV 绑定。

维护生成平台时，先取得并审阅新的 cfnew 精简内核，再同步：

```bash
npm run sync:core -- /绝对路径/_worker.js
npm test
```

同步命令验证版本标记和模块格式，然后更新打包内核；页面和安装包的版本号随内核自动读取。发布面板后，用户才会看到新的可生成版本。平台不在用户请求期间自动下载、替换或执行上游新代码。

## 地区偏好与实际出口

控制台的 `wk` 是**回退地区偏好**。美国 `US`、韩国 `KR` 等选项可以保存，并在 VLESS / Trojan WebSocket 或 VLESS XHTTP 需要地区回退时选择对应候选域名；它不会固定 Worker 的运行地区，也不会强制所有目标都从所选国家出站。

- 直连成功时不使用地区回退，所以选择美国后，实际出口仍可能被目标网站识别为新加坡。
- 手填 ProxyIP `p` 优先于地区候选；关闭地区匹配 `rm=no` 后按内置候选顺序选择，`wk` 不参与选择。
- 有效的出站代理 `s` 及 `qj` 决定是否通过代理、失败后是否回退。WebSocket 节点还可用 path 内的 `p`、`wk`、`rm`、`s` 覆盖该连接的配置。
- 保存后请重新建立客户端连接；已有连接和 KV 跨地区缓存可能暂时沿用旧值。

系统状态只展示当前有效配置，不进行出口 IP 或第三方回退域名的可用性实测。候选名称、客户端旗帜和地区标签都不能作为实际出口国家的验证。若需要固定国家，应配置并实测该地区的出站代理；仅选择 `wk` 无法保证。

## 自有服务器与 Docker

Node.js 22：

```bash
git clone https://github.com/hanhaoops/CFTWO-Panel.git
cd CFTWO-Panel
npm ci
npm start
```

默认监听 `127.0.0.1:3100`，可以使用 Nginx 或 Caddy 反代并启用 HTTPS。固定 Worker 时设置 `w=https://your-worker.example.com`。

Docker：

```bash
docker compose up -d --build
```

Docker、Node、Vercel 使用同一套面板代码和个人 Worker 构建功能。

## 开发与验证

```bash
npm ci
npm test
npm run build:vercel -- /一个空目录
```

测试使用内存 KV 与本地隔离 Worker，不访问真实节点。`CFNEW_ALLOW_PRIVATE=yes` 仅供隔离测试，线上不要设置。

## 来源与许可

CFTWO-Panel 基于 CFnew 及其相关开源项目进行二次开发，来源与第三方许可见 [NOTICE.md](./NOTICE.md)。本仓库采用自定义的 [CFnew 源码使用与署名许可](./LICENSE)，允许合法修改和二次开发，但不得将改写结果冒充为无关的原创项目。

本项目供学习与网络技术研究，请遵守当地法律及所用平台的服务条款。
