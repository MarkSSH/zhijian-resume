import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createResumeServer} from '../scripts/preview.mjs';
import {createResumeStore} from '../scripts/store.mjs';
import {migrate,layoutFor,ownerKey,fieldKey} from '../app/format.js';
import {blankEntry,sectionLabels,validate,clone} from '../app/model.js';
import {renderResume} from '../app/render.js';

function fixture(){const publication={...blankEntry('publications'),title:'Source paper',authors:'Test A',venue:'Example Journal',status:'返修',group:'pending'};delete publication.supplement;return {version:3,profile:{name:'原始姓名',authorName:'Test A',major:'研究方向',degree:'博士',phone:'',email:'',politics:'',birth:'',nativePlace:'',ethnicity:'',extra:'',logo:'',photo:'',logoMode:'contain',showLogo:true,showPhoto:true},styles:{accent:'#30455e',paper:'#ffffff',fontSize:12,lineHeight:1.65,sectionGap:14,pageMargin:42,photoWidth:82,logoSize:88,chineseFont:'sans',showEnglish:true,showPlaceholders:true},sections:Object.entries(sectionLabels).filter(([id])=>id!=='internships').map(([id,title])=>({id,title,english:id,visible:true})),education:[],projects:[],publications:[publication],patents:[],awards:[],skills:[],campus:[],evaluation:'原始评价',format:{},layouts:{},sectionStyles:{}};}
async function setup(t){const root=await mkdtemp(path.join(os.tmpdir(),'paper-library-'));await mkdir(path.join(root,'data'));const original=fixture();await writeFile(path.join(root,'data','resume.json'),JSON.stringify(original));const server=await createResumeServer({projectRoot:root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;const call=(url,method='GET',data,revision,extra={})=>fetch(base+url,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(revision?{'If-Match':revision}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});return {root,original,call};}

test('supplement migration keeps custom row placement, field formats and original content',()=>{
 const source=fixture(),owner=ownerKey(source,'publications',0);source.layouts[owner]={rows:[['title','status','authors'],['venue','year']],rowModes:['flow','flow'],right:[],gap:4};
 const titleKey=fieldKey(source,'publications.0.title');source.format[titleKey]={style:{fontSize:13},marks:[{start:0,end:6,style:{fontWeight:700}}]};
 const data=migrate(source);assert.equal(data.version,6);assert.equal(data.publications[0].supplement,'');assert.deepEqual(data.layouts[owner].rows[0],['title','status','supplement','authors']);assert.deepEqual(data.format,source.format);assert.deepEqual(migrate(data),data);assert.deepEqual(validate(data),[]);assert.equal(source.publications[0].supplement,undefined);
 data.publications[0].supplement='JCR Q1 · 示例说明 <script>';const html=renderResume(data);assert.ok(html.includes('publication-supplement'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.indexOf('data-layout-field="status"')<html.indexOf('data-layout-field="supplement"'));
 data.publications[0].supplement=null;assert.ok(validate(data).length);
});

test('library creates independent copies and blanks with isolated revisions, backups and metadata',async t=>{
 const {root,original,call}=await setup(t),initial=await(await call('/api/resumes/main/data')).json();
 assert.deepEqual(initial.data,migrate(original));assert.deepEqual(JSON.parse(await readFile(path.join(root,'data','resume.pre-v6.json'),'utf8')),original);assert.equal((await(await call('/api/resume')).json()).revision,initial.revision);
 const createResponse=await call('/api/resumes','POST',{name:'算法投递版',description:'强调模型研究',sourceId:'main'});assert.equal(createResponse.status,201);const created=(await createResponse.json()).document,id=created.id,copy=await(await call(`/api/resumes/${id}/data`)).json();assert.deepEqual(copy.data,initial.data);assert.notEqual(copy.revision,initial.revision);
 const edit=clone(copy.data);edit.profile.name='副本姓名';edit.publications[0].supplement='示例补充说明';const key=fieldKey(edit,'publications.0.supplement');edit.format[key]={style:{color:'#375c50'},marks:[]};
 assert.equal((await call(`/api/resumes/${id}/data`,'PUT',edit,initial.revision)).status,409);
 const saved=await call(`/api/resumes/${id}/data`,'PUT',edit,copy.revision);assert.equal(saved.status,200);assert.deepEqual((await(await call('/api/resumes/main/data')).json()).data,initial.data);assert.deepEqual((await(await call(`/api/resumes/${id}/previous`)).json()).data,copy.data);assert.equal((await call('/api/resumes/main/previous')).status,404);
 const blankResponse=await call('/api/resumes','POST',{name:'从空白开始',description:''}),blankId=(await blankResponse.json()).document.id,blank=(await(await call(`/api/resumes/${blankId}/data`)).json()).data;assert.equal(blank.profile.name,'');assert.equal(blank.evaluation,'');assert.equal(blank.publications.length,0);assert.deepEqual(blank.format,{});assert.deepEqual(validate(blank),[]);
 const library=await(await call('/api/resumes')).json(),record=library.resumes.find(r=>r.id===id);assert.equal(record.preview.personName,'副本姓名');
 const rename=await call(`/api/resumes/${id}`,'PATCH',{name:'科研版',description:'新的用途说明'},record.revision);assert.equal(rename.status,200);assert.equal((await call(`/api/resumes/${id}`,'PATCH',{name:'过期修改',description:''},record.revision)).status,409);assert.deepEqual((await(await call(`/api/resumes/${id}/data`)).json()).data,edit);
 const restarted=await createResumeStore(root);assert.equal((await restarted.list()).resumes.length,3);assert.equal((await restarted.read(id)).document.name,'科研版');assert.deepEqual((await restarted.read(id)).data,edit);
 const view=await call(`/view/${id}`);assert.equal(view.status,200);const html=await view.text();assert.ok(html.includes('副本姓名'));assert.ok(html.includes('示例补充说明'));assert.ok(html.includes('<base href="/">'));
});

test('library validates metadata and keeps private storage and other versions protected',async t=>{
 const {call}=await setup(t);
 for(const data of [{name:'',description:''},{name:'A'.repeat(81),description:''},{name:'OK',description:'x'.repeat(241)},{name:'OK',description:2}])assert.equal((await call('/api/resumes','POST',data)).status,400);
 assert.equal((await call('/api/resumes','POST',{name:'OK',description:'',sourceId:'../main'})).status,404);
 assert.equal((await call('/api/resumes','POST',{name:'OK',description:''},undefined,{Origin:'https://foreign.example'})).status,403);
 for(const url of ['/data/library.json','/data/resumes/main/resume.json','/api/resumes/missing/data','/view/..%2Fmain'])assert.equal((await call(url)).status,404);
 const record=await(await call('/api/resumes/main/data')).json(),a=clone(record.data),b=clone(record.data);a.evaluation='窗口甲';b.evaluation='窗口乙';const responses=await Promise.all([call('/api/resumes/main/data','PUT',a,record.revision),call('/api/resumes/main/data','PUT',b,record.revision)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});

test('deletion archives only the selected resume and rejects stale or foreign requests',async t=>{
 const {root,call}=await setup(t),main=await(await call('/api/resumes/main/data')).json();
 const copy=(await(await call('/api/resumes','POST',{name:'待删除版本',description:'独立副本',sourceId:'main'})).json()).document,id=copy.id;
 const url=`/api/resumes/${id}`,data=await(await call(url+'/data')).json();
 assert.equal((await call(url,'DELETE')).status,409);
 assert.equal((await call(url,'DELETE',undefined,main.document.revision)).status,409);
 assert.equal((await call(url,'DELETE',undefined,copy.revision,{Origin:'https://foreign.example'})).status,403);
 const edited=clone(data.data);edited.evaluation='删除前最后保存的正文';
 assert.equal((await call(url+'/data','PUT',edited,data.revision)).status,200);
 assert.equal((await call(url,'DELETE',undefined,copy.revision)).status,409);
 const latest=await(await call(url+'/data')).json();
 assert.equal((await call(url,'DELETE',undefined,latest.document.revision)).status,200);
 for(const endpoint of [url+'/data',url+'/previous',`/view/${id}`])assert.equal((await call(endpoint)).status,404);
 assert.equal((await call(url+'/data','PUT',edited,latest.revision)).status,404);
 assert.equal((await call(url,'DELETE',undefined,latest.document.revision)).status,404);
 assert.equal((await call('/api/resumes','POST',{name:'不能再复制',description:'',sourceId:id})).status,404);
 assert.deepEqual((await(await call('/api/resumes/main/data')).json()).data,main.data);
 assert.equal((await(await call('/api/resumes')).json()).resumes.length,1);
 const archive=path.join(root,'data','deleted',id);
 assert.deepEqual(JSON.parse(await readFile(path.join(archive,'resume.json'),'utf8')),edited);
 assert.deepEqual(JSON.parse(await readFile(path.join(archive,'resume.previous.json'),'utf8')),data.data);
 assert.equal(JSON.parse(await readFile(path.join(archive,'document.json'),'utf8')).name,copy.name);
 await assert.rejects(readFile(path.join(root,'data','resumes',id,'resume.json')),error=>error.code==='ENOENT');
 assert.equal((await call(`/data/deleted/${id}/resume.json`)).status,404);
 const restarted=await createResumeStore(root);assert.equal((await restarted.list()).resumes.length,1);await assert.rejects(restarted.read(id),error=>error.status===404);
});

test('original and last resume can be deleted, with safe empty-library restart and new blanks',async t=>{
 const {root,call}=await setup(t),main=await(await call('/api/resumes/main/data')).json();
 await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'assets','photo.jpg'),'shared asset');
 const source=clone(main.data);source.styles.fontSize=13;await call('/api/resumes/main/data','PUT',source,main.revision);
 const latest=await(await call('/api/resumes/main/data')).json();
 assert.equal((await call('/api/resumes/main','DELETE',undefined,latest.document.revision)).status,200);
 assert.deepEqual((await(await call('/api/resumes')).json()).resumes,[]);
 for(const url of ['/index.html','/api/resume','/api/previous','/view/main'])assert.equal((await call(url)).status,404);
 assert.equal(await readFile(path.join(root,'assets','photo.jpg'),'utf8'),'shared asset');
 await assert.rejects(readFile(path.join(root,'data','resume.json')),error=>error.code==='ENOENT');
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'data','deleted','main','resume.json'),'utf8')),source);
 const restarted=await createResumeStore(root);assert.deepEqual((await restarted.list()).resumes,[]);
 const created=await restarted.create({name:'重新开始',description:''}),blank=await restarted.read(created.document.id);
 assert.notEqual(created.document.id,'main');assert.equal(blank.data.profile.name,'');assert.equal(blank.data.profile.photo,'');assert.equal(blank.data.evaluation,'');assert.deepEqual(blank.data.publications,[]);assert.deepEqual(blank.data.format,{});assert.equal(blank.data.styles.fontSize,12);assert.deepEqual(validate(blank.data),[]);
 const blankCopy=await restarted.create({name:'新副本',description:'',sourceId:created.document.id});assert.deepEqual((await restarted.read(blankCopy.document.id)).data,blank.data);
 assert.equal((await(await call('/api/resumes')).json()).resumes.length,2);
});

test('concurrent deletion and save cannot revive a resume, and interrupted archiving resumes',async t=>{
 const {root,call}=await setup(t),main=await(await call('/api/resumes/main/data')).json();
 const copy=(await(await call('/api/resumes','POST',{name:'并发版本',description:'',sourceId:'main'})).json()).document,url='/api/resumes/'+copy.id,data=await(await call(url+'/data')).json();
 const changed=clone(data.data);changed.evaluation='另一个窗口的新内容';
 const results=await Promise.all([call(url,'DELETE',undefined,copy.revision),call(url+'/data','PUT',changed,data.revision)]);
 const [deleted,saved]=results.map(r=>r.status);assert.ok(deleted===200&&saved===404||deleted===409&&saved===200);
 if(deleted===409){const current=await(await call(url+'/data')).json();assert.equal((await call(url,'DELETE',undefined,current.document.revision)).status,200);}
 const libraryFile=path.join(root,'data','library.json'),library=JSON.parse(await readFile(libraryFile,'utf8')),record=library.resumes.find(r=>r.id==='main');
 library.resumes=[];(library.deleted??=[]).push({...record,deletedAt:new Date().toISOString()});await writeFile(libraryFile,JSON.stringify(library));
 const restarted=await createResumeStore(root);assert.deepEqual((await restarted.list()).resumes,[]);
 assert.deepEqual(JSON.parse(await readFile(path.join(root,'data','deleted','main','resume.json'),'utf8')),main.data);
 await assert.rejects(readFile(path.join(root,'index.html')),error=>error.code==='ENOENT');
 const restartedAgain=await createResumeStore(root);assert.deepEqual((await restartedAgain.list()).resumes,[]);
});
