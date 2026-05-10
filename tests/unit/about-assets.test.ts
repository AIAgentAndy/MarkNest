import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const aboutAssetDir = path.join(process.cwd(), 'public', 'about');

describe('about panel QR assets', () => {
  it('stores QR images at their rendered size', async () => {
    await expect(readPngSize(path.join(aboutAssetDir, 'wx.png'))).resolves.toEqual({
      width: 124,
      height: 124
    });
    await expect(readPngSize(path.join(aboutAssetDir, 'coffee.png'))).resolves.toEqual({
      width: 124,
      height: 124
    });
  });
});

async function readPngSize(filePath: string): Promise<{ width: number; height: number }> {
  const png = await readFile(filePath);

  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}
