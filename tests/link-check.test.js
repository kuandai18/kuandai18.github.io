'use strict';

/**
 * tests/link-check.test.js —— 链接完整性校验
 *
 * 覆盖：
 *   - 站内互链矩阵：主站 → 6 子站（FR-016）；每子站 → 主站（FR-019）+ 5 兄弟站（FR-015）
 *   - 外部友链三件套：3 个固定外站，target=_blank + rel=noopener（FR-016/017/018）
 *   - 全站站外链接统一新标签打开 + noopener（FR-003/017）
 *   - 站内链接相对路径有效（目标存在，FR-025）与页内锚点指向存在的 id
 *   - 静态资源引用（link/script/img）目标存在
 *   - 办理 CTA 与 data.js URL 逐字符一致（FR-008：主站 6 条 / 每子站 ≥2 条）
 *   - 渠道名展示与 data.js 逐字一致（design.md 4.2.1：页脚友链锚文本 / 主站卡片 H3）
 *   - 404.html（附加页）站内导航可用
 *
 * 可独立执行：node tests/link-check.test.js
 */

const lib = require('./lib');
const {
  CONTENT_PAGES, ALL_PAGES, SUBSITES, EXTERNAL_FRIENDS,
  read, getAnchors, extractTags, getAttr, resolveRef, refExists, toRel,
  decodeEntities, loadData, createSuite
} = lib;

/** 非本地路径的 href 前缀（外链协议、mailto/tel/data 等） */
const SKIP_SCHEME = /^(https?:|mailto:|tel:|data:|javascript:)/i;

function build(suite) {
  const htmlByPage = new Map(ALL_PAGES.map((p) => [p.rel, read(p.rel)]));
  const anchorsByPage = new Map([...htmlByPage].map(([rel, html]) => [rel, getAnchors(html)]));
  const data = loadData();
  const bySlug = new Map(data.map((d) => [d.slug, d]));

  /** 页面内指向某仓库相对路径目标的链接列表 */
  const linksTo = (pageRel, targetRel) =>
    (anchorsByPage.get(pageRel) || []).filter(
      (a) => a.href && toRel(resolveRef(pageRel, a.href)) === targetRel
    );

  suite.test('主站 index.html 含全部 6 个子站链接（FR-016）', (t) => {
    for (const slug of SUBSITES) {
      t.ok(
        linksTo('index.html', `${slug}/index.html`).length >= 1,
        `主站缺少到子站 ${slug}/index.html 的链接`
      );
    }
  });

  suite.test('每个子站含返回主站链接（FR-019）', (t) => {
    for (const slug of SUBSITES) {
      const rel = `${slug}/index.html`;
      t.ok(linksTo(rel, 'index.html').length >= 1, `${rel} 缺少返回主站链接`);
    }
  });

  suite.test('每个子站含其他 5 个兄弟站链接（互链矩阵完整，FR-015）', (t) => {
    for (const slug of SUBSITES) {
      const rel = `${slug}/index.html`;
      for (const other of SUBSITES) {
        if (other === slug) continue;
        t.ok(
          linksTo(rel, `${other}/index.html`).length >= 1,
          `${rel} 缺少到兄弟站 ${other}/index.html 的链接`
        );
      }
    }
  });

  suite.test('7 个内容页均含 3 个外部友链且 target=_blank、rel 含 noopener（FR-016/017/018）', (t) => {
    for (const p of CONTENT_PAGES) {
      const anchors = anchorsByPage.get(p.rel) || [];
      for (const url of EXTERNAL_FRIENDS) {
        const hits = anchors.filter((a) => a.href === url);
        if (hits.length === 0) {
          t.ok(false, `${p.rel} 缺少外部友链 ${url}`);
          continue;
        }
        for (const a of hits) {
          t.ok(a.target === '_blank', `${p.rel} 友链 ${url} 未设 target="_blank"`);
          t.ok((a.rel || '').split(/\s+/).includes('noopener'), `${p.rel} 友链 ${url} rel 缺 noopener`);
        }
      }
    }
  });

  suite.test('外部友链锚文本为规范中文名（券宝/优惠聚合/号卡办理中心）', (t) => {
    const NAMES = {
      'https://jdjdndn.github.io/': '券宝',
      'https://wcbblll.cc': '优惠聚合',
      'https://dlhaoka.com': '号卡办理中心'
    };
    for (const p of CONTENT_PAGES) {
      for (const a of anchorsByPage.get(p.rel) || []) {
        const expected = NAMES[a.href];
        if (!expected) continue;
        t.equal(a.text, expected, `${p.rel} 外链 ${a.href} 锚文本应为「${expected}」`);
      }
    }
  });

  suite.test('全部站外 http(s) 链接均新标签打开且带 noopener（FR-003/017）', (t) => {
    for (const p of ALL_PAGES) {
      for (const a of anchorsByPage.get(p.rel) || []) {
        if (!a.href || !/^https?:\/\//i.test(a.href)) continue;
        t.ok(a.target === '_blank', `${p.rel} 站外链接 ${a.href} 未设 target="_blank"`);
        t.ok((a.rel || '').split(/\s+/).includes('noopener'), `${p.rel} 站外链接 ${a.href} rel 缺 noopener`);
      }
    }
  });

  suite.test('全部页面内部链接相对路径均有效（目标存在，FR-025）', (t) => {
    for (const p of ALL_PAGES) {
      for (const a of anchorsByPage.get(p.rel) || []) {
        if (!a.href || SKIP_SCHEME.test(a.href) || a.href.startsWith('#')) continue;
        const resolved = resolveRef(p.rel, a.href);
        t.ok(
          refExists(resolved),
          `${p.rel} 内部链接 "${a.href}" 指向的目标不存在（解析为 ${toRel(resolved) || '/'}）`
        );
      }
    }
  });

  suite.test('站内导航链接在当前标签打开（未滥用 target=_blank）', (t) => {
    for (const p of ALL_PAGES) {
      for (const a of anchorsByPage.get(p.rel) || []) {
        if (!a.href || SKIP_SCHEME.test(a.href) || a.href.startsWith('#')) continue;
        t.ok(
          a.target !== '_blank',
          `${p.rel} 站内链接 "${a.href}" 设置了 target="_blank"（契约：站内当前标签打开）`
        );
      }
    }
  });

  suite.test('页内锚点均指向存在的 id', (t) => {
    for (const p of ALL_PAGES) {
      const html = htmlByPage.get(p.rel);
      for (const a of anchorsByPage.get(p.rel) || []) {
        if (!a.href || !a.href.startsWith('#') || a.href === '#') continue;
        const id = a.href.slice(1);
        const idRe = new RegExp(`\\bid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
        t.ok(idRe.test(html), `${p.rel} 锚点 "${a.href}" 在页面中无对应 id`);
      }
    }
  });

  suite.test('7 个内容页无以 / 开头的根路径引用（FR-025：全相对路径，file:// 直开可用）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      const refs = [];
      for (const tagName of ['a', 'link']) {
        for (const tag of extractTags(html, tagName)) {
          const v = getAttr(tag, 'href');
          if (v) refs.push(v);
        }
      }
      for (const tagName of ['script', 'img']) {
        for (const tag of extractTags(html, tagName)) {
          const v = getAttr(tag, 'src');
          if (v) refs.push(v);
        }
      }
      for (const r of refs) {
        t.ok(!r.startsWith('/'), `${p.rel} 存在根路径引用 "${r}"（应为 ./ 或 ../ 相对路径）`);
      }
    }
  });

  suite.test('全部页面静态资源引用（link/script/img）目标存在', (t) => {
    for (const p of ALL_PAGES) {
      const html = htmlByPage.get(p.rel);
      const check = (tag, attrName) => {
        const v = getAttr(tag, attrName);
        if (!v || /^(https?:|data:|\/\/)/i.test(v)) return;
        const resolved = resolveRef(p.rel, v);
        t.ok(refExists(resolved), `${p.rel} 资源 "${v}" 不存在（解析为 ${toRel(resolved) || '/'}）`);
      };
      for (const tag of extractTags(html, 'link')) check(tag, 'href');
      for (const tag of extractTags(html, 'script')) check(tag, 'src');
      for (const tag of extractTags(html, 'img')) check(tag, 'src');
    }
  });

  suite.test('办理 CTA 与 data.js URL 逐字符一致且新标签 + noopener（FR-008：主站 6 条 / 每子站 ≥2 条）', (t) => {
    const mainCtas = (anchorsByPage.get('index.html') || []).filter((a) => a.dataChannel);
    t.equal(mainCtas.length, 6, '主站 data-channel 直达链接数量');
    for (const slug of SUBSITES) {
      const entry = bySlug.get(slug);
      const hits = mainCtas.filter((a) => a.dataChannel === slug);
      t.ok(hits.length >= 1, `主站缺少 ${slug}（${entry.name}）的直达办理链接`);
      for (const a of hits) {
        t.equal(a.href, entry.url, `主站 ${slug} 直达链接 href 与 data.js 不一致`);
        t.ok(
          a.target === '_blank' && (a.rel || '').split(/\s+/).includes('noopener'),
          `主站 ${slug} 直达链接缺 target="_blank"/noopener`
        );
      }
    }
    for (const slug of SUBSITES) {
      const rel = `${slug}/index.html`;
      const hits = (anchorsByPage.get(rel) || []).filter((a) => a.dataChannel);
      t.ok(hits.length >= 2, `${rel} 办理 CTA 少于 2 处（FR-008 要求每子站 ≥2）`);
      for (const a of hits) {
        const entry = bySlug.get(a.dataChannel);
        t.ok(entry != null, `${rel} 存在未知 data-channel "${a.dataChannel}"`);
        if (entry) t.equal(a.href, entry.url, `${rel} CTA href 与 data.js（${a.dataChannel}）不一致`);
        t.ok(
          a.target === '_blank' && (a.rel || '').split(/\s+/).includes('noopener'),
          `${rel} CTA 缺 target="_blank"/noopener`
        );
      }
    }
  });

  suite.test('页脚友链锚文本与 data.js 渠道名逐字一致（design.md 4.2.1）', (t) => {
    for (const p of CONTENT_PAGES) {
      const html = htmlByPage.get(p.rel);
      const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
      t.ok(footers.length >= 1, `${p.rel} 缺少 <footer>`);
      if (footers.length === 0) continue;
      const footerAnchors = getAnchors(footers[footers.length - 1]);
      for (const slug of SUBSITES) {
        const target = `${slug}/index.html`;
        const entry = bySlug.get(slug);
        const hits = footerAnchors.filter(
          (a) => a.href && toRel(resolveRef(p.rel, a.href)) === target
        );
        for (const a of hits) {
          t.equal(a.text, entry.name, `${p.rel} 页脚指向 ${target} 的锚文本与 data.js 渠道名不一致`);
        }
      }
    }
  });

  suite.test('主站渠道卡片 H3 与 data.js 渠道名逐字一致（design.md 4.2.1）', (t) => {
    const html = htmlByPage.get('index.html');
    const h3Texts = (html.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi) || []).map((h) =>
      decodeEntities(h.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    );
    for (const slug of SUBSITES) {
      const entry = bySlug.get(slug);
      t.ok(h3Texts.includes(entry.name), `主站缺少渠道名 H3「${entry.name}」`);
    }
  });

  suite.test('404.html（附加页）含 6 个子站导航链接与返回首页链接', (t) => {
    const anchors = anchorsByPage.get('404.html') || [];
    for (const slug of SUBSITES) {
      t.ok(
        linksTo('404.html', `${slug}/index.html`).length >= 1,
        `404.html 缺少到 ${slug}/index.html 的导航链接`
      );
    }
    const home = anchors.filter(
      (a) => a.href === '/' || (a.href && toRel(resolveRef('404.html', a.href)) === 'index.html')
    );
    t.ok(home.length >= 1, '404.html 缺少返回首页链接');
  });
}

function run(print = true) {
  const suite = createSuite('链接完整性 link-check');
  build(suite);
  return suite.done(print);
}

module.exports = { name: 'link-check', run };

if (require.main === module) {
  process.exit(run(true).failed === 0 ? 0 : 1);
}
