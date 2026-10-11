import assert from 'node:assert/strict';
import { test } from 'node:test';

import { simulatePlanningV2DispatchProtocol } from '@/lib/daily-planning/dispatch-protocol-v2';
import type {
  PlanningV2LedgerRecord,
  PlanningV2LedgerStatus,
} from '@/lib/daily-planning/dispatch-ledger-v2';
import { reconcilePlanningV2Readback } from '@/lib/daily-planning/write-reconciliation-v2';

const HEADER = [
  'Observation ID','Fecha','Registrado en','Activity Type','Domain',
  'Entity Type','Canonical Ref','Actividad','Minutos declarados',
  'Inicio real','Execution State','Evidence State','Progress Effect',
  'Source Class','Confianza','Evidence Refs JSON','Version',
];
const ORIGINAL = [
  'vida2:tasks-daily-planning:v2:execution:'+'a'.repeat(64),
  '2026-10-11','2026-10-11T12:00:00Z',
  'study','university','subject','subject-iop','Práctica simulada',
  75,'','partial','DECLARED','unknown','user_report','Media','[]',
  'planning-execution-v2',
];

type State = { digest: string; dispatched: boolean };
function harness(opts: {send?: 'commit' | 'no-commit' | 'commit-then-error';badBefore?: boolean}={}) {
  const rows: unknown[][]=[HEADER];
  const ledger=new Map<string,State>();
  const calls: string[]=[];
  const digests: string[]=[];
  let attempts=0;
  let inspectCalls=0;
  const ports={
    async transition(action:'prepare' | 'dispatch', record:PlanningV2LedgerRecord):
      Promise<PlanningV2LedgerStatus> {
      calls.push(action);
      digests.push(record.payloadDigest);
      const old=ledger.get(record.recordId);
      if (action==='prepare') {
        if(!old) {ledger.set(record.recordId,{digest:record.payloadDigest,dispatched:false});return 'prepared';}
        if (old.digest!==record.payloadDigest) return 'conflict';
        return old.dispatched?'uncertain':'already-prepared';
      }
      if(!old) return 'blocked';
      if(old.digest!==record.payloadDigest) return 'conflict';
      if(old.dispatched) return 'uncertain';
      old.dispatched=true;
      return 'dispatch-once';
    },
    async inspect() {
      inspectCalls++;
      if(opts.badBefore && inspectCalls===1) throw Error('synthetic failed read');
      return reconcilePlanningV2Readback({
        kind:'execution',
        candidateRow:ORIGINAL,
        rows,
        readStatus:'ready',
        readComplete:true,
      });
    },
    async sendOnce(){
      calls.push('send');
      attempts++;
      if(opts.send !== 'no-commit') rows.push([...ORIGINAL]);
      if(opts.send === 'commit-then-error') throw Error('lost response after commit');
    },
  };
  return {ports,rows,ledger,calls,digests,
    get attempts(){return attempts;},get inspectCalls(){return inspectCalls;}};
}
const run=(x:ReturnType<typeof harness>, candidateRow:readonly unknown[]=ORIGINAL)=>
  simulatePlanningV2DispatchProtocol({kind:'execution',candidateRow},x.ports);

test('one synthetic dispatch and matching readback confirms once', async()=>{
  const x=harness();
  assert.deepEqual(await run(x),{status:'confirmed',sendAttempts:1,retryAllowed:false});
  assert.deepEqual(x.calls,['prepare','dispatch','send']);
  assert.equal(x.rows.length,2);
});
test('pre-existing confirmed physical row prevents dispatch or even ledger prepare', async()=>{
  const x=harness();x.rows.push([...ORIGINAL]);
  assert.equal((await run(x)).status,'already-visible');
  assert.deepEqual(x.calls,[]);
  assert.equal(x.attempts,0);
});
test('missing required candidate version fails before provider or ledger calls', async()=>{
  const x=harness();const row=[...ORIGINAL];row[16]='invalid-version';
  assert.deepEqual(await run(x,row),{status:'blocked',sendAttempts:0,retryAllowed:false});
  assert.equal(x.inspectCalls,0);
});
test('malformed ID fails before touching durable state', async()=>{
  const x=harness();const row=[...ORIGINAL];row[0]='bad';
  assert.equal((await run(x,row)).status,'blocked');
  assert.deepEqual(x.calls,[]);
});
test('failed pre-read means no dispatch', async()=>{
  const x=harness({badBefore:true});
  assert.equal((await run(x)).status,'blocked');
  assert.equal(x.attempts,0);
});
test('a pre-existing physical duplicate blocks a new dispatch', async()=>{
  const x=harness();x.rows.push([...ORIGINAL],[...ORIGINAL]);
  assert.equal((await run(x)).status,'blocked');assert.equal(x.attempts,0);
});
test('a conflicting same-ID physical row blocks dispatch', async()=>{
  const x=harness();const bad=[...ORIGINAL];bad[7]='changed';x.rows.push(bad);
  assert.equal((await run(x)).status,'blocked');assert.equal(x.attempts,0);
});
test('schema corruption blocks dispatch', async()=>{
  const x=harness();x.rows[0]=['bad-header'];
  assert.equal((await run(x)).status,'blocked');assert.equal(x.attempts,0);
});
test('a second call cannot redispatch the same record after an uncertain no-commit', async()=>{
  const x=harness({send:'no-commit'});
  assert.equal((await run(x)).status,'uncertain');
  assert.equal((await run(x)).status,'blocked');
  assert.equal(x.attempts,1);
});
test('two callers with the same digest race; at most one calls sendOnce', async()=>{
  const x=harness();
  const [a,b]=await Promise.all([run(x),run(x)]);
  assert.deepEqual([a.sendAttempts,b.sendAttempts].sort(),[0,1]);
  assert.equal(x.attempts,1);
});
test('lost send response after a committed row is observable as confirmed', async()=>{
  const x=harness({send:'commit-then-error'});
  assert.equal((await run(x)).status,'confirmed');
  assert.equal(x.attempts,1);
});
test('commit is not inferred from a successful transport call without readback', async()=>{
  const x=harness({send:'no-commit'});
  assert.deepEqual(await run(x),{status:'uncertain',sendAttempts:1,retryAllowed:false});
});
test('postread cannot be skipped to declare success', async()=>{
  const x=harness();
  const inspect=x.ports.inspect;
  x.ports.inspect=async()=>{const res=await inspect();if(x.attempts>0) throw Error('readback lost');return res;};
  assert.equal((await run(x)).status,'uncertain');
  assert.equal(x.attempts,1);
});
test('physical duplicate discovered after dispatch is never marked confirmed', async()=>{
  const x=harness();const send=x.ports.sendOnce;
  x.ports.sendOnce=async()=>{await send();x.rows.push([...ORIGINAL]);};
  assert.equal((await run(x)).status,'duplicate');
  assert.equal(x.attempts,1);
});
test('post-commit content conflict is separately detected', async()=>{
  const x=harness();x.ports.sendOnce=async()=>{x.rows.push([...ORIGINAL.slice(0,7),'changed',...ORIGINAL.slice(8)]);};
  assert.equal((await run(x)).status,'conflict');
});
test('unknown redis state after prepare blocks the provider', async()=>{
  const x=harness();
  x.ports.transition=async(action,record)=> {
    if(action==='prepare'){x.ledger.set(record.recordId,{digest:record.payloadDigest,dispatched:false});return 'unavailable';}
    return 'dispatch-once';
  };
  assert.equal((await run(x)).status,'blocked');assert.equal(x.attempts,0);
});
test('lost redis dispatch decision blocks the provider', async()=>{
  const x=harness();
  const transition=x.ports.transition;
  x.ports.transition=async(action,record)=> {
    if(action==='dispatch'){await transition(action,record);throw Error('lost Redis response');}
    return transition(action,record);
  };
  assert.equal((await run(x)).status,'blocked');assert.equal(x.attempts,0);
});
test('local fingerprint is computed, fixed-width hex and stable', async()=>{
  const x=harness();
  await run(x);
  assert.equal(x.digests.length,2);
  assert.match(x.digests[0],/^[0-9a-f]{64}$/);
  assert.equal(x.digests[0],x.digests[1]);
  assert.equal(x.digests[0].includes('Práctica'),false);
});
test('provider never sees the raw current row through protocol statuses', async()=>{
  const x=harness();
  const output=JSON.stringify(await run(x));
  assert.equal(output.includes('Práctica'),false);
  assert.equal(output.includes(String(ORIGINAL[0])),false);
});
