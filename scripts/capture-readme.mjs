// Capture only public demo data; never open the user's working data directory.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {createResumeServer} from './preview.mjs';
import {browserPath} from './pdf.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(projectRoot,'assets','readme');
const tempRoot=path.resolve(os.tmpdir());
const dataRoot=await mkdtemp(path.join(tempRoot,'zhijian-readme-'));
let server,browser;
try {
  await mkdir(output,{recursive:true});
  server=await createResumeServer({projectRoot,dataRoot});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,ids=[];
  for(const [name,description] of [
    ['算法研发 · 秋招版','面向算法研发岗位，展示建模能力与工程实践。'],
    ['学术申请 · 科研版','用于学术项目申请，突出研究经历、论文与成果。'],
  ]) {
    const response=await fetch(base+'/api/resumes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,presetId:'demo'})});
    assert.equal(response.status,201);ids.push((await response.json()).document.id);
  }
  browser=await chromium.launch({executablePath:await browserPath(),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const capture=async name=>{
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(output,name+'.png')});
  };
  await page.goto(base,{waitUntil:'load'});await capture('cover');
  await page.locator('#enter-studio').click();await page.locator('#library-message').waitFor({state:'hidden'});
  assert.equal(await page.locator('.resume-card').count(),2);
  await capture('workspace');
  await page.goto(base+'/editor.html?id='+ids[0]+'&section=projects',{waitUntil:'load'});
  await page.locator('[data-field="projects.0.title"]').waitFor({state:'attached'});
  await page.locator('.entry-card').first().locator('summary').click();
  await page.frameLocator('#resume-frame').locator('.resume-page').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#layout-status').textContent.includes('正在'));
  await capture('editor');
  for(const route of ['/', '/editor.html?id='+ids[0]]) {
    await page.goto(base+route,{waitUntil:'load'});
    const icon=await page.locator('link[rel="icon"]').getAttribute('href');
    assert.equal((await fetch(new URL(icon,base+route))).status,200);
  }
  assert.deepEqual(errors,[]);
  console.log('Saved cover.png, workspace.png and editor.png in assets/readme using fictional demo data.');
} finally {
  if(browser)await browser.close();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  // Only remove the exact temporary directory created by this process.
  assert.equal(path.dirname(dataRoot),tempRoot);
  assert.ok(path.basename(dataRoot).startsWith('zhijian-readme-'));
  await rm(dataRoot,{recursive:true,force:true});
}
