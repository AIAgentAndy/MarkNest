import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const sizes = [16, 32, 48, 128];
const iconDir = path.join(process.cwd(), 'extension', 'icons');
const iconStyle = "a2-clear-mn-lockup";
const transparent = [0, 0, 0, 0];
const primary = [15, 118, 110, 255];
const bright = [16, 185, 129, 255];
const strokeBaseWidth = 18;

const paths = [
  {
    // M12 96V32L39 80L66 32V96
    color: primary,
    points: [
      [12, 96],
      [12, 32],
      [39, 80],
      [66, 32],
      [66, 96]
    ]
  },
  {
    // M74 96V32L116 96V32
    color: bright,
    points: [
      [74, 96],
      [74, 32],
      [116, 96],
      [116, 32]
    ]
  }
];

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(size) {
  const scale = size / 128;
  const strokeWidth = Math.max(3, strokeBaseWidth * scale);
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const row = [0];
    for (let x = 0; x < size; x += 1) {
      row.push(...drawStrokeIcon(x, y, scale, strokeWidth));
    }
    rows.push(Buffer.from(row));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// background: transparent
function drawStrokeIcon(x, y, scale, strokeWidth) {
  const sampleOffsets = [
    [0.5, 0.5],
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];
  let bestCoverage = 0;
  let bestColor = transparent;

  for (const pathDefinition of paths) {
    let coveredSamples = 0;
    for (const [offsetX, offsetY] of sampleOffsets) {
      const point = [(x + offsetX) / scale, (y + offsetY) / scale];
      if (isPointCoveredByPath(point, pathDefinition.points, strokeWidth / scale)) {
        coveredSamples += 1;
      }
    }

    const coverage = coveredSamples / sampleOffsets.length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestColor = pathDefinition.color;
    }
  }

  if (bestCoverage === 0) {
    return transparent;
  }

  return [bestColor[0], bestColor[1], bestColor[2], Math.round(bestColor[3] * bestCoverage)];
}

function isPointCoveredByPath(point, pathPoints, strokeWidth) {
  const radius = strokeWidth / 2;
  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    if (distanceToSegment(point, pathPoints[index], pathPoints[index + 1]) <= radius) {
      return true;
    }
  }

  return pathPoints.some((pathPoint) => distance(point, pathPoint) <= radius);
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)
  );
  return distance(point, [start[0] + projection * dx, start[1] + projection * dy]);
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

await mkdir(iconDir, { recursive: true });
await Promise.all(
  sizes.map((size) => writeFile(path.join(iconDir, `icon-${size}.png`), createPng(size)))
);

console.log(`图标已生成：${iconDir} (${iconStyle})`);
