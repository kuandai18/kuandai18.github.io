'use strict';

/**
 * tests/structure-check.test.js —— 页面结构与数据契约校验
 *
 * 覆盖（依据 spec.md FR-020、design.md 1.2.3 / T7 / T8 / 4.2.1）：
 *   - 语义化骨架：7 内容页 header/nav/main/footer 齐备且 <main> 唯一（FR-020）；
 *     404.html 为 spec 外附加页，仅要求 main/nav/footer 基础结构
 *   - 标题层级：每页 <h1> 恰 1 个、层级无跳级（FR-020）
 *   - 图标契约：文本节点无 emoji 码点、每页至少 1 个内联 <svg>（design.md T7/T8）
 *   - 基础声明：lang=zh-CN / charset=UTF-8 / viewport（design.md 1.2.3 骨架契约）
 *   - 无障碍入口：skip-link 指向 #main 且 <main> 带 id="main"（design.md 1.2.3）
 *   - data.js：可解析、6 条齐全、字段完整（name/url/slug/sub/intro）、
 *     slug 与子站目录一致、sub 格式正确、name/slug 无重复
 *   - 每个子站页面文本含自身渠道名原文（design.md 4.2.1 自我标识）
 *
 * 可独立执行：node tests/structure-check.test.js
 */

const lib = require('./lib');
const {
  CONTENT_PAGES, ALL_PAGES, SUBSITES,
  read, extractTags, getAnchors, getAttr, textContent, findEmoji, loadData, createSuite
} = lib;

function build(suite) {
  const htmlByPage = new Map(ALL_PAGES.map((p) => [p.rel, read(p.rel)]));

  suite.test('7 个内容页语义化骨架齐备（header/nav/main/footer，FR-020）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      for (const tag of ['header', 'nav', 'main', 'footer']) {
        t.ok(extractTags(html, tag).length >= 1, `${p.rel} 缺 <${tag}> 语义标签`);
      }
      t.equal(extractTags(html, 'main').length, 1, `${p.rel} <main> 数量应恰为 1`);
    }
  });

  suite.test('404.html（附加页）具备基础语义结构（main/nav/footer）', (t) => {
    const html = htmlByPage.get('404.html');
    for (const tag of ['main', 'nav', 'footer']) {
      t.ok(extractTags(html, tag).length >= 1, `404.html 缺 <${tag}>`);
    }
  });

  suite.test('每页恰好 1 个 <h1>（FR-020）', (t) => {
    for (const p of ALL_PAGES) {
      t.equal(extractTags(htmlByPage.get(p.rel), 'h1').length, 1, `${p.rel} <h1> 数量`);
    }
  });

  suite.test('标题层级无跳级（FR-020：h1→h2→h3 逐级递进）', (t) => {
    for (const p of ALL_PAGES) {
      const html = htmlByPage.get(p.rel);
      const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
      let prev = 0;
      levels.forEach((lv, i) => {
        if (prev !== 0 && lv > prev + 1) {
          t.ok(false, `${p.rel} 标题层级跳级：h${prev} 后直接出现 h${lv}（第 ${i + 1} 个标题）`);
        }
        prev = lv;
      });
    }
  });

  suite.test('页面文本无 emoji 码点（design.md T8：禁止 emoji 充当图标）', (t) => {
    for (const p of ALL_PAGES) {
      const emojis = findEmoji(textContent(htmlByPage.get(p.rel)));
      for (const e of emojis) {
        t.ok(false, `${p.rel} 文本含 emoji ${e.char}（${e.code}）`);
      }
    }
  });

  suite.test('每页至少 1 个 <svg>（design.md T7：图标一律内联 SVG）', (t) => {
    for (const p of ALL_PAGES) {
      t.ok(extractTags(htmlByPage.get(p.rel), 'svg').length >= 1, `${p.rel} 无 <svg>`);
    }
  });

  suite.test('每页声明 lang=zh-CN、charset=UTF-8、viewport（骨架契约）', (t) => {
    for (const p of ALL_PAGES) {
      const html = htmlByPage.get(p.rel);
      t.ok(/<html[^>]*\blang\s*=\s*["']zh-CN["']/i.test(html), `${p.rel} <html> 未声明 lang="zh-CN"`);
      t.ok(/<meta[^>]*charset\s*=\s*["']?utf-8/i.test(html), `${p.rel} 缺 UTF-8 charset 声明`);
      t.ok(/<meta[^>]*name\s*=\s*["']viewport["']/i.test(html), `${p.rel} 缺 viewport 声明`);
    }
  });

  suite.test('每页声明 favicon（<link rel="icon">，8 页含 404）', (t) => {
    for (const p of ALL_PAGES) {
      const links = extractTags(htmlByPage.get(p.rel), 'link');
      const hasIcon = links.some((tag) =>
        (getAttr(tag, 'rel') || '').toLowerCase().split(/\s+/).includes('icon')
      );
      t.ok(hasIcon, `${p.rel} 缺 <link rel="icon">（favicon 声明）`);
    }
  });

  suite.test('7 个内容页含 skip-link 且指向 #main，<main> 带 id="main"（无障碍骨架）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      const skip = getAnchors(html).find((a) => (a.className || '').toLowerCase().includes('skip'));
      t.ok(!!skip, `${p.rel} 缺 skip-link（跳到主内容）`);
      if (skip) t.equal(skip.href, '#main', `${p.rel} skip-link 未指向 #main`);
      t.ok(/<main\b[^>]*\bid\s*=\s*["']main["']/i.test(html), `${p.rel} <main> 缺 id="main"`);
    }
  });

  suite.test('data.js 可解析且 6 条渠道数据齐全（单一事实来源契约）', (t) => {
    let data = null;
    try {
      data = loadData();
    } catch (e) {
      t.ok(false, `data.js 解析失败：${e.message}`);
    }
    if (data == null) return;
    t.ok(Array.isArray(data), 'kuandaiList 应为数组');
    if (!Array.isArray(data)) return;
    t.equal(data.length, 6, '渠道条目数量');
    const slugs = new Set();
    const names = new Set();
    for (const d of data) {
      for (const f of ['name', 'url', 'slug', 'sub', 'intro']) {
        t.ok(typeof d[f] === 'string' && d[f].trim().length > 0, `渠道（slug=${d.slug || '?'}）缺必填字段 ${f}`);
      }
      t.ok(/^https:\/\//.test(String(d.url || '')), `渠道 ${d.slug} 的 url 应为 https 绝对地址`);
      t.equal(d.sub, `${d.slug}/index.html`, `渠道 ${d.slug} 的 sub 字段格式`);
      slugs.add(d.slug);
      names.add(d.name);
    }
    t.equal(slugs.size, 6, 'slug 应无重复');
    t.equal(names.size, 6, '渠道名应无重复');
    for (const s of SUBSITES) t.ok(slugs.has(s), `data.js 缺 slug "${s}"（应与子站目录一致）`);
  });

  suite.test('每个子站页面文本含自身渠道名原文（design.md 4.2.1 自我标识）', (t) => {
    const data = loadData();
    const bySlug = new Map(data.map((d) => [d.slug, d]));
    for (const slug of SUBSITES) {
      const text = textContent(htmlByPage.get(`${slug}/index.html`));
      const name = bySlug.get(slug).name;
      t.ok(text.includes(name), `${slug}/index.html 页面文本未出现渠道名「${name}」`);
    }
  });
}

function run(print = true) {
  const suite = createSuite('结构校验 structure-check');
  build(suite);
  return suite.done(print);
}

module.exports = { name: 'structure-check', run };

if (require.main === module) {
  process.exit(run(true).failed === 0 ? 0 : 1);
}
