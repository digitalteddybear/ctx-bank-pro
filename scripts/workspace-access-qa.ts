import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NextRequest} from 'next/server';
import {hasLocalWorkspaceAccess} from '../src/lib/server/local-workspace-auth';
test('Docker secret token works on hosted routes; wrong and missing tokens fail',()=>{
const dir=mkdtempSync(join(tmpdir(),'ctx-auth-'));const file=join(dir,'operator');const token='a'.repeat(64);writeFileSync(file,token);
const old=process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE;process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE=file;
try{assert.equal(hasLocalWorkspaceAccess(new NextRequest('https://ctx.example.test/api/agents/campaign',{headers:{authorization:'Bearer '+token}})),true);assert.equal(hasLocalWorkspaceAccess(new NextRequest('https://ctx.example.test/api/agents/campaign')),false);assert.equal(hasLocalWorkspaceAccess(new NextRequest('https://ctx.example.test/api/agents/campaign',{headers:{authorization:'Bearer '+'b'.repeat(64)}})),false);process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE=file+'-missing';assert.equal(hasLocalWorkspaceAccess(new NextRequest('http://localhost/api/agents/campaign',{headers:{origin:'http://localhost'}})),false);}finally{if(old===undefined)delete process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE;else process.env.CTX_OUTREACH_OPERATOR_TOKEN_FILE=old;rmSync(dir,{recursive:true});}});
