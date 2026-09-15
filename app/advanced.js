import {fields,sectionLabels,getPath} from './model.js';
import {escapeHTML as e} from './render.js';
import {entryTypes,defaultRows,fieldKey,ownerKey,layoutFor,rowMode,orderedProfile,arrangeProfile,patchStyle,applyRange,hasContentBlocks,contentBlockTypes} from './format.js';

const profileLabels={name:'姓名',major:'专业 / 研究领域',degree:'身份 / 学位',phone:'联系电话',email:'电子邮箱',politics:'政治面貌',birth:'出生年月',nativePlace:'户籍地',ethnicity:'民族',extra:'补充信息'};
const moduleOf=type=>['publications','patents'].includes(type)?'research':type;
const labelFor=(type,key)=>type==='profile'?profileLabels[key]:fields[type]?.find(f=>f[0]===key)?.[1]||key;
const numeric={fontSize:[8,60,.5],lineHeight:[1,3,.05],letterSpacing:[-1,8,.1],marginTop:[0,60,1],marginBottom:[0,60,1],indent:[0,100,1]};

export function createAdvanced({getData,getSection,setSection,setTab,mutate,renderPanel,renderPreview,frame,panel,toast}){
  let selectedKey='profile.name',range=null,scope='field',layoutOwner=null,restoring=false,drag=null,textEdit=null,crossField=false;
  const data=()=>getData();
  function allFields(){
    const list=Object.entries(profileLabels).map(([key,label])=>({path:`profile.${key}`,label,section:'profile'}));
    for(const type of entryTypes)data()[type].forEach((entry,i)=>{for(const [key,label] of fields[type])if(!(hasContentBlocks(type)&&key==='description'))list.push({path:`${type}.${i}.${key}`,label:`${i+1}. ${label}`,section:moduleOf(type)});});
    for(const type of contentBlockTypes)data()[type].forEach((entry,i)=>entry.blocks.forEach((block,j)=>list.push({path:`${type}.${i}.blocks.${j}.text`,label:`${i+1}. 内容块 ${j+1} · ${{paragraph:'段落',bullet:'圆点',numbered:'编号'}[block.type]}`,section:type})));
    data().sections.forEach((s,i)=>{list.push({path:`sections.${i}.title`,label:'模块标题',section:s.id},{path:`sections.${i}.english`,label:'英文副标题',section:s.id});});
    list.push({path:'evaluation',label:'个人评价',section:'evaluation'});
    return list.map(item=>({...item,key:fieldKey(data(),item.path)}));
  }
  function selected(){const list=allFields();let found=list.find(f=>f.key===selectedKey&&f.section===getSection());if(!found){found=list.find(f=>f.section===getSection())||list[0];selectedKey=found.key;range=null;if(scope==='selection')scope='field';}return found;}
  function chooseField(path,start=0,end=0){
    if(restoring)return;
    crossField=false;
    const item=allFields().find(f=>f.path===path);if(!item)return;
    if(selectedKey!==item.key){range=null;scope='field';}selectedKey=item.key;setSection(item.section);
    if(end>start){range={key:item.key,start,end};scope='selection';}else{range=null;if(scope==='selection')scope='field';}
    const [type,index]=path.split('.');if(defaultRows[type])layoutOwner=ownerKey(data(),type,index);
    updateTarget();
  }
  function nodeFor(){return frame.contentDocument?.querySelector(`[data-field-key="${selected().key}"]`);}
  function updateTarget(){if(!data())return;const item=selected(),label=document.querySelector('#format-target');if(label)label.textContent=range?.key===item.key?`已选 ${range.end-range.start} 字 · ${item.label}`:item.label;}
  function selectedBlock(){const path=selected().path.split('.');return hasContentBlocks(path[0])&&path[2]==='blocks'?data()[path[0]][path[1]].blocks[path[3]]:null;}
  function currentStyle(){
    const item=selected();if(scope==='section')return data().sectionStyles[item.section]||{};
    const format=data().format[item.key]||{style:{},marks:[]};
    if(scope!=='selection'||!range){const style={...format.style},block=selectedBlock();if(block)style.listType=block.type==='paragraph'?'none':block.type;return style;}
    const result={};for(const property of ['fontFamily','fontSize','color','fontWeight','fontStyle','textDecoration']){
      const marks=applyRange(format.marks,String(getPath(data(),item.path)).length,range.start,range.end,{}),points=[range.start,...marks.filter(m=>m.start>range.start&&m.start<range.end).map(m=>m.start),...marks.filter(m=>m.end>range.start&&m.end<range.end).map(m=>m.end)];
      const values=points.map(pos=>marks.find(m=>m.start<=pos&&m.end>pos)?.style[property]??format.style?.[property]);
      if(values.every(v=>v===values[0])&&values[0]!==undefined)result[property]=values[0];
    }return result;
  }
  function inlineContext(){
    if(scope!=='field')return null;
    const item=selected(),[type,index,fieldPart]=item.path.split('.'),field=type==='profile'?index:fieldPart;
    if(!defaultRows[type]||type==='profile')return null;
    if(type==='campus'&&field==='description')return null;
    const owner=ownerKey(data(),type,index);if(!data().layouts[owner])return null;
    const layout=layoutFor(data(),type,index),rowIndex=layout.rows.findIndex(row=>row.includes(field));if(rowIndex<0)return null;
    const prefix=type==='profile'?'profile':type+'.'+index,filled=layout.rows[rowIndex].filter(key=>key===field||getPath(data(),prefix+'.'+key));
    const split=rowMode(layout,rowIndex,filled)==='split',right=layout.right.includes(field);
    const group=filled.filter(key=>!split||layout.right.includes(key)===right);
    return group.length>1?{type,index,field,owner,rowIndex,layout}:null;
  }
  function separateField(){
    const context=inlineContext();if(!context)return;
    const {layout,field,rowIndex,owner}=context,row=layout.rows[rowIndex],index=row.indexOf(field),mode=layout.rowModes[rowIndex];
    const pieces=[row.slice(0,index),[field],row.slice(index+1)].filter(part=>part.length);
    if(layout.rows.length-1+pieces.length>12){toast('最多支持 12 行，请先合并或删除空行。');return;}
    mutate(()=>{layout.rows.splice(rowIndex,1,...pieces);layout.rowModes.splice(rowIndex,1,...pieces.map(part=>part.length===1&&part[0]===field?'auto':mode));data().layouts[owner]=layout;},'字段已独立成行，可单独调整段落格式');
  }
  function numericField(key,label,style){const [min,max,step]=numeric[key];return `<label class="field"><span>${label}</span><input type="number" data-format="${key}"${['marginTop','marginBottom','indent'].includes(key)&&inlineContext()?' disabled':''} min="${min}" max="${max}" step="${step}" value="${style[key]??''}" placeholder="继承默认"></label>`;}
  function toggleActive(key){
    const explicit=currentStyle()[key],expected={fontWeight:700,fontStyle:'italic',textDecoration:'underline'}[key];if(explicit!==undefined)return explicit===expected;
    let node=nodeFor();if(!node)return false;if(scope==='section')node=node.closest('[data-editor-section]');
    if(scope==='selection'&&range){const walker=node.ownerDocument.createTreeWalker(node,4),values=[];let n,offset=0;while(n=walker.nextNode()){if(offset<range.end&&offset+n.length>range.start)values.push(node.ownerDocument.defaultView.getComputedStyle(n.parentElement)[key]);offset+=n.length;}return values.length>0&&values.every(value=>key==='textDecoration'?value.includes('underline'):String(value)===String(expected));}
    const value=node.ownerDocument.defaultView.getComputedStyle(node)[key];return key==='textDecoration'?value.includes('underline'):String(value)===String(expected);
  }
  function sectionSelect(){return `<label class="field"><span>所在模块</span><select data-advanced-section>${['profile',...data().sections.map(s=>s.id)].map(id=>`<option value="${id}"${id===getSection()?' selected':''}>${e(id==='profile'?'基本信息':sectionLabels[id])}</option>`).join('')}</select></label>`;}
  function localPanel(){
    const item=selected(),style=currentStyle(),text=String(getPath(data(),item.path)),hasRange=range?.key===item.key&&range.end>range.start&&range.end<=text.length;
    if(scope==='selection'&&!hasRange){scope='field';range=null;return localPanel();}
    return `<h2 class="style-title">局部格式</h2><p class="section-helper">点击字段，或在纸面拖选一段文字，再调整格式。</p>${sectionSelect()}<label class="field"><span>当前字段</span><select data-format-target>${allFields().filter(f=>f.section===getSection()).map(f=>`<option value="${f.key}"${f.key===item.key?' selected':''}>${e(f.label)} · ${e(String(getPath(data(),f.path)).slice(0,26)||'（空）')}</option>`).join('')}</select></label><div class="scope-switch" role="group" aria-label="格式作用范围">${[['selection','选中文字'],['field','整个字段'],['section','整个模块']].map(([value,label])=>`<button data-scope="${value}" class="${scope===value?'active':''}"${value==='selection'&&!hasRange?' disabled':''}>${label}</button>`).join('')}</div><div class="selection-note">${scope==='selection'?`已选 ${range.end-range.start} 字：<q>${e(text.slice(range.start,range.end).slice(0,80))}</q>`:scope==='section'?'格式作用于当前模块；字段和选中文字的单独设置优先。':'格式作用于整个字段；留空的选项继承默认样式。'}</div><label class="field"><span>字体</span><select data-format="fontFamily">${[['','继承默认（英文 Georgia）'],['georgia','Georgia · 中文雅黑'],['times','Times New Roman · 中文宋体'],['sans','雅黑 / 苹方 · 英文 Georgia'],['serif','宋体 · 英文 Georgia']].map(([v,t])=>`<option value="${v}"${(style.fontFamily||'')===v?' selected':''}>${t}</option>`).join('')}</select></label><div class="field-grid">${numericField('fontSize','字号（px）',style)}<label class="field"><span>文字颜色</span><div class="color-inputs"><input type="color" data-format="color" value="${style.color||'#30455e'}" aria-label="选择文字颜色"><input type="text" data-format="color" value="${style.color||''}" placeholder="继承 / #30455e" aria-label="文字颜色值"></div></label></div><div class="format-buttons" role="group" aria-label="字体修饰">${[['fontWeight',700,'B','加粗'],['fontStyle','italic','I','斜体'],['textDecoration','underline','U','下划线']].map(([k,v,t,label])=>`<button data-format-toggle="${k}" aria-label="${label}" aria-pressed="${toggleActive(k)}" class="${toggleActive(k)?'active':''}"><${t==='B'?'b':t==='I'?'i':'u'}>${t}</${t==='B'?'b':t==='I'?'i':'u'}></button>`).join('')}<button data-format-clear class="clear-format">清除${scope==='selection'?'选中':scope==='section'?'模块':'字段'}格式</button></div>${scope!=='selection'?`<div class="style-section"><h3>段落与间距</h3>${inlineContext()?'<div class="inline-layout-note">此字段与其他文字接续。对齐、段前后、缩进和列表需在独立成行后设置；字号、颜色和行高可直接调整。<button data-field-own-row>将此字段独立成行</button></div>':''}<label class="field"><span>文字对齐</span><select data-format="textAlign"${inlineContext()?' disabled':''}>${[['','继承默认'],['left','左对齐'],['center','居中'],['right','右对齐'],['justify','两端对齐']].map(([v,t])=>`<option value="${v}"${(style.textAlign||'')===v?' selected':''}>${t}</option>`).join('')}</select></label><div class="field-grid">${numericField('lineHeight','行高（倍）',style)}${numericField('letterSpacing','字间距（px）',style)}${numericField('marginTop','段前（px）',style)}${numericField('marginBottom','段后（px）',style)}</div>${scope==='field'?`${numericField('indent','左缩进（px）',style)}<label class="field"><span>每行列表</span><select data-format="listType"${inlineContext()?' disabled':''}>${[['','继承默认'],['none','普通文本'],['bullet','圆点列表'],['numbered','编号列表']].map(([v,t])=>`<option value="${v}"${(style.listType||'')===v?' selected':''}>${t}</option>`).join('')}</select></label><p class="muted-note">用回车分隔每一项。段落设置作用于整个字段，位置调整请使用“字段布局”。</p>`:''}</div>`:''}`;
  }
  function restoreSelection(focus=false){
    const item=selected(),node=nodeFor();if(!node||!range||range.key!==item.key)return;
    const doc=node.ownerDocument,walker=doc.createTreeWalker(node,4),nodes=[];let n;while(n=walker.nextNode())nodes.push(n);if(!nodes.length)return;
    const point=offset=>{for(const n of nodes){if(offset<=n.textContent.length)return [n,offset];offset-=n.textContent.length;}return [nodes.at(-1),nodes.at(-1).textContent.length];};
    restoring=true;if(focus)node.focus();const r=doc.createRange();r.setStart(...point(range.start));r.setEnd(...point(range.end));doc.getSelection().removeAllRanges();doc.getSelection().addRange(r);queueMicrotask(()=>restoring=false);
  }
  function apply(patch,clear=false,focus=false){
    const item=selected();if(crossField&&scope!=='section'){toast('请在单个字段内选择文字；跨字段可使用整个模块格式。');return;}if(scope==='selection'&&(!range||range.key!==item.key))return;
    mutate(()=>{
      const block=scope==='field'?selectedBlock():null;if(block&&Object.hasOwn(patch,'listType')){block.type=['bullet','numbered'].includes(patch.listType)?patch.listType:'paragraph';patch={...patch};delete patch.listType;}
      if(scope==='section'){if(clear)delete data().sectionStyles[item.section];else data().sectionStyles[item.section]=patchStyle(data().sectionStyles[item.section]||{},patch);}
      else if(scope==='field'&&clear)delete data().format[item.key];
      else{const format=data().format[item.key]??={style:{},marks:[]};if(scope==='selection')format.marks=applyRange(format.marks,String(getPath(data(),item.path)).length,range.start,range.end,patch,clear);else format.style=patchStyle(format.style,patch);}
    });restoreSelection(focus);updateTarget();
  }
  function toggle(key,focus=false){const pairs={fontWeight:[700,400],fontStyle:['italic','normal'],textDecoration:['underline','none']};const values=pairs[key];apply({[key]:toggleActive(key)?values[1]:values[0]},false,focus);}
  function capture(doc){
    if(restoring)return;const sel=doc.getSelection();if(!sel?.rangeCount)return;const r=sel.getRangeAt(0);
    const ancestor=n=>(n.nodeType===1?n:n.parentElement)?.closest('[data-path]');const start=ancestor(r.startContainer),end=ancestor(r.endContainer);if(!start||start!==end){if(sel.toString()&&(start||end)){crossField=true;range=null;if(scope==='selection')scope='field';}return;}
    const before=doc.createRange();before.selectNodeContents(start);before.setEnd(r.startContainer,r.startOffset);const a=before.toString().length;before.setEnd(r.endContainer,r.endOffset);chooseField(start.dataset.path,a,before.toString().length);
  }
  function insertPlain(doc,text){
    const selection=doc.getSelection();if(!selection?.rangeCount)return;const r=selection.getRangeAt(0),node=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement).closest('[data-path]');
    if(!node||!node.contains(r.endContainer))return;recordTextEdit(node,r);const path=node.dataset.path,position=textEdit.start+text.replace(/\r/g,'').length;r.deleteContents();const textNode=doc.createTextNode(text.replace(/\r/g,''));r.insertNode(textNode);r.setStartAfter(textNode);r.collapse(true);selection.removeAllRanges();selection.addRange(r);node.dispatchEvent(new Event('input',{bubbles:true}));renderPreview();restoreCaret(path,position);
  }
  function restoreCaret(path,position){
    const doc=frame.contentDocument,node=doc.querySelector(`[data-path="${path}"]`);if(!node)return;
    let container=node,remaining=position;const lines=[...node.children].filter(n=>n.classList.contains('rich-line'));
    for(const line of lines){if(remaining<=line.textContent.length){container=line;break;}remaining-=line.textContent.length+1;}
    const walker=doc.createTreeWalker(container,4);let n,point=[container,0];while(n=walker.nextNode()){if(remaining<=n.length){point=[n,remaining];break;}remaining-=n.length;point=[n,n.length];}
    const range=doc.createRange();range.setStart(...point);range.collapse(true);restoring=true;node.focus();doc.getSelection().removeAllRanges();doc.getSelection().addRange(range);queueMicrotask(()=>restoring=false);
  }
  function recordTextEdit(node,r){
    textEdit=null;if(!r||!node.contains(r.startContainer)||!node.contains(r.endContainer))return;
    const before=node.ownerDocument.createRange();before.selectNodeContents(node);before.setEnd(r.startContainer,r.startOffset);const start=before.toString().length;before.setEnd(r.endContainer,r.endOffset);textEdit={path:node.dataset.path,start,end:before.toString().length};
  }
  function bindFrame(doc){
    doc.addEventListener('selectionchange',()=>capture(doc));
    const showSelection=()=>{capture(doc);if(range){setTab('local');renderPanel();}};
    doc.addEventListener('mouseup',showSelection);doc.addEventListener('keyup',event=>{if(event.shiftKey)showSelection();});
    doc.addEventListener('beforeinput',event=>{
      const node=event.target.closest('[contenteditable=true]');if(!node)return;
      recordTextEdit(node,event.getTargetRanges?.()[0]);
      if(['insertParagraph','insertLineBreak'].includes(event.inputType)){event.preventDefault();insertPlain(doc,'\n');}
      const key={formatBold:'fontWeight',formatItalic:'fontStyle',formatUnderline:'textDecoration'}[event.inputType];if(key){event.preventDefault();capture(doc);toggle(key,true);}
    });
    doc.addEventListener('paste',event=>{if(!event.target.closest('[contenteditable=true]'))return;event.preventDefault();insertPlain(doc,event.clipboardData.getData('text/plain'));});
    doc.addEventListener('keydown',event=>{if(!event.target.closest('[contenteditable=true]'))return;const key={b:'fontWeight',i:'fontStyle',u:'textDecoration'}[event.key.toLowerCase()];if((event.ctrlKey||event.metaKey)&&key){event.preventDefault();capture(doc);toggle(key,true);}});
  }
  function layoutEntries(){const types=getSection()==='profile'?['profile']:getSection()==='research'?['publications','patents']:defaultRows[getSection()]?[getSection()]:[];return types.flatMap(type=>type==='profile'?[{owner:'profile',type,index:0,label:'基本信息 · 中央信息区'}]:data()[type].map((entry,index)=>({owner:ownerKey(data(),type,index),type,index,label:`${type==='publications'?'论文 ':type==='patents'?'专利 ':''}${index+1}. ${entry.title||entry.school||entry.category||entry.text||'未命名条目'}`})));}
  function layoutEntry(){const entries=layoutEntries();return entries.find(x=>x.owner===layoutOwner)||entries[0];}
  function profileOrderPanel(){
    const layout=layoutFor(data(),'profile',0),order=orderedProfile(layout);
    return `<h2 class="style-title">基本信息顺序</h2><p class="section-helper">从左到右、从上到下排列。拖动卡片，或用前移 / 后移调整；未填写的字段不占纸面位置。</p>${sectionSelect()}
      <div class="profile-order-grid">${order.map((key,i)=>`<div class="profile-order-card" draggable="true" data-profile-order="${key}"><div><span class="drag-grip">⠿</span><strong>${e(profileLabels[key])}</strong><small>${i+1}</small></div><p>${e(data().profile[key]||'未填写')}</p><div class="profile-order-actions"><button data-profile-shift="-1" data-profile-key="${key}" aria-label="${e(profileLabels[key])}前移"${i===0?' disabled':''}>← 前移</button><button data-profile-shift="1" data-profile-key="${key}" aria-label="${e(profileLabels[key])}后移"${i===order.length-1?' disabled':''}>后移 →</button></div></div>`).join('')}</div>
      <label class="field" style="margin-top:18px"><span>两列间距（px）</span><input type="number" data-layout-gap min="0" max="30" value="${layout.gap}"></label>
      <button class="button secondary" data-layout-reset>恢复默认顺序</button><p class="muted-note" style="margin-top:12px">姓名固定在上方居中；图标、字段名和局部格式会跟随字段一起移动。</p>`;
  }
  function moveProfile(key,to,before){
    const layout=layoutFor(data(),'profile',0),order=orderedProfile(layout),from=order.indexOf(key);if(from<0)return;
    order.splice(from,1);if(before)to=order.indexOf(before);to=Math.max(0,Math.min(order.length,to));order.splice(to,0,key);
    mutate(()=>data().layouts.profile=arrangeProfile(layout,order));
  }
  function layoutPanel(){
    const entry=layoutEntry();
    if(!entry)return `<h2 class="style-title">字段布局</h2><p class="section-helper">将字段组合成行，保持条目结构清晰。</p>${sectionSelect()}<div class="empty-list">此模块暂无可调整布局的条目。可先在“内容编辑”中添加；个人评价可通过“局部格式”调整段落。</div>`;
    layoutOwner=entry.owner;
    if(entry.type==='profile')return profileOrderPanel();
    const {type,index}=entry,layout=layoutFor(data(),type,index),source=type==='profile'?data().profile:data()[type][index];
    const preset=type==='projects'?['project-line','名称、机构、角色、时间同行','名称与机构角色接续，时间单独靠右']:
      type==='internships'?['internship-line','公司、部门 · 岗位、时间同行','部门与岗位用圆点连接，时间单独靠右']:
      type==='publications'?['reference-line','作者、论文名、期刊会议连续排版','整条文献自然接续，换行后继续使用整行宽度']:
      type==='patents'?['patent-line','专利信息连续排版','名称、发明人、专利号与日期按顺序接续']:null;
    const rows=layout.rows.map((row,i)=>{
      const mode=layout.rowModes[i];
      const chips=row.map((key,j)=>`<div class="layout-chip" draggable="${type==='profile'&&key==='name'?'false':'true'}" data-drag-field="${key}">
        <div class="chip-top"><span class="drag-grip" aria-hidden="true">⠿</span><strong>${e(labelFor(type,key))}</strong>${hasContentBlocks(type)&&key==='description'?`<small>${source.blocks.length} 个内容块</small>`:!source[key]?'<small>未填写</small>':''}<button data-layout-shift="-1" data-layout-field="${key}" aria-label="${e(labelFor(type,key))}向左"${j===0||(type==='profile'&&key==='name')?' disabled':''}>←</button><button data-layout-shift="1" data-layout-field="${key}" aria-label="${e(labelFor(type,key))}向右"${j===row.length-1||(type==='profile'&&key==='name')?' disabled':''}>→</button></div>
        <div class="chip-options"><label>移至<select data-layout-row-target="${key}"${type==='profile'&&key==='name'?' disabled':''} aria-label="${e(labelFor(type,key))}移至行">${layout.rows.map((_,n)=>`<option value="${n}"${n===i?' selected':''}>第 ${n+1} 行</option>`).join('')}<option value="${layout.rows.length}"${layout.rows.length>=12?' disabled':''}>新的一行</option></select></label><label title="${mode==='flow'?'文字接续按字段顺序排版；切换左右对齐可启用靠右。':'靠右字段会归入本行右侧，其余字段在左侧接续。'}"><input type="checkbox" data-layout-right="${key}"${layout.right.includes(key)?' checked':''}${mode==='flow'||type==='profile'||(hasContentBlocks(type)&&key==='description')?' disabled':''}>靠右</label></div>
      </div>`).join('');
      return `<section class="layout-row" data-drop-row="${i}"><div class="layout-row-heading"><span>第 ${i+1} 行</span>${!row.length?`<button data-layout-delete-row="${i}" aria-label="删除空行 ${i+1}">删除空行</button>`:'<small>按顺序接续文字</small>'}</div>
        ${type==='profile'?'<p class="row-mode-hint">姓名固定在上方；信息按两列对齐。</p>':`<label class="row-mode-control">行排版<select data-layout-row-mode="${i}" aria-label="第 ${i+1} 行排版方式">${[['auto','自动 · 按靠右设置'],['flow','文字接续 · 连续换行'],['split','左右对齐 · 时间等靠右']].map(([value,label])=>`<option value="${value}"${mode===value?' selected':''}>${label}</option>`).join('')}</select></label>`}
        ${chips||'<div class="drop-placeholder">拖到这里另起一行</div>'}</section>`;
    }).join('');
    return `<h2 class="style-title">字段布局</h2><p class="section-helper">${type==='profile'?'姓名下方的信息统一为两列。可调整各行中的字段顺序。':'同一行的文字自然接续。需要独立靠右的时间等字段，可使用左右对齐。'}</p>${sectionSelect()}
      <label class="field"><span>当前条目</span><select data-layout-entry>${layoutEntries().map(x=>`<option value="${x.owner}"${x.owner===entry.owner?' selected':''}>${e(x.label.slice(0,60))}</option>`).join('')}</select></label>
      ${preset?`<button class="layout-preset" data-layout-preset="${preset[0]}"><span>${preset[1]}</span><small>${preset[2]}</small></button>`:''}
      ${hasContentBlocks(type)?'<p class="muted-note">正文按内容块顺序独占行宽；段落和分点的增删排序在“内容编辑”中完成。</p>':''}<div class="layout-rows">${rows}</div>
      <div class="layout-actions"><button class="button secondary" data-layout-add-row${layout.rows.length>=12?' disabled':''}>＋ 新建一行</button><button class="button secondary" data-layout-reset>恢复默认布局</button></div>
      ${type!=='profile'&&data()[type].length>1?`<button class="apply-layout-all" data-layout-apply-all>将此布局应用到全部${{education:'教育经历',internships:'实习经历',projects:'项目',publications:'论文',patents:'专利',awards:'奖项',skills:'技能',campus:'学生工作'}[type]}（${data()[type].length} 条）</button>`:''}
      <label class="field" style="margin-top:18px"><span>字段间距（px）</span><input type="number" data-layout-gap min="0" max="30" value="${layout.gap}"></label>
      <p class="muted-note">拖拽、左右箭头与“移至”菜单都可调整顺序。空字段不占纸面空间；段落中的回车会保留。文字接续不会把字段分成独立的窄列。</p>`;
  }
  function editLayout(fn){const entry=layoutEntry();if(!entry)return;mutate(()=>{const layout=layoutFor(data(),entry.type,entry.index);fn(layout);data().layouts[entry.owner]=layout;});}
  function moveField(key,row,before){
    const entry=layoutEntry();if(!entry||!defaultRows[entry.type].flat().includes(key))return;
    editLayout(layout=>{if(row<0||row>layout.rows.length||row>=12)return;if(row===layout.rows.length){layout.rows.push([]);layout.rowModes.push('auto');}for(const fields of layout.rows){const pos=fields.indexOf(key);if(pos>=0)fields.splice(pos,1);}const target=layout.rows[row],pos=before?target.indexOf(before):-1;target.splice(pos>=0?pos:target.length,0,key);});
  }
  panel.addEventListener('change',event=>{
    const t=event.target;
    if(t.matches('[data-advanced-section]')){setSection(t.value);range=null;scope='field';crossField=false;renderPanel();return;}
    if(t.matches('[data-format-target]')){selectedKey=t.value;range=null;scope='field';crossField=false;renderPanel();updateTarget();return;}
    if(t.dataset.format){const key=t.dataset.format;let value=t.value.trim()||null;if(numeric[key]&&value!==null){value=Number(value);const [min,max]=numeric[key];if(!Number.isFinite(value)||value<min||value>max){toast(`请输入 ${min}–${max} 之间的数值`);renderPanel();return;}}if(key==='color'&&value&&!/^#[0-9a-f]{6}$/i.test(value)){toast('颜色请使用 # 加六位十六进制数');renderPanel();return;}apply({[key]:value});return;}
    if(t.matches('[data-layout-entry]')){layoutOwner=t.value;renderPanel();return;}
    if(t.hasAttribute('data-layout-row-mode')){editLayout(layout=>layout.rowModes[Number(t.dataset.layoutRowMode)]=t.value);return;}
    if(t.dataset.layoutRowTarget){moveField(t.dataset.layoutRowTarget,Number(t.value));return;}
    if(t.dataset.layoutRight){editLayout(layout=>{layout.right=layout.right.filter(key=>key!==t.dataset.layoutRight);if(t.checked)layout.right.push(t.dataset.layoutRight);});return;}
    if(t.matches('[data-layout-gap]')){const gap=Number(t.value);if(!Number.isFinite(gap)||gap<0||gap>30){toast('字段间距应为 0–30 px');renderPanel();return;}editLayout(layout=>layout.gap=gap);}
  });
  panel.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.profileShift){const order=orderedProfile(layoutFor(data(),'profile',0));moveProfile(b.dataset.profileKey,order.indexOf(b.dataset.profileKey)+Number(b.dataset.profileShift));return;}
    if(b.dataset.scope){scope=b.dataset.scope;renderPanel();return;}
    if(b.dataset.formatToggle){toggle(b.dataset.formatToggle);return;}
    if(b.hasAttribute('data-field-own-row')){separateField();return;}
    if(b.hasAttribute('data-format-clear')){apply({},true);return;}
    if(b.hasAttribute('data-layout-preset')){editLayout(layout=>{
      if(b.dataset.layoutPreset==='project-line'){layout.rows=[['title','organization','role','dates'],['tech'],['description']];layout.right=['dates'];layout.rowModes=['split','flow','flow'];}
      else if(b.dataset.layoutPreset==='internship-line'){layout.rows=[['title','department','role','dates'],['description']];layout.right=['dates'];layout.rowModes=['split','flow'];}
      else{layout.rows=[b.dataset.layoutPreset==='reference-line'?['authors','title','venue','year','status','supplement']:['title','authors','number','date','status']];layout.right=[];layout.rowModes=['flow'];}
    });return;}
    if(b.hasAttribute('data-layout-add-row')){editLayout(layout=>{if(layout.rows.length<12){layout.rows.push([]);layout.rowModes.push('auto');}});return;}
    if(b.hasAttribute('data-layout-apply-all')){const entry=layoutEntry(),source=layoutFor(data(),entry.type,entry.index);mutate(()=>{data()[entry.type].forEach((_,i)=>data().layouts[ownerKey(data(),entry.type,i)]=JSON.parse(JSON.stringify(source)));},'已应用到同类条目，可撤销');return;}
    if(b.hasAttribute('data-layout-reset')){const entry=layoutEntry();mutate(()=>delete data().layouts[entry.owner]);return;}
    if(b.hasAttribute('data-layout-delete-row')){editLayout(layout=>{const i=Number(b.dataset.layoutDeleteRow);if(!layout.rows[i].length){layout.rows.splice(i,1);layout.rowModes.splice(i,1);}});return;}
    if(b.dataset.layoutShift){editLayout(layout=>{const key=b.dataset.layoutField,row=layout.rows.find(row=>row.includes(key)),a=row.indexOf(key),next=a+Number(b.dataset.layoutShift);if(next>=0&&next<row.length)[row[a],row[next]]=[row[next],row[a]];});}
  });
  let profileDrag=null;
  panel.addEventListener('dragstart',event=>{const card=event.target.closest('[data-profile-order]');if(!card||event.target.closest('button'))return;profileDrag=card.dataset.profileOrder;event.dataTransfer.setData('text/plain',profileDrag);event.dataTransfer.effectAllowed='move';});
  panel.addEventListener('dragover',event=>{if(profileDrag&&event.target.closest('[data-profile-order]'))event.preventDefault();});
  panel.addEventListener('drop',event=>{const card=event.target.closest('[data-profile-order]');if(!card||!profileDrag)return;event.preventDefault();if(card.dataset.profileOrder!==profileDrag)moveProfile(profileDrag,0,card.dataset.profileOrder);profileDrag=null;});
  panel.addEventListener('dragend',()=>profileDrag=null);
  panel.addEventListener('dragstart',event=>{const chip=event.target.closest('[data-drag-field]');if(!chip||event.target.closest('input,select,button'))return;drag={owner:layoutOwner,field:chip.dataset.dragField};event.dataTransfer.setData('text/plain',JSON.stringify(drag));event.dataTransfer.effectAllowed='move';chip.classList.add('dragging');});
  panel.addEventListener('dragover',event=>{const row=event.target.closest('[data-drop-row]');if(row&&drag?.owner===layoutOwner){event.preventDefault();event.dataTransfer.dropEffect='move';panel.querySelectorAll('.drop-active').forEach(n=>n.classList.remove('drop-active'));row.classList.add('drop-active');}});
  panel.addEventListener('drop',event=>{const row=event.target.closest('[data-drop-row]');if(!row||drag?.owner!==layoutOwner)return;event.preventDefault();const before=event.target.closest('[data-drag-field]')?.dataset.dragField;if(before!==drag.field)moveField(drag.field,Number(row.dataset.dropRow),before);drag=null;});
  panel.addEventListener('dragend',()=>{drag=null;panel.querySelectorAll('.drop-active,.dragging').forEach(n=>n.classList.remove('drop-active','dragging'));});
  document.querySelector('#open-local-format').addEventListener('click',()=>{setTab('local');renderPanel();});
  for(const button of document.querySelectorAll('[data-quick-format]')){button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>{setTab('local');toggle(button.dataset.quickFormat);});}
  return {localPanel,layoutPanel,chooseField,bindFrame,updateTarget,restoreSelection,clearRange:()=>{range=null;if(scope==='selection')scope='field';},capture,takeTextEdit:path=>{const edit=textEdit;textEdit=null;return edit?.path===path?edit:undefined;}};
}
