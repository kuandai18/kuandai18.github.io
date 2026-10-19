# 宽带办理导航（kuandai18.github.io）

宽带办理聚合导航站群：主站一站式聚合展示 6 个宽带办理渠道，每个渠道各配一个独立的品牌化落地子站，站群之间通过友情链接互跳，为访客提供渠道比较、办理指引与直达官方办理页的入口。

- 线上地址：<https://kuandai18.github.io/>
- 技术形态：纯静态站点（HTML5 / CSS3 / 原生 JS），零构建、零框架、零远程依赖，push 即部署
- 渠道数据：[`data.js`](./data.js) 为唯一事实来源（6 个渠道的名称与官方办理地址）

## 站点结构

仓库根目录即站点根目录：

```text
kuandai18.github.io/
├── index.html              # 主站：聚合导航（6 渠道入口、站点说明、友链）
├── data.js                 # 渠道数据（唯一事实来源，6 个渠道）
├── robots.txt              # 爬虫协议（全站放行 + Sitemap 声明）
├── sitemap.xml             # 站点地图（主站 + 6 子站，共 7 个页面）
├── llms.txt                # 面向 AI 爬虫 / 大模型的站点说明
├── 404.html                # 自定义 404 页面（站内导航兜底）
├── favicon.svg             # 站点图标（信号主题）
├── README.md               # 本文件
├── assets/                 # 主站专属资源（main.css / main.js / favicon.svg）
├── xingka/                 # 星卡宽带子站（深空星夜 · 暗色科技风）
├── r172/                   # 172宽带子站（新拟态 · 清新数字风）
├── xinyao/                 # 好卡新耀宽带子站（渐变流体 · 活力风）
├── kaka/                   # 咔咔通信宽带子站（杂志编辑风 · 黄黑）
├── dandan/                 # 蛋蛋宽带子站（玻璃拟态 · 奶油风）
└── lingqu/                 # 灵渠宽带子站（水墨中国风）
```

| 站点 | 线上路径 | 定位 |
| --- | --- | --- |
| 主站 | https://kuandai18.github.io/ | 6 渠道一站式比较与直达办理入口 |
| 星卡宽带 | https://kuandai18.github.io/xingka/ | 星卡宽带办理指引子站 |
| 172宽带 | https://kuandai18.github.io/r172/ | 172宽带办理指引子站 |
| 好卡新耀宽带 | https://kuandai18.github.io/xinyao/ | 好卡新耀宽带办理指引子站 |
| 咔咔通信宽带 | https://kuandai18.github.io/kaka/ | 咔咔通信宽带办理指引子站 |
| 蛋蛋宽带 | https://kuandai18.github.io/dandan/ | 蛋蛋宽带办理指引子站 |
| 灵渠宽带 | https://kuandai18.github.io/lingqu/ | 灵渠宽带办理指引子站 |

每个子站目录内含 `index.html` / `style.css` / `site.js` / `favicon.svg` 四件套，站点资源自包含、互不依赖。

## 本地预览

三种方式任选，无需任何安装或构建步骤：

```bash
# 方式一（零依赖）：直接用浏览器打开
#    在资源管理器中双击 index.html（或任一子站目录内的 index.html）

# 方式二（Python）：在仓库根目录执行
python -m http.server 8000
#    然后访问 http://localhost:8000/

# 方式三（Node.js）：在仓库根目录执行
npx serve .
#    按命令行提示的地址访问
```

## 部署

本仓库即 GitHub Pages 用户站点（`kuandai18.github.io`）：

1. 将变更 push 到 `main` 分支；
2. GitHub Pages 自动发布，稍候片刻即可通过 <https://kuandai18.github.io/> 及各子目录 URL 访问（如 `https://kuandai18.github.io/xingka/`）。

无任何构建配置需要维护。

## 渠道数据变更

渠道清单（新增 / 修改 / 下架）不允许只改单点，需按以下顺序一次性同步更新，以保持全站一致：

`data.js`（唯一事实来源）→ 主站渠道卡片 → 对应子站页面 → 全部页面友情链接 → `sitemap.xml` → `llms.txt`

各页面自带运行期一致性自检（`site.js` 将页面硬编码的渠道名称与办理 URL 与 `data.js` 比对，不一致时在控制台输出警告），变更完成后以各页控制台零警告为完成标志。

## SEO / AI 基础设施

- `robots.txt`：全站对搜索引擎与 AI 爬虫放行，并声明 Sitemap 地址；
- `sitemap.xml`：覆盖主站与 6 个子站共 7 个页面（干净绝对 URL，不带 `index.html`）；
- `llms.txt`：面向大模型 / AI 助手的站点结构说明（页面清单、友链与口径声明）；
- `404.html`：深色科技风 404 兜底页，提供返回首页与 6 个子站的站内导航；
- `favicon.svg`：信号主题站点图标，自包含渐变底、适配深浅背景；
- 各页面 head 内含 title / description / Open Graph / canonical 与 JSON-LD 结构化数据。
