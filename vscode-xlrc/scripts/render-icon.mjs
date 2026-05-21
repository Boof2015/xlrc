import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const size = 512;
const scale = size / 24;
const bars = [
  { x: 3, y: 5, width: 18, height: 2.6, radius: 1.3, color: [232, 232, 240, 255] },
  { x: 3, y: 10.7, width: 13, height: 2.6, radius: 1.3, color: [56, 189, 248, 255] },
  { x: 3, y: 16.4, width: 16, height: 2.6, radius: 1.3, color: [232, 232, 240, 255] }
];

const pixels = Buffer.alloc(size * size * 4);

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const coverage = sampleCoverage(x, y);
    if (!coverage) {
      continue;
    }

    const offset = (y * size + x) * 4;
    pixels[offset] = coverage.color[0];
    pixels[offset + 1] = coverage.color[1];
    pixels[offset + 2] = coverage.color[2];
    pixels[offset + 3] = coverage.alpha;
  }
}

writeFileSync(new URL("../media/icon.png", import.meta.url), encodePng(size, size, pixels));

function sampleCoverage(px, py) {
  const samples = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];

  for (const bar of bars) {
    let hits = 0;
    for (const [sx, sy] of samples) {
      const x = (px + sx) / scale;
      const y = (py + sy) / scale;
      if (insideRoundedRect(x, y, bar)) {
        hits += 1;
      }
    }

    if (hits > 0) {
      return { color: bar.color, alpha: Math.round((hits / samples.length) * 255) };
    }
  }

  return null;
}

function insideRoundedRect(x, y, rect) {
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) {
    return false;
  }

  const radius = rect.radius;
  const cx = Math.min(Math.max(x, rect.x + radius), rect.x + rect.width - radius);
  const cy = Math.min(Math.max(y, rect.y + radius), rect.y + rect.height - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk("IHDR", Buffer.concat([
    uint32(width),
    uint32(height),
    Buffer.from([8, 6, 0, 0, 0])
  ]));

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = chunk("IDAT", deflateSync(scanlines, { level: 9 }));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data])))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
