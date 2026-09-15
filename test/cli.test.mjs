import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,stat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseStartOptions} from '../scripts/cli.mjs';

test('CLI accepts port flags with precedence and rejects malformed or ambiguous input',()=>{
  assert.equal(parseStartOptions([],{}).port,4173);
  assert.equal(parseStartOptions([],{PORT:'8080'}).port,8080);
  for(const args of [['9000'],['--port','9000'],['--port=9000'],['-p','9000']])assert.equal(parseStartOptions(args,{PORT:'invalid'}).port,9000);
  for(const value of ['1','65535'])assert.equal(parseStartOptions(['--port',value],{}).port,Number(value));
  for(const args of [['--port'],['--port='],['--port','0'],['--port','65536'],['--port','1.5'],['--port','1e3'],['--port','-1'],['--port',' 8080'],['--host','0.0.0.0'],['0'],['65536'],['8080','8081'],['8080','--port','8081'],['--port','8080','8081'],['-p','8080','--port','8081']])assert.throws(()=>parseStartOptions(args,{}));
  for(const value of ['','foo','0','65536'])assert.throws(()=>parseStartOptions([],{PORT:value}));
  assert.deepEqual(parseStartOptions(['--help'],{PORT:'invalid'}),{help:true});
});

test('CLI binds the requested port, reports conflicts and exits cleanly for help or invalid flags',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'zhijian-cli-')),children=[];
  const entry=fileURLToPath(new URL('../scripts/preview.mjs',import.meta.url));
  const run=(args,dataDir)=>{
    const child=spawn(process.execPath,[entry,...args],{env:{...process.env,PORT:'invalid',ZHIJIAN_DATA_DIR:path.join(root,dataDir)},windowsHide:true});
    child.output='';child.stdout.on('data',chunk=>child.output+=chunk);child.stderr.on('data',chunk=>child.output+=chunk);
    children.push(child);return child;
  };
  t.after(()=>{for(const child of children)if(child.exitCode===null)child.kill();});
  for(const [args,code,message] of [[['--help'],0,/npm run server/],[['--port','bad'],1,/1–65535/],[['--unknown'],1,/未知参数/]]){
    const child=run(args,'no-data');const [exit]=await once(child,'exit');assert.equal(exit,code);assert.match(child.output,message);
  }
  await assert.rejects(stat(path.join(root,'no-data')),error=>error.code==='ENOENT');
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const running=run(['--port',String(port)],'active');
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CLI startup timed out: '+running.output)),15000);
    const check=()=>{if(running.output.includes('http://127.0.0.1:'+port)){clearTimeout(timer);resolve();}};
    running.stdout.on('data',check);running.once('exit',code=>{clearTimeout(timer);reject(new Error('CLI exited '+code+': '+running.output));});check();
  });
  const response=await fetch('http://127.0.0.1:'+port+'/api/resumes');assert.equal(response.status,200);assert.deepEqual((await response.json()).resumes,[]);
  const conflict=run(['--port='+port],'conflict');const [exit]=await once(conflict,'exit');assert.equal(exit,1);assert.match(conflict.output,/已被占用/);assert.match(conflict.output,/npm run server/);
});

test('npm server forwards a bare port and separated flags through the real package script',async t=>{
  const npm=process.env.npm_execpath;
  if(!npm){t.skip('Run with npm test to verify npm argument forwarding');return;}
  const root=await mkdtemp(path.join(os.tmpdir(),'zhijian-npm-'));
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  await mkdir(path.join(root,'scripts'));
  await writeFile(path.join(root,'package.json'),JSON.stringify({private:true,type:'module',scripts:pkg.scripts}));
  const parser=new URL('../scripts/cli.mjs',import.meta.url).href;
  // Exercise npm's actual forwarding without starting a persistent server.
  await writeFile(path.join(root,'scripts','preview.mjs'),`import {parseStartOptions} from ${JSON.stringify(parser)}; console.log('PORT_RESULT='+JSON.stringify(parseStartOptions(process.argv.slice(2))));`);
  for(const [args,port] of [[[],4173],[['8080'],8080],[['--','--port','8081'],8081],[['--','--port=8082'],8082]]){
    const env={...process.env};delete env.PORT;
    const child=spawn(process.execPath,[npm,'run','server',...args],{cwd:root,env,windowsHide:true});let output='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    const [exit]=await once(child,'exit');assert.equal(exit,0,output);
    assert.equal(JSON.parse(output.match(/PORT_RESULT=(.+)/)[1]).port,port);
  }
});
