import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {PDFDocument} from 'pdf-lib';
import {loadPreset} from '../scripts/presets.mjs';
import {createResumeServer} from '../scripts/preview.mjs';
import {browserPath} from '../scripts/pdf.mjs';
import {migrate,fieldKey,layoutFor,ownerKey,newBlock,dropEntryMetadata} from '../app/format.js';
import {validate,clone} from '../app/model.js';
import {activePrintLayout,layoutFingerprint,paginationUnits} from '../app/pagination.js';
import {renderResume} from '../app/render.js';

const logoSVG='<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#30455e"/><path d="M12 34V14h6v14h18v6z" fill="white"/></svg>';
const logoSource='data:image/svg+xml;base64,'+Buffer.from(logoSVG).toString('base64');

test('v5 internship migration removes location, updates the old default heading and preserves custom content',async()=>{
  const old=await loadPreset('demo');old.version=5;
  const entry=old.internships[0],owner=ownerKey(old,'internships',0);delete entry.logo;entry.location='旧工作地点';
  old.format[owner+':location']={style:{color:'#743a44'},marks:[]};
  old.format[owner+':role']={style:{fontWeight:700},marks:[]};
  old.layouts[owner]={rows:[['title','role','dates'],['department','location'],['description']],right:['dates'],rowModes:['split','flow','flow'],gap:9};
  old.printLayout={version:1,source:layoutFingerprint(old),gaps:{[owner]:8}};
  const before=clone(old),data=migrate(old);
  assert.deepEqual(old,before);assert.deepEqual(validate(data),[]);assert.equal(data.version,6);
  const {location,...expected}=entry;assert.deepEqual(data.internships[0],{...expected,logo:''});
  assert.equal(data.format[owner+':location'],undefined);assert.deepEqual(data.format[owner+':role'],old.format[owner+':role']);
  assert.deepEqual(data.layouts[owner].rows,[['title','department','role','dates'],['description']]);assert.equal(data.layouts[owner].gap,9);
  assert.equal(activePrintLayout(data),null);assert.deepEqual(migrate(data),data);
  const custom=clone(old);custom.layouts[owner].rows=[['title','dates'],['role','department','location'],['description']];
  assert.deepEqual(migrate(custom).layouts[owner].rows,[['title','dates'],['role','department'],['description']]);
  const hidden=clone(old);hidden.sections.find(s=>s.id==='internships').visible=false;
  hidden.printLayout.source=layoutFingerprint(hidden);assert.ok(activePrintLayout(migrate(hidden)));
});

test('internship logos validate and keep pagination portable; department and role share one separator',async()=>{
  const data=await loadPreset('demo'),entry=data.internships[0];entry.logo=logoSource;
  const html=renderResume(data);assert.match(html,/class="internship-logo"/);assert.ok(html.includes(logoSource));assert.equal((html.match(/class="internship-role-dot"/g)||[]).length,1);
  for(const field of ['department','role']){const partial=clone(data);partial.internships[0][field]='';assert.ok(!renderResume(partial).includes('class="internship-role-dot"'));}
  const local=clone(data);local.internships[0].logo='./assets/school-placeholder.svg';assert.equal(layoutFingerprint(local),layoutFingerprint(data));
  local.internships[0].logo='';assert.notEqual(layoutFingerprint(local),layoutFingerprint(data));assert.ok(!renderResume(local).includes('class="internship-logo"'));
  for(const invalid of ['https://example.com/logo.png','javascript:alert(1)','./assets/../secret.svg','data:text/html;base64,AAAA',null]){const corrupt=clone(data);corrupt.internships[0].logo=invalid;assert.ok(validate(corrupt).length);}
  assert.deepEqual(validate(data),[]);
});

test('v4 migration adds an empty hidden internship section and preserves order, content and verified spacing',async()=>{
  const old=await loadPreset('demo');old.version=4;delete old.internships;old.sections=old.sections.filter(s=>s.id!=='internships').reverse();
  old.format['profile.name']={style:{color:'#743a44'},marks:[{start:0,end:2,style:{fontWeight:700}}]};
  const key=ownerKey(old,'projects',0);old.layouts[key]=layoutFor(old,'projects',0);
  old.printLayout={version:1,source:layoutFingerprint(old),gaps:{[key]:8}};
  const before=clone(old),html=renderResume(old),data=migrate(old);
  assert.equal(data.version,6);assert.deepEqual(validate(data),[]);assert.deepEqual(old,before);
  const index=data.sections.findIndex(s=>s.id==='education');assert.equal(data.sections[index+1].id,'internships');assert.equal(data.sections[index+1].visible,false);
  assert.deepEqual(data.internships,[]);assert.deepEqual(data.sections.filter(s=>s.id!=='internships'),old.sections);
  for(const field of ['profile','education','projects','publications','patents','awards','skills','campus','evaluation','styles','format','layouts','sectionStyles'])assert.deepEqual(data[field],old[field]);
  assert.ok(activePrintLayout(data));assert.deepEqual(data.printLayout.gaps,old.printLayout.gaps);
  // Section index paths shift in HTML, while visible text and styling stay identical.
  assert.equal(renderResume(data).replace(/data-path="sections\.\d+\./g,'data-path="sections.'),html.replace(/data-path="sections\.\d+\./g,'data-path="sections.'));
  assert.deepEqual(migrate(data),data);
  const stale=clone(old);stale.profile.name+=' edit';const migrated=migrate(stale);assert.equal(activePrintLayout(migrated),null);
});

test('internship rich fields, layouts and blocks remain valid after reordering and reject corrupt input',async()=>{
  const data=await loadPreset('demo'),first=data.internships[0],second=clone(first);second.id='entry_second_intern';second.blocks=[newBlock('numbered')];second.blocks[0].text='Other entry';data.internships.push(second);
  const key=fieldKey(data,'internships.0.blocks.1.text'),owner=ownerKey(data,'internships',0);
  data.format[key]={style:{color:'#743a44'},marks:[{start:0,end:2,style:{fontWeight:700}}]};
  data.layouts[owner]={rows:[['title','department','role','dates','description']],right:['dates'],rowModes:['split'],gap:6};
  data.internships.reverse();assert.equal(fieldKey(data,'internships.1.blocks.1.text'),key);assert.deepEqual(validate(data),[]);
  assert.ok(paginationUnits(data).some(unit=>unit.key===owner&&unit.maxGap===12));
  const html=renderResume(data);assert.match(html,/internship-entry/);assert.match(html,/#icon-briefcase/);assert.match(html,/internships\.[01]\.blocks\.1\.text/);assert.match(html,/project-body-slot/);assert.ok(html.includes('font-weight:700'));
  for(const corrupt of [d=>delete d.internships,d=>d.internships[0].role=null,d=>d.internships[0].blocks[0].type='html',d=>d.internships[0].blocks[0].id=d.internships[1].blocks[0].id,d=>d.layouts[owner].rows[0].push('title'),d=>d.format[key].marks[0].end=100000]){const invalid=clone(data);corrupt(invalid);assert.ok(validate(invalid).length);}
  dropEntryMetadata(data,'internships',1);data.internships.splice(1,1);assert.equal(data.format[key],undefined);assert.equal(data.layouts[owner],undefined);assert.deepEqual(validate(data),[]);
});

test('internship editor saves blocks, formats, layouts, visibility and exports JSON, HTML and PDF',async t=>{
  let executablePath;try{executablePath=await browserPath();}catch{t.skip('Install Chrome / Edge to run browser integration');return;}
  const source=fileURLToPath(new URL('../',import.meta.url)),root=await mkdtemp(path.join(os.tmpdir(),'zhijian-internship-'));
  for(const name of ['app','assets/fonts','home.html','editor.html','styles.css'])await cp(path.join(source,name),path.join(root,name),{recursive:true});
  const server=await createResumeServer({projectRoot:root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath,headless:true});t.after(async()=>{await browser.close();await new Promise(resolve=>server.close(resolve));});
  const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  const created=await(await fetch(base+'/api/resumes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'实习编辑测试',description:'',presetId:'blank'})})).json();
  const id=created.document.id,api='/api/resumes/'+id;
  await page.goto(base+'/editor.html?id='+id+'&section=internships',{waitUntil:'load'});
  await page.locator('[data-action="add-entry"][data-type="internships"]').click();
  await page.locator('[data-field="internships.0.title"]').fill('示例机构（虚构）');
  await page.locator('[data-field="internships.0.role"]').fill('研发实习生');
  await page.locator('[data-field="internships.0.dates"]').fill('2025.07–2025.08');
  await page.locator('[data-field="internships.0.department"]').fill('平台开发部');
  assert.equal(await page.locator('[data-field="internships.0.location"]').count(),0);
  const frame=page.frameLocator('#resume-frame');
  const upload=page.waitForEvent('filechooser');await page.locator('[data-action="upload-internship-logo"]').click();
  await (await upload).setFiles({name:'unit-logo.svg',mimeType:'image/svg+xml',buffer:Buffer.from(logoSVG)});
  await frame.locator('.internship-logo').waitFor();
  await page.locator('[data-action="remove-internship-logo"]').click();await frame.locator('.internship-logo').waitFor({state:'hidden'});
  await page.locator('#undo').click();await frame.locator('.internship-logo').waitFor();
  await page.locator('[data-action="add-block"][data-block-type="paragraph"]').click();
  await page.locator('[data-field="internships.0.blocks.0.text"]').fill('两个月的实习，参与内部工具开发。');
  await page.locator('[data-action="add-block"][data-block-type="bullet"]').click();
  await page.locator('[data-field="internships.0.blocks.1.text"]').fill('完成接口联调。\n整理测试和交接文档。');
  await page.locator('select[data-block-type="0.1"]').selectOption('numbered');
  await page.locator('[data-action="move-block"][data-block-index="1"][data-direction="-1"]').click();
  await page.locator('[data-tab="layout"]').click();await page.locator('[data-layout-preset="internship-line"]').click();
  assert.equal(await page.locator('[data-layout-row-target="location"]').count(),0);
  await page.locator('[data-tab="local"]').click();
  const selectedKey=await page.locator('[data-format-target] option').evaluateAll(options=>options.find(o=>o.textContent.includes('内容块 1')).value);
  await page.locator('[data-format-target]').selectOption(selectedKey);
  await page.locator('input[type="text"][data-format="color"]').fill('#743a44');await page.locator('input[type="text"][data-format="color"]').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='已保存到项目');
  let saved=(await(await fetch(base+api+'/data')).json()).data;
  assert.equal(saved.sections.find(s=>s.id==='internships').visible,true);assert.equal(saved.internships[0].blocks[0].type,'numbered');assert.equal(saved.internships[0].blocks[1].type,'paragraph');assert.equal(saved.format[selectedKey].style.color,'#743a44');
  assert.equal(saved.internships[0].logo,logoSource);assert.equal(saved.profile.logo,'');
  await frame.locator('.internship-entry .list-numbered').waitFor();
  const heading=await frame.locator('.internship-entry').evaluate(node=>{
    const rect=selector=>node.querySelector(selector).getBoundingClientRect();
    const company=rect('.internship-company'),department=rect('[data-path="internships.0.department"]'),role=rect('[data-path="internships.0.role"]');
    return {gap:department.left-company.right,sameLine:Math.abs(department.top-role.top)<3,ordered:department.right<role.left,logoLoaded:node.querySelector('.internship-logo').naturalWidth>0};
  });
  assert.ok(heading.gap>=18,JSON.stringify(heading));assert.ok(heading.sameLine&&heading.ordered&&heading.logoLoaded);
  await frame.locator('.internship-entry').screenshot({path:path.join(root,'internship-preview.png')});
  for(const type of ['json','html']){
    await page.locator('#export-button').click();const pending=page.waitForEvent('download');await page.locator('[data-export="'+type+'"]').click();const download=await pending;const content=await readFile(await download.path(),'utf8');
    if(type==='json')assert.deepEqual(JSON.parse(content).internships,saved.internships);else{assert.match(content,/示例机构（虚构）/);assert.match(content,/list-numbered/);assert.ok(content.includes(logoSource));}
  }
  const pdf=await fetch(base+api+'/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(saved)});assert.equal(pdf.status,200);assert.ok((await PDFDocument.load(await pdf.arrayBuffer())).getPageCount()>=1);
  await page.locator('[data-tab="content"]').click();
  const visible=page.locator('.section-editor-header input[type="checkbox"]');await visible.uncheck();await frame.locator('.internship-entry').waitFor({state:'hidden'});
  await page.locator('#undo').click();await frame.locator('.internship-entry').waitFor();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='已保存到项目');
  await page.reload({waitUntil:'load'});await page.locator('[data-action="add-entry"][data-type="internships"]').waitFor();
  saved=(await(await fetch(base+api+'/data')).json()).data;assert.equal(saved.internships[0].role,'研发实习生');assert.equal(saved.internships[0].blocks.length,2);assert.equal(saved.internships[0].logo,logoSource);assert.deepEqual(validate(saved),[]);assert.deepEqual(errors,[]);
  t.diagnostic('Internship preview: '+path.join(root,'internship-preview.png'));
});
