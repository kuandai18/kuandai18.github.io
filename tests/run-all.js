'use strict';

/**
 * tests/run-all.js —— 全量测试统一入口
 *
 * 依次执行 link-check / seo-check / structure-check 三个套件，
 * 汇总 PASS/FAIL 并以退出码反馈结果（0 = 全部通过，1 = 存在失败）。
 *
 * 用法（路径基于 __dirname 解析，任意工作目录均可执行）：
 *   node tests/run-all.js
 */

const lib = require('./lib');
const suites = [
  require('./link-check.test.js'),
  require('./seo-check.test.js'),
  require('./structure-check.test.js')
];

function main() {
  console.log('宽带导航站群静态测试（Node.js 原生实现，零依赖）');
  console.log(`目标目录：${lib.ROOT}`);

  let passed = 0;
  let failed = 0;
  for (const s of suites) {
    const summary = s.run(true);
    passed += summary.passed;
    failed += summary.failed;
  }

  console.log('\n==================== 汇总 ====================');
  console.log(`套件：${suites.length} 个；用例：${passed + failed} 项 —— ${passed} PASS / ${failed} FAIL`);
  if (failed === 0) {
    console.log('结论：全部用例通过。');
  } else {
    console.log(`结论：${failed} 项用例失败，明细见上方 FAIL 条目。`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main();
