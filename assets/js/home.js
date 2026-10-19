/**
 * home.js —— 宽带办理导航 · 主站聚合导航页增强脚本
 *
 * 职责（全部为渐进增强，禁 JS 时页面内容/链接完整可用）：
 *   ① html.js 根类标记：CSS 据此启用 JS 增强模块（如搜索框）
 *   ② 锚点平滑滚动 JS 兜底（CSS scroll-behavior 的补充）
 *   ③ 渠道卡片渐入动画（IntersectionObserver，reduced-motion 降级）
 *   ④ 渠道搜索筛选（输入即过滤，aria-live 播报结果）
 *   ⑤ data.js 一致性自检（[data-channel] 与 kuandaiList 比对，仅 console.warn）
 *
 * 红线：经典脚本 + defer；无 fetch/XHR/localStorage；不操作 document.write。
 */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var mql = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: true };

  /* ① 标记 JS 可用（搜索框等增强模块的显隐开关） */
  docEl.classList.add('js');

  /**
   * ② 锚点平滑滚动兜底
   * @param {MouseEvent} e 点击事件
   */
  function initSmoothScroll() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!link) return;
      var id = link.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      var reduce = window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (history.pushState) history.pushState(null, '', '#' + id);
    });
  }

  /**
   * ③ 渠道卡片渐入：html.anim 下先隐藏，进入视口后逐张错峰浮现
   * 降级：reduced-motion / 不支持 IntersectionObserver / 无卡片 → 不启用
   */
  function initReveal() {
    if (mql.matches || !('IntersectionObserver' in window)) return;
    var cards = document.querySelectorAll('.channel-card');
    if (!cards.length) return;
    docEl.classList.add('anim');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var card = entry.target;
        card.style.transitionDelay = (i % 3) * 90 + 'ms';
        card.classList.add('is-visible');
        card.addEventListener('transitionend', function () {
          card.style.transitionDelay = '';
        }, { once: true });
        io.unobserve(card);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    Array.prototype.forEach.call(cards, function (card) { io.observe(card); });
  }

  /**
   * ④ 渠道搜索筛选：按卡片文本（渠道名/简介/提示）过滤显隐
   * 结果经 filter-status（aria-live="polite"）播报；空结果展示提示卡
   */
  function initSearch() {
    var input = document.getElementById('channel-search');
    if (!input) return;
    var cards = Array.prototype.slice.call(
      document.querySelectorAll('.channel-grid .channel-card'));
    var empty = document.querySelector('.filter-empty');
    var status = document.getElementById('filter-status');
    var total = cards.length;

    function apply() {
      var raw = input.value.trim();
      var q = raw.toLowerCase();
      var shown = 0;
      cards.forEach(function (card) {
        var hit = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
        card.parentElement.hidden = !hit; /* 显隐落在 li 上，保持网格语义 */
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (status) {
        status.textContent = q
          ? '筛选「' + raw + '」：找到 ' + shown + ' 个渠道'
          : '共收录 ' + total + ' 个宽带渠道';
      }
    }

    input.addEventListener('input', apply);
    apply(); /* 初始化统计文案 */
  }

  /**
   * ⑤ data.js 一致性自检（NFR-018 护栏，访客无感知）
   * 遍历 [data-channel]（值为 slug），在 kuandaiList 中按 slug 匹配，
   * 比对 getAttribute('href')（返回字面值，&amp; 已还原为 &）与 url；
   * 同时核对卡片渠道名展示与 name 逐字一致。
   */
  function initSelfCheck() {
    if (typeof kuandaiList === 'undefined' || !Array.isArray(kuandaiList)) {
      console.warn('[主站自检] 未检测到 data.js 的 kuandaiList，跳过一致性校验');
      return;
    }
    var links = document.querySelectorAll('a[data-channel]');
    Array.prototype.forEach.call(links, function (link) {
      var key = link.getAttribute('data-channel');
      var item = null;
      for (var i = 0; i < kuandaiList.length; i++) {
        var c = kuandaiList[i];
        if (c.slug === key || c.name === key) { item = c; break; }
      }
      if (!item) {
        console.warn('[主站自检] data.js 中未找到渠道：' + key);
        return;
      }
      var href = link.getAttribute('href');
      if (href !== item.url) {
        console.warn('[主站自检] 「' + item.name + '」办理链接与 data.js 不一致：\n' +
          '  页面值: ' + href + '\n  data.js: ' + item.url);
      }
      var card = link.closest ? link.closest('.channel-card') : null;
      if (card) {
        var nameEl = card.querySelector('.channel-name');
        if (nameEl && nameEl.textContent.trim() !== item.name) {
          console.warn('[主站自检] 渠道名与 data.js 不一致：「' +
            nameEl.textContent.trim() + '」≠「' + item.name + '」');
        }
      }
    });
  }

  initSmoothScroll();
  initReveal();
  initSearch();
  initSelfCheck();
})();
