import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,cp,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createResumeStore} from '../scripts/store.mjs';
import {createResumeServer} from '../scripts/preview.mjs';
import {loadPreset} from '../scripts/presets.mjs';

async function setup(t,{legacy=false}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'zhijian-recycle-'));
  if(legacy){await mkdir(path.join(root,'data'));await writeFile(path.join(root,'data','resume.json'),JSON.stringify(await loadPreset('demo')));}
  const server=await createResumeServer({projectRoot:root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(url,method='GET',data,revision,extra={})=>fetch(base+url,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(revision?{'If-Match':revision}:{}),...extra},...(data?{body:JSON.stringify(data)}:{})});
  return {root,call};
}
const json=async response=>(await response).json();

test('fresh startup, public presets and empty restart do not depend on private or obsolete files',async t=>{
  const {root,call}=await setup(t);
  assert.deepEqual((await json(call('/api/resumes'))).resumes,[]);
  assert.deepEqual((await json(call('/api/trash'))).resumes,[]);
  assert.deepEqual((await json(call('/api/presets'))).presets.map(p=>p.id),['blank','demo']);
  await assert.rejects(stat(path.join(root,'data','resume.json')),error=>error.code==='ENOENT');
  await writeFile(path.join(root,'data','blank-template.json'),'obsolete, deliberately invalid');
  const restarted=await createResumeStore(root);
  const blank=(await restarted.create({name:'空白',description:''})).document;
  assert.deepEqual((await restarted.read(blank.id)).data,await loadPreset('blank'));
  const demo=(await json(call('/api/resumes','POST',{name:'演示',description:'',presetId:'demo'}))).document;
  const doc=await json(call(`/api/resumes/${demo.id}/data`));
  assert.deepEqual(doc.data,await loadPreset('demo'));assert.match(doc.data.profile.extra,/虚构/);
  doc.data.styles.fontSize=16;doc.data.profile.name='私人内容';
  await call(`/api/resumes/${demo.id}/data`,'PUT',doc.data,doc.revision);
  const next=(await restarted.create({name:'不继承个人资料',description:''})).document;
  assert.deepEqual((await restarted.read(next.id)).data,await loadPreset('blank'));
  assert.equal((await call('/api/resumes','POST',{name:'非法预设',description:'',presetId:'../data/resume'})).status,400);
  assert.equal((await call('/api/resumes','POST',{name:'冲突来源',description:'',presetId:'blank',sourceId:demo.id})).status,400);
});

test('restore retains IDs, metadata, rich content and previous backup but invalidates old editor revisions',async t=>{
  const {root,call}=await setup(t,{legacy:true});
  for(const id of ['main',(await json(call('/api/resumes','POST',{name:'副本',description:'保留用途',presetId:'demo'}))).document.id]){
    const before=await json(call(`/api/resumes/${id}/data`));
    const changed=structuredClone(before.data);changed.evaluation='恢复后应保留的内容';
    changed.format['profile.name']={style:{color:'#30455e'},marks:[{start:0,end:2,style:{fontWeight:700}}]};
    changed.styles.lineHeight=1.5;
    assert.equal((await call(`/api/resumes/${id}/data`,'PUT',changed,before.revision)).status,200);
    const saved=await json(call(`/api/resumes/${id}/data`));
    assert.equal((await call(`/api/resumes/${id}`,'DELETE',undefined,saved.document.revision)).status,200);
    let trash=(await json(call('/api/trash'))).resumes.find(r=>r.id===id);
    assert.equal((await call(`/api/trash/${id}/restore`,'POST',undefined,'stale')).status,409);
    assert.equal((await call(`/api/trash/${id}/restore`,'POST',undefined,trash.revision,{Origin:'https://foreign.example'})).status,403);
    assert.equal((await call(`/api/trash/${id}/restore`,'POST',undefined,trash.revision)).status,200);
    const restored=await json(call(`/api/resumes/${id}/data`));
    assert.equal(restored.document.name,saved.document.name);assert.equal(restored.document.description,saved.document.description);
    assert.deepEqual(restored.data,changed);assert.deepEqual((await json(call(`/api/resumes/${id}/previous`))).data,before.data);
    assert.notEqual(restored.revision,saved.revision);
    assert.equal((await call(`/api/resumes/${id}/data`,'PUT',changed,saved.revision)).status,409);
    assert.equal((await call(`/api/trash/${id}`,'DELETE',undefined,trash.revision)).status,404);
    await assert.rejects(stat(path.join(root,'data','deleted',id)),e=>e.code==='ENOENT');
    // A second delete and restore must not collide with the earlier archive.
    assert.equal((await call(`/api/resumes/${id}`,'DELETE',undefined,restored.document.revision)).status,200);
    trash=(await json(call('/api/trash'))).resumes.find(r=>r.id===id);
    assert.equal((await call(`/api/trash/${id}/restore`,'POST',undefined,trash.revision)).status,200);
  }
  assert.equal((await json(call('/api/trash'))).resumes.length,0);
  const restarted=await createResumeStore(root);assert.equal((await restarted.list()).resumes.length,2);
});

test('permanent deletion removes only the chosen archive and cannot target active or unrelated files',async t=>{
  const {root,call}=await setup(t,{legacy:true});
  await mkdir(path.join(root,'assets'));await writeFile(path.join(root,'assets','photo.jpg'),'shared');
  const other=(await json(call('/api/resumes','POST',{name:'保留',description:'',presetId:'demo'}))).document;
  const otherDoc=await json(call(`/api/resumes/${other.id}/data`));
  let main=await json(call('/api/resumes/main/data'));
  assert.equal((await call('/api/trash/main','DELETE',undefined,main.document.revision)).status,404);
  await call('/api/resumes/main','DELETE',undefined,main.document.revision);
  const trash=(await json(call('/api/trash'))).resumes[0];
  assert.equal((await call('/api/trash/main','DELETE',undefined,'stale')).status,409);
  assert.equal((await call('/api/trash/..%2Fresumes','DELETE',undefined,trash.revision)).status,404);
  assert.equal((await call('/api/trash/main','DELETE',undefined,trash.revision,{Origin:'https://foreign.example'})).status,403);
  assert.equal((await call('/api/trash/main','DELETE',undefined,trash.revision)).status,200);
  await assert.rejects(stat(path.join(root,'data','deleted','main')),e=>e.code==='ENOENT');
  assert.deepEqual((await json(call(`/api/resumes/${other.id}/data`))).data,otherDoc.data);
  assert.equal(await readFile(path.join(root,'assets','photo.jpg'),'utf8'),'shared');
  assert.equal((await call('/api/trash/main/restore','POST',undefined,trash.revision)).status,404);
  assert.equal((await json(call('/api/trash'))).resumes.length,0);
  const restarted=await createResumeStore(root);assert.equal((await restarted.list()).resumes.length,1);assert.equal((await restarted.trash()).resumes.length,0);
  // Missing or corrupt backup content must still be removable from the bin.
  const active=await restarted.read(other.id);await restarted.remove(other.id,active.document.revision);
  await rm(path.join(root,'data','deleted',other.id,'resume.json'));
  const broken=(await restarted.trash()).resumes[0];await restarted.purge(other.id,broken.revision);
  assert.equal((await restarted.trash()).resumes.length,0);
});

test('interrupted restore and purge complete on restart without reviving permanently deleted data',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'zhijian-recovery-')),store=await createResumeStore(root);
  const restore=(await store.create({name:'恢复操作',description:'',presetId:'demo'})).document;
  const purge=(await store.create({name:'删除操作',description:''})).document;
  const original=(await store.read(restore.id)).data;
  await store.remove(restore.id,restore.revision);await store.remove(purge.id,purge.revision);
  const file=path.join(root,'data','library.json'),library=JSON.parse(await readFile(file,'utf8'));
  Object.assign(library.deleted.find(r=>r.id===restore.id),{operation:'restore',restoreToken:'recovery-generation'});
  library.deleted.find(r=>r.id===purge.id).operation='purge';await writeFile(file,JSON.stringify(library));
  // Simulate the point after restored files exist and the archive was removed,
  // but before the final catalog commit.
  await cp(path.join(root,'data','deleted',restore.id),path.join(root,'data','resumes',restore.id),{recursive:true});
  await rm(path.join(root,'data','deleted',restore.id),{recursive:true});
  await rm(path.join(root,'data','deleted',purge.id),{recursive:true});
  const restarted=await createResumeStore(root);
  assert.deepEqual((await restarted.read(restore.id)).data,original);
  assert.deepEqual((await restarted.trash()).resumes,[]);
  await assert.rejects(restarted.read(purge.id),e=>e.status===404);
});

test('custom data directory isolates saves, restoration and purge from the source checkout',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'zhijian-source-')),dataRoot=await mkdtemp(path.join(os.tmpdir(),'zhijian-data-'));
  await writeFile(path.join(root,'index.html'),'do not change');
  await writeFile(path.join(dataRoot,'resume.json'),JSON.stringify(await loadPreset('demo')));
  const store=await createResumeStore(root,{dataRoot});const first=await store.read('main');
  await store.remove('main',first.document.revision);
  let trash=(await store.trash()).resumes[0];await store.restore('main',trash.revision);
  const restored=await store.read('main');assert.deepEqual(restored.data,first.data);
  await store.remove('main',restored.document.revision);trash=(await store.trash()).resumes[0];await store.purge('main',trash.revision);
  assert.equal(await readFile(path.join(root,'index.html'),'utf8'),'do not change');
  await assert.rejects(stat(path.join(root,'data')),e=>e.code==='ENOENT');
});
