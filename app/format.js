import {activePrintLayout,layoutFingerprint} from './pagination.js';
export const entryTypes=['education','internships','projects','publications','patents','awards','skills','campus'];
export const contentBlockTypes=['projects','internships'];
export const hasContentBlocks=type=>contentBlockTypes.includes(type);
export const fontOptions={georgia:'Georgia, "Microsoft YaHei", serif',times:'"Times New Roman", "SimSun", serif',sans:'Georgia, "Microsoft YaHei", "PingFang SC", sans-serif',serif:'Georgia, "SimSun", "Songti SC", serif'};
export const inlineProperties=['fontFamily','fontSize','color','fontWeight','fontStyle','textDecoration'];
export const blockProperties=[...inlineProperties,'textAlign','lineHeight','letterSpacing','marginTop','marginBottom','indent','listType'];
export const defaultRows={
  profile:[['name'],['major','degree'],['phone','email'],['nativePlace','ethnicity'],['politics','birth'],['extra']],
  education:[['school','label','degree','dates'],['detail'],['note']],
  internships:[['title','department','role','dates'],['description']],
  projects:[['title','dates'],['organization','role','tech'],['description']],
  publications:[['authors','title'],['venue','year','status','supplement']],
  patents:[['title','status'],['authors'],['number','date']],
  awards:[['text']],skills:[['category','detail']],
  campus:[['title','role','dates'],['organization'],['description']],
};
const copy=value=>JSON.parse(JSON.stringify(value));
const at=(data,path)=>path.split('.').reduce((node,key)=>node?.[key],data);
export const newEntryId=()=>`entry_${globalThis.crypto.randomUUID().replaceAll('-','')}`;
export const newBlock=(type='paragraph')=>({id:`block_${globalThis.crypto.randomUUID().replaceAll('-','')}`,type,text:''});
export const cleanListPrefixes=text=>text.split('\n').map(line=>line.replace(/^\s*(?:[•●▪]\s*|[-*]\s+|\d{1,2}(?:[、)]\s*|\.(?!\d)\s*)|[（(][一二三四五六七八九十\d]{1,3}[）)]\s*|[一二三四五六七八九十]+[、.]\s*)/u,'')).join('\n');
export function orderedProfile(layout){return layout.rows.flat().filter(key=>key!=='name');}
export function arrangeProfile(layout,order){layout.rows=[['name']];for(let i=0;i<order.length;i+=2)layout.rows.push(order.slice(i,i+2));layout.rowModes=layout.rows.map(()=>'auto');layout.right=[];return layout;}
export function migrate(input){
  const data=copy(input);
  if(data?.version===1){
    data.version=2;data.format={};data.sectionStyles={};data.layouts={};
    for(const type of entryTypes)if(Array.isArray(data[type]))data[type].forEach((entry,i)=>{if(entry&&typeof entry==='object')entry.id=`entry_${type}_${i+1}`;});
  }
  if(data?.version===2){
    data.version=3;
    if(data.profile){data.profile.nativePlace??='';data.profile.ethnicity??='';}
    const profile=data.layouts?.profile;
    if(profile&&Array.isArray(profile.rows)&&profile.rows.every(Array.isArray)){
      const order=orderedProfile(profile);for(const field of ['nativePlace','ethnicity'])if(!order.includes(field))order.push(field);
      arrangeProfile(profile,order);
    }
    if(Array.isArray(data.projects))for(const project of data.projects){
      if(!project||typeof project!=='object')continue;
      const key=`projects:${project.id}:description`,format=data.format?.[key],listType=format?.style?.listType;
      project.blocks=typeof project.description!=='string'||project.description||format?[{id:`block_${project.id}_original`,type:['bullet','numbered'].includes(listType)?listType:'paragraph',text:project.description}]:[];
      if(format&&project.blocks.length){const moved=copy(format);delete moved.style?.listType;data.format[`projects:${project.id}:block:${project.blocks[0].id}:text`]=moved;delete data.format[key];}
      delete project.description;
    }
  }
  if(data?.version===3){
    data.version=4;
    if(Array.isArray(data.publications))for(const publication of data.publications){
      if(!publication||typeof publication!=='object')continue;
      if(!Object.hasOwn(publication,'supplement'))publication.supplement='';
      const layout=data.layouts?.[`publications:${publication.id}`];
      if(Array.isArray(layout?.rows)&&layout.rows.every(Array.isArray)&&!layout.rows.flat().includes('supplement')){
        const row=layout.rows.find(row=>row.includes('status'));if(row)row.splice(row.indexOf('status')+1,0,'supplement');
      }
    }
  }
  if(data?.version===4){
    // Adding a hidden, empty section leaves the rendered résumé unchanged.
    const preservePrint=!!activePrintLayout(data)&&data.internships===undefined&&!data.sections?.some(section=>section.id==='internships');
    data.version=5;
    if(data.internships===undefined)data.internships=[];
    if(Array.isArray(data.sections)&&!data.sections.some(section=>section.id==='internships')){
      const education=data.sections.findIndex(section=>section.id==='education');
      data.sections.splice(education<0?0:education+1,0,{id:'internships',title:'实习经历',english:'INTERNSHIPS',visible:false});
    }
    if(preservePrint)data.printLayout.source=layoutFingerprint(data);
  }
  if(data?.version===5){
    const preservePrint=!!activePrintLayout(data)&&(!data.internships?.length||data.sections?.find(section=>section.id==='internships')?.visible===false);
    data.version=6;
    if(Array.isArray(data.internships))for(const entry of data.internships){
      if(!entry||typeof entry!=='object')continue;
      entry.logo??='';delete entry.location;
      if(data.format)delete data.format[`internships:${entry.id}:location`];
      const layout=data.layouts?.[`internships:${entry.id}`];
      if(Array.isArray(layout?.rows)&&layout.rows.every(Array.isArray)){
        const oldDefault=JSON.stringify(layout.rows)===JSON.stringify([['title','role','dates'],['department','location'],['description']]);
        if(oldDefault){layout.rows=copy(defaultRows.internships);layout.rowModes=['split','flow'];}
        else layout.rows=layout.rows.map(row=>row.filter(field=>field!=='location'));
        if(Array.isArray(layout.right))layout.right=layout.right.filter(field=>field!=='location');
      }
    }
    if(preservePrint)data.printLayout.source=layoutFingerprint(data);
  }
  return data;
}
export function fieldKey(data,path){
  const [type,index,field]=path.split('.');
  if(hasContentBlocks(type)&&field==='blocks'){const [,i,,j,property]=path.split('.');return `${type}:${data[type][i].id}:block:${data[type][i].blocks[j].id}:${property}`;}
  if(type==='sections')return `section:${data.sections[index].id}:${field}`;
  if(entryTypes.includes(type))return `${type}:${data[type][index].id||index}:${field}`;
  return path;
}
export function ownerKey(data,type,index){return type==='profile'?'profile':`${type}:${data[type][index].id}`;}
export function layoutFor(data,type,index){
  const layout=copy(data.layouts?.[ownerKey(data,type,index)]||{rows:defaultRows[type],right:defaultRows[type].flat().includes('dates')?['dates']:[],gap:type==='profile'?10:type==='publications'?4:8});
  layout.rowModes??=layout.rows.map(()=>'auto');
  return layout;
}
export function rowMode(layout,index,filled=layout.rows[index]){
  const mode=layout.rowModes?.[index]||'auto';
  return mode==='auto'?(filled.some(field=>layout.right.includes(field))?'split':'flow'):mode;
}
export function styleCSS(style={}){
  const names={fontSize:'font-size',color:'color',fontWeight:'font-weight',fontStyle:'font-style',textDecoration:'text-decoration',textAlign:'text-align',lineHeight:'line-height',letterSpacing:'letter-spacing',marginTop:'margin-top',marginBottom:'margin-bottom',indent:'padding-left'};
  return Object.entries(style).filter(([key])=>key!=='listType').map(([key,value])=>{
    if(key==='fontFamily')return fontOptions[value]?`font-family:${fontOptions[value]}!important`:'';
    if(!names[key])return '';
    return `${names[key]}:${value}${['fontSize','letterSpacing','marginTop','marginBottom','indent'].includes(key)?'px':''}!important`;
  }).filter(Boolean).join(';');
}
export function patchStyle(style,patch){const result={...style};for(const [key,value] of Object.entries(patch)){if(value===null||value==='')delete result[key];else result[key]=value;}return result;}
export function applyRange(marks,textLength,start,end,patch,clear=false){
  start=Math.max(0,Math.min(start,textLength));end=Math.max(start,Math.min(end,textLength));
  const boundaries=[...new Set([0,textLength,start,end,...marks.flatMap(m=>[m.start,m.end])])].filter(n=>n>=0&&n<=textLength).sort((a,b)=>a-b),result=[];
  for(let i=0;i<boundaries.length-1;i++){
    const a=boundaries[i],b=boundaries[i+1];if(a===b)continue;
    let style={...(marks.find(m=>m.start<=a&&m.end>=b)?.style||{})};
    if(a>=start&&b<=end)style=clear?{}:patchStyle(style,patch);
    if(!Object.keys(style).length)continue;
    const previous=result.at(-1);if(previous&&previous.end===a&&JSON.stringify(previous.style)===JSON.stringify(style))previous.end=b;else result.push({start:a,end:b,style});
  }
  return result;
}
export function updateText(data,path,value,edit){
  const old=String(at(data,path)),key=fieldKey(data,path),format=data.format?.[key];
  if(format?.marks?.length&&old!==value){
    let start=0;while(start<old.length&&start<value.length&&old[start]===value[start])start++;
    let suffix=0;while(suffix<old.length-start&&suffix<value.length-start&&old[old.length-1-suffix]===value[value.length-1-suffix])suffix++;
    if(edit&&Number.isInteger(edit.start)&&Number.isInteger(edit.end)&&edit.start>=0&&edit.end>=edit.start&&edit.end<=old.length){
      const inserted=value.length-old.length+edit.end-edit.start;
      if(inserted>=0&&value.slice(0,edit.start)===old.slice(0,edit.start)&&value.slice(edit.start+inserted)===old.slice(edit.end)){start=edit.start;suffix=old.length-edit.end;}
    }
    const oldEnd=old.length-suffix,newEnd=value.length-suffix,delta=value.length-old.length,result=[];
    for(const mark of format.marks){
      if(mark.start<start)result.push({...mark,end:Math.min(mark.end,start)});
      if(mark.end>oldEnd)result.push({...mark,start:Math.max(mark.start,oldEnd)+delta,end:mark.end+delta});
    }
    const typingStyle=format.marks.find(m=>m.start<start&&m.end>=start)?.style||format.marks.find(m=>m.start===start)?.style;
    if(typingStyle&&newEnd>start)result.push({start,end:newEnd,style:typingStyle});
    format.marks=applyRange(result.filter(m=>m.end>m.start).sort((a,b)=>a.start-b.start),value.length,0,0,{});
  }
  const keys=path.split('.'),last=keys.pop(),parent=keys.reduce((node,key)=>node[key],data);parent[last]=value;
}
export function dropEntryMetadata(data,type,index){const entry=data[type][index];if(!entry)return;const prefix=`${type}:${entry.id}:`;for(const key of Object.keys(data.format||{}))if(key.startsWith(prefix))delete data.format[key];if(data.layouts)delete data.layouts[`${type}:${entry.id}`];}
export function validateExtensions(data){
  if(![2,3,4,5,6].includes(data.version))return [];
  const errors=[],keys=new Map(),owners=new Map();
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const validStyle=(style,inline=false)=>{
    if(!object(style))return false;
    return Object.entries(style).every(([k,v])=>{
      if(!(inline?inlineProperties:blockProperties).includes(k))return false;
      if(k==='fontFamily')return Object.hasOwn(fontOptions,v);
      if(k==='color')return /^#[0-9a-f]{6}$/i.test(v);
      if(k==='fontWeight')return [400,600,700].includes(v);
      if(k==='fontStyle')return ['normal','italic'].includes(v);
      if(k==='textDecoration')return ['none','underline'].includes(v);
      if(k==='textAlign')return ['left','center','right','justify'].includes(v);
      if(k==='listType')return ['none','bullet','numbered'].includes(v);
      const ranges={fontSize:[8,60],lineHeight:[1,3],letterSpacing:[-1,8],marginTop:[0,60],marginBottom:[0,60],indent:[0,100]};
      return typeof v==='number'&&Number.isFinite(v)&&v>=ranges[k][0]&&v<=ranges[k][1];
    });
  };
  for(const field of ['name','authorName','major','degree','phone','email','politics','birth','nativePlace','ethnicity','extra'])keys.set(`profile.${field}`,data.profile?.[field]);
  keys.set('evaluation',data.evaluation);owners.set('profile',defaultRows.profile.flat());
  const ids=new Set();
  for(const type of entryTypes)for(const entry of data[type]||[]){
    if(!/^entry_[a-zA-Z0-9_-]+$/.test(entry?.id)||ids.has(entry.id)){errors.push('条目标识缺失或重复');continue;}ids.add(entry.id);
    const allowed=defaultRows[type].flat().concat(type==='internships'&&data.version<6?['location']:[]);
    for(const field of allowed)keys.set(`${type}:${entry.id}:${field}`,entry[field]);
    if(hasContentBlocks(type)&&data.version>=3){
      keys.delete(`${type}:${entry.id}:description`);
      for(const block of entry.blocks){
        if(ids.has(block.id))errors.push('内容块标识重复');ids.add(block.id);
        keys.set(`${type}:${entry.id}:block:${block.id}:text`,block.text);
      }
    }
    owners.set(`${type}:${entry.id}`,allowed.filter(key=>!(type==='publications'&&key==='supplement'&&data.version<4)));
  }
  for(const section of data.sections||[])for(const field of ['title','english'])keys.set(`section:${section.id}:${field}`,section[field]);
  for(const name of ['format','sectionStyles','layouts'])if(!object(data[name]))errors.push(`${name}格式不正确`);
  if(errors.length)return errors;
  if(Object.keys(data.format).length>5000)errors.push('局部格式条目过多');
  for(const [key,format] of Object.entries(data.format)){
    if(!keys.has(key)||!object(format)||!validStyle(format.style||{})){errors.push('字段格式无效');continue;}
    if(!Array.isArray(format.marks)||format.marks.length>2000){errors.push('文字格式片段无效');continue;}
    let end=0;
    for(const mark of format.marks){if(!object(mark)||!Number.isInteger(mark.start)||!Number.isInteger(mark.end)||mark.start<end||mark.end<=mark.start||mark.end>String(keys.get(key)).length||!validStyle(mark.style,true))errors.push('选中文字的格式范围无效');end=mark?.end||0;}
  }
  for(const [key,style] of Object.entries(data.sectionStyles))if(!['profile',...(data.sections||[]).map(s=>s.id)].includes(key)||!validStyle(style))errors.push('模块格式无效');
  for(const [key,layout] of Object.entries(data.layouts)){
    if(!owners.has(key)||!object(layout)||!Array.isArray(layout.rows)||layout.rows.length>12||layout.rows.some(row=>!Array.isArray(row))){errors.push('字段布局无效');continue;}
    const placed=layout.rows.flat(),allowed=owners.get(key);
    if(placed.length!==allowed.length||new Set(placed).size!==allowed.length||placed.some(field=>!allowed.includes(field))||!Array.isArray(layout.right)||layout.right.some(field=>!allowed.includes(field))||new Set(layout.right).size!==layout.right.length||typeof layout.gap!=='number'||!Number.isFinite(layout.gap)||layout.gap<0||layout.gap>30)errors.push('布局需要保留全部字段，每个字段只能出现一次');
    if(layout.rowModes!==undefined&&(!Array.isArray(layout.rowModes)||layout.rowModes.length!==layout.rows.length||layout.rowModes.some(mode=>!['auto','flow','split'].includes(mode))))errors.push('行排版方式无效');
  }
  return errors;
}
