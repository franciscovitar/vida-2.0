import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PLANNING_V2_DISPATCH_LUA,
  createPlanningV2DispatchLedger,
  resolvePlanningV2LedgerConfig,
  validPlanningV2LedgerRecord,
  type PlanningV2LedgerRecord,
} from '@/lib/daily-planning/dispatch-ledger-v2';
import type { UpstashRestConfig } from '@/lib/actions/upstash-rest';

const config: UpstashRestConfig = {
  url: 'https://mock-unit.upstash.io', token: 'test-token-safe-dummy',
  namespace: 'vida2:planning-v2:dev:deadbeef0123456789012345:dispatch-v1', timeoutMs: 1000,
};
const record = (suffix='a'): PlanningV2LedgerRecord => ({
  kind: 'execution',
  recordId: `vida2:tasks-daily-planning:v2:execution:${suffix.repeat(64)}`,
  payloadDigest: 'c'.repeat(64),
});

type Stored = {state:'prepared'|'dispatched';digest:string};
function providerMock(opts: {failAfter?: 'prepare'|'dispatch';broken?:boolean}={}) {
  const map = new Map<string,Stored | string>();
  const requests: string[][] = [];
  let unavailableAfter = opts.failAfter;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const parts = JSON.parse(String(init?.body)) as string[];
    requests.push(parts);
    assert.equal(parts[0],'EVAL');
    assert.equal(parts[2],1);
    assert.equal(parts[1],PLANNING_V2_DISPATCH_LUA);
    const [, , , key, op, digest] = parts;
    const old = map.get(key);
    let result = 'blocked';
    if (opts.broken) result='unexpected';
    else if (old === undefined) {
      if(op==='prepare') {map.set(key,{state:'prepared',digest});result='prepared';}
    } else if(typeof old === 'string') result='blocked';
    else if(old.digest!==digest) result='conflict';
    else if(op==='prepare') result=old.state==='prepared'?'already-prepared':'uncertain';
    else if(op==='dispatch' && old.state==='prepared') {
      map.set(key,{state:'dispatched',digest}); result='dispatch-once';
    } else if(op==='dispatch' && old.state==='dispatched') result='uncertain';
    if(unavailableAfter && unavailableAfter===op) {
      unavailableAfter=undefined;
      throw new Error('simulated lost Upstash HTTP reply');
    }
    return new Response(JSON.stringify({result}),{status:200});
  }) as typeof fetch;
  return {map,requests,fetchImpl};
}

test('config is OFF by default and target cannot be PROD',()=>{
  const env={VERCEL_ENV:'preview',GOOGLE_SHEETS_TARGET:'dev',GOOGLE_SHEETS_DEV_ID:'dev-mock-sheet-id',UPSTASH_REDIS_REST_URL:config.url,UPSTASH_REDIS_REST_TOKEN:config.token};
  assert.equal(resolvePlanningV2LedgerConfig(env).ok,false);
  assert.equal(resolvePlanningV2LedgerConfig({...env,PLANNING_V2_DEV_LEDGER_ENABLED:'true',VERCEL_ENV:'production'}).ok,false);
  assert.equal(resolvePlanningV2LedgerConfig({...env,PLANNING_V2_DEV_LEDGER_ENABLED:'true',GOOGLE_SHEETS_TARGET:'prod'}).ok,false);
  const enabled=resolvePlanningV2LedgerConfig({...env,PLANNING_V2_DEV_LEDGER_ENABLED:'true'});
  assert.equal(enabled.ok,true);
  if(enabled.ok) assert.match(enabled.value.namespace,/^vida2:planning-v2:dev:[0-9a-f]{24}:dispatch-v1$/);
});

test('invalid and surplus raw user fields are rejected before Upstash',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(validPlanningV2LedgerRecord(record()),true);
  assert.equal(await ledger.transition('prepare',{...record(),rawJournal:'private'} as PlanningV2LedgerRecord),'blocked');
  assert.equal(await ledger.transition('prepare',{...record(),payloadDigest:'x'}),'blocked');
  assert.equal(await ledger.transition('prepare',{...record(),recordId:'other'}),'blocked');
  assert.equal(p.requests.length,0);
});

test('single record progresses PREPARED to one DISPATCH; replays never redispatch',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('prepare',record()),'prepared');
  assert.equal(await ledger.transition('prepare',record()),'already-prepared');
  assert.equal(await ledger.transition('dispatch',record()),'dispatch-once');
  assert.equal(await ledger.transition('dispatch',record()),'uncertain');
  assert.equal(await ledger.transition('prepare',record()),'uncertain');
  assert.equal([...p.map.values()][0] && typeof [...p.map.values()][0]==='object' ? ([...p.map.values()][0] as Stored).state : null,'dispatched');
});

test('cannot dispatch a missing reservation',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('dispatch',record()),'blocked');
  assert.equal(p.map.size,0);
});

test('concurrent workers share one dispatch decision for the same ID',async()=>{
  const p=providerMock();const one=createPlanningV2DispatchLedger(config,p.fetchImpl);
  const two=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await one.transition('prepare',record()),'prepared');
  const result=await Promise.all([one.transition('dispatch',record()),two.transition('dispatch',record())]);
  assert.deepEqual(result.sort(),['dispatch-once','uncertain'].sort());
});

test('a conflicting payload cannot reuse the same ID',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('prepare',record()),'prepared');
  assert.equal(await ledger.transition('dispatch',{...record(),payloadDigest:'b'.repeat(64)}),'conflict');
  assert.equal(await ledger.transition('dispatch',record()),'dispatch-once');
});

test('unknown Redis failure after dispatch decision prevents blind retry',async()=>{
  const p=providerMock({failAfter:'dispatch'});
  const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('prepare',record()),'prepared');
  assert.equal(await ledger.transition('dispatch',record()),'unavailable');
  assert.equal(await ledger.transition('dispatch',record()),'uncertain');
});

test('unknown Redis failure after reservation can safely re-observe preparation',async()=>{
  const p=providerMock({failAfter:'prepare'});const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('prepare',record()),'unavailable');
  assert.equal(await ledger.transition('prepare',record()),'already-prepared');
  assert.equal(await ledger.transition('dispatch',record()),'dispatch-once');
});

test('no writable TTL, expiry or deletion in Lua state machine',()=>{
  assert.equal(/redis\.call\(['"](?:EXPIRE|PEXPIRE|DEL|UNLINK|EXPIREAT)['"]/.test(PLANNING_V2_DISPATCH_LUA),false);
  assert.equal(/redis\.call\(['"]SET['"][^\n]*['"]EX['"]/.test(PLANNING_V2_DISPATCH_LUA),false);
  assert.match(PLANNING_V2_DISPATCH_LUA,/state='dispatched'/);
});

test('storage namespace and key are opaque, no raw journal or user text',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  await ledger.transition('prepare',record());
  const args=p.requests[0];assert.equal(args[3].startsWith(config.namespace+':id:'),true);
  assert.equal(args[3].includes(record().recordId),false);
  assert.match(args[3],/:id:[a-f0-9]{64}$/);
});

test('two different observation IDs are independent',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  const a=record('a'),b=record('b');
  assert.equal(await ledger.transition('prepare',a),'prepared');
  assert.equal(await ledger.transition('prepare',b),'prepared');
  assert.equal(await ledger.transition('dispatch',a),'dispatch-once');
  assert.equal(await ledger.transition('dispatch',b),'dispatch-once');
});

test('Redis unexpected response fails closed without dispatch authorization',async()=>{
  const p=providerMock({broken:true});const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  assert.equal(await ledger.transition('prepare',record()),'unavailable');
});

test('corrupt redis state is never implicitly reset',async()=>{
  const p=providerMock();const ledger=createPlanningV2DispatchLedger(config,p.fetchImpl);
  await ledger.transition('prepare',record());const key=[...p.map.keys()][0];p.map.set(key,'bad row');
  assert.equal(await ledger.transition('dispatch',record()),'blocked');
  assert.equal(await ledger.transition('prepare',record()),'blocked');
});

test('wrong namespace cannot create a write ledger',()=>{
  assert.throws(()=>createPlanningV2DispatchLedger({...config,namespace:'vida2:prod'}),/invalid-namespace/);
});
