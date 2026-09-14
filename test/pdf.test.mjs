import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PDFDocument,PDFName,PDFArray,PDFDict} from 'pdf-lib';
import {fitStyles,browserPath} from '../scripts/pdf.mjs';
import {createResumeServer} from '../scripts/preview.mjs';
import {sectionLabels,blankEntry,validate,clone} from '../app/model.js';
import {newBlock} from '../app/format.js';
import {layoutFingerprint,paginationCSS,activePrintLayout} from '../app/pagination.js';

function fixture(){
 return {version:4,profile:{name:'PDF 测试姓名',authorName:'Test A',major:'软件工程',degree:'硕士',phone:'',email:'',politics:'',birth:'',nativePlace:'',ethnicity:'',extra:'',logo:'',photo:'',logoMode:'contain',showLogo:false,showPhoto:false},styles:{accent:'#30455e',paper:'#ffffff',fontSize:14,lineHeight:2,sectionGap:20,pageMargin:48,photoWidth:82,logoSize:88,chineseFont:'sans',showEnglish:true,showPlaceholders:false},sections:Object.entries(sectionLabels).map(([id,title])=>({id,title,english:id,visible:id==='projects'})),education:[],projects:Array.from({length:7},(_,i)=>({...blankEntry('projects'),title:`Project ${i+1} 项目验证`,dates:'2024–2026',organization:'示例机构',role:'研发',tech:'HTML / CSS',blocks:[{...newBlock('bullet'),text:Array.from({length:8},(_,j)=>`Item ${i+1}.${j+1} 完整保留项目职责与成果，验证分页能够保留每一段正文与符号。`).join('\n')}]})),publications:[],patents:[],awards:[],skills:[],campus:[],evaluation:'',format:{},layouts:{},sectionStyles:{}};
}

test('two-page fit preserves original styles on impossible lengths and uses spacing before font size',async()=>{
 const styles=fixture().styles,original=clone(styles),seen=[];
 const result=await fitStyles(styles,async s=>{seen.push(clone(s));return {pages:s.lineHeight<=1.6?2:3,pdf:Buffer.from('verified')};});
 assert.equal(result.status,'fitted');assert.equal(result.pages,2);assert.equal(result.styles.fontSize,14);assert.deepEqual(styles,original);assert.ok(seen.length<15);
 for(const [pages,status] of [[8,'too-long'],[1,'too-short'],[2,'already']]){
  const seen=[];const failure=await fitStyles(styles,async s=>{seen.push(s);return {pages,pdf:Buffer.from('original')};});
  assert.equal(failure.status,status);assert.deepEqual(failure.styles,original);assert.ok(seen.every(s=>s.fontSize>=11&&s.lineHeight>=1.4));
 }
 const d=fixture();d.styles.spacingScale=.1;assert.ok(validate(d).some(x=>x.includes('spacingScale')));delete d.styles.spacingScale;assert.deepEqual(validate(d),[]);
});

test('saved page spacing is portable, invalidates on layout edits, and never blocks deleted entries',()=>{
 const data=fixture(),key='projects:'+data.projects[0].id;
 data.printLayout={version:1,source:layoutFingerprint(data),gaps:{[key]:8}};
 assert.deepEqual(validate(data),[]);assert.ok(paginationCSS(data).includes('padding-top:8px'));
 const portable=clone(data);portable.profile.photo='data:image/png;base64,AAAA';assert.ok(activePrintLayout(portable));
 const edited=clone(data);edited.projects[0].title+=' new content';assert.equal(activePrintLayout(edited),null);assert.equal(paginationCSS(edited),'');
 const removed=clone(data);removed.projects.shift();assert.deepEqual(validate(removed),[]);assert.equal(paginationCSS(removed),'');
 const invalid=clone(data);invalid.printLayout.gaps[key]=30;assert.ok(validate(invalid).length);
});

test('PDF API renders A4 from an unsaved snapshot, fits using real pages, and never writes resume data',async t=>{
 try{await browserPath();}catch{t.skip('Install Chrome / Edge to run the PDF integration test');return;}
 const root=await mkdtemp(path.join(os.tmpdir(),'paper-pdf-'));await mkdir(path.join(root,'data'));await copyFile(new URL('../styles.css',import.meta.url),path.join(root,'styles.css'));
 const data=fixture(),raw=JSON.stringify(data);await writeFile(path.join(root,'data','resume.json'),raw);
 const server=await createResumeServer({projectRoot:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`,post=(endpoint,input,headers={})=>fetch(base+'/api/resumes/main/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
 assert.equal((await post('pdf',data,{Origin:'https://foreign.example'})).status,403);assert.equal((await post('pdf',{version:4})).status,400);
 const snapshot=clone(data);snapshot.profile.name='Unsaved snapshot';
 const response=await post('pdf',snapshot);assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/application\/pdf/);assert.match(response.headers.get('Content-Disposition'),/Unsaved%20snapshot/);
 const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),Number(response.headers.get('X-PDF-Pages')));for(const p of pdf.getPages()){assert.ok(Math.abs(p.getWidth()-595.28)<1);assert.ok(Math.abs(p.getHeight()-841.89)<1);}
 const fitResponse=await post('fit',snapshot);assert.equal(fitResponse.status,200);const fit=await fitResponse.json();assert.ok(['fitted','already','balanced'].includes(fit.status),JSON.stringify({...fit,pdf:undefined}));assert.equal((await PDFDocument.load(Buffer.from(fit.pdf,'base64'))).getPageCount(),2);
 const fitted={...snapshot,styles:fit.styles,...(fit.printLayout?{printLayout:fit.printLayout}:{})};assert.deepEqual(validate(fitted),[]);
 if(fit.balance){assert.ok(fit.balance.after<fit.balance.before);assert.ok(fit.printLayout);}
 const exported=await PDFDocument.load(Buffer.from(fit.pdf,'base64'));
 for(const page of exported.getPages())for(const ref of page.node.lookupMaybe(PDFName.of('Annots'),PDFArray)?.asArray()||[]){const link=exported.context.lookup(ref,PDFDict),uri=link.lookupMaybe(PDFName.of('A'),PDFDict)?.get(PDFName.of('URI'));assert.ok(!String(uri||'').includes('resume.invalid/pagination/'));}
 const replay=await post('pdf',fitted);assert.equal((await PDFDocument.load(await replay.arrayBuffer())).getPageCount(),2);assert.deepEqual(JSON.parse(replay.headers.get('X-PDF-Pagination')),fit.pagination);
 const repeated=await(await post('fit',fitted)).json();assert.deepEqual(repeated.printLayout,fit.printLayout);assert.deepEqual(repeated.pagination,fit.pagination);
 assert.equal(await readFile(path.join(root,'data','resume.json'),'utf8'),raw);assert.deepEqual((await(await fetch(base+'/api/resumes/main/data')).json()).data,data);
 const tooShort=clone(snapshot);tooShort.projects=[];const short=await(await post('fit',tooShort)).json();assert.equal(short.status,'too-short');assert.equal(short.pdf,undefined);assert.deepEqual(short.styles,tooShort.styles);
});
