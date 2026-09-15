export function parseStartOptions(args,env=process.env){
  let requestedPort,help=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--help'||arg==='-h'){help=true;continue;}
    if(arg==='--port'||arg==='-p'||arg.startsWith('--port=')){
      if(requestedPort!==undefined)throw new Error('端口参数只能指定一次');
      const value=arg.startsWith('--port=')?arg.slice(7):args[++i];
      if(value===undefined||value==='')throw new Error('端口参数缺少数值，例如 --port 8080');
      requestedPort=value;
    }else if(/^\d+$/.test(arg)){
      if(requestedPort!==undefined)throw new Error('端口参数只能指定一次');
      requestedPort=arg;
    }else throw new Error(`未知参数：${arg}。使用 --help 查看启动方式。`);
  }
  if(help)return {help:true};
  const value=String(requestedPort??env.PORT??4173);
  if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>65535)
    throw new Error('端口必须是 1–65535 之间的整数，例如 --port 8080');
  return {help:false,port:Number(value)};
}

export const startHelp=`纸间 Zhijian · Resume Studio

用法：npm run server [端口]
      npm run server -- [选项]
      node scripts/preview.mjs [选项]

  [端口]                  直接指定端口，例如 npm run server 8080
  --port <端口>, -p <端口>  指定端口（默认 4173）
  --port=<端口>           同上
  --help, -h              显示帮助

例如：npm run server 8080
      npm run server -- --port 8080
单独的 -- 是 npm 转交 --port 等选项所需的分隔符；直接填写端口可省略它。
端口优先级：命令行参数 > PORT 环境变量 > 4173。
服务仅监听本机 127.0.0.1。`;
