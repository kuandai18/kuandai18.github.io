'use strict';

/**
 * tests/lib.js —— 测试公共工具库（Node.js 原生实现，零第三方依赖）
 *
 * 职责：
 *   1. 站点常量：页面清单、子站 slug、外部友链、部署地址；
 *   2. 文件工具：读取、页面相对引用 → 仓库内绝对路径解析、目标存在性判断；
 *   3. HTML 轻量解析：标签/属性提取、实体解码、<a> 锚点（含锚文本）、
 *      meta/title/canonical、JSON-LD 块提取与 @type 检索、
 *      可见文本近似抽取、emoji 码点扫描；
 *   4. data.js 加载（纯脚本无导出，用 Function 包装执行）；
 *   5. 极简测试运行器 createSuite（收集用例、逐断言记录失败明细、汇总 PASS/FAIL）。
 */

const fs = require('fs');
const path = require('path');

/* ---------------- 常量 ---------------- */

/** 仓库根目录（tests/ 的上一级） */
const ROOT = path.resolve(__dirname, '..');

/** 站点部署地址（GitHub Pages） */
const SITE = 'https://kuandai18.github.io';

/** 6 个子站 slug（与 data.js 的 slug、子站目录一一对应） */
const SUBSITES = ['xingka', 'r172', 'xinyao', 'kaka', 'dandan', 'lingqu'];

/** 3 个固定外部友链（FR-016/017/018） */
const EXTERNAL_FRIENDS = [
  'https://jdjdndn.github.io/',
  'https://wcbblll.cc',
  'https://dlhaoka.com'
];

/**
 * 7 个内容页 = 主站 + 6 子站（spec.md 交付清单）。
 * 404.html 不在该清单内（tasks.md §0 说明），作为附加页参与基础校验。
 */
const CONTENT_PAGES = [
  { rel: 'index.html', slug: '', url: `${SITE}/` },
  ...SUBSITES.map((slug) => ({ rel: `${slug}/index.html`, slug, url: `${SITE}/${slug}/` }))
];

/** 全部待检 HTML 页面（7 内容页 + 404） */
const ALL_PAGES = [...CONTENT_PAGES, { rel: '404.html', slug: null, url: null }];

/* ---------------- 文件工具 ---------------- */

function abs(relPath) { return path.join(ROOT, relPath); }

function read(relPath) { return fs.readFileSync(abs(relPath), 'utf8'); }

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/** 仓库绝对路径 → 正斜杠相对路径（仅用于报错信息展示） */
function toRel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

/** 将页面内引用（href/src）解析为仓库内绝对路径：支持相对路径与根路径（404 页用） */
function resolveRef(pageRel, href) {
  let h = decodeEntities(String(href)).trim();
  h = h.split('#')[0].split('?')[0];
  if (h === '') h = './';
  if (h.startsWith('/')) return path.join(ROOT, h);
  return path.resolve(path.dirname(abs(pageRel)), h);
}

/** 判断解析目标是否可被浏览器打开：文件存在；若是目录则需含 index.html */
function refExists(resolved) {
  if (!fileExists(resolved)) return false;
  if (fs.statSync(resolved).isDirectory()) return fileExists(path.join(resolved, 'index.html'));
  return true;
}

/* ---------------- HTML 解析 ---------------- */

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', copy: '©' };

/** HTML 实体解码（命名实体 + 十进制/十六进制数字实体） */
function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : m;
  });
}

/** 提取全部开始标签原文（如 <a href="…">），不区分大小写 */
function extractTags(html, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi');
  return html.match(re) || [];
}

/** 从标签原文中取属性值（支持双引号/单引号/无引号），已做实体解码；不存在返回 null */
function getAttr(tag, name) {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return decodeEntities(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
}

/** 提取页面全部 <a> 元素：常用属性 + 内部纯文本（已剥离内嵌标签如 SVG 图标） */
function getAnchors(html) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tagOnly = `<a${m[1]}>`;
    out.push({
      href: getAttr(tagOnly, 'href'),
      target: getAttr(tagOnly, 'target'),
      rel: getAttr(tagOnly, 'rel'),
      dataChannel: getAttr(tagOnly, 'data-channel'),
      className: getAttr(tagOnly, 'class'),
      text: decodeEntities(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
      raw: m[0]
    });
  }
  return out;
}

/** 取 <title> 文本；不存在返回 null */
function getTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : null;
}

/** 按 name 或 property 取 <meta> 的 content；不存在返回 null */
function getMeta(html, key) {
  const k = key.toLowerCase();
  for (const tag of extractTags(html, 'meta')) {
    const name = getAttr(tag, 'name');
    const property = getAttr(tag, 'property');
    if ((name && name.toLowerCase() === k) || (property && property.toLowerCase() === k)) {
      return getAttr(tag, 'content');
    }
  }
  return null;
}

/** 取 canonical 链接；不存在返回 null */
function getCanonical(html) {
  for (const tag of extractTags(html, 'link')) {
    if ((getAttr(tag, 'rel') || '').toLowerCase() === 'canonical') return getAttr(tag, 'href');
  }
  return null;
}

/** 提取全部 JSON-LD 脚本块的源码文本 */
function extractJsonLd(html) {
  const re = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/** 在 JSON-LD 对象树中递归查找指定 @type 的节点（含 @graph 嵌套与数组） */
function findNodesByType(root, type) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') {
      const t = n['@type'];
      if (t === type || (Array.isArray(t) && t.includes(type))) out.push(n);
      Object.values(n).forEach(walk);
    }
  };
  walk(root);
  return out;
}

/** 近似抽取可见文本：剥离注释、script/style/svg 块与全部标签，再解码实体并压缩空白 */
function textContent(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

/* ---------------- emoji 扫描 ---------------- */

/**
 * emoji 码点区间（design.md T8「禁止 emoji 充当图标」）：
 *   U+1F000–U+1FAFF（emoji 各补充区）、U+2600–U+27BF（杂项符号/装饰符号，含 ☎✈✔）、
 *   U+2B00–U+2BFF（箭头与符号）、U+2300–U+23FF（杂项技术，含 ⌚⏰）、U+FE0F（表情变体选择符）。
 * 不含 U+2190–U+21FF 普通箭头（← 等常规排版符号）与 U+2460 起的带圈数字。
 */
const EMOJI_SOURCE = '[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2300}-\\u{23FF}\\u{FE0F}]';

/** 返回文本中出现的 emoji 字符及其码点（最多 20 个） */
function findEmoji(text) {
  const re = new RegExp(EMOJI_SOURCE, 'gu');
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null && found.length < 20) {
    found.push({ char: m[0], code: `U+${m[0].codePointAt(0).toString(16).toUpperCase()}` });
  }
  return found;
}

/* ---------------- data.js ---------------- */

/** 加载并执行 data.js（纯脚本、无导出），返回 kuandaiList 数组 */
function loadData() {
  const code = read('data.js');
  const fn = new Function(`${code}\n;return (typeof kuandaiList !== 'undefined') ? kuandaiList : null;`);
  return fn();
}

/* ---------------- 测试运行器 ---------------- */

/**
 * 极简测试套件。用法：
 *   const suite = createSuite('名称');
 *   suite.test('用例名', (t) => { t.ok(cond, '失败说明'); t.equal(a, b, '说明'); });
 *   const summary = suite.done(true); // 打印明细并返回 { passed, failed, total, cases }
 */
function createSuite(name) {
  const cases = [];
  return {
    name,
    test(title, fn) {
      const failures = [];
      const t = {
        ok(cond, msg) { if (!cond) failures.push(msg); },
        equal(actual, expected, msg) {
          if (actual !== expected) {
            failures.push(`${msg}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
          }
        }
      };
      try { fn(t); } catch (e) { failures.push(`用例执行异常：${e && e.message ? e.message : String(e)}`); }
      cases.push({ title, failures });
    },
    done(print = true) {
      let passed = 0;
      let failed = 0;
      const lines = [];
      for (const c of cases) {
        if (c.failures.length === 0) {
          passed += 1;
          if (print) lines.push(`  PASS  ${c.title}`);
        } else {
          failed += 1;
          if (print) {
            lines.push(`  FAIL  ${c.title}`);
            for (const f of c.failures) lines.push(`        - ${f}`);
          }
        }
      }
      if (print) {
        console.log(`\n=== ${name} ===`);
        for (const l of lines) console.log(l);
        console.log(`  —— 小计：${passed} PASS / ${failed} FAIL（共 ${cases.length} 项用例）`);
      }
      return { name, passed, failed, total: cases.length, cases };
    }
  };
}

module.exports = {
  ROOT, SITE, SUBSITES, EXTERNAL_FRIENDS, CONTENT_PAGES, ALL_PAGES,
  abs, read, fileExists, toRel, resolveRef, refExists,
  decodeEntities, extractTags, getAttr, getAnchors,
  getTitle, getMeta, getCanonical, extractJsonLd, findNodesByType,
  textContent, findEmoji, loadData, createSuite
};
