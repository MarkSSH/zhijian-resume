// Stable entry keys let saved spacing follow the résumé without changing its text or field formats.
export function paginationUnits(data){
 const units=[{key:'profile',selector:'.resume-header',maxGap:0}],add=(type)=>{
  for(const [i,entry] of data[type].entries())units.push({key:`${type}:${entry.id}`,selector:`[data-entry="${type}.${i}"]`,maxGap:['projects','internships'].includes(type)?12:['education','campus'].includes(type)?8:0});
 };
 for(const section of data.sections.filter(s=>s.visible)){
  units.push({key:`section:${section.id}`,selector:`[data-editor-section="${section.id}"]>.section-heading`,maxGap:8});
  if(section.id==='research'){
   units.push({key:'papers-heading',selector:'.research-group:not(.patent-group)>.subsection-heading',maxGap:0});add('publications');
   units.push({key:'patents-heading',selector:'.patent-group>.subsection-heading',maxGap:0});add('patents');
  }else if(section.id==='evaluation')units.push({key:'evaluation',selector:'[data-path="evaluation"]',maxGap:0});
  else add(section.id);
 }
 units.push({key:'footer',selector:'.resume-footer',maxGap:0});return units;
}

export function layoutFingerprint(data){
 const {printLayout,...source}=data,{logo,photo,...profile}=source.profile;
 // Images occupy fixed-size boxes; embedding the same assets in an offline export must not invalidate spacing.
 const portable=source.version>=6?{...source,profile,internships:source.internships.map(({logo,...entry})=>({...entry,hasLogo:!!logo}))}:{...source,profile};
 const text=JSON.stringify(portable);let a=2166136261,b=5381;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}

export function activePrintLayout(data){return data.printLayout?.source===layoutFingerprint(data)?data.printLayout:null;}
export function paginationCSS(data){
 const layout=activePrintLayout(data);if(!layout)return '';
 return paginationUnits(data).filter(unit=>layout.gaps[unit.key]>0).map(unit=>`.resume-page ${unit.selector}{padding-top:${layout.gaps[unit.key]}px;}`).join('');
}
export function validatePrintLayout(data){
 if(data.printLayout===undefined)return [];
 const layout=data.printLayout,object=value=>value&&typeof value==='object'&&!Array.isArray(value);
 if(!object(layout)||layout.version!==1||typeof layout.source!=='string'||!/^[a-f0-9]{16}$/.test(layout.source)||!object(layout.gaps))return ['分页间距资料格式不正确'];
 // Deleted entries may remain in an inactive saved plan; they must not block subsequent edits or imports.
 const cap=key=>/^(projects|internships):entry_[a-zA-Z0-9_-]+$/.test(key)?12:/^(education|campus):entry_[a-zA-Z0-9_-]+$/.test(key)||/^section:(education|internships|projects|research|awards|skills|campus|evaluation)$/.test(key)?8:0;
 return Object.keys(layout.gaps).length>1000||Object.entries(layout.gaps).some(([key,value])=>!cap(key)||!Number.isFinite(value)||value<0||value>cap(key))?['分页间距超出可用范围']:[];
}
