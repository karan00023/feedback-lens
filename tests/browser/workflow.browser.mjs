// Real-browser check of the investigation workflow at desktop and mobile widths.
// Needs Playwright with Chromium (not a project dependency):
//   npm run test:browser                       # starts the local server on a free port
//   BASE_URL=https://karan00023.github.io/feedback-lens/ npm run test:browser
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from '../../server.mjs';

const {chromium} = createRequire(import.meta.url)('playwright');

let server;
let base = process.env.BASE_URL;
if (!base) {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
}

const browser = await chromium.launch();
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['pass', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); }
};

try {
  for (const [label, viewport] of [['desktop', {width: 1280, height: 900}], ['mobile', {width: 390, height: 844}]]) {
    const page = await browser.newPage({viewport});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, {waitUntil: 'networkidle'});
    const text = async selector => (await page.locator(selector).innerText()).replace(/\s+/g, ' ');

    await check(`${label}: library loads and questions are enabled`, async () => {
      assert.match(await text('#visible-count'), /Showing 31 of 31/);
      assert.equal(await page.locator('#ask').isDisabled(), false);
    });
    await check(`${label}: an empty question shows inline guidance`, async () => {
      await page.fill('#question', '   ');
      await page.click('#ask');
      assert.equal(await page.locator('#question-error').isVisible(), true);
    });
    await check(`${label}: an example produces a cited extractive answer`, async () => {
      await page.click('text=Export issues');
      assert.match(await text('#answer'), /Extractive baseline · no LLM/i);
      assert.equal(await page.locator('#answer .cite').count(), 1);
    });
    await check(`${label}: a citation reveals its record even when library filters hide it`, async () => {
      await page.click('[data-theme=Billing]');
      await page.click('#answer .cite');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'FB-016');
      assert.ok(await page.evaluate(() => {
        const r = document.getElementById('FB-016').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      }), 'cited record is scrolled into view');
      assert.match(await text('#visible-count'), /Showing 31 of 31/);
    });
    await check(`${label}: changing the channel re-runs the question in the new scope`, async () => {
      await page.selectOption('#channel', 'interview');
      await page.waitForFunction(() => document.querySelector('#answer').textContent.includes('interviews'));
      assert.match(await text('#answer'), /Not enough evidence in interviews/);
    });
    await check(`${label}: an over-narrow scope offers to broaden and then answers`, async () => {
      await page.click('text=Too narrow a scope');
      assert.match(await text('#answer'), /exists outside surveys/);
      await page.click('[data-broaden]');
      assert.equal(await page.inputValue('#channel'), 'all');
      assert.equal(await page.locator('#answer .cite').count(), 1);
    });
    await check(`${label}: an unsupported question abstains and explains why`, async () => {
      await page.click('text=Out of scope');
      const answer = await text('#answer');
      assert.match(answer, /Not enough evidence/);
      assert.match(answer, /revenue/);
      assert.equal(await page.locator('#answer .cite').count(), 0);
    });
    await check(`${label}: question input is capped at 500 characters`, async () => {
      await page.fill('#question', 'x'.repeat(600));
      assert.equal((await page.inputValue('#question')).length, 500);
    });
    await check(`${label}: evaluation compares baseline and current versions`, async () => {
      assert.match(await text('#eval-results'), /Original baseline.*Current/);
    });
    await check(`${label}: no horizontal page scroll and no script errors`, async () => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      assert.deepEqual(errors, []);
    });
    await check(`${label}: a shared link restores the question and scope`, async () => {
      await page.goto(`${base}?q=${encodeURIComponent('Why do large exports time out?')}&channel=support`, {waitUntil: 'networkidle'});
      await page.waitForSelector('#answer .cite');
      assert.equal(await page.inputValue('#channel'), 'support');
    });
    await page.close();
  }

  await check('failed data load shows a retry that recovers', async () => {
    const page = await browser.newPage();
    await page.route('**/data/feedback.json', route => route.abort());
    await page.goto(base, {waitUntil: 'networkidle'});
    assert.match(await page.locator('#records').innerText(), /did not load/);
    assert.equal(await page.locator('#ask').isDisabled(), true);
    await page.unroute('**/data/feedback.json');
    await page.click('#retry-load');
    await page.waitForFunction(() => document.querySelector('#visible-count').textContent.includes('31'));
    assert.equal(await page.locator('#ask').isDisabled(), false);
    await page.close();
  });

  await check('every portfolio page loads without errors or broken same-site links', async () => {
    const page = await browser.newPage();
    for (const path of ['', 'lab/', 'telemetry/', 'telemetry/report.html', 'research/', 'research/citation-checks.html', 'models/']) {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const response = await page.goto(base + path, {waitUntil: 'networkidle'});
      assert.equal(response.status(), 200, path);
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.href.split('#')[0]));
      for (const link of new Set(links.filter(l => l.startsWith(base)))) {
        const status = (await page.request.get(link)).status();
        assert.ok(status < 400, `${path} links to ${link} (${status})`);
      }
      assert.deepEqual(errors, [], path);
      page.removeAllListeners('pageerror');
    }
    await page.close();
  });
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} browser checks passed against ${base}`);
process.exitCode = failed ? 1 : 0;
