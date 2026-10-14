// Saves the storage body of one Confluence page as a test fixture.
//
//   ATLASSIAN_URL=https://site.atlassian.net ATLASSIAN_USER=me@x.com ATLASSIAN_TOKEN=... \
//   node scripts/capture-fixture.mjs <pageId> <fixture-name>
//
// Writes tests/fixtures/<fixture-name>.storage.xml. Pick low-sensitivity pages.

import { writeFileSync } from 'fs';

const [pageId, name] = process.argv.slice(2);
if (!pageId || !name) {
  console.error('Usage: node scripts/capture-fixture.mjs <pageId> <fixture-name>');
  process.exit(1);
}
const site = (process.env.ATLASSIAN_URL ?? '').replace(/\/$/, '');
const user = process.env.ATLASSIAN_USER ?? '';
const token = process.env.ATLASSIAN_TOKEN ?? '';
if (!site || !user || !token) {
  console.error('Set ATLASSIAN_URL, ATLASSIAN_USER and ATLASSIAN_TOKEN.');
  process.exit(1);
}
const response = await fetch(`${site}/wiki/rest/api/content/${pageId}?expand=body.storage`, {
  headers: {
    Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`,
    Accept: 'application/json'
  }
});
if (!response.ok) {
  console.error(`HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}
const page = JSON.parse((await response.text()).replace(/"subType"\s*:\s*"[^"]*",?\s*/g, ''));
const target = `tests/fixtures/${name}.storage.xml`;
writeFileSync(target, page.body.storage.value, 'utf8');
console.log(`Saved "${page.title}" to ${target}`);
