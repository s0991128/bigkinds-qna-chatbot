import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here=fileURLToPath(new URL(".",import.meta.url));
const publicDir=join(here,"..","public");
const port=Number(process.env.PORT||4173);
const allowedOrigin=process.env.ALLOWED_ORIGIN||"*";
const model=process.env.OPENAI_MODEL||"gpt-5.4-mini";
const maxBody=20_000;
const rate=new Map();
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml"};

function headers(extra={}){return{"x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin","content-security-policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.openai.com; img-src 'self' data:; frame-ancestors *","access-control-allow-origin":allowedOrigin,"access-control-allow-headers":"content-type","access-control-allow-methods":"GET,POST,OPTIONS",...extra}}
function json(res,status,data){res.writeHead(status,headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store"}));res.end(JSON.stringify(data))}
function clientIp(req){return String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"unknown").split(",")[0].trim()}
function allow(ip){const now=Date.now(),entry=rate.get(ip)||[];const recent=entry.filter(t=>now-t<60_000);if(recent.length>=30)return false;recent.push(now);rate.set(ip,recent);return true}
async function body(req){let text="";for await(const chunk of req){text+=chunk;if(text.length>maxBody)throw new Error("body_too_large")}return JSON.parse(text||"{}")}
function textFromResponse(data){for(const item of data.output||[])for(const part of item.content||[])if(part.type==="output_text"&&part.text)return part.text;return""}

async function chat(req,res){
  if(!allow(clientIp(req)))return json(res,429,{error:"요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."});
  if(!process.env.OPENAI_API_KEY)return json(res,503,{error:"AI 연동이 비활성화되어 있습니다."});
  let payload;try{payload=await body(req)}catch{return json(res,400,{error:"잘못된 요청입니다."})}
  const question=String(payload.question||"").trim().slice(0,500),sources=Array.isArray(payload.sources)?payload.sources.slice(0,3):[];
  if(!question||!sources.length)return json(res,400,{error:"질문 또는 검색 근거가 없습니다."});
  const evidence=sources.map((s,i)=>`[${i+1}] ${s.title}\n${s.answer}\n기준일: ${s.effectiveDate||"미확인"}`).join("\n\n");
  const instructions=["당신은 빅카인즈 공식 Q&A 안내봇입니다.","반드시 제공된 근거 안에서만 한국어로 답변하세요.","근거에 금액·날짜가 없으면 추정하지 말고 담당자 확인이 필요하다고 말하세요.","API 유료화 질문은 적용 대상, 무료 구간, 초과 단가, 부가세, 적용일을 근거에 있을 때만 답하세요.","비밀번호·인증키·주민등록번호 등 민감정보 입력을 요구하지 마세요.","간결하고 실행 가능한 답변을 제공하세요."].join("\n");
  let upstream;try{upstream=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model,instructions,input:`질문:\n${question}\n\n검색 근거:\n${evidence}`,store:false,max_output_tokens:500})})}catch{return json(res,502,{error:"AI 서비스에 연결할 수 없습니다."})}
  if(!upstream.ok)return json(res,502,{error:"AI 답변 생성에 실패했습니다."});
  const data=await upstream.json(),answer=textFromResponse(data);if(!answer)return json(res,502,{error:"AI 답변이 비어 있습니다."});
  return json(res,200,{answer,category:sources[0]?.title||"기타",escalate:sources[0]?.effectiveDate==="검수 필요"});
}

async function serve(req,res){
  if(req.method==="OPTIONS"){res.writeHead(204,headers());return res.end()}
  if(req.url==="/health")return json(res,200,{status:"ok",ai:Boolean(process.env.OPENAI_API_KEY)});
  if(req.url==="/api/chat"&&req.method==="POST")return chat(req,res);
  if(req.method!=="GET")return json(res,405,{error:"허용되지 않은 요청입니다."});
  const urlPath=decodeURIComponent((req.url||"/").split("?")[0]);
  const relative=normalize(urlPath==="/"?"index.html":urlPath.replace(/^\/+/,""));
  const file=join(publicDir,relative);if(!file.startsWith(publicDir))return json(res,403,{error:"Forbidden"});
  try{const info=await stat(file);if(!info.isFile())throw new Error();const bytes=await readFile(file);const policy=extname(file)===".html"||relative.startsWith("data\\")||relative.startsWith("data/")?"no-cache":"public, max-age=300";res.writeHead(200,headers({"content-type":mime[extname(file)]||"application/octet-stream","cache-control":policy}));res.end(bytes)}catch{return json(res,404,{error:"Not found"})}
}

http.createServer((req,res)=>serve(req,res).catch(()=>json(res,500,{error:"Internal server error"}))).listen(port,"0.0.0.0",()=>console.log(`BIG KINDS Q&A listening on ${port}`));

