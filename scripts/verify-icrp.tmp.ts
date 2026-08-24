import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));
await page.goto('http://localhost:5173/flexo/apps/icrp/', { waitUntil: 'networkidle' });
await page.locator('text=/· \\d+ placements/').waitFor({ timeout: 30000 });
await page.evaluate(() => indexedDB.deleteDatabase('icrp-projects'));
await page.keyboard.press('KeyA');
await page.getByRole('searchbox', { name: 'Search catalog' }).fill('LF1W1HA');
await page.waitForTimeout(400);
await page.locator('button', { hasText: /LF1W1HA/ }).first().click();
await page.waitForTimeout(3500);
await page.keyboard.press('Escape');
await page.keyboard.press('KeyW');
await page.evaluate(() => {
  const w = window as any;
  const layer = w.__icrp.project().objects[0].layers.find((l: any) => l.id !== 'default');
  if (layer) w.__icrp.selectLayer(layer.id);
});
await page.keyboard.press('f');
await page.waitForTimeout(700);
const st = async (label: string) => {
  const s = await page.evaluate(() => {
    const w = window as any;
    return { sel: w.__icrp.selection().length, pivot: w.__icrp.pivotScreen() };
  });
  console.log(label, JSON.stringify(s));
};
await st('after select+frame:');
const canvas = page.locator('canvas').first();
const cbox = (await canvas.boundingBox())!;
const cx = cbox.x + cbox.width / 2, cy = cbox.y + cbox.height / 2;
await page.mouse.move(cx + 60, cy);
await page.mouse.down();
await page.mouse.move(cx + 210, cy + 40, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
await st('after body drag:');
await browser.close();
