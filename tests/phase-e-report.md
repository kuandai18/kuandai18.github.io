# Phase E 测试报告：链接 / SEO / 结构校验

- **执行日期**：2026-10-19
- **执行方式**：`node tests/run-all.js`（Node.js v24，原生实现，零依赖）
- **被测范围**：7 个内容页（index.html + 6 子站）+ 404.html（附加页）+ data.js + sitemap.xml + robots.txt + llms.txt
- **结果汇总**：3 个套件 / **42 项用例 —— 37 PASS / 5 FAIL**

| 套件 | 文件 | 用例数 | PASS | FAIL |
| --- | --- | --- | --- | --- |
| 链接完整性 | tests/link-check.test.js | 14 | 13 | 1 |
| SEO 校验 | tests/seo-check.test.js | 18 | 15 | 3 |
| 结构校验 | tests/structure-check.test.js | 10 | 9 | 1 |

> 5 项 FAIL 均为**被测页面缺陷**（测试脚本本身运行正常，未误报）；测试过程未修改任何页面代码。

---

## 一、测试脚本清单

| 文件 | 说明 |
| --- | --- |
| `tests/lib.js` | 公共工具库：站点常量、文件/路径解析、HTML 轻量解析（锚点/meta/canonical/JSON-LD/文本抽取）、emoji 码点扫描、data.js 加载、极简测试运行器 |
| `tests/link-check.test.js` | 互链矩阵（主站→6 子站、子站→主站+5 兄弟站）、外部友链三件套（3 外链 × target=_blank + rel=noopener）、全站站外链接行为、相对路径有效性、锚点指向、根路径引用禁用、静态资源存在、办理 CTA 与 data.js URL 逐字符一致（主站 6 / 每子站 ≥2）、页脚锚文本与渠道名逐字一致、404 导航 |
| `tests/seo-check.test.js` | title/description 非空·唯一·限长、13 项 head 字段齐备、canonical/og:url 契约、og:type/locale、twitter:card、title 与 description 三处一致、sitemap 结构与 canonical 双向对应、robots.txt 合法、llms.txt 完整、JSON-LD 可解析、@type 覆盖（主站 WebSite+ItemList / 子站 Service+BreadcrumbList+FAQPage）、Service 无 offers/aggregateRating（C-008）、主站 ItemList 与 data.js 一致、404 noindex |
| `tests/structure-check.test.js` | 语义骨架（header/nav/main/footer，main 唯一）、h1 恰 1 个、标题层级无跳级、文本无 emoji 码点、每页 ≥1 个 SVG、lang/charset/viewport、skip-link→#main、data.js 可解析且 6 条字段齐全、子站含自身渠道名原文 |
| `tests/run-all.js` | 统一入口：顺序执行三套件，汇总 PASS/FAIL，退出码 0/1（可接 CI） |

单套件可独立执行：`node tests/link-check.test.js` 等，均支持独立退出码。

---

## 二、发现的问题清单（按文件分组，均为页面缺陷）

### dandan/index.html

| # | 严重度 | 行号 | 问题 | 修复建议 |
| --- | --- | --- | --- | --- |
| 1 | **严重** | L46、L51 | JSON-LD（块起始于 L20）中 FAQPage 两个 `acceptedAnswer` 文本里，「宽带」两侧是**未转义的 ASCII 双引号 U+0022**（`点击"宽带"`、`切换到"宽带"`），导致整块 JSON-LD `JSON.parse` 失败（position 951）。爬虫将丢弃全部结构化数据，Service / BreadcrumbList / FAQPage 三个节点一起失效，违反 FR-022 | 将 L46/L51 JSON 字符串内引号转义为 `\"宽带\"`；或与页面可见 FAQ（L484/L488）**同步**改用中文引号「“宽带”」。注意 spec 要求 JSON-LD FAQ 文案与可见 FAQ 逐字一致，两处需同步修改 |
| 2 | 中 | L12（og:description）、L18（twitter:description） | OG/Twitter 描述与 meta description 不一致（缺「资费以官方页面为准」尾句），违反 design.md §2.2.3「og/twitter description 同 description」 | 将 L12/L18 的 content 替换为 L11 meta description 原文 |

### lingqu/index.html

| # | 严重度 | 行号 | 问题 | 修复建议 |
| --- | --- | --- | --- | --- |
| 3 | **高** | 全页（页脚 L444-L468） | 全页无 `<nav>` 语义标签（页脚为 `div.link-groups > section[aria-label]` 结构），是 7 个内容页中唯一缺 nav 的页面，违反 FR-020 与 design.md §1.3.10.6（footer > nav[aria-label="友情链接"]） | 将 L444 `<div class="link-groups">` 改为 `<nav class="link-groups" aria-label="友情链接">`，L468 对应 `</div>` 改 `</nav>`（CSS 类选择器不受标签影响） |
| 4 | 中 | L450 | 页脚友链锚文本「R172 宽带」与 data.js 渠道名「172宽带」不一致（多空格 + 大小写），违反 design.md §4.2.1 逐字一致 | 锚文本改为「172宽带」 |
| 5 | 中 | L451 | 页脚友链锚文本「鑫耀宽带」与 data.js 渠道名「好卡新耀宽带」不一致（使用简称） | 锚文本改为「好卡新耀宽带」 |
| 6 | 中 | L12（og:description）、L18（twitter:description） | OG/Twitter 描述与 meta description 不一致（缺「覆盖与资费以官方页面为准」尾句） | 将 L12/L18 的 content 替换为 meta description 原文 |

### kaka/index.html

| # | 严重度 | 行号 | 问题 | 修复建议 |
| --- | --- | --- | --- | --- |
| 7 | 中 | L12（og:description）、L18（twitter:description） | OG/Twitter 描述与 meta description 不一致（缺「一页讲透」「资费以官方页面为准」语句） | 将 L12/L18 的 content 替换为 meta description 原文 |

---

## 三、观察项（不计入 FAIL，供团队决策）

1. **description 与规格值表偏差**：kaka / dandan / lingqu 三页的 meta description 整体偏离 design.md §1.3.10.1 规格值表（做了主题化改写，如 lingqu 的「渠系四景 / 水到渠成」），而主站 / xingka / r172 / xinyao 四页与规格表逐字一致。design.md 注明「值为规格值，Phase C 直接采用」——若严格按规格执行需回改文案；若团队认可主题化改写，建议同步更新 design.md 规格表，避免规格与实现漂移。
2. **404.html 范围说明**：404 页不在 spec §8.3 交付清单内（tasks.md §0.3.1），本次作为附加页参与基础校验（noindex、返回首页、6 子站导航、基础语义结构），全部通过。

---

## 四、全部通过的验收点（摘要）

互链矩阵完整（主站 6 子站链接、每子站主站+5 兄弟站）；3 个外部友链在 7 页齐备且均 `target="_blank" rel="noopener"`；全部站外链接统一新标签 + noopener；全部内部链接相对路径有效、无根路径引用（file:// 直开可用）、锚点指向存在；静态资源引用零 404；办理 CTA 与 data.js URL 逐字符一致（主站 6 条 / 每子站 ≥2 条）；主站卡片 H3 与 data.js 渠道名一致；title/description 全站唯一且限长；13 项 SEO 字段齐备、取值契约正确；sitemap/robots/llms.txt 内容合法且与页面 canonical 一一对应；JSON-LD 除 dandan 外均可解析且类型覆盖达标、无价格字段；语义骨架 / h1 唯一 / 无跳级 / 无 emoji / SVG 齐备 / skip-link / data.js 六条数据契约全部通过。
