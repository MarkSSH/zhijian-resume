import {newEntryId,validateExtensions} from './format.js';
import {validatePrintLayout} from './pagination.js';
export const profileInformation={
  major:{label:'专业领域',icon:'book'},degree:{label:'学位',icon:'education'},
  phone:{label:'联系电话',icon:'phone'},email:{label:'电子邮箱',icon:'mail'},
  politics:{label:'政治面貌',icon:'institution'},birth:{label:'出生年月',icon:'calendar'},
  nativePlace:{label:'户籍地',icon:'location'},ethnicity:{label:'民族',icon:'team'},
  extra:{label:'补充信息',icon:'info'},
};
export const fields = {
  education: [['school','学校'],['label','学校标签'],['degree','学位'],['dates','起止时间'],['detail','院系、专业与导师','textarea'],['note','研究方向、课程与备注','textarea']],
  projects: [['title','项目名称'],['dates','起止时间'],['organization','机构 / 单位'],['role','本人角色'],['tech','技术关键词'],['description','项目正文（内容块）','textarea']],
  publications: [['title','论文标题','textarea'],['authors','作者（保留原始顺序）','textarea'],['venue','期刊 / 会议'],['year','年份'],['status','状态 / 收录信息'],['supplement','补充说明','textarea']],
  patents: [['title','专利名称','textarea'],['authors','发明人（保留原始顺序）','textarea'],['number','专利号'],['date','日期'],['status','专利状态']],
  awards: [['text','奖项名称','textarea']],
  skills: [['category','技能类别'],['detail','具体能力','textarea']],
  campus: [['title','组织 / 班级'],['role','职务'],['dates','起止时间'],['organization','学校'],['description','工作内容（每行一条）','textarea']],
};
export const sectionLabels = {education:'教育背景',projects:'项目经历',research:'科研成果',awards:'荣誉奖项',skills:'个人技能',campus:'学生工作经历',evaluation:'个人评价'};
export const optionalStyleDefaults={spacingScale:1,pageVerticalMargin:32};
export const pageBottomMargin=styles=>Math.max(12,(styles.pageVerticalMargin??optionalStyleDefaults.pageVerticalMargin)-12);
export const styleRanges = {fontSize:[10,16,.5],lineHeight:[1.3,2,.05],sectionGap:[8,30,1],pageMargin:[20,60,1],photoWidth:[55,105,1],logoSize:[45,120,1],spacingScale:[.55,1.5,.05],pageVerticalMargin:[24,60,1]};
export const blankEntry = type => ({id:newEntryId(),...Object.fromEntries(fields[type].map(([key])=>[key,'']))});
export const clone = value => JSON.parse(JSON.stringify(value));
export const getPath = (data,path) => path.split('.').reduce((node,key)=>node?.[key],data);
export function setPath(data,path,value) {
  const keys=path.split('.');
  if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw new Error('无效字段');
  const last=keys.pop(); const parent=keys.reduce((node,key)=>node[key],data);
  if(!Object.hasOwn(parent,last))throw new Error('字段不存在');
  parent[last]=value;
}
export function validate(data) {
  const errors=[];
  const object=(value,label)=>{
    if(!value||Array.isArray(value)||typeof value!=='object'){errors.push(`${label}格式不正确`);return false;}return true;
  };
  const str=(value,label,max=20000)=>{if(typeof value!=='string'||value.length>max)errors.push(`${label}须为不超过 ${max} 字的文本`);};
  const bool=(value,label)=>{if(typeof value!=='boolean')errors.push(`${label}须为开关值`);};
  if(!object(data,'资料'))return errors;
  if(![1,2,3,4].includes(data.version))errors.push('暂不支持此资料版本，请导入本编辑器导出的 JSON');
  if(object(data.profile,'基本信息')) {
    for(const key of ['name','authorName','major','degree','phone','email','politics','birth','extra'])str(data.profile[key],`基本信息 ${key}`,2000);
    if(data.version>=3)for(const key of ['nativePlace','ethnicity'])str(data.profile[key],`基本信息 ${key}`,2000);
    bool(data.profile.showLogo,'校徽显示');bool(data.profile.showPhoto,'照片显示');
    if(!['emblem','contain'].includes(data.profile.logoMode))errors.push('校徽显示方式无效');
    for(const key of ['logo','photo']) {
      const value=data.profile[key];
      if(typeof value!=='string'||value.length>3000000||!(value===''||/^\.\/assets\/[a-zA-Z0-9_\-/]+\.(svg|png|jpe?g|webp)$/i.test(value)||/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(value)))errors.push('图片须为本地素材或 PNG、JPEG、WebP、SVG 图片');
    }
  }
  if(object(data.styles,'样式')) {
    for(const key of ['accent','paper'])if(!/^#[0-9a-fA-F]{6}$/.test(data.styles[key]))errors.push('颜色格式无效');
    for(const [key,[min,max]] of Object.entries(styleRanges)){if(data.styles[key]===undefined&&Object.hasOwn(optionalStyleDefaults,key))continue;if(typeof data.styles[key]!=='number'||!Number.isFinite(data.styles[key])||data.styles[key]<min||data.styles[key]>max)errors.push(`${key}超出可用范围`);}
    if(!['sans','serif'].includes(data.styles.chineseFont))errors.push('中文字体选项无效');
    bool(data.styles.showEnglish,'英文标题');bool(data.styles.showPlaceholders,'待补充提示');
  }
  const ids=Object.keys(sectionLabels);
  if(!Array.isArray(data.sections)||data.sections.length!==ids.length||new Set(data.sections.map(s=>s?.id)).size!==ids.length||data.sections.some(s=>!ids.includes(s?.id)))errors.push('简历模块结构不完整');
  else for(const section of data.sections){str(section.title,'模块标题',100);str(section.english,'英文标题',100);bool(section.visible,'模块显示');}
  for(const [type,definitions] of Object.entries(fields)) {
    if(!Array.isArray(data[type])||data[type].length>100){errors.push(`${type}须为不超过 100 条的列表`);continue;}
    for(const entry of data[type])if(object(entry,type)) {
      for(const [key] of definitions)if(!(type==='projects'&&key==='description'&&data.version>=3)&&!(type==='publications'&&key==='supplement'&&data.version<4))str(entry[key],`${type}.${key}`);
      if(type==='projects'&&data.version>=3){
        if(!Array.isArray(entry.blocks)||entry.blocks.length>100)errors.push('项目正文须为不超过 100 个内容块');
        else for(const block of entry.blocks)if(object(block,'内容块')){
          if(!/^block_[a-zA-Z0-9_-]+$/.test(block.id))errors.push('内容块标识无效');
          if(!['paragraph','bullet','numbered'].includes(block.type))errors.push('内容块类型无效');str(block.text,'内容块正文');
        }
      }
    }
  }
  str(data.evaluation,'个人评价');
  if(!errors.length)errors.push(...validateExtensions(data),...validatePrintLayout(data));
  return errors;
}
