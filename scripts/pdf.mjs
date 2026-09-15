import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {renderDocument,themeCSS} from '../app/render.js';
import {clone,validate,optionalStyleDefaults,styleRanges,pageBottomMargin} from '../app/model.js';
import {migrate} from '../app/format.js';
import {imageSlots} from '../app/images.js';
import {StoreError} from './store.mjs';
import {instrumentPagination,readPagination,balanceTwoPages} from './pagination.mjs';

export async function browserPath(){
 const candidates=[process.env.RESUME_BROWSER_PATH];
 if(process.platform==='win32')for(const root of [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean))for(const app of ['Google/Chrome/Application/chrome.exe','Microsoft/Edge/Application/msedge.exe'])candidates.push(path.join(root,app));
 else candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/microsoft-edge');
 for(const candidate of candidates.filter(Boolean))try{await access(candidate);return candidate;}catch{}
 throw new StoreError(503,'未找到 Chrome 或 Edge。请安装其中一个浏览器，或用 RESUME_BROWSER_PATH 指定浏览器路径后重启服务。');
}

async function embedImages(data,root){
 const copy=clone(data),types={'.svg':'svg+xml','.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.webp':'webp'};
 for(const {owner,key} of imageSlots(copy))if(owner[key]?.startsWith('./assets/')){
  const assetRoot=path.resolve(root,'assets'),file=path.resolve(root,owner[key]),relative=path.relative(assetRoot,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new StoreError(400,'图片路径无效');
  try{owner[key]=`data:image/${types[path.extname(file).toLowerCase()]};base64,${(await readFile(file)).toString('base64')}`;}
  catch{throw new StoreError(422,'图片文件无法读取，请重新选择图片后导出。');}
 }
 return copy;
}

// Search along a bounded typography path; only an actually rendered two-page PDF succeeds.
export async function fitStyles(styles,render){
 const initial=await render(styles),beforePages=initial.pages;
 if(beforePages===2)return {status:'already',beforePages,...initial,styles};
 const base={...optionalStyleDefaults,...styles},compress=beforePages>2;
 const space={...base,...(compress?{
  spacingScale:Math.min(base.spacingScale,.55),sectionGap:Math.min(base.sectionGap,8),
  pageMargin:Math.min(base.pageMargin,32),pageVerticalMargin:Math.min(base.pageVerticalMargin,24),lineHeight:Math.min(base.lineHeight,1.4),
 }:{spacingScale:Math.max(base.spacingScale,1.5),sectionGap:Math.max(base.sectionGap,24),pageMargin:Math.max(base.pageMargin,50),pageVerticalMargin:Math.max(base.pageVerticalMargin,46),lineHeight:Math.max(base.lineHeight,1.85)})};
 const smaller={...space,fontSize:Math.min(base.fontSize,11)},larger={...space,fontSize:Math.max(base.fontSize,14)};
 let start=base;
 for(const end of [space,compress?smaller:larger]){
  const edge=await render(end);
  if(!compress&&edge.pages===2)return {status:'fitted',beforePages,...edge,styles:end};
  if(compress?edge.pages<=2:edge.pages>=2){
   let low=0,high=1,best=edge.pages===2?{...edge,styles:end}:null;
   for(let i=0;i<8;i++){
    const t=(low+high)/2,candidate={...start};
    for(const key of ['spacingScale','sectionGap','pageMargin','pageVerticalMargin','lineHeight','fontSize']){const step=styleRanges[key][2];candidate[key]=Math.round(Math.round((start[key]+(end[key]-start[key])*t)/step)*step*100)/100;}
    const result=await render(candidate);
    if(result.pages===2)best={...result,styles:candidate};
    if(compress?result.pages>2:result.pages<2)low=t;else high=t;
   }
   if(best)return {status:'fitted',beforePages,...best};
  }
  start=end;
 }
 return {status:compress?'too-long':'too-short',beforePages,...initial,styles};
}

export function createPdfService(projectRoot){
 let active=false;
 return async(input,{fit=false}={})=>{
  if(active)throw new StoreError(429,'正在生成另一份 PDF，请稍后重试。');
  let data;try{data=migrate(input);}catch{throw new StoreError(400,'简历资料格式不正确');}
  const errors=validate(data);if(errors.length)throw new StoreError(400,errors.slice(0,3).join('；'));
  active=true;let browser,timer;
  try{
   const executablePath=await browserPath(),portable=await embedImages(data,projectRoot),css=await readFile(path.join(projectRoot,'styles.css'),'utf8');
   browser=await chromium.launch({executablePath,headless:true,timeout:20000});
   timer=setTimeout(()=>browser.close().catch(()=>{}),90000);
   const page=await browser.newPage({viewport:{width:1100,height:1200},javaScriptEnabled:false});
   // Rendering is local and isolated: imported SVGs cannot fetch external resources or run scripts.
   await page.route('**/*',route=>route.abort());
   await page.emulateMedia({media:'print'});
   await page.setContent(renderDocument(portable,css),{waitUntil:'load',timeout:15000});
   await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));
    if([...document.images].some(img=>!img.naturalWidth))throw new Error('图片无法解码');
   });
   const units=await instrumentPagination(page,data),cache=new Map();
   const render=async(styles,printLayout=fit?null:data.printLayout)=>{
    const key=JSON.stringify({styles,printLayout});if(cache.has(key))return cache.get(key);
    await page.locator('#resume-theme').evaluate((node,theme)=>node.textContent=theme,themeCSS({...portable,styles,printLayout}));
    await page.evaluate(({top,bottom})=>{
     const height=297*96/25.4-top-bottom;
     for(const entry of document.querySelectorAll('.project-entry,.internship-entry,.education-entry,.publications li,.patents-list li,.campus-list article')){
      entry.removeAttribute('data-print-split');
      if(entry.getBoundingClientRect().height>height-4)entry.setAttribute('data-print-split','true');
     }
    },{top:styles.pageVerticalMargin??32,bottom:pageBottomMargin(styles)});
    const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,tagged:true,timeout:15000});
    const result=await readPagination(pdf,units,styles);cache.set(key,result);return result;
   };
   const result=fit?await balanceTwoPages(data,await fitStyles(data.styles,render),render):{...await render(data.styles),styles:data.styles};
   delete result.regions;return result;
  }catch(error){if(error.status)throw error;throw new StoreError(500,'PDF 排版未完成，请检查图片是否有效并重试。若持续失败，请重启本地服务。');}
  finally{clearTimeout(timer);if(browser)await browser.close().catch(()=>{});active=false;}
 };
}
