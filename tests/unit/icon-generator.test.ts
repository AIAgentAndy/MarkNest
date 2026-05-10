import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const iconScriptPath = path.join(process.cwd(), 'scripts', 'create-icons.mjs');

describe('MarkNest icon generator', () => {
  it('generates the selected transparent A2 MN lockup', async () => {
    const source = await readFile(iconScriptPath, 'utf8');

    expect(source).toContain('const iconStyle = \"a2-clear-mn-lockup\";');
    expect(source).toContain('drawStrokeIcon');
    expect(source).toContain('background: transparent');
    expect(source).toContain('const transparent = [0, 0, 0, 0];');
    expect(source).toContain('const strokeBaseWidth = 18;');
    expect(source).toContain('M12 96V32L39 80L66 32V96');
    expect(source).toContain('M74 96V32L116 96V32');
  });
});
