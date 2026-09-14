import {PDFDocument,PDFName,PDFArray,PDFDict,PDFString,PDFHexString} from 'pdf-lib';
import {layoutFingerprint,paginationUnits} from '../app/pagination.js';
import {pageBottomMargin} from '../app/model.js';

const prefix='https://resume.invalid/pagination/';
// Temporary link annotations report Chromium's actual fragment rectangles. They are removed before export.
export async function instrumentPagination(page,data){
 const units=paginationUnits(data);
 const present=await page.evaluate(({units,prefix})=>units.flatMap(unit=>{
  const node=document.querySelector(unit.selector);if(!node||!node.getBoundingClientRect().height)return [];
  if(getComputedStyle(node).position==='static')node.style.position='relative';
  const marker=document.createElement('a');marker.setAttribute('aria-hidden','true');marker.tabIndex=-1;marker.href=prefix+encodeURIComponent(unit.key);marker.style.cssText='position:absolute;inset:0;display:block;pointer-events:none;';node.append(marker);
  return [{...unit}];
 }),{units,prefix});
 return present;
}

export async function readPagination(bytes,units,styles){
 const doc=await PDFDocument.load(bytes),pages=doc.getPages(),regions=[];
 for(const [index,page] of pages.entries()){
  const annotations=page.node.lookupMaybe(PDFName.of('Annots'),PDFArray),remaining=[];
  for(const ref of annotations?.asArray()||[]){
   const annotation=doc.context.lookup(ref,PDFDict),action=annotation.lookupMaybe(PDFName.of('A'),PDFDict),uri=action?.get(PDFName.of('URI'));
   if((uri instanceof PDFString||uri instanceof PDFHexString)&&uri.decodeText().startsWith(prefix)){
    const key=decodeURIComponent(uri.decodeText().slice(prefix.length)),rect=annotation.lookup(PDFName.of('Rect'),PDFArray).asArray().map(x=>x.asNumber());
    const top=(page.getHeight()-rect[3])*4/3,bottom=(page.getHeight()-rect[1])*4/3;
    regions.push({key,page:index+1,top,bottom,split:top<-.5||bottom>page.getHeight()*4/3+.5});
   }else remaining.push(ref);
  }
  if(annotations){if(remaining.length)page.node.set(PDFName.of('Annots'),doc.context.obj(remaining));else page.node.delete(PDFName.of('Annots'));}
 }
 const order=new Map(units.map((unit,i)=>[unit.key,i])),breaks=[];
 for(let number=2;number<=pages.length;number++){
  const candidates=regions.filter(r=>r.page===number).sort((a,b)=>a.top-b.top||(order.get(a.key)??0)-(order.get(b.key)??0)),first=candidates[0];
  if(first)breaks.push({page:number,key:first.key,split:first.split||regions.some(r=>r.split||r.key===first.key&&r.page<number)});
 }
 const whitespace=pages.map((page,i)=>{
  const content=regions.filter(r=>r.page===i+1&&!r.split);
  return content.length?Math.max(0,page.getHeight()*4/3-pageBottomMargin(styles)-Math.max(...content.map(r=>r.bottom))):null;
 });
 return {pdf:Buffer.from(await doc.save()),pages:pages.length,pagination:{breaks,whitespace},regions};
}

export async function balanceTwoPages(data,result,render){
 if(result.pages!==2)return result;
 const base={...data,styles:result.styles};delete base.printLayout;
 const original=result,regions=result.regions||[],free=result.pagination?.whitespace?.[0];
 if(!Number.isFinite(free)||free<20||regions.some(r=>r.split))return {...result,printLayout:null};
 const units=paginationUnits(base),onFirst=new Set(regions.filter(r=>r.page===1&&!regions.some(other=>other.key===r.key&&other.page!==1)).map(r=>r.key));
 const candidates=units.filter(u=>onFirst.has(u.key)&&u.maxGap>0);
 if(candidates.length<2)return {...result,printLayout:null};
 const budget=Math.min(free-8,candidates.reduce((sum,u)=>sum+u.maxGap,0));
 const fingerprint=layoutFingerprint(base),makeLayout=ratio=>({version:1,source:fingerprint,gaps:Object.fromEntries(candidates.map(u=>[u.key,Math.floor(budget*ratio*u.maxGap/candidates.reduce((sum,u)=>sum+u.maxGap,0))]).filter(([,gap])=>gap>0))});
 const sameBreaks=next=>JSON.stringify(next.pagination?.breaks)===JSON.stringify(original.pagination.breaks);
 let low=0,high=1,best={...result,printLayout:null};
 for(let i=0;i<6;i++){
  const ratio=i===0?1:(low+high)/2,printLayout=makeLayout(ratio),trial=await render(result.styles,printLayout);
  if(trial.pages===2&&sameBreaks(trial)&&trial.pagination.whitespace[0]>=4){
   low=ratio;if(trial.pagination.whitespace[0]<best.pagination.whitespace[0])best={...result,...trial,printLayout};if(i===0)break;
  }else high=ratio;
 }
 const gained=free-best.pagination.whitespace[0];
 return {...best,status:gained>=2?'balanced':result.status,balance:gained>=2?{page:1,before:Math.round(free),after:Math.round(best.pagination.whitespace[0])}:undefined};
}
