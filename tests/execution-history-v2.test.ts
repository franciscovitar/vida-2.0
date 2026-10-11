import assert from 'node:assert/strict';
import {test} from 'node:test';
import {selectPlanningExecutionV2Day} from '@/lib/daily-planning/execution-history-v2';
const d='2026-10-11';
const h=['Observation ID','Fecha','Registrado en','Activity Type','Domain','Entity Type','Canonical Ref','Actividad','Minutos declarados','Inicio real','Execution State','Evidence State','Progress Effect','Source Class','Confianza','Evidence Refs JSON','Version'];
const mk=(suffix: string,refs: string[] = [],at='2026-10-11T14:00:00Z'): unknown[]=>['vida2:tasks-daily-planning:v2:execution:'+suffix.repeat(64),d,at,'study','university','subject','iop','Práctica inventarios',75,'','partial','DECLARED','unknown','user_report','Media',JSON.stringify(refs),'planning-execution-v2'];
const id=(x: string)=>'vida2:tasks-daily-planning:v2:execution:'+x.repeat(64);
const correct=(x:string)=>'correction-of:'+id(x);
test('empty header exists',()=>assert.equal(selectPlanningExecutionV2Day([h],d).status,'empty'));
test('missing schema unavailable',()=>assert.equal(selectPlanningExecutionV2Day([],d).status,'unavailable'));
test('single valid observed study does not claim verified progress',()=>{let s=selectPlanningExecutionV2Day([h,mk('a')],d);assert.equal(s.status,'ready');assert.equal(s.current[0].progressEffect,'unknown')});
test('same ID exact replay with new timestamp dedupes',()=>{let s=selectPlanningExecutionV2Day([h,mk('a'),mk('a',[],'2026-10-11T15:00:00Z')],d);assert.equal(s.status,'ready');assert.equal(s.current.length,1)});
test('same ID mismatched content fails closed',()=>{let b=mk('a');b[7]='Actividad diferente';let s=selectPlanningExecutionV2Day([h,mk('a'),b],d);assert.equal(s.status,'invalid');assert.equal(s.current.length,0)});
test('corrected evidence supersedes previous observation only when explicitly linked',()=>{let corrected=mk('b',[correct('a')]);corrected[11]='VERIFIED';corrected[12]='verified';const s=selectPlanningExecutionV2Day([h,mk('a'),corrected],d);assert.equal(s.status,'ready');assert.equal(s.current.length,1);assert.equal(s.current[0].id,id('b'))});
test('similar activity with different ID but no linkage must not be deduped',()=>{let s=selectPlanningExecutionV2Day([h,mk('a'),mk('b')],d);assert.equal(s.current.length,2)});
test('unknown correction parent fails closed',()=>{let s=selectPlanningExecutionV2Day([h,mk('b',[correct('a')])],d);assert.equal(s.status,'invalid')});
test('two successors for one parent fail closed',()=>{let s=selectPlanningExecutionV2Day([h,mk('a'),mk('b',[correct('a')]),mk('c',[correct('a')])],d);assert.equal(s.status,'invalid')});
test('cycles fail closed',()=>{let s=selectPlanningExecutionV2Day([h,mk('a',[correct('b')]),mk('b',[correct('a')])],d);assert.equal(s.status,'invalid')});
test('raw sensitive extra column rejected',()=>{let r=mk('a');r.push('rawJournal');let s=selectPlanningExecutionV2Day([h,r],d);assert.equal(s.status,'invalid')});
test('bad row plus valid row degrades, never invents progress',()=>{let b=mk('b');b[12]='verified';let s=selectPlanningExecutionV2Day([h,mk('a'),b],d);assert.equal(s.status,'degraded');assert.equal(s.current.length,1)});
test('another day ignored',()=>{let b=mk('a');b[1]='2026-10-10';let s=selectPlanningExecutionV2Day([h,b],d);assert.equal(s.status,'empty')});
test('forged VERIFIED effect with DECLARED evidence rejected',()=>{let b=mk('a');b[12]='verified';let s=selectPlanningExecutionV2Day([h,b],d);assert.equal(s.status,'invalid')});

test('a bare observation ID is evidence, not an implicit correction',()=>{
  let s=selectPlanningExecutionV2Day([h,mk('a'),mk('b',[id('a')])],d);
  assert.equal(s.status,'ready');assert.equal(s.current.length,2);
});
test('typed correction cannot silently supersede another entity',()=>{
  const altered=mk('b',[correct('a')]);altered[6]='dsi';
  const s=selectPlanningExecutionV2Day([h,mk('a'),altered],d);
  assert.equal(s.status,'invalid');assert.equal(s.current.length,0);
});
test('typed correction from a different day cannot supersede the original',()=>{
  const altered=mk('b',[correct('a')]);altered[1]='2026-10-10';
  const s=selectPlanningExecutionV2Day([h,mk('a'),altered],d);
  assert.equal(s.status,'ready');assert.equal(s.current.length,1);
});
test('typed correction cannot have an earlier recordedAt than its parent',()=>{
  const altered=mk('b',[correct('a')],'2026-10-11T13:00:00Z');
  assert.equal(selectPlanningExecutionV2Day([h,mk('a'),altered],d).status,'invalid');
});
test('malformed typed correction token is rejected even if its row looks valid',()=>{
  const altered=mk('b',['correction-of:random']);
  assert.equal(selectPlanningExecutionV2Day([h,mk('a'),altered],d).status,'degraded');
});
test('separate evidence refs do not change independent observations',()=>{
  const s=selectPlanningExecutionV2Day([h,mk('a'),mk('b',['source:milestone'])],d);
  assert.equal(s.status,'ready');assert.equal(s.current.length,2);
});

test('sanitized Sheets null optional cells remain valid without inventing a canonical entity',()=>{
  const r=mk('f'); r[5]='none'; r[6]=null; r[8]=null; r[9]=null;
  const s=selectPlanningExecutionV2Day([h,r],d);
  assert.equal(s.status,'ready');
  assert.equal(s.current.length,1);
  assert.equal(s.current[0]?.canonicalRef,null);
  assert.equal(s.current[0]?.declaredMinutes,null);
  assert.equal(s.current[0]?.realStart,null);
});
test('missing required canonical identity is not silently repaired from null',()=>{
  const r=mk('f'); r[6]=undefined;
  const s=selectPlanningExecutionV2Day([h,r],d);
  assert.equal(s.status,'invalid');
});
test('blank optional canonical ref is allowed for a declared, unverified subject',()=>{
  const r=mk('f'); r[6]=null;
  const s=selectPlanningExecutionV2Day([h,r],d);
  assert.equal(s.status,'ready');
  assert.equal(s.current[0]?.progressEffect,'unknown');
});
