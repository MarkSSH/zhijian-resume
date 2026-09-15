import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createResumeStore,StoreError} from './store.mjs';
import {renderDocument} from '../app/render.js';
import {createPdfService} from './pdf.mjs';
import {listPresets} from './presets.mjs';
import {parseStartOptions,startHelp} from './cli.mjs';

const mimeTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.js':'text/javascript; charset=utf-8'};
const json=(response,code,value)=>response.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));
async function body(request,limit=7000000){if(!request.headers['content-type']?.startsWith('application/json'))throw new StoreError(415,'请使用 JSON 资料');const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>limit)throw new StoreError(413,'资料过大，请缩小图片或文字后再保存');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new StoreError(400,'JSON 格式不正确');}}
export async function createResumeServer({projectRoot,dataRoot}){
 const store=await createResumeStore(projectRoot,{dataRoot}),renderPdf=createPdfService(projectRoot);
 return createServer(async(request,response)=>{
  const host=request.headers.host||'';
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)){json(response,403,{error:'仅允许本机访问'});return;}
  if(request.headers.origin&&request.headers.origin!==`http://${host}`||request.headers['sec-fetch-site']==='cross-site'){json(response,403,{error:'请求来源不匹配'});return;}
  try{
   const url=new URL(request.url,`http://${host}`),pathname=decodeURIComponent(url.pathname),method=request.method;
   if(pathname==='/api/presets'){
    if(method==='GET')json(response,200,{presets:listPresets()});
    else json(response,405,{error:'不支持此操作'});return;
   }
   if(pathname==='/api/trash'){
    if(method==='GET')json(response,200,await store.trash());
    else json(response,405,{error:'不支持此操作'});return;
   }
   const trash=pathname.match(/^\/api\/trash\/(main|resume_[a-f0-9]{32})(\/restore)?$/);
   if(trash){
    if(trash[2]&&method==='POST')json(response,200,await store.restore(trash[1],request.headers['if-match']));
    else if(!trash[2]&&method==='DELETE')json(response,200,await store.purge(trash[1],request.headers['if-match']));
    else json(response,405,{error:'不支持此操作'});return;
   }
   if(pathname==='/api/resumes'){
    if(method==='GET')json(response,200,await store.list());
    else if(method==='POST')json(response,201,await store.create(await body(request,5000)));
    else json(response,405,{error:'不支持此操作'});return;
   }
   const print=pathname.match(/^\/api\/resumes\/(main|resume_[a-f0-9]{32})\/(pdf|fit)$/);
   if(print){
    if(method!=='POST'){json(response,405,{error:'请使用 POST 提交当前简历'});return;}
    await store.read(print[1]);const input=await body(request),result=await renderPdf(input,{fit:print[2]==='fit'});
    if(print[2]==='fit')json(response,200,{...result,pdf:['fitted','already','balanced'].includes(result.status)?result.pdf.toString('base64'):undefined});
    else{const filename=encodeURIComponent((input.profile.name||'个人简历')+'-简历.pdf'),pagination=JSON.stringify(result.pagination);response.writeHead(200,{'Content-Type':'application/pdf','Content-Length':result.pdf.length,'Cache-Control':'no-store','Content-Disposition':`attachment; filename="resume.pdf"; filename*=UTF-8''${filename}`,'X-PDF-Pages':result.pages,'X-PDF-Pagination':pagination.length<6000?pagination:'{}'});response.end(result.pdf);}
    return;
   }
   const match=pathname.match(/^\/api\/resumes\/(main|resume_[a-f0-9]{32})(?:\/(data|previous))?$/);
   if(match||pathname==='/api/resume'||pathname==='/api/previous'){
    const id=match?.[1]||'main',kind=match?(match[2]||'metadata'):pathname==='/api/resume'?'data':'previous';
    if(kind==='data'&&method==='GET')json(response,200,await store.read(id));
    else if(kind==='data'&&method==='PUT')json(response,200,await store.save(id,await body(request),request.headers['if-match']));
    else if(kind==='previous'&&method==='GET')json(response,200,await store.previous(id));
    else if(kind==='metadata'&&method==='PATCH')json(response,200,await store.update(id,await body(request,5000),request.headers['if-match']));
    else if(kind==='metadata'&&method==='DELETE')json(response,200,await store.remove(id,request.headers['if-match']));
    else json(response,405,{error:'不支持此操作'});return;
   }
   if(pathname.startsWith('/api/')){json(response,404,{error:'接口不存在'});return;}
   if(!['GET','HEAD'].includes(method)){response.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
   const view=pathname==='/index.html'?['','main']:pathname.match(/^\/view\/(main|resume_[a-f0-9]{32})$/);
   if(view){const {data}=await store.read(view[1]),html=renderDocument(data).replace('<head>','<head><base href="/">');response.writeHead(200,{'Content-Type':mimeTypes['.html'],'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});response.end(method==='HEAD'?undefined:html);return;}
   const relativePath=pathname==='/'?(url.searchParams.has('section')||url.searchParams.has('tab')?'editor.html':'home.html'):pathname.replace(/^\/+/,''),filePath=path.resolve(projectRoot,relativePath),relative=path.relative(projectRoot,filePath),extension=path.extname(filePath);
   const allowed=['index.html','styles.css','editor.html','home.html'].includes(relative)||(relative.startsWith(`app${path.sep}`)&&['.js','.css'].includes(extension))||(relative.startsWith(`assets${path.sep}`)&&['.svg','.png','.jpg','.jpeg','.webp','.woff2'].includes(extension));
   if(!allowed||relative.startsWith('..')||path.isAbsolute(relative)){response.writeHead(404).end('Not found');return;}
   if(relative==='index.html')await store.read('main');
   if(!(await stat(filePath)).isFile())throw new StoreError(404,'文件不存在');const content=await readFile(filePath);response.writeHead(200,{'Content-Type':mimeTypes[extension]||'application/octet-stream','Cache-Control':'no-store','Content-Length':content.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});response.end(method==='HEAD'?undefined:content);
  }catch(error){if(!response.headersSent)json(response,error.status||(error.code==='ENOENT'?404:500),{error:error.status?error.message:error.code==='ENOENT'?'文件不存在':'保存或读取失败，请检查本地服务后重试'});}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const options=parseStartOptions(process.argv.slice(2));
  if(options.help)console.log(startHelp);
  else{
   const {port}=options,projectRoot=fileURLToPath(new URL('../',import.meta.url));
   const server=await createResumeServer({projectRoot,dataRoot:process.env.ZHIJIAN_DATA_DIR});
   server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用 npm run server <其他端口> 启动。`:error.message);process.exitCode=1;});
   server.listen(port,'127.0.0.1',()=>console.log(`纸间 Zhijian · Resume Studio: http://127.0.0.1:${server.address().port}`));
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
