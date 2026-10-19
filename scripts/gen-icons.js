'use strict';

/**
 * scripts/gen-icons.js —— 主站 favicon PNG 生成器（零依赖，仅 Node 内置模块 fs/path/zlib）
 *
 * 像素级重绘根目录 favicon.svg 的设计（64×64 设计坐标系，等比映射到各输出尺寸）：
 *   - 背景：圆角矩形 rx=14，对角线性渐变 #2F54EB（左上）→ #4D9FFF（右下）
 *   - Wi-Fi 图形（白色）：两条同心弧带 + 圆点
 *       · 弧带圆心 (32, 42)，半径 20.5 / 10.5，带宽 5（半宽 2.5）
 *       · 角度范围 -135° ~ -45°（atan2 度数，向上张开的弧）
 *       · 端帽按 SVG stroke-linecap="round" 处理（半径 = 弧带半宽的圆帽）
 *       · 圆点圆心 (32, 42)，半径 3.6
 *   - 抗锯齿：所有边缘 1px 软过渡（64 坐标系；输出 ≥64px 时收敛为 1 输出像素，避免放大糊边）
 *
 * 输出（写入仓库根目录）：
 *   - favicon-32.png        32×32   圆角矩形 + 透明角（iOS Safari 不支持 SVG favicon 的 PNG 回退）
 *   - apple-touch-icon.png  180×180 全出血不透明（iOS 自动加圆角，不能自带透明角）
 *   - icon-192.png          192×192 圆角透明（PWA 备用）
 *   - icon-512.png          512×512 圆角透明（PWA 备用）
 *
 * PNG 拼装：8 字节签名 + IHDR（bitDepth=8 / colorType=6 RGBA / 压缩、过滤、隔行均为 0）
 *           + IDAT（每行前置 filter byte 0，整体 zlib.deflateSync level 9）+ IEND；
 *           CRC32 为标准查表实现，覆盖 chunk type + data。
 *
 * 末尾自校验：读回每个生成文件，验证签名、IHDR 宽高与字段、inflateSync 解压后长度
 * === h*(1+w*4)，全部通过才 exit 0 并打印每个文件的尺寸与字节数。幂等，可重复运行覆盖。
 *
 * 用法：node scripts/gen-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ===== 设计参数（64×64 坐标系） =====
const CANVAS = 64; // 设计坐标系边长
const RADIUS = 14; // 背景圆角半径 rx
const GRAD_FROM = [0x2f, 0x54, 0xeb]; // #2F54EB（左上）
const GRAD_TO = [0x4d, 0x9f, 0xff]; //   #4D9FFF（右下）
const ARC_CX = 32; // 弧带 / 圆点公共圆心
const ARC_CY = 42;
const ARC_R_OUTER = 20.5; // 外弧半径
const ARC_R_INNER = 10.5; // 内弧半径
const ARC_HALF_W = 2.5; // 弧带半宽（带宽 5）
const ANG_START = -135; // 弧角度范围（atan2 度数，向上张开）
const ANG_END = -45;
const DOT_R = 3.6; // 圆点半径
const SQ = Math.SQRT1_2; // cos45° = sin45° = √2/2

/** 计算某半径弧线两端点坐标（即 round 端帽圆心） */
function arcEnds(r) {
  return [
    [ARC_CX - r * SQ, ARC_CY - r * SQ], // -135° 端
    [ARC_CX + r * SQ, ARC_CY - r * SQ], // -45° 端
  ];
}
const ENDS_OUTER = arcEnds(ARC_R_OUTER);
const ENDS_INNER = arcEnds(ARC_R_INNER);

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 软边覆盖率：signedDist < 0 为形状内部，soft 为过渡带宽度（设计坐标单位） */
function coverage(signedDist, soft) {
  return clamp01(0.5 - signedDist / soft);
}

/** 铺满 64×64 画布、圆角 RADIUS 的圆角矩形符号距离（负值在内部） */
function roundedRectDist(u, v) {
  const qx = Math.abs(u - CANVAS / 2) - (CANVAS / 2 - RADIUS);
  const qy = Math.abs(v - CANVAS / 2) - (CANVAS / 2 - RADIUS);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - RADIUS;
}

/** 对角线性渐变取色：t=0（左上）→ GRAD_FROM，t=1（右下）→ GRAD_TO */
function gradient(u, v) {
  const t = clamp01((u + v) / (CANVAS * 2));
  return [
    Math.round(GRAD_FROM[0] + (GRAD_TO[0] - GRAD_FROM[0]) * t),
    Math.round(GRAD_FROM[1] + (GRAD_TO[1] - GRAD_FROM[1]) * t),
    Math.round(GRAD_FROM[2] + (GRAD_TO[2] - GRAD_FROM[2]) * t),
  ];
}

/**
 * 单条弧带（含 round 端帽）在 (u,v) 处的覆盖率。
 * 点到弧中心线的距离：角度落在弧范围内取径向距离，否则取到较近端点的直线距离
 * （后者自然形成圆形端帽，与 SVG stroke-linecap="round" 一致）。
 */
function arcCoverage(u, v, r, ends, soft) {
  const dx = u - ARC_CX;
  const dy = v - ARC_CY;
  const dist = Math.hypot(dx, dy);
  let pathDist;
  if (dist < 1e-9) {
    pathDist = r; // 圆心处角度未定义，到弧环的距离即半径
  } else {
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang >= ANG_START && ang <= ANG_END) {
      pathDist = Math.abs(dist - r);
    } else {
      pathDist = Math.min(
        Math.hypot(u - ends[0][0], v - ends[0][1]),
        Math.hypot(u - ends[1][0], v - ends[1][1])
      );
    }
  }
  return coverage(pathDist - ARC_HALF_W, soft);
}

/**
 * 渲染一个尺寸的 RGBA 像素缓冲（w*h*4，非预乘 alpha）。
 * @param {number} size 输出边长（正方形）
 * @param {boolean} fullBleed true = 背景铺满画布（无圆角无透明，iOS 全出血）
 */
function render(size, fullBleed) {
  // 软边宽度：1 设计单位（64 坐标系 1px）；输出 ≥64px 时收敛为 1 输出像素
  const soft = Math.min(1, CANVAS / size);
  const rgba = Buffer.alloc(size * size * 4);
  const k = CANVAS / size; // 输出像素 → 设计坐标的缩放
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * k;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * k;

      // 背景层：对角渐变圆角矩形（全出血模式则铺满画布）
      const bg = gradient(u, v);
      const b = fullBleed ? 1 : coverage(roundedRectDist(u, v), soft);

      // 前景层：白色 Wi-Fi 双弧 + 圆点（重叠处取最大覆盖率）
      const dotDist = Math.hypot(u - ARC_CX, v - ARC_CY);
      const w = Math.max(
        arcCoverage(u, v, ARC_R_OUTER, ENDS_OUTER, soft),
        arcCoverage(u, v, ARC_R_INNER, ENDS_INNER, soft),
        coverage(dotDist - DOT_R, soft)
      );

      // 标准 alpha 合成：白色前景 over 渐变背景 over 透明
      const a = w + b * (1 - w);
      const i = (y * size + x) * 4;
      if (a <= 0) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      } else {
        rgba[i] = Math.round((255 * w + bg[0] * b * (1 - w)) / a);
        rgba[i + 1] = Math.round((255 * w + bg[1] * b * (1 - w)) / a);
        rgba[i + 2] = Math.round((255 * w + bg[2] * b * (1 - w)) / a);
        rgba[i + 3] = Math.round(a * 255);
      }
    }
  }
  return rgba;
}

// ===== PNG 拼装（签名 + IHDR + IDAT + IEND） =====
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 标准 CRC32 查表（多项式 0xEDB88320，初值/终值异或 0xFFFFFFFF） */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC32（覆盖 buffer 全部字节） */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 拼一个 PNG chunk：长度(4) + type(4) + data + CRC32(type+data)(4) */
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 8 + data.length);
  return out;
}

/** RGBA 像素 → PNG 文件字节（bitDepth=8、colorType=6、每行 filter=0、zlib level 9） */
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); // 宽
  ihdr.writeUInt32BE(h, 4); // 高
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 6; // colorType：RGBA
  ihdr[10] = 0; // compression：deflate
  ihdr[11] = 0; // filter：自适应（每行自声明，此处全为 0）
  ihdr[12] = 0; // interlace：无

  const stride = w * 4;
  const raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // filter byte：None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ===== 自校验：读回文件，验证签名 / IHDR / chunk CRC / IDAT 解压长度 =====
function validatePNG(file, w, h) {
  const buf = fs.readFileSync(file);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error('PNG 签名错误');
  }
  let off = 8;
  let ihdr = null;
  let sawIEND = false;
  const idatParts = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (off + 12 + len > buf.length) throw new Error(`chunk ${type} 长度越界`);
    if (buf.readUInt32BE(off + 8 + len) !== crc32(buf.subarray(off + 4, off + 8 + len))) {
      throw new Error(`chunk ${type} CRC 不匹配`);
    }
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = data;
    else if (type === 'IDAT') idatParts.push(data);
    else if (type === 'IEND') {
      sawIEND = true;
      break;
    }
    off += 12 + len;
  }
  if (!ihdr || ihdr.length !== 13) throw new Error('IHDR 缺失或长度错误');
  if (ihdr.readUInt32BE(0) !== w || ihdr.readUInt32BE(4) !== h) {
    throw new Error(`IHDR 宽高不符（期望 ${w}x${h}）`);
  }
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) {
    throw new Error('IHDR 字段错误（应为 8bit / RGBA / 0 / 0 / 0）');
  }
  if (!sawIEND) throw new Error('缺少 IEND');
  if (idatParts.length === 0) throw new Error('缺少 IDAT');
  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const expect = h * (1 + w * 4);
  if (raw.length !== expect) throw new Error(`解压长度 ${raw.length} ≠ 期望 ${expect}`);
}

// ===== 目标清单与主流程 =====
const TARGETS = [
  { file: 'favicon-32.png', size: 32, fullBleed: false, note: '圆角透明' },
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true, note: '全出血不透明' },
  { file: 'icon-192.png', size: 192, fullBleed: false, note: 'PWA 备用' },
  { file: 'icon-512.png', size: 512, fullBleed: false, note: 'PWA 备用' },
];

function main() {
  const root = path.resolve(__dirname, '..');
  const made = [];
  for (const t of TARGETS) {
    const png = encodePNG(t.size, t.size, render(t.size, t.fullBleed));
    const out = path.join(root, t.file);
    fs.writeFileSync(out, png);
    made.push({ ...t, out, bytes: png.length });
  }

  console.log('gen-icons：PNG 生成 + 自校验');
  let failed = 0;
  for (const m of made) {
    try {
      validatePNG(m.out, m.size, m.size);
      console.log(`  OK   ${m.file}  ${m.size}x${m.size}（${m.note}）  ${m.bytes} bytes`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${m.file}: ${e.message}`);
    }
  }
  if (failed > 0) {
    console.error(`自校验失败：${failed} 个文件不合法`);
    process.exit(1);
  }
  console.log(`全部 ${made.length} 个 PNG 自校验通过（签名 / IHDR / chunk CRC / IDAT 解压长度）。`);
}

main();
