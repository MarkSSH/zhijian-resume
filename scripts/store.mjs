import {readFile,writeFile,mkdir,rename,copyFile,stat,readdir,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {validate,clone} from '../app/model.js';
import {migrate} from '../app/format.js';
import {renderDocument} from '../app/render.js';
import {loadPreset} from './presets.mjs';

export class StoreError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const encode=data=>JSON.stringify(data,null,2)+'\n';
const validId=id=>id==='main'||/^resume_[a-f0-9]{32}$/.test(id);
const preview=data=>({personName:data.profile.name,degree:data.profile.degree,major:data.profile.major,accent:data.styles.accent,sections:data.sections.filter(s=>s.visible).slice(0,4).map(s=>s.title)});
const publicRecord=record=>({...record,revision:hash(JSON.stringify(record))});
const occupiedSlots=library=>library.resumes.length+(library.deleted??[]).filter(record=>record.operation==='restore').length;
// A new generation prevents pre-deletion editors from overwriting a restore.
const dataRevision=(record,raw)=>hash(record.id+'\n'+(record.generation?record.generation+'\n':'')+raw);
const resumeFile=name=>/^resume(?:\.(?:original|previous|pre-v\d+))?\.json$/.test(name);

async function atomicWrite(file,content) {
  await writeFile(file+'.tmp',content,'utf8');
  await rename(file+'.tmp',file);
}
async function exists(file) {
  try { await stat(file); return true; }
  catch(error) { if(error.code==='ENOENT')return false; throw error; }
}
async function backupOnce(from,to) {
  await copyFile(from,to,1).catch(error=>{if(error.code!=='EEXIST')throw error;});
}
function checked(input) {
  let data;
  try { data=migrate(input); } catch { throw new StoreError(400,'资料格式不正确'); }
  const errors=validate(data);
  if(errors.length)throw new StoreError(400,errors.slice(0,3).join('；'));
  return data;
}
function metadata(input) {
  if(!input||typeof input!=='object'||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>80||typeof input.description!=='string'||input.description.length>240)
    throw new StoreError(400,'请填写 1–80 字的简历名称，用途说明不超过 240 字');
  return {name:input.name.trim(),description:input.description.trim()};
}
function checkLibrary(library) {
  if(library?.version!==1||!Array.isArray(library.resumes)||library.resumes.length>100||!Array.isArray(library.deleted??[]))
    throw new Error('简历目录格式不正确，请保留资料并检查 library.json');
  const records=[...library.resumes,...(library.deleted??[])];
  if(new Set(records.map(record=>record.id)).size!==records.length)throw new Error('简历目录包含重复标识');
  for(const record of records) {
    if(!validId(record.id))throw new Error('简历目录包含无效标识');
    metadata(record);
    if(record.operation&&!['restore','purge'].includes(record.operation))throw new Error('回收站操作记录无效');
  }
  return library;
}
function within(root,file) {
  const relative=path.relative(path.resolve(root),path.resolve(file));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('文件路径超出简历目录');
  return path.resolve(file);
}

export async function createResumeStore(projectRoot,{dataRoot:configuredDataRoot}={}) {
  projectRoot=path.resolve(projectRoot);
  const dataRoot=path.resolve(projectRoot,configuredDataRoot||'data');
  const libraryFile=path.join(dataRoot,'library.json'),deletedRoot=path.join(dataRoot,'deleted');
  const mainHTML=dataRoot===path.join(projectRoot,'data')?path.join(projectRoot,'index.html'):path.join(dataRoot,'index.html');
  const paths=id=>{
    if(!validId(id))throw new StoreError(404,'简历不存在');
    const dir=id==='main'?dataRoot:within(path.join(dataRoot,'resumes'),path.join(dataRoot,'resumes',id));
    return {dir,data:path.join(dir,'resume.json'),previous:path.join(dir,'resume.previous.json'),original:path.join(dir,'resume.original.json'),html:id==='main'?mainHTML:path.join(dir,'index.html')};
  };
  const archivePath=id=>{
    if(!validId(id))throw new StoreError(404,'回收站中没有这份简历');
    return within(deletedRoot,path.join(deletedRoot,id));
  };
  const readLibrary=async()=>checkLibrary(JSON.parse(await readFile(libraryFile,'utf8')));
  const writeLibrary=library=>atomicWrite(libraryFile,encode(library));
  const recordFor=async id=>{
    const record=(await readLibrary()).resumes.find(record=>record.id===id);
    if(!record)throw new StoreError(404,'这份简历不存在，请返回工作台');
    return record;
  };
  const read=async id=>{
    const record=await recordFor(id),raw=await readFile(paths(id).data,'utf8');
    return {data:checked(JSON.parse(raw)),revision:dataRevision(record,raw),document:publicRecord(record)};
  };
  async function upgrade(id) {
    const p=paths(id),raw=await readFile(p.data,'utf8'),original=JSON.parse(raw),data=checked(original);
    if(original.version!==data.version) {
      await backupOnce(p.data,p.original);
      await backupOnce(p.data,path.join(p.dir,`resume.pre-v${data.version}.json`));
      await atomicWrite(p.data,encode(data));
    }
    await atomicWrite(p.html,renderDocument(data));
    return data;
  }

  await mkdir(dataRoot,{recursive:true});
  if(!await exists(libraryFile)) {
    const library={version:1,resumes:[],deleted:[]};
    if(await exists(paths('main').data)) {
      const initial=await upgrade('main'),date=(await stat(paths('main').data)).mtime.toISOString();
      library.resumes.push({id:'main',name:'通用简历',description:'现有简历，可作为不同投递方向的基础版本。',createdAt:date,updatedAt:date,preview:preview(initial)});
    } else {
      for(const dir of ['resumes','deleted']) {
        if(await exists(path.join(dataRoot,dir))&&(await readdir(path.join(dataRoot,dir))).length)
          throw new Error('发现已有简历文件但缺少 library.json，请恢复目录文件后启动');
      }
    }
    await writeLibrary(library);
  }

  async function archiveDeleted(record,{requireData=true}={}) {
    const p=paths(record.id),archive=archivePath(record.id);
    await mkdir(deletedRoot,{recursive:true});
    if(record.id==='main') {
      await mkdir(archive,{recursive:true});
      const names=(await readdir(dataRoot)).filter(name=>resumeFile(name)||resumeFile(name.replace(/\.tmp$/,'')));
      for(const name of names)await rename(within(dataRoot,path.join(dataRoot,name)),within(archive,path.join(archive,name)));
      for(const file of [p.html,p.html+'.tmp']) {
        if(await exists(file))await rename(within(path.dirname(p.html),file),within(archive,path.join(archive,path.basename(file))));
      }
    } else if(await exists(p.dir)) {
      await rename(within(path.join(dataRoot,'resumes'),p.dir),archive);
    } else if(!await exists(archive)) {
      if(requireData)throw new StoreError(404,'删除备份文件不存在，请检查本地数据目录');
      await mkdir(archive,{recursive:true});
    }
    if(requireData&&!await exists(path.join(archive,'resume.json')))throw new StoreError(404,'删除备份缺少正文，暂时无法恢复');
    await atomicWrite(path.join(archive,'document.json'),encode(record));
  }

  // Journal intent before touching files. Replaying an interrupted operation
  // never revives a purge or loses a completed restore. rm targets only the
  // validated child of deletedRoot, never the main data directory.
  async function finishRestore(record) {
    const archive=archivePath(record.id),p=paths(record.id);
    await mkdir(p.dir,{recursive:true});
    if(await exists(archive)) {
      for(const name of (await readdir(archive)).filter(resumeFile)) {
        await atomicWrite(within(p.dir,path.join(p.dir,name)),await readFile(within(archive,path.join(archive,name)),'utf8'));
      }
    }
    const data=await upgrade(record.id);
    await rm(archive,{recursive:true,force:true});
    const library=await readLibrary();
    const {deletedAt,operation,restoreToken,...active}=record;
    active.generation=restoreToken;
    active.updatedAt=new Date().toISOString();
    active.preview=preview(data);
    library.deleted=library.deleted.filter(item=>item.id!==record.id);
    library.resumes.push(active);
    await writeLibrary(library);
    return {document:publicRecord(active)};
  }
  async function finishPurge(record) {
    await rm(archivePath(record.id),{recursive:true,force:true});
    const library=await readLibrary();
    library.deleted=library.deleted.filter(item=>item.id!==record.id);
    await writeLibrary(library);
    return {purged:true,id:record.id};
  }
  for(const record of (await readLibrary()).deleted??[]) {
    try {
      if(record.operation==='restore')await finishRestore(record);
      else if(record.operation==='purge')await finishPurge(record);
      else await archiveDeleted(record);
    } catch(error) { console.warn(`回收站操作待重试 (${record.id}): ${error.code||error.message}`); }
  }
  for(const record of (await readLibrary()).resumes)await upgrade(record.id);

  let writes=Promise.resolve();
  const serial=fn=>{const task=writes.then(fn);writes=task.catch(()=>{});return task;};
  const deletedFor=(library,id,revision)=>{
    const record=(library.deleted??[]).find(record=>record.id===id);
    if(!record)throw new StoreError(404,'回收站中没有这份简历，请刷新列表');
    if(revision!==hash(JSON.stringify(record)))throw new StoreError(409,'回收站已有更新，请刷新后重试');
    return record;
  };

  return {
    list:async()=>{const library=await readLibrary();return {resumes:library.resumes.map(publicRecord),deletedCount:(library.deleted??[]).length};},
    trash:async()=>({resumes:((await readLibrary()).deleted??[]).map(publicRecord)}),
    read,
    previous:async id=>{
      await recordFor(id);
      try { return {data:checked(JSON.parse(await readFile(paths(id).previous,'utf8')))}; }
      catch(error) { if(error.code==='ENOENT')throw new StoreError(404,'这份简历还没有上一版保存记录'); throw error; }
    },
    save:(id,input,revision)=>serial(async()=>{
      const record=await recordFor(id),data=checked(input),p=paths(id),raw=await readFile(p.data,'utf8');
      if(revision!==dataRevision(record,raw))throw new StoreError(409,'这份简历已有更新，请先载入最新版本');
      const next=encode(data),savedAt=new Date(Math.max(Date.now(),Date.parse(record.updatedAt)+1||0)).toISOString();
      await atomicWrite(p.previous,raw); await atomicWrite(p.data,next);
      await atomicWrite(p.html,renderDocument(data));
      const library=await readLibrary(),latest=library.resumes.find(record=>record.id===id);
      latest.updatedAt=savedAt; latest.preview=preview(data); await writeLibrary(library);
      return {revision:dataRevision(latest,next),savedAt};
    }),
    create:input=>serial(async()=>{
      const meta=metadata(input),library=await readLibrary();
      if(occupiedSlots(library)>=100)throw new StoreError(400,'最多保存 100 份简历（含正在恢复的简历）');
      if(input.sourceId&&input.presetId)throw new StoreError(400,'请选择复制已有简历或使用预设');
      if(input.presetId&&!['blank','demo'].includes(input.presetId))throw new StoreError(400,'预设不存在');
      const data=input.sourceId?clone((await read(input.sourceId)).data):await loadPreset(input.presetId||'blank');
      checked(data);
      const id='resume_'+randomUUID().replaceAll('-',''),p=paths(id),date=new Date().toISOString();
      const record={id,...meta,createdAt:date,updatedAt:date,preview:preview(data)};
      await mkdir(p.dir,{recursive:true});
      await atomicWrite(p.data,encode(data)); await atomicWrite(p.original,encode(data));
      await atomicWrite(p.html,renderDocument(data));
      library.resumes.push(record); await writeLibrary(library);
      return {document:publicRecord(record)};
    }),
    update:(id,input,revision)=>serial(async()=>{
      const meta=metadata(input),library=await readLibrary(),record=library.resumes.find(record=>record.id===id);
      if(!record)throw new StoreError(404,'简历不存在');
      if(revision!==hash(JSON.stringify(record)))throw new StoreError(409,'简历信息已有更新，请关闭窗口后重新编辑');
      Object.assign(record,meta); await writeLibrary(library); return {document:publicRecord(record)};
    }),
    remove:(id,revision)=>serial(async()=>{
      const library=await readLibrary(),record=library.resumes.find(record=>record.id===id);
      if(!record)throw new StoreError(404,'这份简历已被删除，请刷新工作台');
      if(revision!==hash(JSON.stringify(record)))throw new StoreError(409,'这份简历已有更新，请关闭确认窗口、刷新列表后再删除');
      const deleted={...record,deletedAt:new Date().toISOString()};
      library.resumes=library.resumes.filter(record=>record.id!==id);
      (library.deleted??=[]).push(deleted); await writeLibrary(library);
      await archiveDeleted(deleted).catch(error=>console.warn(`删除备份待整理 (${id}): ${error.code||error.message}`));
      return {deleted:true,id};
    }),
    restore:(id,revision)=>serial(async()=>{
      const library=await readLibrary(),record=deletedFor(library,id,revision);
      if(record.operation==='purge')throw new StoreError(409,'这份简历正在彻底删除，请刷新列表');
      if(!record.operation&&occupiedSlots(library)>=100)throw new StoreError(400,'工作台已达 100 份上限，请先移出一份再恢复');
      if(!record.operation) {
        await archiveDeleted(record);
        checked(JSON.parse(await readFile(path.join(archivePath(id),'resume.json'),'utf8')));
        record.operation='restore'; record.restoreToken=randomUUID(); await writeLibrary(library);
      }
      return finishRestore(record);
    }),
    purge:(id,revision)=>serial(async()=>{
      const library=await readLibrary(),record=deletedFor(library,id,revision);
      if(record.operation==='restore')throw new StoreError(409,'这份简历正在恢复，请刷新列表');
      if(!record.operation) {
        await archiveDeleted(record,{requireData:false});
        record.operation='purge'; await writeLibrary(library);
      }
      return finishPurge(record);
    }),
  };
}
