'use strict';

/**
 * tests/seo-check.test.js —— SEO 元信息与可发现性工件校验
 *
 * 覆盖（依据 design.md 2.2.3 / spec.md FR-021/022、NFR-006）：
 *   - <title> 非空、全站唯一；meta description 非空、不超长（≤120 汉字）、全站唯一
 *   - 13 项 head 字段齐备（title/description/keywords/canonical/og×6/twitter×3）
 *   - 取值契约：canonical 与 og:url 指向页面部署地址、og:type=website、
 *     og:locale=zh_CN、twitter:card=summary、title 与 description 的 OG/Twitter 三处一致
 *   - sitemap.xml：XML 声明、urlset、7 个 URL 齐全且与各页 canonical 一一对应、
 *     每条含 loc/lastmod/changefreq/priority、日期格式合法
 *   - robots.txt：User-agent: * / Allow: / / Sitemap 指向本站 sitemap、无全站 Disallow
 *   - llms.txt：7 个页面 URL 与 3 个外部友链齐全
 *   - JSON-LD：可解析、@context 正确、类型覆盖达标（主站 WebSite+ItemList；
 *     子站 Service+BreadcrumbList+FAQPage）、Service 无 offers/aggregateRating（C-008）、
 *     主站 ItemList 与 data.js 渠道一致（名称/URL/顺序）
 *   - 404.html（附加页）声明 noindex
 *
 * 可独立执行：node tests/seo-check.test.js
 */

const lib = require('./lib');
const {
  CONTENT_PAGES, ALL_PAGES, SUBSITES, SITE, EXTERNAL_FRIENDS,
  read, getTitle, getMeta, getCanonical, extractJsonLd, findNodesByType,
  decodeEntities, loadData, createSuite
} = lib;

/** 统计汉字数量（NFR-006：description ≤ 120 汉字） */
function countHan(s) { return (String(s).match(/[\u4e00-\u9fff]/g) || []).length; }

function build(suite) {
  const htmlByPage = new Map(ALL_PAGES.map((p) => [p.rel, read(p.rel)]));
  const data = loadData();

  suite.test('每页 <title> 非空（8 页，含 404）', (t) => {
    for (const p of ALL_PAGES) {
      const title = getTitle(htmlByPage.get(p.rel));
      t.ok(typeof title === 'string' && title.trim().length >= 4, `${p.rel} title 缺失或过短`);
    }
  });

  suite.test('全部页面 title 互不相同（NFR-006 无重复）', (t) => {
    const seen = new Map();
    for (const p of ALL_PAGES) {
      const title = getTitle(htmlByPage.get(p.rel));
      if (title == null) continue;
      if (seen.has(title)) t.ok(false, `title 重复「${title}」：${seen.get(title)} 与 ${p.rel}`);
      else seen.set(title, p.rel);
    }
    t.equal(seen.size, ALL_PAGES.length, '不同 title 的数量');
  });

  suite.test('每页 meta description 非空且不超长（≤120 汉字，NFR-006）', (t) => {
    for (const p of ALL_PAGES) {
      const d = getMeta(htmlByPage.get(p.rel), 'description');
      t.ok(typeof d === 'string' && d.trim().length >= 10, `${p.rel} description 缺失或过短`);
      if (typeof d === 'string' && d.trim()) {
        const han = countHan(d);
        t.ok(han <= 120, `${p.rel} description 含 ${han} 个汉字，超过 120 上限`);
      }
    }
  });

  suite.test('meta description 全站无重复（NFR-006）', (t) => {
    const seen = new Map();
    for (const p of ALL_PAGES) {
      const d = (getMeta(htmlByPage.get(p.rel), 'description') || '').trim();
      if (!d) continue;
      if (seen.has(d)) t.ok(false, `description 重复：${seen.get(d)} 与 ${p.rel}`);
      else seen.set(d, p.rel);
    }
  });

  suite.test('7 个内容页 13 项 SEO 字段齐备且非空（FR-021 / design.md 2.2.3）', (t) => {
    const metaKeys = [
      'keywords', 'description',
      'og:title', 'og:description', 'og:type', 'og:url', 'og:locale', 'og:site_name',
      'twitter:card', 'twitter:title', 'twitter:description'
    ];
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      t.ok((getTitle(html) || '').trim(), `${p.rel} 缺 <title>`);
      t.ok((getCanonical(html) || '').trim(), `${p.rel} 缺 canonical`);
      for (const k of metaKeys) {
        t.ok((getMeta(html, k) || '').trim(), `${p.rel} 缺 ${k}`);
      }
    }
  });

  suite.test('canonical 与 og:url 均指向页面部署地址（FR-021）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      t.equal(getCanonical(html), p.url, `${p.rel} canonical`);
      t.equal(getMeta(html, 'og:url'), p.url, `${p.rel} og:url`);
    }
  });

  suite.test('og:type=website 且 og:locale=zh_CN（design.md 2.2.3）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      t.equal(getMeta(html, 'og:type'), 'website', `${p.rel} og:type`);
      t.equal(getMeta(html, 'og:locale'), 'zh_CN', `${p.rel} og:locale`);
    }
  });

  suite.test('twitter:card=summary（design.md 2.2.3）', (t) => {
    for (const p of CONTENT_PAGES) {
      const card = getMeta(htmlByPage.get(p.rel), 'twitter:card');
      t.equal(card, 'summary', `${p.rel} twitter:card`);
    }
  });

  suite.test('title / og:title / twitter:title 三处一致', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      const title = getTitle(html);
      t.equal(getMeta(html, 'og:title'), title, `${p.rel} og:title 与 <title> 不一致`);
      t.equal(getMeta(html, 'twitter:title'), title, `${p.rel} twitter:title 与 <title> 不一致`);
    }
  });

  suite.test('description / og:description / twitter:description 三处一致', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      const d = getMeta(html, 'description');
      t.equal(getMeta(html, 'og:description'), d, `${p.rel} og:description 与 description 不一致`);
      t.equal(getMeta(html, 'twitter:description'), d, `${p.rel} twitter:description 与 description 不一致`);
    }
  });

  suite.test('sitemap.xml 结构合法：XML 声明、urlset、7 个 URL、loc/lastmod/changefreq/priority 齐备、日期格式正确', (t) => {
    const xml = read('sitemap.xml');
    t.ok(/<\?xml[^>]*encoding="UTF-8"/i.test(xml), 'sitemap.xml 缺 XML 声明或非 UTF-8 编码');
    t.ok(/<urlset[\s>]/i.test(xml), 'sitemap.xml 缺 <urlset> 根元素');
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/gi)].map((m) => m[1].trim());
    const expected = [`${SITE}/`, ...SUBSITES.map((s) => `${SITE}/${s}/`)];
    t.equal(locs.length, expected.length, 'sitemap <loc> 数量');
    for (const u of expected) t.ok(locs.includes(u), `sitemap 缺少 ${u}`);
    for (const l of locs) t.ok(expected.includes(l), `sitemap 含非预期 URL ${l}`);
    const urls = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
    t.equal(urls.length, 7, 'sitemap <url> 条目数');
    for (const u of urls) {
      t.ok(/<loc>/.test(u), '存在缺 <loc> 的条目');
      const lm = (u.match(/<lastmod>([^<]*)<\/lastmod>/i) || [])[1];
      t.ok(/^\d{4}-\d{2}-\d{2}$/.test((lm || '').trim()), `lastmod 日期格式非法：${lm}`);
      t.ok(/<changefreq>/.test(u) && /<priority>/.test(u), '存在缺 changefreq/priority 的条目');
    }
  });

  suite.test('sitemap 与各页 canonical 一一对应（双向）', (t) => {
    const locs = new Set(
      [...read('sitemap.xml').matchAll(/<loc>([^<]*)<\/loc>/gi)].map((m) => m[1].trim())
    );
    for (const p of CONTENT_PAGES) {
      t.ok(locs.has(p.url), `${p.rel} 的 canonical ${p.url} 未收录进 sitemap`);
    }
    const canon = new Set(CONTENT_PAGES.map((p) => p.url));
    for (const l of locs) t.ok(canon.has(l), `sitemap 中的 ${l} 无对应页面 canonical`);
  });

  suite.test('robots.txt 合法：User-agent: * / Allow: / / Sitemap 指向本站 sitemap', (t) => {
    const txt = read('robots.txt');
    t.ok(/User-agent:\s*\*/i.test(txt), '缺 User-agent: * 规则');
    t.ok(/Allow:\s*\/(\s|$)/m.test(txt), '缺 Allow: / 规则');
    t.ok(new RegExp(`Sitemap:\\s*${SITE}/sitemap\\.xml`, 'i').test(txt), '缺 Sitemap 声明或未指向本站 sitemap.xml');
    t.ok(!/Disallow:\s*\/\s*$/im.test(txt), '存在全站 Disallow 规则');
  });

  suite.test('llms.txt 含全部 7 个页面 URL 与 3 个外部友链', (t) => {
    const txt = read('llms.txt');
    for (const p of CONTENT_PAGES) t.ok(txt.includes(p.url), `llms.txt 缺少页面 ${p.url}`);
    for (const u of EXTERNAL_FRIENDS) t.ok(txt.includes(u), `llms.txt 缺少友链 ${u}`);
  });

  suite.test('每页 JSON-LD 可解析且 @context 为 https://schema.org（FR-022）', (t) => {
    for (const p of CONTENT_PAGES) {
      const blocks = extractJsonLd(htmlByPage.get(p.rel));
      t.ok(blocks.length >= 1, `${p.rel} 缺 JSON-LD 结构化数据`);
      for (const b of blocks) {
        try {
          const obj = JSON.parse(b);
          t.equal(obj['@context'], 'https://schema.org', `${p.rel} JSON-LD @context`);
        } catch (e) {
          t.ok(false, `${p.rel} JSON-LD 解析失败：${e.message}`);
        }
      }
    }
  });

  suite.test('JSON-LD 类型覆盖达标（主站 WebSite+ItemList；子站 Service+BreadcrumbList+FAQPage；C-008）', (t) => {
    for (const p of CONTENT_PAGES) {
      const nodes = [];
      for (const b of extractJsonLd(htmlByPage.get(p.rel))) {
        try { nodes.push(JSON.parse(b)); } catch { /* 解析失败已在上一用例报告，避免重复计数 */ }
      }
      const need = p.slug === '' ? ['WebSite', 'ItemList'] : ['Service', 'BreadcrumbList', 'FAQPage'];
      for (const ty of need) {
        const found = nodes.some((n) => findNodesByType(n, ty).length > 0);
        t.ok(found, `${p.rel} JSON-LD 缺 @type="${ty}"`);
      }
      for (const n of nodes) {
        for (const s of findNodesByType(n, 'Service')) {
          t.ok(!('offers' in s), `${p.rel} Service 节点含 offers（C-008 禁止价格字段）`);
          t.ok(!('aggregateRating' in s), `${p.rel} Service 节点含 aggregateRating（C-008 禁止）`);
        }
      }
    }
  });

  suite.test('主站 JSON-LD ItemList 与 data.js 渠道一致（名称/URL/顺序）', (t) => {
    const lists = [];
    for (const b of extractJsonLd(htmlByPage.get('index.html'))) {
      try {
        lists.push(...findNodesByType(JSON.parse(b), 'ItemList'));
      } catch { /* 解析失败已在前置用例报告 */ }
    }
    t.ok(lists.length >= 1, '主站 JSON-LD 缺 ItemList');
    if (lists.length === 0) return;
    const items = (lists[0].itemListElement || []).filter((x) => x && x['@type'] === 'ListItem');
    t.equal(items.length, 6, 'ItemList 渠道条目数');
    data.forEach((d, i) => {
      const item = items.find((x) => x.position === i + 1);
      t.ok(item != null, `ItemList 缺 position=${i + 1}（${d.name}）`);
      if (item) {
        t.equal(item.name, d.name, `ItemList position=${i + 1} 名称与 data.js 不一致`);
        t.equal(item.url, `${SITE}/${d.slug}/`, `ItemList position=${i + 1} url`);
      }
    });
  });

  suite.test('子站 FAQPage JSON-LD 与页面可见 FAQ 逐字一致（条数/问句/答案）', (t) => {
    /* 页面 FAQ DOM 因站而异：问句在 <summary>（内含 h3 或装饰 span），答案在
       .faq-body 或 .faq-answer。先剥离装饰性 span（faq-q/faq-toggle/faq-mark，
       均为 aria-hidden 编号或加号），再剥全部标签取纯文本。 */
    const strip = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    for (const p of CONTENT_PAGES) {
      if (p.slug === '') continue; // 主站无 FAQ 板块
      const html = htmlByPage.get(p.rel);
      const pageFaq = [];
      const detailRe = /<details\b[^>]*class="[^"]*faq-item[^"]*"[^>]*>([\s\S]*?)<\/details>/gi;
      let m;
      while ((m = detailRe.exec(html)) !== null) {
        const block = m[1].replace(
          /<span\b[^>]*class="[^"]*(?:faq-q|faq-toggle|faq-mark)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
          ' '
        );
        const sm = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        if (!sm) continue;
        pageFaq.push({
          q: strip(sm[1]),
          a: strip(block.slice(sm.index + sm[0].length))
        });
      }
      const jsonFaq = [];
      for (const b of extractJsonLd(html)) {
        let obj = null;
        try { obj = JSON.parse(b); } catch { continue; /* 解析失败已在前置用例报告 */ }
        for (const f of findNodesByType(obj, 'FAQPage')) {
          for (const item of (f.mainEntity || [])) {
            jsonFaq.push({
              name: item.name,
              text: item.acceptedAnswer && item.acceptedAnswer.text
            });
          }
        }
      }
      t.ok(pageFaq.length >= 3, `${p.rel} 页面可见 FAQ 少于 3 条`);
      t.equal(pageFaq.length, jsonFaq.length, `${p.rel} 页面 FAQ 条数与 JSON-LD mainEntity 不一致`);
      const n = Math.min(pageFaq.length, jsonFaq.length);
      for (let i = 0; i < n; i++) {
        t.equal(pageFaq[i].q, jsonFaq[i].name, `${p.rel} 第 ${i + 1} 问问句与 JSON-LD 不一致`);
        t.equal(pageFaq[i].a, jsonFaq[i].text, `${p.rel} 第 ${i + 1} 问答案与 JSON-LD 不一致`);
      }
    }
  });

  suite.test('子站 BreadcrumbList 每个 ListItem 均携带 item URL（结构化数据完整性）', (t) => {
    for (const p of CONTENT_PAGES) {
      if (p.slug === '') continue;
      const crumbs = [];
      for (const b of extractJsonLd(htmlByPage.get(p.rel))) {
        let obj = null;
        try { obj = JSON.parse(b); } catch { continue; }
        crumbs.push(...findNodesByType(obj, 'BreadcrumbList'));
      }
      t.ok(crumbs.length >= 1, `${p.rel} JSON-LD 缺 BreadcrumbList`);
      for (const c of crumbs) {
        const items = (c.itemListElement || []).filter((x) => x && x['@type'] === 'ListItem');
        t.ok(items.length >= 2, `${p.rel} BreadcrumbList ListItem 少于 2 条`);
        for (const it of items) {
          t.ok(
            typeof it.item === 'string' && /^https:\/\//.test(it.item),
            `${p.rel} BreadcrumbList position=${it.position} 的 ListItem 缺 item URL（Google 要求末级条目必须可解析）`
          );
        }
      }
    }
  });

  suite.test('404.html（附加页）声明 noindex，避免错误页被收录', (t) => {
    const robots = getMeta(htmlByPage.get('404.html'), 'robots');
    t.ok((robots || '').toLowerCase().includes('noindex'), '404.html 缺 meta robots="noindex"');
  });
}

function run(print = true) {
  const suite = createSuite('SEO 校验 seo-check');
  build(suite);
  return suite.done(print);
}

module.exports = { name: 'seo-check', run };

if (require.main === module) {
  process.exit(run(true).failed === 0 ? 0 : 1);
}
