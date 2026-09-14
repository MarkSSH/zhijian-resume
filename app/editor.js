import {fields,sectionLabels,styleRanges,optionalStyleDefaults,blankEntry,clone,getPath,setPath,validate} from './model.js';
import {renderResume,renderDocument,themeCSS,icons,escapeHTML as e} from './render.js';
import {migrate,updateText,dropEntryMetadata,newBlock,fieldKey,cleanListPrefixes} from './format.js';
import {createAdvanced} from './advanced.js';
import {paginationUnits} from './pagination.js';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),resumeId=params.get('id')||'main',API='/api/resumes/'+encodeURIComponent(resumeId);
const frame=$('#resume-frame'),panel=$('#panel-body');
const A4_WIDTH=210*96/25.4,A4_HEIGHT=297*96/25.4;
const LOCAL_KEY=resumeId==='main'?'paper-resume-draft-v1':'paper-resume-draft-'+resumeId;
let documentName='';
let data,revision,openingData,activeSection='profile',activeTab='content',previewOnly=false;
let dirty=false,saving=false,saveTimer,saveBlocked=false,localDraft=null,changeNumber=0;
let undoStack=[],redoStack=[],inputSession=null,resizeFrame,measureTimer,zoom='fit',openEntries=new Set();
let importCandidate=null,toastTimer,renderVersion=0;
let pdfBusy=false,verifiedPdf=null,fitUndoFingerprint=null;
const connectedDocuments=new WeakSet();
if(['profile',...Object.keys(sectionLabels)].includes(params.get('section')))activeSection=params.get('section');
if(['content','style','local','layout'].includes(params.get('tab')))activeTab=params.get('tab');
const advanced=createAdvanced({getData:()=>data,getSection:()=>activeSection,setSection:value=>activeSection=value,setTab:value=>activeTab=value,mutate,renderPanel,renderPreview,frame,panel,toast});

function status(text,type=''){const node=$('#save-status');node.textContent=text;node.className='save-status '+type;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3000);}
function notice(text,actions=[]){const node=$('#notice');node.replaceChildren();node.append(document.createTextNode(text));for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',fn);node.append(b);}node.hidden=false;}
function clearNotice(){$('#notice').hidden=true;}
function storeDraft(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify({data,baseRevision:revision,updatedAt:Date.now()}));}catch{toast('浏览器暂存空间不足，请保持页面打开并保存到项目。');}}
function updateHistory(){$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;}
function remember(){undoStack.push(clone(data));if(undoStack.length>60)undoStack.shift();redoStack=[];updateHistory();}
function changed(){dirty=true;changeNumber++;invalidatePdf();storeDraft();if(!saveBlocked)status('等待保存…','unsaved');clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,750);}
function editField(path,value){const edit=advanced.takeTextEdit(path);if(getPath(data,path)===value)return;if(inputSession!==path){remember();inputSession=path;}if(typeof value==='string')updateText(data,path,value,edit);else if(path.startsWith('styles.')&&Object.hasOwn(optionalStyleDefaults,path.slice(7)))data.styles[path.slice(7)]=value;else setPath(data,path,value);advanced.clearRange();changed();}
function mutate(fn,message){inputSession=null;remember();fn();changed();renderPreview();renderPanel();if(message)toast(message);}
function history(direction){const source=direction==='undo'?undoStack:redoStack,target=direction==='undo'?redoStack:undoStack;if(!source.length)return;target.push(clone(data));data=source.pop();inputSession=null;advanced.clearRange();changed();renderPanel();renderPreview();updateHistory();}

async function saveNow(){
  clearTimeout(saveTimer);if(!data||!dirty||saving||saveBlocked)return;
  const errors=validate(data);if(errors.length){status('资料需要调整','error');notice(errors[0]);return;}
  saving=true;status('正在保存…');const snapshot=clone(data),number=changeNumber;
  try{
    const response=await fetch(API+'/data',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':revision},body:JSON.stringify(snapshot)});
    const result=await response.json();
    if(response.status===409){
      saveBlocked=true;status('版本冲突','error');
      notice('另一个窗口或项目文件已有更新。当前修改已暂存，请选择接下来使用的版本。',[
        ['载入项目版本',()=>resolveConflict(false)],['保留我的修改',()=>resolveConflict(true)],['下载我的备份',()=>exportFile('json')]
      ]);return;
    }
    if(!response.ok)throw new Error(result.error||'保存失败');
    revision=result.revision;
    if(number===changeNumber){dirty=false;status('已保存到项目');try{localStorage.removeItem(LOCAL_KEY);}catch{}}
    else{storeDraft();status('正在保存新修改…');}
    $('#retry-save').hidden=true;
  }catch(error){status('未保存到项目','error');$('#retry-save').hidden=false;notice(`${error.message}。修改仍保留在当前页面，可重试保存或导出备份。`,[['重试',()=>{clearNotice();saveNow();}],['导出备份',()=>exportFile('json')]]);}
  finally{saving=false;if(dirty&&!saveBlocked&&$('#retry-save').hidden)saveTimer=setTimeout(saveNow,200);}
}
async function resolveConflict(keepMine){
  try{
    const response=await fetch(API+'/data');if(!response.ok)throw new Error('无法读取最新版本');const latest=await response.json();latest.data=migrate(latest.data);
    const errors=validate(latest.data);if(errors.length)throw new Error(errors[0]);
    revision=latest.revision;saveBlocked=false;clearNotice();
    if(keepMine){dirty=true;saveNow();}else{remember();data=latest.data;dirty=false;try{localStorage.removeItem(LOCAL_KEY);}catch{}renderPanel();renderPreview();status('已载入项目版本');}
  }catch(error){toast(error.message);}
}

function field(path,label,type='text',placeholder=''){
  const value=getPath(data,path)??'';
  const control=type==='textarea'?`<textarea data-field="${path}" placeholder="${e(placeholder)}" rows="3">${e(value)}</textarea>`:
    `<input data-field="${path}" type="${type}" value="${e(value)}" placeholder="${e(placeholder)}" autocomplete="off">`;
  return `<label class="field"><span>${e(label)}</span>${control}</label>`;
}
const checkbox=(path,label)=>`<label class="toggle-label"><input type="checkbox" data-field="${path}"${getPath(data,path)?' checked':''}>${e(label)}</label>`;
function assetCard(key,label){const image=data.profile[key];const markup=key==='logo'&&data.profile.logoMode==='emblem'?`<svg viewBox="0 0 360 360" aria-label="校徽预览"><image href="${e(image)}" width="1504" height="360"/></svg>`:`<img src="${e(image)}" alt="${label}预览">`;return `<div class="image-card"><div class="asset-top"><span>${label}</span>${checkbox(`profile.show${key==='logo'?'Logo':'Photo'}`,'显示')}</div><div class="asset-preview">${image?markup:'暂无图片'}</div><button class="button secondary" data-action="upload" data-image="${key}">替换${label}</button></div>`;}
function profileForm(){return `<div class="section-editor-header"><h2>基本信息</h2></div><p class="section-helper">写下你的名字，让经历成为主角。</p><div class="field-grid">${field('profile.name','姓名')}${field('profile.authorName','论文中的姓名')}</div><div class="field-grid">${field('profile.major','专业 / 研究领域')}${field('profile.degree','身份 / 学位')}</div>${field('profile.phone','联系电话','tel')}${field('profile.email','电子邮箱','email')}<div class="field-grid">${field('profile.politics','政治面貌')}${field('profile.birth','出生年月')}</div>${field('profile.nativePlace','户籍地','text','填写户籍所在省、市或地区')}${field('profile.ethnicity','民族','text','按本人情况填写')}<button class="add-entry" data-action="profile-layout">调整字段顺序与列间距 ↗</button><div class="form-divider"></div>${field('profile.extra','补充信息','text','例如：求职意向、个人主页')}<div class="form-divider"></div><span class="field-label">校徽与个人照片</span><div class="image-grid">${assetCard('logo','校徽')}${assetCard('photo','照片')}</div><label class="field"><span>校徽显示方式</span><select data-field="profile.logoMode"><option value="contain"${data.profile.logoMode==='contain'?' selected':''}>完整显示图片</option><option value="emblem"${data.profile.logoMode==='emblem'?' selected':''}>横向组合图，仅显示左侧校徽</option></select></label><p class="muted-note">支持 PNG、JPEG、WebP、SVG，每张不超过 2 MB。替换后可在“样式调整”中修改尺寸。</p>`;}
function projectBlocks(index){
  const blocks=data.projects[index].blocks;
  return `<div class="project-block-editor"><div class="subgroup-title">项目正文<span>段落与分点可混排</span></div>
    ${blocks.map((block,j)=>`<section class="content-block-card" data-content-block="${block.id}">
      <div class="content-block-heading"><span>内容块 ${j+1}</span><div class="entry-tools"><button data-action="move-block" data-index="${index}" data-block-index="${j}" data-direction="-1" aria-label="上移内容块 ${j+1}"${j===0?' disabled':''}>↑</button><button data-action="move-block" data-index="${index}" data-block-index="${j}" data-direction="1" aria-label="下移内容块 ${j+1}"${j===blocks.length-1?' disabled':''}>↓</button><button data-action="remove-block" data-index="${index}" data-block-index="${j}" aria-label="删除内容块 ${j+1}">×</button></div></div>
      <label class="field"><span>呈现方式</span><select data-block-type="${index}.${j}"><option value="paragraph"${block.type==='paragraph'?' selected':''}>普通段落</option><option value="bullet"${block.type==='bullet'?' selected':''}>圆点列表</option><option value="numbered"${block.type==='numbered'?' selected':''}>编号列表</option></select></label>
      ${field(`projects.${index}.blocks.${j}.text`,block.type==='paragraph'?'段落正文':'分点内容（每行一点，无需手写序号）','textarea')}
      ${block.type!=='paragraph'?`<button class="clean-prefix" data-action="clean-block-prefix" data-index="${index}" data-block-index="${j}">清理已有的手动序号</button>`:''}
    </section>`).join('')}
    <div class="block-add-actions"><button data-action="add-block" data-index="${index}" data-block-type="paragraph">＋ 段落块</button><button data-action="add-block" data-index="${index}" data-block-type="bullet">＋ 分点块</button></div>
    <p class="muted-note">段落直接书写；列表每行一个要点，符号自动生成。可混排、切换类型和调整顺序。</p>
  </div>`;
}
function entryCards(type,label){
  return (data[type].length?data[type].map((entry,index)=>{
    const key=`${type}.${index}`,title=entry.title||entry.school||entry.text||entry.category||`新${label}`;
    return `<details class="entry-card" data-entry-key="${key}"${openEntries.has(key)?' open':''}><summary><span class="entry-label" title="${e(title)}">${index+1}. ${e(title)}</span><span class="entry-tools"><button type="button" data-action="move-entry" data-type="${type}" data-index="${index}" data-direction="-1" aria-label="上移${label} ${index+1}"${index===0?' disabled':''}>↑</button><button type="button" data-action="move-entry" data-type="${type}" data-index="${index}" data-direction="1" aria-label="下移${label} ${index+1}"${index===data[type].length-1?' disabled':''}>↓</button><button type="button" class="remove" data-action="remove-entry" data-type="${type}" data-index="${index}" aria-label="删除${label} ${index+1}">×</button></span></summary><div class="entry-fields">${fields[type].filter(([key])=>type!=='projects'||key!=='description').map(([key,label,input])=>field(`${type}.${index}.${key}`,label,input)).join('')}${type==='projects'?projectBlocks(index):''}</div></details>`;
  }).join(''):`<div class="empty-list">还没有${label}，添加一条开始整理。</div>`)+`<button class="add-entry" data-action="add-entry" data-type="${type}">＋ 添加${label}</button>`;
}
function sectionForm(){const index=data.sections.findIndex(s=>s.id===activeSection),section=data.sections[index];
  return `<div class="section-editor-header"><h2>${e(sectionLabels[activeSection])}</h2>${checkbox(`sections.${index}.visible`,'显示模块')}</div><p class="section-helper">调整条目顺序，保留最能说明能力的内容。</p><div class="order-tools"><button data-action="move-section" data-direction="-1"${index===0?' disabled':''}>↑ 模块上移</button><button data-action="move-section" data-direction="1"${index===data.sections.length-1?' disabled':''}>↓ 模块下移</button></div><div class="field-grid">${field(`sections.${index}.title`,'模块标题')}${field(`sections.${index}.english`,'英文副标题')}</div>${activeSection==='research'?`<div class="subgroup-title">论文<span>PUBLICATIONS · ${data.publications.length}</span></div>${entryCards('publications','论文')}<div class="subgroup-title">专利<span>PATENTS · ${data.patents.length}</span></div>${entryCards('patents','专利')}`:activeSection==='evaluation'?field('evaluation','个人评价','textarea','结合具体经历描述特点，避免空泛评价。'):entryCards(activeSection,{education:'教育经历',projects:'项目',awards:'奖项',skills:'技能',campus:'学生工作'}[activeSection])}`;
}
function contentPanel(){const names={profile:'基本信息',education:'教育背景',projects:'项目经历',research:'科研成果',awards:'荣誉奖项',skills:'个人技能',campus:'学生工作',evaluation:'个人评价'};return `<nav class="nav-grid" aria-label="简历模块">${['profile',...data.sections.map(s=>s.id)].map(id=>`<button data-section="${id}" class="${id===activeSection?'selected ':''}${data.sections.find(s=>s.id===id)?.visible===false?'is-hidden':''}" aria-pressed="${id===activeSection}">${names[id]}</button>`).join('')}</nav>${activeSection==='profile'?profileForm():sectionForm()}`;}
const rangeNames={fontSize:['正文字号','px'],lineHeight:['正文行距','倍'],sectionGap:['模块间距','px'],pageMargin:['页面左右留白','px'],photoWidth:['照片宽度','px'],logoSize:['校徽尺寸','px'],spacingScale:['条目间距系数','倍'],pageVerticalMargin:['页面上下留白','px']};
function rangeField(key){const [min,max,step]=styleRanges[key],[label,unit]=rangeNames[key],value=data.styles[key]??optionalStyleDefaults[key];return `<label class="range-field"><span class="range-top"><span>${label}</span><output data-output="styles.${key}">${value} ${unit}</output></span><input type="range" data-field="styles.${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"></label>`+(key==='pageMargin'?rangeField('pageVerticalMargin')+rangeField('spacingScale'):'');}
function stylePanel(){return `<h2 class="style-title">让版式更适合你</h2><p class="section-helper" style="margin-top:7px">少一点装饰，多一点清晰。</p><div class="style-section" style="margin-top:0;padding-top:0;border:0"><h3>主题配色</h3><div class="color-swatches">${[['#30455e','石墨蓝'],['#243d69','学院蓝'],['#743a44','酒红'],['#375c50','墨绿'],['#333333','经典黑']].map(([color,label])=>`<button class="swatch${data.styles.accent===color?' active':''}" data-action="theme" data-color="${color}" style="--swatch:${color}" aria-label="${label}" title="${label}"></button>`).join('')}</div><label class="color-field">自定义主题色<input type="color" data-field="styles.accent" value="${data.styles.accent}"></label><label class="color-field">纸面颜色<input type="color" data-field="styles.paper" value="${data.styles.paper}"></label></div><div class="style-section"><h3>字体与阅读节奏</h3><div class="fixed-font"><span>英文字体</span><strong>Georgia</strong></div><label class="field"><span>中文字体</span><select data-field="styles.chineseFont"><option value="sans"${data.styles.chineseFont==='sans'?' selected':''}>简洁黑体 · 微软雅黑 / 苹方</option><option value="serif"${data.styles.chineseFont==='serif'?' selected':''}>学术宋体 · 宋体 / 华文宋体</option></select></label>${rangeField('fontSize')}${rangeField('lineHeight')}</div><div class="style-section"><h3>页面与图片</h3>${rangeField('sectionGap')}${rangeField('pageMargin')}${rangeField('photoWidth')}${rangeField('logoSize')}</div><div class="style-section"><h3>显示选项</h3><label class="switch-row">模块英文副标题<input type="checkbox" data-field="styles.showEnglish"${data.styles.showEnglish?' checked':''}></label><label class="switch-row">待补充提示<input type="checkbox" data-field="styles.showPlaceholders"${data.styles.showPlaceholders?' checked':''}></label><p class="muted-note">关闭待补充提示后，空白模块仍保留标题。可在“内容编辑”中隐藏整个模块。</p></div><div class="style-section"><button class="button secondary" data-action="reset-style">恢复本次打开时的样式</button></div>`;}
function renderPanel(){if(!data)return;const scroll=panel.scrollTop;panel.innerHTML=activeTab==='style'?stylePanel():activeTab==='local'?advanced.localPanel():activeTab==='layout'?advanced.layoutPanel():contentPanel();panel.scrollTop=scroll;updateTabs();advanced.updateTarget();}
function updateTabs(){for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===activeTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);}panel.setAttribute('aria-labelledby',activeTab+'-tab');}

function frameEditingCSS(){return `html,body{padding:0!important;margin:0!important;background:transparent!important;overflow:hidden!important}.resume-page{margin:0!important;max-width:none!important;box-shadow:none!important;width:${A4_WIDTH}px!important}.workspace-note{display:none!important}.resume-page [contenteditable=true]{outline:none;cursor:text;border-radius:2px}.resume-page [contenteditable=true]:hover{background:#e8eff752;box-shadow:0 0 0 2px #7394bf25}.resume-page [contenteditable=true]:focus{background:#eff5fd;box-shadow:0 0 0 2px #6488b955}.resume-page [data-editor-section].selected-section .section-heading h2{color:var(--accent)}.resume-page [data-path]:empty{min-width:8px;min-height:1em;display:inline-block}`;}
function prepareFrame(){
  const doc=frame.contentDocument;if(!doc||!data||!doc.querySelector('.resume-page'))return;
  if(connectedDocuments.has(doc)){renderPreview();return;}
  connectedDocuments.add(doc);
  let css=doc.querySelector('#editor-frame-css');if(!css){css=doc.createElement('style');css.id='editor-frame-css';doc.head.append(css);}css.textContent=frameEditingCSS();
  doc.addEventListener('click',event=>{if(!previewOnly&&event.target.closest('a'))event.preventDefault();});
  doc.addEventListener('focusin',event=>{
    const target=event.target.closest('[data-path]');if(!target||previewOnly)return;inputSession=null;
    advanced.chooseField(target.dataset.path);
    const section=target.closest('[data-editor-section]')?.dataset.editorSection;if(section){activeSection=section;const entry=target.closest('[data-entry]')?.dataset.entry;if(entry)openEntries.add(entry);renderPanel();}
  });
  doc.addEventListener('input',event=>{
    const node=event.target.closest('[data-path]');if(!node||previewOnly)return;
    const path=node.dataset.path,value=node.textContent.replace(/\r/g,'');editField(path,value);
    const field=panel.querySelector(`[data-field="${path}"]`);if(field)field.value=value;
    updateSummary(path);$('#document-name').textContent=documentName||((data.profile.name||'未命名')+'的简历');measureSoon();
  });
  advanced.bindFrame(doc);
  doc.addEventListener('focusout',()=>{inputSession=null;setTimeout(()=>{if(!doc.activeElement?.closest('[contenteditable=true]'))renderPreview();},0);});
  doc.addEventListener('keydown',keyboardHistory);
  resizeFrame?.disconnect();resizeFrame=new ResizeObserver(measureSoon);resizeFrame.observe(doc.body);
  renderPreview();
}
function renderPreview(){
  const doc=frame.contentDocument;if(!data||!doc?.querySelector('.resume-page'))return;
  if(verifiedPdf&&verifiedPdf.fingerprint!==JSON.stringify(data))invalidatePdf();
  renderVersion++;
  doc.querySelector('.resume-page').outerHTML=renderResume(data);
  if(!doc.querySelector('.icon-definitions'))doc.body.insertAdjacentHTML('afterbegin',icons);
  let theme=doc.querySelector('#resume-theme');if(!theme){theme=doc.createElement('style');theme.id='resume-theme';doc.head.append(theme);}theme.textContent=themeCSS(data);
  for(const node of doc.querySelectorAll('[data-path]')){
    if(!previewOnly){node.setAttribute('contenteditable','true');node.setAttribute('spellcheck','false');node.setAttribute('aria-label','编辑 '+node.dataset.path);}
    else node.removeAttribute('contenteditable');
  }
  $('#document-name').textContent=documentName||((data.profile.name||'未命名')+'的简历');
  doc.querySelectorAll('img,image').forEach(img=>img.addEventListener('load',measureSoon,{once:true}));
  measureSoon();
}
function updateSummary(path){const [type,index,key]=path.split('.');if(['title','school','text','category'].includes(key)){const node=panel.querySelector(`[data-entry-key="${type}.${index}"] .entry-label`);if(node){const value=getPath(data,path);node.textContent=`${Number(index)+1}. ${value||'未命名条目'}`;node.title=value;}}}
function measureSoon(){clearTimeout(measureTimer);measureTimer=setTimeout(measure,50);}
function measure(){
  const paper=frame.contentDocument?.querySelector('.resume-page');if(!paper||!data)return;
  const height=Math.ceil(paper.getBoundingClientRect().height);frame.style.height=height+'px';
  const container=$('#preview-scroll'),pad=parseFloat(getComputedStyle(container).paddingLeft)+parseFloat(getComputedStyle(container).paddingRight);
  const scale=zoom==='fit'?Math.min(1.15,Math.max(.2,(container.clientWidth-pad-2)/A4_WIDTH)):Number(zoom);
  $('#preview-surface').style.transform=`scale(${scale})`;
  $('#preview-sizer').style.width=A4_WIDTH*scale+'px';$('#preview-sizer').style.height=height*scale+'px';
  const guides=$('#page-guides');guides.innerHTML='';
  const pages=Math.ceil((height-.5)/A4_HEIGHT);
  if($('#guide-toggle').checked&&!previewOnly){
    const verified=verifiedPdf?.fingerprint===JSON.stringify(data);
    const marks=verified?(verifiedPdf.pagination?.breaks||[]).filter(b=>!b.split).flatMap(b=>{const unit=paginationUnits(data).find(u=>u.key===b.key),node=unit&&frame.contentDocument.querySelector(unit.selector);return node?[{top:node.getBoundingClientRect().top-paper.getBoundingClientRect().top-3,label:`PDF 第 ${b.page} 页从此开始`}]:[];}):Array.from({length:pages-1},(_,i)=>({top:(i+1)*A4_HEIGHT,label:'估算长度线 · 非实际分页'}));
    for(const mark of marks){const line=document.createElement('div');line.className='page-boundary'+(verified?' verified':'');line.style.top=mark.top+'px';const label=document.createElement('span');label.textContent=mark.label;line.append(label);guides.append(line);}
  }
  $('#layout-status').textContent=verifiedPdf?.fingerprint===JSON.stringify(data)?`PDF 已校验：${verifiedPdf.pages} 页 A4 · 查看分页可核对实际断页`:`长页预览约 ${pages} 页 · 参考线不含打印留白，实际分页以 PDF 为准`;
}

panel.addEventListener('focusin',event=>{inputSession=null;const path=event.target.dataset.field;if(path&&!path.startsWith('styles.')&&typeof getPath(data,path)==='string')advanced.chooseField(path);});
panel.addEventListener('input',event=>{
  const target=event.target;if(!target.dataset.field||target.type==='checkbox'||target.tagName==='SELECT')return;
  const value=target.type==='range'?Number(target.value):target.value,path=target.dataset.field;
  editField(path,value);updateSummary(path);
  const output=panel.querySelector(`[data-output="${path}"]`);if(output)output.textContent=value+' '+rangeNames[path.split('.')[1]][1];
  renderPreview();
});
panel.addEventListener('change',event=>{
  const target=event.target;
  if(target.hasAttribute('data-block-type')){const [i,j]=target.dataset.blockType.split('.').map(Number);mutate(()=>data.projects[i].blocks[j].type=target.value);return;}
  if(!target.dataset.field)return;
  if(target.type==='checkbox'||target.tagName==='SELECT'){
    const path=target.dataset.field;mutate(()=>setPath(data,path,target.type==='checkbox'?target.checked:target.value));
  }inputSession=null;
});
panel.addEventListener('toggle',event=>{const key=event.target.dataset.entryKey;if(key){if(event.target.open)openEntries.add(key);else openEntries.delete(key);}},true);
panel.addEventListener('click',event=>{
  const nav=event.target.closest('[data-section]');if(nav){activeSection=nav.dataset.section;renderPanel();panel.scrollTop=0;return;}
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;event.preventDefault();event.stopPropagation();
  const {action,type,index,direction}=button.dataset;
  if(action==='profile-layout'){activeTab='layout';activeSection='profile';renderPanel();panel.scrollTop=0;return;}
  if(action==='add-block'){
    const project=data.projects[Number(index)];if(project.blocks.length>=100){toast('每个项目最多支持 100 个内容块');return;}
    const block=newBlock(button.dataset.blockType);mutate(()=>project.blocks.push(block));
    panel.querySelector(`[data-content-block="${block.id}"] textarea`)?.focus();return;
  }
  if(action==='move-block'){const project=data.projects[Number(index)],a=Number(button.dataset.blockIndex),b=a+Number(direction);if(b<0||b>=project.blocks.length)return;mutate(()=>[project.blocks[a],project.blocks[b]]=[project.blocks[b],project.blocks[a]]);return;}
  if(action==='remove-block'){const i=Number(index),j=Number(button.dataset.blockIndex);mutate(()=>{delete data.format[fieldKey(data,`projects.${i}.blocks.${j}.text`)];data.projects[i].blocks.splice(j,1);},'内容块已删除，可撤销');return;}
  if(action==='clean-block-prefix'){const path=`projects.${index}.blocks.${button.dataset.blockIndex}.text`;const text=cleanListPrefixes(getPath(data,path));mutate(()=>updateText(data,path,text),'手动序号已清理，可撤销');return;}
  if(action==='upload'){$('#image-file').dataset.image=button.dataset.image;$('#image-file').click();return;}
  if(action==='theme'){mutate(()=>data.styles.accent=button.dataset.color);return;}
  if(action==='reset-style'){mutate(()=>data.styles=clone(openingData.styles),'样式已恢复，可撤销');return;}
  if(action==='add-entry'){
    if(data[type].length>=100){toast('单类最多支持 100 条');return;}
    const newIndex=data[type].length;openEntries.add(`${type}.${newIndex}`);mutate(()=>{const entry=blankEntry(type);if(type==='projects'){delete entry.description;entry.blocks=[];}data[type].push(entry);});
    const card=panel.querySelector(`[data-entry-key="${type}.${newIndex}"]`);card?.scrollIntoView({block:'nearest'});card?.querySelector('input,textarea')?.focus();return;
  }
  if(action==='remove-entry'){mutate(()=>{dropEntryMetadata(data,type,Number(index));data[type].splice(Number(index),1);openEntries.clear();},'条目已删除，可点击撤销恢复');return;}
  if(action==='move-entry'){const a=Number(index),b=a+Number(direction);if(b<0||b>=data[type].length)return;mutate(()=>{[data[type][a],data[type][b]]=[data[type][b],data[type][a]];openEntries.clear();openEntries.add(`${type}.${b}`);});return;}
  if(action==='move-section'){const a=data.sections.findIndex(s=>s.id===activeSection),b=a+Number(direction);if(b<0||b>=data.sections.length)return;mutate(()=>{[data.sections[a],data.sections[b]]=[data.sections[b],data.sections[a]];});}
});
for(const node of document.querySelectorAll('[data-tab]'))node.addEventListener('click',()=>{activeTab=node.dataset.tab;renderPanel();panel.scrollTop=0;});
function keyboardHistory(event){if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveNow();}}
document.addEventListener('keydown',keyboardHistory);
$('#undo').addEventListener('click',()=>history('undo'));$('#redo').addEventListener('click',()=>history('redo'));
$('#retry-save').addEventListener('click',()=>{clearNotice();$('#retry-save').hidden=true;saveNow();});
$('#back-studio').addEventListener('click',async event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();await saveNow();if(dirty||saving){toast(saveBlocked?'请先处理版本冲突，再返回工作台':'修改正在保存，请稍后再返回工作台');return;}location.href='/#studio';});
$('#zoom').addEventListener('change',event=>{zoom=event.target.value;measure();});
$('#guide-toggle').addEventListener('change',measure);
new ResizeObserver(measureSoon).observe($('#preview-scroll'));
$('#preview-toggle').addEventListener('click',()=>{previewOnly=!previewOnly;document.body.classList.toggle('preview-only',previewOnly);$('#preview-toggle').textContent=previewOnly?'返回编辑':'纯净预览 ↗';$('#guide-toggle').disabled=previewOnly;renderPreview();measureSoon();});

function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('图片读取失败'));r.readAsDataURL(file);});}
function imageLoads(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法识别这张图片，请重新选择 PNG、JPEG、WebP 或 SVG'));image.src=src;});}
$('#image-file').addEventListener('change',async event=>{
  const file=event.target.files[0],key=event.target.dataset.image;event.target.value='';if(!file)return;
  try{if(file.size>2*1024*1024)throw new Error('图片超过 2 MB，请先选择较小的版本');if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type))throw new Error('暂不支持此图片格式');const src=await readFile(file);await imageLoads(src);mutate(()=>{data.profile[key]=src;if(key==='logo')data.profile.logoMode='contain';},'图片已替换');}catch(error){toast(error.message);}
});
$('#import-button').addEventListener('click',()=>$('#import-file').click());
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try{if(file.size>7000000)throw new Error('资料文件过大，请导入 7 MB 以内的备份');const candidate=migrate(JSON.parse(await file.text()));const errors=validate(candidate);if(errors.length)throw new Error(errors[0]);importCandidate=candidate;$('#import-summary').textContent=`${candidate.profile.name||'未命名简历'} · ${candidate.education.length} 段教育经历 · ${candidate.publications.length} 篇论文 · ${candidate.patents.length} 项专利`;$('#confirm-dialog').showModal();}catch(error){toast(error instanceof SyntaxError?'文件不是有效 JSON，请选择本编辑器导出的资料备份。':error.message);}
});
$('#confirm-dialog').addEventListener('close',()=>{if($('#confirm-dialog').returnValue==='import'&&importCandidate){mutate(()=>{data=clone(importCandidate);openEntries.clear();},'资料已导入');}importCandidate=null;});
$('#export-button').addEventListener('click',()=>{const menu=$('#export-options');menu.hidden=!menu.hidden;$('#export-button').setAttribute('aria-expanded',!menu.hidden);});
document.addEventListener('click',event=>{if(!event.target.closest('.export-menu')){$('#export-options').hidden=true;$('#export-button').setAttribute('aria-expanded','false');}});
document.querySelectorAll('[data-export]').forEach(button=>button.addEventListener('click',()=>{$('#export-options').hidden=true;exportFile(button.dataset.export);}));
$('#restore-previous').addEventListener('click',async()=>{
  $('#export-options').hidden=true;
  if(saving){toast('请等待当前保存完成后再恢复');return;}
  try{const response=await fetch(API+'/previous');const result=await response.json();if(!response.ok)throw new Error(result.error);result.data=migrate(result.data);const errors=validate(result.data);if(errors.length)throw new Error(errors[0]);mutate(()=>{data=clone(result.data);openEntries.clear();},'已恢复上一版，可撤销');}catch(error){toast(error.message);}
});
async function portableData(){const copy=clone(data);for(const key of ['logo','photo'])if(copy.profile[key].startsWith('./')){const response=await fetch(copy.profile[key]);if(!response.ok)throw new Error('读取图片失败，请确认本地服务正常');copy.profile[key]=await readFile(await response.blob());}return copy;}
function invalidatePdf(){
  if(verifiedPdf){URL.revokeObjectURL(verifiedPdf.url);verifiedPdf=null;$('#pdf-frame').removeAttribute('src');$('#pdf-dialog').close();pdfResult('内容或样式已更新','上次的 PDF 校验已失效，可重新适配两页或导出 PDF。');}
  fitUndoFingerprint=null;$('#undo-fit').hidden=true;
}
function pdfResult(title,detail){$('#pdf-result').hidden=false;$('#pdf-result-title').textContent=title;$('#pdf-result-detail').textContent=detail;$('#preview-pdf').hidden=!verifiedPdf;}
function setPdfBusy(value,fit=false){pdfBusy=value;$('#fit-two-pages').disabled=value||!data;$('#fit-two-pages').textContent=value?(fit?'正在适配…':'正在生成 PDF…'):'适配两页 ↙↗';$('[data-export="pdf"]').disabled=value;$('#fit-two-pages').setAttribute('aria-busy',String(value));}
async function pdfRequest(kind,snapshot){
  const response=await fetch(API+'/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(115000)});
  if(!response.ok){let message='PDF 服务暂时不可用，请确认本地服务已重启';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  return response;
}
function keepPdf(blob,pages,fingerprint,snapshot,pagination){
  if(verifiedPdf)URL.revokeObjectURL(verifiedPdf.url);
  verifiedPdf={blob,pages,fingerprint,pagination,url:URL.createObjectURL(blob),filename:`${documentName||'简历'}-${snapshot.profile.name||'个人简历'}.pdf`};
  $('#preview-pdf').hidden=false;measureSoon();
}
function downloadPdf(pdf){const anchor=document.createElement('a');anchor.href=pdf.url;anchor.download=pdf.filename;anchor.click();}
async function exportPdf(){
  if(!data||pdfBusy)return;
  const snapshot=clone(data),fingerprint=JSON.stringify(snapshot);
  if(verifiedPdf?.fingerprint===fingerprint){downloadPdf(verifiedPdf);toast(`PDF 已下载，共 ${verifiedPdf.pages} 页 A4`);return;}
  setPdfBusy(true);pdfResult('正在生成 PDF','正在加载字体、图片并检查实际分页…');
  try{
    const response=await pdfRequest('pdf',snapshot),blob=await response.blob(),pages=Number(response.headers.get('X-PDF-Pages')),pagination=JSON.parse(response.headers.get('X-PDF-Pagination')||'{}');
    if(JSON.stringify(data)===fingerprint){keepPdf(blob,pages,fingerprint,snapshot,pagination);downloadPdf(verifiedPdf);pdfResult(`PDF 已导出 · ${pages} 页 A4`,'文字可选择和复制；绿线标示 PDF 的实际起页位置，跨页条目请在“查看分页”中核对。');}
    else{const pdf={url:URL.createObjectURL(blob),filename:`${documentName||'简历'}-${snapshot.profile.name||'个人简历'}.pdf`};downloadPdf(pdf);setTimeout(()=>URL.revokeObjectURL(pdf.url),10000);pdfResult(`PDF 已导出 · ${pages} 页 A4`,'生成期间有新修改，本次下载的是点击导出时的版本。');}
  }catch(error){pdfResult('PDF 导出未完成',error.message);}
  finally{setPdfBusy(false);}
}
async function fitTwoPages(){
  if(!data||pdfBusy)return;
  const snapshot=clone(data),fingerprint=JSON.stringify(snapshot);
  setPdfBusy(true,true);pdfResult('正在适配两页','先调整间距与留白，必要时再缩小正文；正在校验实际 PDF 页数…');
  try{
    const result=await(await pdfRequest('fit',snapshot)).json();
    if(JSON.stringify(data)!==fingerprint){pdfResult('本次调整未应用','排版期间有新的修改，已保留当前内容。请重新点击适配两页。');return;}
    if(result.status==='too-long'||result.status==='too-short'){
      pdfResult(`暂时无法适配两页 · 当前 ${result.beforePages} 页`,result.status==='too-long'?'在正文 11 px（原本更小时保持原值）的下限内仍无法容纳完整内容，原版式已保留。可精简内容，或检查单独设置过大字号和间距的字段。':'内容较少，在合理字号和间距内仍不足两页，原版式已保留。可以继续补充经历，或直接导出当前页数。');return;
    }
    const changes=Object.keys(rangeNames).filter(key=>(snapshot.styles[key]??optionalStyleDefaults[key])!==(result.styles[key]??optionalStyleDefaults[key]));
    const layoutChanged=JSON.stringify(data.printLayout||null)!==JSON.stringify(result.printLayout||null),didChange=changes.length||layoutChanged;
    if(didChange)mutate(()=>{data.styles=clone(result.styles);if(result.printLayout)data.printLayout=clone(result.printLayout);else delete data.printLayout;});
    const current=JSON.stringify(data),bytes=Uint8Array.from(atob(result.pdf),c=>c.charCodeAt(0));
    keepPdf(new Blob([bytes],{type:'application/pdf'}),result.pages,current,data,result.pagination);
    fitUndoFingerprint=didChange?current:null;$('#undo-fit').hidden=!fitUndoFingerprint;
    const details=changes.map(key=>`${rangeNames[key][0]} ${(snapshot.styles[key]??optionalStyleDefaults[key])} → ${result.styles[key]}`);
    if(result.balance)details.push(`已适度放宽第一页条目间距，页末可用留白由 ${result.balance.before} px 减少到 ${result.balance.after} px`);
    pdfResult(didChange?`已适配为 2 页 A4 · 原 ${result.beforePages} 页`:'当前已是 2 页 A4',details.length?details.join('；')+'。绿线标示实际 PDF 起页位置，可撤销调整。':'已按实际 PDF 校验，可查看分页或直接下载。');
  }catch(error){pdfResult('两页适配未完成',error.message+'。原版式已保留。');}
  finally{setPdfBusy(false);}
}
$('#fit-two-pages').addEventListener('click',fitTwoPages);
$('#undo-fit').addEventListener('click',()=>{if(fitUndoFingerprint===JSON.stringify(data)){history('undo');pdfResult('已撤销两页适配','内容和样式已恢复到调整前。');}});
$('#dismiss-pdf-result').addEventListener('click',()=>$('#pdf-result').hidden=true);
$('#preview-pdf').addEventListener('click',()=>{if(!verifiedPdf)return;$('#pdf-preview-caption').textContent=`${verifiedPdf.pages} 页 A4 · ${documentName||'当前简历'}`;$('#pdf-frame').src=verifiedPdf.url;$('#pdf-dialog').showModal();});
$('#close-pdf-preview').addEventListener('click',()=>$('#pdf-dialog').close());
$('#pdf-dialog').addEventListener('close',()=>$('#pdf-frame').removeAttribute('src'));
$('#download-preview-pdf').addEventListener('click',()=>{if(verifiedPdf)downloadPdf(verifiedPdf);});
async function exportFile(type){
  if(!data)return;
  if(type==='pdf'){await exportPdf();return;}
  try{const copy=await portableData();let text,mime,extension;if(type==='json'){text=JSON.stringify(copy,null,2);mime='application/json';extension='json';}else{const response=await fetch('./styles.css');if(!response.ok)throw new Error('读取样式失败');text=renderDocument(copy,await response.text());mime='text/html';extension='html';}
    const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=(data.profile.name||'个人简历')+'-简历.'+extension;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast(type==='json'?'资料备份已下载，包含校徽与照片':'网页已下载，可直接离线打开');
  }catch(error){toast(error.message);}
}
window.addEventListener('beforeunload',event=>{if(dirty){storeDraft();event.preventDefault();event.returnValue='';}});
frame.addEventListener('load',prepareFrame);

async function init(){
  try{
    const response=await fetch(API+'/data');if(!response.ok)throw new Error(response.status===404?'这份简历已被删除或不存在，请返回工作台。':'无法读取项目资料');const result=await response.json();result.data=migrate(result.data);const errors=validate(result.data);if(errors.length)throw new Error(errors[0]);
    data=result.data;revision=result.revision;documentName=result.document?.name||'';$('#document-name').title=result.document?.description||documentName;openingData=clone(data);
    try{localDraft=JSON.parse(localStorage.getItem(LOCAL_KEY)||'null');if(localDraft?.data)localDraft.data=migrate(localDraft.data);}catch{}
    if(localDraft?.data&&!validate(localDraft.data).length&&JSON.stringify(localDraft.data)!==JSON.stringify(data)){
      notice('发现上次未保存到项目的修改。',[
        ['恢复暂存',()=>{const draft=localDraft;clearNotice();if(draft.baseRevision!==revision){saveBlocked=true;notice('项目在暂存后有更新。请核对恢复的内容，再决定保存哪个版本。',[['载入项目版本',()=>resolveConflict(false)],['保存恢复内容',()=>resolveConflict(true)]]);}mutate(()=>data=clone(draft.data));if(saveBlocked)status('暂存已恢复，待确认','unsaved');}],
        ['使用项目版本',()=>{try{localStorage.removeItem(LOCAL_KEY);}catch{}clearNotice();}]
      ]);
    }
    renderPanel();frame.src='/view/'+encodeURIComponent(resumeId);status('已保存到项目');setPdfBusy(false);
  }catch(error){status('未能载入','error');panel.innerHTML='<div class="empty-list">暂时无法打开这份简历，请重试或返回工作台。</div>';notice(error.message,[['重新载入',()=>location.reload()],['返回工作台',()=>location.href='/#studio']]);}
}
init();
