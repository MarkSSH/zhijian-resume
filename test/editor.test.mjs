import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validate,clone,blankEntry,sectionLabels} from '../app/model.js';
import {renderResume} from '../app/render.js';
import {createResumeServer} from '../scripts/preview.mjs';
import {migrate,fieldKey,ownerKey,layoutFor,rowMode,applyRange,updateText,dropEntryMetadata,newBlock,orderedProfile,arrangeProfile,cleanListPrefixes} from '../app/format.js';

const seed={
  version:1,
  profile:{name:'测试姓名',authorName:'Test A',major:'测试专业',degree:'博士研究生',phone:'',email:'',politics:'',birth:'',extra:'',logo:'',photo:'',logoMode:'contain',showLogo:true,showPhoto:true},
  styles:{accent:'#30455e',paper:'#ffffff',fontSize:12,lineHeight:1.65,sectionGap:14,pageMargin:42,photoWidth:82,logoSize:88,chineseFont:'sans',showEnglish:true,showPlaceholders:true},
  sections:Object.entries(sectionLabels).map(([id,title])=>({id,title,english:id.toUpperCase(),visible:true})),
  education:[blankEntry('education')],projects:[],patents:[],awards:[],skills:[],campus:[],evaluation:'',
  publications:[{...blankEntry('publications'),title:'Published title',authors:'Test A',group:'published'},{...blankEntry('publications'),title:'Pending title',authors:'Test A',status:'在审',group:'pending'}],
};
test('imports reject malformed fields, oversized values and unsafe image URLs',()=>{
  assert.deepEqual(validate(seed),[]);
  for(const edit of [d=>d.styles.accent='red;}body{display:none',d=>d.profile.photo='javascript:alert(1)',d=>d.styles.fontSize=NaN,d=>d.sections.push(d.sections[0]),d=>d.publications[0].title=null,d=>d.education='broken']){
    const data=clone(seed);edit(data);assert.ok(validate(data).length);
  }
});
test('renderer escapes text and preserves publication order without grouping',()=>{
  const data=clone(seed);data.profile.name='<img src=x onerror=alert(1)>';data.publications.reverse();
  const html=renderResume(data);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal((html.match(/class="publication-number"/g)||[]).length,2);
  assert.equal((html.match(/status-tag status-pending/g)||[]).length,1);
  assert.equal((html.match(/class="publications"/g)||[]).length,1);
  assert.ok(!html.includes('publication-group-label'));assert.ok(html.indexOf('Pending title')<html.indexOf('Published title'));
  delete data.publications[0].group;data.publications[0].status='返修';assert.deepEqual(validate(data),[]);
  assert.ok(renderResume(data).includes('class="status-tag status-pending">返修'));
  data.publications[0].status='已录用';assert.ok(!renderResume(data).includes('status-pending'));
  data.sections.find(s=>s.id==='research').visible=false;
  assert.ok(!renderResume(data).includes('data-editor-section="research"'));
});
test('local server persists, backs up, rejects stale writes and prevents cross-origin/private-file access',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'resume-editor-test-'));
  await mkdir(path.join(root,'data'));
  await writeFile(path.join(root,'data','resume.json'),JSON.stringify(seed));
  const server=await createResumeServer({projectRoot:root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const original=await (await fetch(base+'/api/resume')).json();
  assert.equal(original.data.version,4);
  assert.equal(JSON.parse(await readFile(path.join(root,'data','resume.pre-v4.json'),'utf8')).version,1);
  const data=clone(original.data);data.profile.name='自动化测试';
  const put=(revision,body=data,extra={})=>fetch(base+'/api/resume',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':revision,...extra},body:JSON.stringify(body)});
  const saved=await put(original.revision);assert.equal(saved.status,200);
  const latest=await saved.json();assert.notEqual(latest.revision,original.revision);
  assert.equal(JSON.parse(await readFile(path.join(root,'data','resume.json'),'utf8')).profile.name,'自动化测试');
  assert.ok((await readFile(path.join(root,'index.html'),'utf8')).includes('自动化测试'));
  assert.equal(JSON.parse(await readFile(path.join(root,'data','resume.previous.json'),'utf8')).profile.name,seed.profile.name);
  assert.equal((await put(original.revision)).status,409);
  assert.equal((await put(latest.revision,data,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await put(latest.revision,{version:1})).status,400);
  for(const url of ['/data/resume.json','/docs/resume.md','/%2e%2e%5cdata/resume.json','/.codex/config.toml'])assert.equal((await fetch(base+url)).status,404);
  const first=clone(data),second=clone(data);first.profile.name='窗口一';second.profile.name='窗口二';
  const concurrent=await Promise.all([put(latest.revision,first),put(latest.revision,second)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
});
test('v1 migration preserves content and assigns stable identities; layouts and styles survive reordering',()=>{
  const source=clone(seed);source.projects=[{...blankEntry('projects'),title:'项目甲'},{...blankEntry('projects'),title:'项目乙'}];
  const data=migrate(source),key=fieldKey(data,'projects.0.title'),owner=ownerKey(data,'projects',0);
  assert.equal(source.version,1);assert.deepEqual(migrate(data),data);assert.equal(data.projects[0].title,source.projects[0].title);
  data.format[key]={style:{color:'#743a44'},marks:[{start:0,end:2,style:{fontWeight:700}}]};
  data.layouts[owner]=layoutFor(data,'projects',0);[data.projects[0],data.projects[1]]=[data.projects[1],data.projects[0]];
  assert.equal(fieldKey(data,'projects.1.title'),key);assert.deepEqual(validate(data),[]);
  dropEntryMetadata(data,'projects',1);data.projects.splice(1,1);assert.equal(data.format[key],undefined);assert.equal(data.layouts[owner],undefined);assert.deepEqual(validate(data),[]);
  for(const type of ['profile','education','publications']){const owner=ownerKey(data,type,0);data.layouts[owner]=layoutFor(data,type,0);assert.deepEqual(validate(data),[]);}
});
test('text-range formats split, clear and rebase across insertion and deletion',()=>{
  let marks=applyRange([],10,1,8,{color:'#743a44'});marks=applyRange(marks,10,3,5,{fontWeight:700});
  assert.deepEqual(marks.map(m=>[m.start,m.end]),[[1,3],[3,5],[5,8]]);
  marks=applyRange(marks,10,4,6,{},true);assert.deepEqual(marks.map(m=>[m.start,m.end]),[[1,3],[3,4],[6,8]]);
  const data=migrate(seed);data.profile.name='ABCDEFGHIJ';data.format['profile.name']={style:{},marks:[{start:2,end:6,style:{color:'#743a44'}}]};
  updateText(data,'profile.name','ABCxxDEFGHIJ');assert.deepEqual(data.format['profile.name'].marks,[{start:2,end:8,style:{color:'#743a44'}}]);assert.deepEqual(validate(data),[]);
  updateText(data,'profile.name','ABHIJ');assert.deepEqual(data.format['profile.name'].marks,[]);assert.deepEqual(validate(data),[]);
  data.profile.name='AAAA';data.format['profile.name'].marks=[{start:2,end:4,style:{color:'#743a44'}}];
  updateText(data,'profile.name','AAAAA',{start:0,end:0});assert.deepEqual(data.format['profile.name'].marks,[{start:3,end:5,style:{color:'#743a44'}}]);
});
test('format and layout validation rejects malformed ranges, unknown properties and duplicate fields',()=>{
  const source=migrate(seed);source.format['profile.name']={style:{fontSize:20},marks:[]};assert.deepEqual(validate(source),[]);
  for(const edit of [d=>d.format['profile.name'].style.color='red;display:none',d=>d.format['profile.name'].style.fontSize=NaN,d=>d.format['profile.name'].style.position='absolute',d=>d.format['profile.name'].marks=[{start:0,end:100,style:{color:'#000000'}}],d=>d.format['profile.name'].marks=[{start:0,end:2,style:{}},{start:1,end:3,style:{}}],d=>d.layouts.profile={rows:[['name','name']],right:[],gap:8},d=>d.publications[1].id=d.publications[0].id]){const data=clone(source);edit(data);assert.ok(validate(data).length);}
});
test('shared renderer exports rich formatting, lists and explicit field row order',()=>{
  const source=clone(seed);source.projects=[{...blankEntry('projects'),title:'Test <Title>',organization:'研究所',role:'负责人',dates:'2024–2026',description:'第一条\n第二条'}];const data=migrate(source);
  const key=fieldKey(data,'projects.0.title');data.format[key]={style:{fontSize:14},marks:[{start:0,end:4,style:{color:'#743a44'}}]};
  data.projects[0].blocks[0].type='numbered';
  data.layouts[ownerKey(data,'projects',0)]={rows:[['title','organization','role','dates'],['tech'],['description']],right:['dates'],gap:10};
  assert.deepEqual(validate(data),[]);const html=renderResume(data);
  assert.ok(html.includes('color:#743a44!important'));assert.ok(html.includes('&lt;Title&gt;'));assert.ok(html.includes('list-numbered'));assert.ok(html.includes('第一条</span>\n<span class="rich-line">第二条'));
  const row=html.slice(html.indexOf('data-layout-row="0"'),html.indexOf('data-layout-row="2"'));
  assert.ok(row.indexOf('data-layout-field="title"')<row.indexOf('data-layout-field="organization"'));
  assert.ok(row.indexOf('data-layout-field="role"')<row.indexOf('data-layout-field="dates"'));
});
test('row modes preserve legacy layouts and distinguish continuous text from a trailing aligned group',()=>{
  const data=migrate(seed),owner=ownerKey(data,'publications',0);
  data.publications[0].venue='International Conference';
  data.layouts[owner]={rows:[['authors','title','venue'],['year','status','supplement']],right:[],gap:4};
  const layout=layoutFor(data,'publications',0);assert.deepEqual(layout.rowModes,['auto','auto']);assert.equal(rowMode(layout,0),'flow');
  const html=renderResume(data);assert.ok(html.includes('class="field-row row-flow row-joined"'));assert.ok(!html.includes('cell-primary'));
  assert.ok(html.includes('<span data-path="publications.0.title"'));assert.ok(html.includes('<cite data-path="publications.0.venue"'));
  assert.ok(!html.includes('<h3 data-path="publications.0.title"'));
  layout.right=['venue'];assert.equal(rowMode(layout,0),'split');layout.rowModes[0]='flow';assert.equal(rowMode(layout,0),'flow');
  data.layouts[owner]=layout;assert.deepEqual(validate(data),[]);
  for(const modes of [['flow'],['columns','flow'],null]){data.layouts[owner].rowModes=modes;assert.ok(validate(data).length);}
});

test('v2 migration preserves project prose, range formats and existing profile order',()=>{
  const source=migrate(seed);source.version=2;delete source.profile.nativePlace;delete source.profile.ethnicity;
  source.layouts.profile={rows:[['name'],['email','phone','major'],['degree','politics','birth','extra']],right:[],gap:7};
  const description='1. 保留手动序号\n2. 保留完整原文';
  source.projects=[{...blankEntry('projects'),description}];
  const oldKey=fieldKey(source,'projects.0.description');source.format[oldKey]={style:{listType:'numbered',color:'#314567'},marks:[{start:3,end:5,style:{fontWeight:700}}]};
  const migrated=migrate(source),block=migrated.projects[0].blocks[0],key=fieldKey(migrated,'projects.0.blocks.0.text');
  assert.deepEqual(validate(migrated),[]);assert.equal(source.version,2);assert.equal(source.projects[0].description,description);
  assert.equal(migrated.profile.nativePlace,'');assert.equal(migrated.profile.ethnicity,'');assert.equal(block.text,description);assert.equal(block.type,'numbered');
  assert.equal(migrated.projects[0].description,undefined);assert.equal(migrated.format[oldKey],undefined);
  assert.deepEqual(migrated.format[key],{style:{color:'#314567'},marks:source.format[oldKey].marks});
  assert.deepEqual(orderedProfile(migrated.layouts.profile),['email','phone','major','degree','politics','birth','extra','nativePlace','ethnicity']);
  assert.equal(migrated.layouts.profile.gap,7);assert.deepEqual(migrate(migrated),migrated);
  for(const bad of [null,0,false,undefined,{}]){const invalid=clone(source);invalid.projects[0].description=bad;assert.ok(validate(migrate(invalid)).length);}
});

test('content blocks keep formatting across reordering and reject invalid structure',()=>{
  assert.equal(cleanListPrefixes('1. 第一点\n2、第二点\n（一）第三点\n•第四点\n3.5% 的提升\n2024 年的实验'),'第一点\n第二点\n第三点\n第四点\n3.5% 的提升\n2024 年的实验');
  const source=clone(seed);source.projects=[blankEntry('projects')];const data=migrate(source);
  data.projects[0].blocks=[{...newBlock(),text:'背景描述'},{...newBlock('bullet'),text:'职责一\n职责二'}];
  const key=fieldKey(data,'projects.0.blocks.1.text');data.format[key]={style:{fontSize:13},marks:[{start:0,end:3,style:{color:'#334455'}}]};
  data.projects[0].blocks.reverse();assert.equal(fieldKey(data,'projects.0.blocks.0.text'),key);assert.deepEqual(validate(data),[]);
  updateText(data,'projects.0.blocks.0.text','新职责一\n职责二',{start:0,end:0});assert.equal(data.format[key].marks[0].end,4);
  const layout=layoutFor(data,'profile',0),order=orderedProfile(layout).reverse();arrangeProfile(layout,order);data.layouts.profile=layout;assert.deepEqual(validate(data),[]);assert.deepEqual(orderedProfile(layout),order);
  for(const edit of [d=>d.projects[0].blocks=null,d=>d.projects[0].blocks[0].type='unknown',d=>d.projects[0].blocks[0].text=null,d=>d.projects[0].blocks[0].id='unsafe id',d=>d.projects[0].blocks[1].id=d.projects[0].blocks[0].id,d=>d.projects[0].blocks=Array.from({length:101},()=>newBlock())]){const invalid=clone(data);edit(invalid);assert.ok(validate(invalid).length);}
  dropEntryMetadata(data,'projects',0);data.projects=[];assert.equal(data.format[key],undefined);assert.deepEqual(validate(data),[]);
});
