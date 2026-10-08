const $=s=>document.querySelector(s),cover=$('#cover'),studio=$('#studio'),dialog=$('#resume-dialog');
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let records=[],trashed=[],presets=[],editing=null,transitioning=false,submitting=false,toastTimer,collection='library',loadVersion=0;
const deleteDialog=$('#delete-dialog');
let deleting=null,deleteBusy=false,deleteMode='trash',restoring=false;
const editorURL=id=>'/editor.html?id='+encodeURIComponent(id);
function toast(message){$('#home-toast').textContent=message;$('#home-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#home-toast').hidden=true,3000);}
async function request(url,options){const response=await fetch(url,options);let result;try{result=await response.json();}catch{throw new Error('暂时无法连接工作台，请刷新重试。');}if(!response.ok)throw new Error(result.error||'操作未完成，请重试');return result;}
function dateLabel(value){const date=new Date(value);return Number.isNaN(date.getTime())?'最近编辑':'更新于 '+new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);}
const iconPaths={
 arrow:'M5 12h14M13 6l6 6-6 6',
 diagonal:'M6 18 18 6M6 6h12v12',
 edit:'m14 5 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z',
 copy:'M9 9h11v11H9zM5 15H4V4h11v1',
 trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
 clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 plus:'M12 5v14M5 12h14',
};
const uiIcon=name=>`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;
function render(){
 $('#resume-count').textContent=String(records.length).padStart(2,'0');
 $('#resume-grid').innerHTML=records.map((record,i)=>{
  const p=record.preview||{},accent=/^#[0-9a-f]{6}$/i.test(p.accent)?p.accent:'#30455e';
  const name=e(record.name),id=e(record.id),href=editorURL(record.id);
  const description=e(record.description||'添加用途说明，记下这一版要去的方向。');
  return `<article class="resume-card" style="--card-index:${Math.min(i,8)}">
    <a class="resume-thumbnail" href="${href}" aria-label="编辑 ${name}">
      <span class="thumbnail-caption" aria-hidden="true">${String(i+1).padStart(2,'0')} / RESUME</span>
      <div class="mini-paper" aria-hidden="true" style="--resume-accent:${accent}">
        <div class="mini-name">${e(p.personName||'你的姓名')}</div>
        <div class="mini-degree">${e(p.degree||p.major||'写下你的经历')}</div>
        <div class="mini-rule"></div>
        <div class="mini-section"></div><div class="mini-lines"></div><div class="mini-lines short"></div>
        <div class="mini-section"></div><div class="mini-lines"></div><div class="mini-lines short"></div>
      </div>
      <span class="thumbnail-open" aria-hidden="true">${uiIcon('diagonal')}</span>
    </a>
    <div class="resume-card-body">
      <div class="card-title-row"><h3><a href="${href}">${name}</a></h3><button class="card-edit" data-edit="${id}" aria-label="修改 ${name} 的名称和说明" title="修改名称与说明">${uiIcon('edit')}</button></div>
      <p class="card-description" title="${description}">${description}</p>
      <time class="card-updated" datetime="${e(record.updatedAt)}">${uiIcon('clock')}${e(dateLabel(record.updatedAt))}</time>
      <div class="card-footer">
        <div class="card-actions"><button data-copy="${id}" aria-label="复制 ${name}">${uiIcon('copy')}复制</button><button class="card-delete" data-delete="${id}" aria-label="删除 ${name}">${uiIcon('trash')}删除</button></div>
        <a class="card-open" href="${href}" aria-label="继续编辑 ${name}">继续编辑${uiIcon('arrow')}</a>
      </div>
    </div>
  </article>`;
 }).join('')+`<button class="new-card" data-new><span class="new-paper" aria-hidden="true">${uiIcon('plus')}</span><strong>新建一份简历</strong><small>空白开始，或沿用已有内容。</small><span class="new-card-link">写下新的可能${uiIcon('arrow')}</span></button>`;
}
function renderTrash(){
 $('#trash-count').textContent=String(trashed.length);
 $('#trash-empty').hidden=trashed.length>0;
 $('#trash-list').innerHTML=trashed.map(record=>`<article class="trash-item"><div class="trash-copy"><h3>${e(record.name)}</h3><p>${e(record.description||'未填写用途说明')}</p><time datetime="${e(record.deletedAt||'')}">${e(dateLabel(record.deletedAt).replace('更新于','删除于'))}</time>${record.operation?`<span class="trash-pending">${record.operation==='restore'?'恢复尚未完成，可重试':'彻底删除尚未完成，可重试'}</span>`:''}</div><div class="trash-actions"><button class="secondary-button" data-restore="${record.id}"${record.operation==='purge'?' disabled':''} aria-label="恢复 ${e(record.name)}">${record.operation==='restore'?'重试恢复':'恢复'}</button><button class="trash-purge" data-purge="${record.id}"${record.operation==='restore'?' disabled':''} aria-label="彻底删除 ${e(record.name)}">彻底删除</button></div></article>`).join('');
}
function showCollection(next){
 collection=next;
 $('#resume-grid').hidden=next==='trash';$('#trash-panel').hidden=next!=='trash';
 for(const [id,value] of [['show-library','library'],['show-trash','trash']]){const button=$('#'+id);button.classList.toggle('is-active',next===value);button.setAttribute('aria-pressed',String(next===value));}
}
async function load(){
 const version=++loadVersion,message=$('#library-message');message.hidden=false;message.classList.remove('is-error');message.textContent='正在打开你的简历集…';
 try{const [library,trash,presetList]=await Promise.all([request('/api/resumes'),request('/api/trash'),request('/api/presets')]);if(version!==loadVersion)return;records=library.resumes;trashed=trash.resumes;presets=presetList.presets;render();renderTrash();showCollection(collection);message.hidden=true;}
 catch(error){if(version!==loadVersion)return;message.classList.add('is-error');message.textContent=error.message+' 点击下方“刷新列表”重试。';}
}
async function showStudio(animate=true){if(transitioning||!studio.hidden)return;transitioning=true;studio.hidden=false;studio.inert=false;cover.inert=true;if(animate){cover.classList.add('scene-transition');studio.classList.add('scene-transition');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);}studio.classList.add('is-visible');cover.classList.add('is-leaving');history.replaceState(null,'','/#studio');$('#studio-title').focus({preventScroll:true});const duration=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches?850:0;setTimeout(()=>{cover.hidden=true;cover.classList.remove('scene-transition');studio.classList.remove('scene-transition');transitioning=false;},duration);load();}
function showCover(){if(transitioning||cover.hidden===false)return;transitioning=true;cover.hidden=false;cover.inert=false;studio.inert=true;cover.classList.add('scene-transition');studio.classList.add('scene-transition');requestAnimationFrame(()=>{cover.classList.remove('is-leaving');studio.classList.remove('is-visible');$('#enter-studio').focus({preventScroll:true});});history.replaceState(null,'','/');setTimeout(()=>{studio.hidden=true;studio.classList.remove('scene-transition');cover.classList.remove('scene-transition');transitioning=false;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:750);}
function openForm(record=null,copy=false){editing=copy?null:record;$('#resume-form').reset();$('#form-error').hidden=true;$('#resume-source').innerHTML=(presets.length?presets:[{id:'blank',name:'空白简历'}]).map(p=>`<option value="preset:${e(p.id)}">${e(p.name)}</option>`).join('')+records.map(r=>`<option value="${r.id}">复制：${e(r.name)}</option>`).join('');$('#resume-name').value=record?record.name+(copy?' · 副本':''):'';$('#resume-description').value=record?.description||'';$('#resume-source').value=copy?record.id:'preset:blank';$('#source-label').hidden=!!editing;$('#source-hint').hidden=!!editing;$('#dialog-title').textContent=editing?'简历名称与用途':'新建一份简历';$('#dialog-eyebrow').textContent=editing?'GIVE IT A DIRECTION':'A NEW CHAPTER';$('#dialog-intro').textContent=editing?'这些信息用于工作台区分版本，不会印在简历上。':'给它一个名字，记下它要去的方向。';$('#save-resume').textContent=editing?'保存修改':'创建并编辑 ↗';sourceHint();dialog.showModal();$('#resume-name').focus();}
function sourceHint(){const source=$('#resume-source').value;$('#source-hint').textContent=source.startsWith('preset:')?(presets.find(p=>'preset:'+p.id===source)?.description||'从默认版式与空白内容开始。'):'复制正文、版式与局部格式，原简历保持独立。';}
function openDelete(record,mode='trash'){
 if(!record||deleteBusy)return;deleting=record;deleteMode=mode;
 $('#delete-title').textContent=mode==='purge'?'彻底删除这份简历？':'移入回收站？';
 $('#delete-description').textContent=mode==='purge'?'将永久删除这份简历及其回收站内的历史备份，此操作无法撤销。已导出的文件不受影响。':'确认后将从工作台移除，可在回收站恢复。';
 $('#cancel-delete').textContent=mode==='purge'?'取消':'保留简历';
 $('#confirm-delete').textContent=mode==='purge'?'彻底删除':'移入回收站';
 $('#delete-document-name').textContent=record.name;$('#delete-error').hidden=true;deleteDialog.showModal();$('#cancel-delete').focus();
}
$('#cancel-delete').addEventListener('click',()=>{if(!deleteBusy)deleteDialog.close();});
deleteDialog.addEventListener('cancel',event=>{if(deleteBusy)event.preventDefault();});
deleteDialog.addEventListener('close',()=>{deleting=null;});
$('#confirm-delete').addEventListener('click',async()=>{
 if(!deleting||deleteBusy)return;
 const record=deleting;deleteBusy=true;$('#confirm-delete').disabled=true;$('#cancel-delete').disabled=true;$('#confirm-delete').textContent='正在删除…';$('#delete-error').hidden=true;
 try{
  const mode=deleteMode;++loadVersion;
  await request((mode==='purge'?'/api/trash/':'/api/resumes/')+record.id,{method:'DELETE',headers:{'If-Match':record.revision}});
  try{localStorage.removeItem(record.id==='main'?'paper-resume-draft-v1':'paper-resume-draft-'+record.id);}catch{}
  if(mode==='purge')trashed=trashed.filter(r=>r.id!==record.id);else records=records.filter(r=>r.id!==record.id);
  render();renderTrash();deleteDialog.close();$(mode==='purge'?'#show-trash':'#new-resume').focus();toast((mode==='purge'?'已彻底删除“':'已移入回收站“')+record.name+'”');await load();
 }catch(error){$('#delete-error').textContent=error.message;$('#delete-error').hidden=false;await load();}
 finally{deleteBusy=false;$('#confirm-delete').disabled=false;$('#cancel-delete').disabled=false;$('#confirm-delete').textContent=deleteMode==='purge'?'彻底删除':'移入回收站';}
});
$('#show-library').addEventListener('click',()=>showCollection('library'));
$('#show-trash').addEventListener('click',()=>{showCollection('trash');load();});
$('#trash-list').addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||restoring)return;
 if(button.dataset.purge){openDelete(trashed.find(r=>r.id===button.dataset.purge),'purge');return;}
 const record=trashed.find(r=>r.id===button.dataset.restore);if(!record)return;
 restoring=true;button.disabled=true;button.textContent='正在恢复…';++loadVersion;
 try{const result=await request('/api/trash/'+record.id+'/restore',{method:'POST',headers:{'If-Match':record.revision}});trashed=trashed.filter(r=>r.id!==record.id);records=records.filter(r=>r.id!==record.id).concat(result.document);render();renderTrash();await load();toast('已恢复“'+record.name+'”，可在我的简历中继续编辑。');$('#show-library').focus();}
 catch(error){toast(error.message);await load();}
 finally{restoring=false;}
});
$('#enter-studio').addEventListener('click',()=>showStudio());$('#back-cover').addEventListener('click',showCover);$('#refresh-library').addEventListener('click',load);$('#new-resume').addEventListener('click',()=>openForm());
$('#resume-grid').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-new'))openForm();else if(button.dataset.edit)openForm(records.find(r=>r.id===button.dataset.edit));else if(button.dataset.copy)openForm(records.find(r=>r.id===button.dataset.copy),true);else if(button.dataset.delete)openDelete(records.find(r=>r.id===button.dataset.delete));});
for(const id of ['close-dialog','cancel-dialog'])$('#'+id).addEventListener('click',()=>{if(!submitting)dialog.close();});dialog.addEventListener('cancel',event=>{if(submitting)event.preventDefault();});$('#resume-source').addEventListener('change',sourceHint);
$('#resume-form').addEventListener('submit',async event=>{event.preventDefault();if(submitting)return;submitting=true;$('#save-resume').disabled=true;$('#form-error').hidden=true;const payload={name:$('#resume-name').value,description:$('#resume-description').value};if(!editing){const source=$('#resume-source').value;if(source.startsWith('preset:'))payload.presetId=source.slice(7);else if(source)payload.sourceId=source;}try{const result=await request(editing?'/api/resumes/'+editing.id:'/api/resumes',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json',...(editing?{'If-Match':editing.revision}:{})},body:JSON.stringify(payload)});if(editing){dialog.close();await load();toast('名称与用途说明已更新');}else location.href=editorURL(result.document.id);}catch(error){$('#form-error').textContent=error.message;$('#form-error').hidden=false;}finally{submitting=false;$('#save-resume').disabled=false;}});
window.addEventListener('pageshow',event=>{if(event.persisted&&!studio.hidden)load();});
if(location.hash==='#studio')showStudio(false);
