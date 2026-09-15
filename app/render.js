import {icons} from './icons.js';
import {getPath,profileInformation,pageBottomMargin} from './model.js';
import {fieldKey,ownerKey,layoutFor,rowMode,styleCSS,applyRange,hasContentBlocks} from './format.js';
import {paginationCSS} from './pagination.js';

export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export {icons};
const iconNames={education:'education',internships:'briefcase',projects:'project',research:'research',awards:'award',skills:'skills',campus:'team',evaluation:'evaluation'};
const publicationStatusClass=status=>'status-tag'+(/返修|在审|在投|修回|审稿|under\s*review|revision|submitted/i.test(status||'')?' status-pending':'');
export function themeCSS(data){
 const s=data.styles,chinese=s.chineseFont==='serif'?'"SimSun", "Songti SC", serif':'"Microsoft YaHei", "PingFang SC", sans-serif';
 return `:root{--accent:${s.accent};--editor-paper:${s.paper};--resume-font-size:${s.fontSize}px;--resume-line-height:${s.lineHeight};--resume-section-gap:${s.sectionGap}px;--resume-margin:${s.pageMargin}px;--resume-spacing:${s.spacingScale??1};--resume-vertical-margin:${s.pageVerticalMargin??32}px;--resume-bottom-margin:${pageBottomMargin(s)}px;--resume-photo-width:${s.photoWidth}px;--resume-photo-height:${s.photoWidth*1398/1018}px;--resume-logo-size:${s.logoSize}px;--header-side:${Math.max(s.logoSize,s.photoWidth)}px;--font-body:Georgia,"Times New Roman",${chinese};--font-heading:Georgia,${chinese};}@page{size:A4;margin:${s.pageVerticalMargin??32}px 0 ${pageBottomMargin(s)}px;}@page:first{margin-top:0;}${s.showEnglish?'':'.section-english,.subsection-heading span{display:none!important}'}${paginationCSS(data)}`;
}
export function renderResume(d){
 const e=escapeHTML;
 const sectionFor=path=>{const type=path.split('.')[0];return type==='sections'?d.sections[path.split('.')[1]].id:['publications','patents'].includes(type)?'research':type;};
 const richText=(text,marks=[],names=[],defaults=[])=>{
   let combined=[];
   for(const mark of defaults)combined=applyRange(combined,text.length,mark.start,mark.end,mark.style);
   for(const name of names.filter(Boolean)){let i=text.indexOf(name);while(i>=0){combined=applyRange(combined,text.length,i,i+name.length,{fontWeight:700});i=text.indexOf(name,i+name.length);}}
   for(const mark of marks)combined=applyRange(combined,text.length,mark.start,mark.end,mark.style);
   const renderSlice=(start,end)=>{let html='',cursor=start;for(const mark of combined){const a=Math.max(start,mark.start),b=Math.min(end,mark.end);if(b<=a)continue;if(a>cursor)html+=e(text.slice(cursor,a));html+=`<span style="${e(styleCSS(mark.style))}">${e(text.slice(a,b))}</span>`;cursor=b;}return html+e(text.slice(cursor,end));};
   return {renderSlice};
 };
 const field=(path,tag='span',className='',author=false,heading=0,overrides={})=>{
   const text=String(getPath(d,path)??''),key=fieldKey(d,path),format=d.format?.[key]||{style:{},marks:[]};
   const inherited=Object.fromEntries(Object.entries(d.sectionStyles?.[sectionFor(path)]||{}).filter(([k])=>!['marginTop','marginBottom','indent','listType'].includes(k)));
   const award=path.startsWith('awards.')&&path.endsWith('.text')?text.match(/(?:特等奖|[一二三]等奖|金奖|银奖|铜奖|优秀毕业生|先进个人)(?:[（(][^）)]*[）)])?[。.]?$/u):null;
   const defaults=award?[{start:award.index,end:text.length,style:{fontWeight:700}}]:[];
   const style={...inherited,...format.style,...overrides},rich=richText(text,format.marks,author?[d.profile.authorName,d.profile.name]:[],defaults);
   let html=rich.renderSlice(0,text.length)+(text.endsWith('\n')?'<br>':'');
   if(style.listType&&style.listType!=='none'){let offset=0;html=text.split('\n').map(line=>{const content=rich.renderSlice(offset,offset+line.length);offset+=line.length+1;return `<span class="rich-line">${content||'<br>'}</span>`;}).join('\n');className+=' rich-list list-'+style.listType;}
   if(['textAlign','marginTop','marginBottom','indent'].some(k=>Object.hasOwn(format.style||{},k)))className+=' field-block';
   return `<${tag} data-path="${path}" data-field-key="${e(key)}"${heading?` role="heading" aria-level="${heading}"`:''}${className.trim()?` class="${className.trim()}"`:''}${Object.keys(style).length?` style="${e(styleCSS(style))}"`:''}>${html}</${tag}>`;
 };
 const optional=(path,tag='span',cls='')=>getPath(d,path)?field(path,tag,cls):'';
 const pending=text=>d.styles.showPlaceholders?`<p class="pending-content">${e(text)}</p>`:'';
 const lines=(path,placeholder)=>getPath(d,path)?field(path,'div','multiline-text'):pending(placeholder);
 const noteLine=(a,b)=>a+(a&&b?' <span class="detail-divider">|</span> ':'')+b;
 const experienceBody=(type,index)=>{
   const project=d[type][index];
   const body=!project.blocks?lines(`${type}.${index}.description`,'待补充：本人职责、技术方案与项目成果。'):!project.blocks.length?pending('待补充：可添加段落块或分点块，描述职责与成果。'):project.blocks.map((block,j)=>`<div class="project-content-block" data-block-id="${block.id}" data-block-type="${block.type}">${field(`${type}.${index}.blocks.${j}.text`,'div','project-block-text',false,0,{listType:block.type==='paragraph'?'none':block.type})}</div>`).join('');
   return `<div class="project-blocks experience-body">${body}</div>`;
 };
 const layout=(type,index)=>{
   const config=layoutFor(d,type,index),prefix=type==='profile'?'profile':`${type}.${index}`,key=ownerKey(d,type,index);
   if(type==='profile'){
     const profileCell=name=>{
       const {label,icon}=profileInformation[name];let value=field('profile.'+name,'span','profile-value');
       if(['phone','email'].includes(name))value=`<a href="${e(name==='phone'?'tel:'+d.profile.phone.replace(/[^+\d]/g,''):'mailto:'+d.profile.email)}">${value}</a>`;
       return `<div class="profile-info-item" data-layout-field="${name}"><svg class="icon" aria-hidden="true"><use href="#icon-${icon}"/></svg><span class="profile-field-label">${label}</span><span class="profile-field-colon" aria-hidden="true">：</span><span class="profile-field-value">${value}</span></div>`;
     };
     const visible=config.rows.flat().filter(name=>profileInformation[name]&&d.profile[name]);
     const rows=visible.map((name,i)=>`${i%2===0?`<div class="profile-info-row" data-layout-row="${Math.floor(i/2)+1}">`:''}${profileCell(name)}${i%2===1||i===visible.length-1?'</div>':''}`).join('');
     const shared=Object.fromEntries(Object.entries(d.sectionStyles?.profile||{}).filter(([key])=>['color','fontSize','fontFamily','fontWeight','fontStyle','lineHeight','letterSpacing'].includes(key)));
     return `<div class="field-layout profile-layout" data-layout-owner="profile" style="--field-gap:${config.gap}px"><div class="profile-name-row" data-layout-field="name">${field('profile.name','h1')}</div><div class="profile-information" style="${e(styleCSS(shared))}">${rows}</div></div>`;
   }
   const styles={
     profile:{name:'profile-name',major:'profile-major',degree:'profile-major',phone:'profile-contact',email:'profile-contact',politics:'profile-personal-text',birth:'profile-personal-text',extra:'profile-personal-text'},
     internships:{title:'layout-heading',department:'internship-department',role:'entry-role',dates:'layout-date'},
     education:{school:'layout-heading',label:'school-label',degree:'degree',dates:'layout-date',detail:'education-detail',note:'entry-note'},
     projects:{title:'layout-heading',dates:'layout-date',organization:'layout-meta role-label',role:'layout-meta role-label project-role',tech:'layout-meta project-keywords'},
     publications:{venue:'publication-venue',year:'publication-year',status:publicationStatusClass(d.publications[index]?.status),supplement:'publication-supplement'},
     patents:{title:'patent-title',status:'status-tag',authors:'patent-authors',number:'entry-note',date:'entry-note'},
     skills:{category:'layout-skill-category'},campus:{title:'layout-heading',role:'entry-role',dates:'layout-date',organization:'entry-note'},
   };
   const cell=name=>{
     if(hasContentBlocks(type)&&name==='description')return `<div class="project-body-slot" data-layout-field="description">${experienceBody(type,index)}</div>`;
     if(type==='campus'&&name==='description')return `<div class="campus-body-slot experience-body" data-layout-field="description">${field(prefix+'.description','div','multiline-text campus-description')}</div>`;
     const cls=styles[type]?.[name]||'',tag=name==='dates'||name==='date'?'time':type==='publications'&&name==='venue'?'cite':'span';
     const heading=type==='profile'&&name==='name'?1:cls==='layout-heading'?3:0;
     let content=field(prefix+'.'+name,tag,cls,name==='authors',heading);
     if(type==='internships'&&name==='title'){
       const logo=d.internships[index].logo;
       content=`<span class="internship-company">${logo?`<img class="internship-logo" src="${e(logo)}" alt="${e(d.internships[index].title||'实习单位')} logo">`:''}${content}</span>`;
     }
     if(type==='profile'&&['phone','email'].includes(name)){
       const href=name==='phone'?'tel:'+String(d.profile.phone).replace(/[^+\d]/g,''):'mailto:'+d.profile.email;
       content=`<a href="${e(href)}"><svg class="icon" aria-hidden="true"><use href="#icon-${name==='phone'?'phone':'mail'}"/></svg>${content}</a>`;
     }
     return `<span class="field-cell" data-layout-field="${name}">${content}</span>`;
   };
   const join=names=>names.map((name,i)=>{
     const previous=names[i-1],pair=type==='internships'&&((previous==='department'&&name==='role')||(previous==='role'&&name==='department'));
     const separator=i?(pair?'<span class="internship-role-dot" aria-hidden="true"> · </span>':'<span class="field-separator" aria-hidden="true"> </span>'):'';
     return separator+cell(name);
   }).join('');
   return `<div class="field-layout layout-${type}${type==='profile'?' profile-layout':''}" data-layout-owner="${e(key)}" style="--field-gap:${config.gap}px">${config.rows.map((row,i)=>{
     const filled=row.filter(name=>hasContentBlocks(type)&&name==='description'?d[type][index].blocks?.length||d.styles.showPlaceholders||d[type][index].description:getPath(d,prefix+'.'+name));
     if(!filled.length)return '';
     const mode=rowMode(config,i,filled),right=mode==='split'?filled.filter(name=>config.right.includes(name)):[],left=filled.filter(name=>!right.includes(name));
     const group=(names,side)=>`<div class="field-group group-${side}${names.length===1?' group-single':' group-joined'}">${join(names)}</div>`;
     let content=mode==='split'&&right.length?`${left.length?group(left,'leading'):''}${group(right,'trailing')}`:join(filled);
     if(['projects','internships','campus'].includes(type)&&filled.includes('description')){
       const at=filled.indexOf('description'),before=filled.slice(0,at),after=filled.slice(at+1);
       const neighbor=names=>{const trailing=names.filter(name=>right.includes(name)),leading=names.filter(name=>!trailing.includes(name));return names.length?`<div class="body-neighbor row-${mode} ${names.length>1?'row-joined':'row-single'}">${trailing.length?`${leading.length?group(leading,'leading'):''}${group(trailing,'trailing')}`:join(names)}</div>`:'';};
       content=neighbor(before)+cell('description')+neighbor(after);
     }
     return `<div class="field-row row-${mode}${filled.length===1?' row-single':' row-joined'}" data-layout-row="${i}">${content}</div>`;
   }).join('')}</div>`;
 };
 const custom=(type,i,fallback)=>d.layouts?.[ownerKey(d,type,i)]?layout(type,i):fallback;
 const header=`<header class="resume-header" data-editor-section="profile" style="${e(styleCSS(d.sectionStyles?.profile||{}))}">
 <div class="school-mark">${d.profile.showLogo&&d.profile.logo?(d.profile.logoMode==='emblem'?`<svg class="school-emblem" viewBox="0 0 360 360" role="img" aria-label="学校校徽"><image href="${e(d.profile.logo)}" width="1504" height="360"/></svg>`:`<img class="school-emblem" src="${e(d.profile.logo)}" alt="学校校徽"/>`):''}</div>
 <div class="profile">${layout('profile')}</div>
 <div class="portrait">${d.profile.showPhoto&&d.profile.photo?`<img src="${e(d.profile.photo)}" alt="${e(d.profile.name)}的照片"/>`:''}</div></header>`;
 const entry=(type,i,body,cls='')=>`<article class="${cls}" data-entry="${type}.${i}" data-entry-id="${e(d[type][i].id||i)}">${custom(type,i,body)}</article>`;
 const content={
 education:()=>`<div class="section-content education-list">${d.education.map((x,i)=>{const p=`education.${i}`;return entry('education',i,`<div class="entry-heading"><h3>${field(p+'.school')}${optional(p+'.label','span','school-label')}${optional(p+'.degree','span','degree')}</h3>${field(p+'.dates','time')}</div>${optional(p+'.detail','p','education-detail')}${optional(p+'.note','p','entry-note')}`,'education-entry');}).join('')||pending('待补充教育经历。')}</div>`,
 internships:()=>`<div class="section-content internship-list">${d.internships.map((x,i)=>entry('internships',i,layout('internships',i),'internship-entry')).join('')||pending('待补充实习经历。')}</div>`,
 projects:()=>`<div class="section-content">${d.projects.map((x,i)=>{const p=`projects.${i}`;return entry('projects',i,`<div class="entry-heading">${field(p+'.title','h3')}${field(p+'.dates','time')}</div><p class="project-meta">${optional(p+'.organization','span','role-label')}${optional(p+'.role','span','role-label project-role')}${optional(p+'.tech','span','project-keywords')}</p>${experienceBody('projects',i)}`,'project-entry');}).join('')||pending('待补充项目经历。')}</div>`,
 research:()=>{
   const publications=d.publications.map((x,i)=>{const p=`publications.${i}`;return `<li data-entry="${p}" data-entry-id="${e(x.id||i)}"><span class="publication-number">[${i+1}]</span><div>${custom('publications',i,`${field(p+'.authors','span','',true)} ${field(p+'.title')}<span class="publication-note">${field(p+'.venue','cite','publication-venue')}${x.year?' · '+field(p+'.year','span','publication-year'):''}${optional(p+'.status','span',publicationStatusClass(x.status))}${optional(p+'.supplement','span','publication-supplement')}</span>`)}</div></li>`;}).join('');
   const patents=d.patents.map((x,i)=>{const p=`patents.${i}`;return `<li data-entry="${p}" data-entry-id="${e(x.id||i)}">${custom('patents',i,`<p class="patent-title">${field(p+'.title')}${optional(p+'.status','span','status-tag')}</p><p class="patent-authors">${field(p+'.authors','span','',true)}</p><p class="entry-note">${noteLine(optional(p+'.number'),optional(p+'.date','time'))}</p>`)}</li>`;}).join('');
   return `<div class="section-content research-content"><div class="research-group"><h3 class="subsection-heading">论文 <span>PUBLICATIONS</span></h3>${publications?`<ol class="publications">${publications}</ol>`:pending('待补充论文信息。')}</div><div class="research-group patent-group"><h3 class="subsection-heading">专利 <span>PATENTS</span></h3>${patents?`<ol class="patents-list">${patents}</ol>`:pending('待补充专利信息。')}</div></div>`;
 },
 awards:()=>`<ul class="section-content awards-list">${d.awards.map((x,i)=>`<li data-entry="awards.${i}" data-entry-id="${e(x.id||i)}">${custom('awards',i,field(`awards.${i}.text`))}</li>`).join('')}</ul>${d.awards.length?'':pending('待补充荣誉奖项。')}`,
 skills:()=>d.skills.length?`<div class="section-content skills-list">${d.skills.map((x,i)=>`<div data-entry="skills.${i}" data-entry-id="${e(x.id||i)}" class="${d.layouts?.[ownerKey(d,'skills',i)]?'custom-skill':''}">${custom('skills',i,`${field(`skills.${i}.category`,'strong')}${field(`skills.${i}.detail`,'span')}`)}</div>`).join('')}</div>`:pending('待补充：编程语言、开发工具、专业软件及外语能力。'),
 campus:()=>`<div class="section-content campus-list">${d.campus.map((x,i)=>{const p=`campus.${i}`;return entry('campus',i,`<div class="entry-heading"><h3>${field(p+'.title')}${optional(p+'.role','span','entry-role')}</h3>${field(p+'.dates','time')}</div>${optional(p+'.organization','p','entry-note')}${x.description?`<div class="experience-body">${field(p+'.description','div','multiline-text campus-description')}</div>`:''}`);}).join('')||pending('待补充学生工作经历。')}</div>`,
 evaluation:()=>lines('evaluation','待补充：结合目标岗位与具体经历提炼个人特点。'),
 };
 return `<main class="resume-page" aria-label="${e(d.profile.name)}的个人简历">${header}${d.sections.filter(s=>s.visible).map(s=>{const i=d.sections.indexOf(s);return `<section class="resume-section" data-editor-section="${s.id}" style="${e(styleCSS(d.sectionStyles?.[s.id]||{}))}" aria-labelledby="${s.id}-title"><div class="section-heading"><h2 id="${s.id}-title"><svg class="section-icon" aria-hidden="true"><use href="#icon-${iconNames[s.id]}"/></svg>${field(`sections.${i}.title`)}</h2><span class="section-rule" aria-hidden="true"></span>${field(`sections.${i}.english`,'span','section-english')}</div>${content[s.id]()}</section>`;}).join('')}<footer class="resume-footer"><span>${e(d.profile.name)} · 个人简历</span><span>CURRICULUM VITAE</span></footer></main>`;
}
export function renderDocument(data,css){
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(data.profile.name)} · 个人简历</title>${css?`<style>${css}</style>`:'<link rel="stylesheet" href="./styles.css">'}<style id="resume-theme">${themeCSS(data)}</style></head><body>${icons}${renderResume(data)}</body></html>`;
}
