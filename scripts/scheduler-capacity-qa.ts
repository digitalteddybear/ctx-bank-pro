import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OutreachStore} from '../src/lib/server/outreach/store';
import {OutreachEngine} from '../src/lib/server/outreach/engine';
import {FixtureModel} from '../src/lib/server/outreach/models';
import {OutreachScheduler,readDeliveryLimits} from '../src/lib/server/outreach/scheduler';
import {CampaignRegistry} from '../src/lib/server/outreach/campaigns';
import {deliveryLimitsSchema} from '../src/lib/outreach-campaign-contract';

test('135 openings retain capacity for 135 replies; budgets survive restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'ctx-budget-'));
  let store=new OutreachStore(join(directory,'workflows.sqlite'));
  try{
    const engine=new OutreachEngine(store,new FixtureModel());
    let scheduler=new OutreachScheduler(store);
    const sender='sender@example.test',start=Date.parse('2026-11-02T08:30:00Z');
    for(let index=0;index<136;index++){
      const run=engine.create({id:String(index),name:'Synthetic',email:`lead${index}@example.test`,permission:'granted',facts:[]});
      scheduler.enqueue({id:`initial-${index}`,runId:run.id,sender,kind:'initial'},start);
    }
    let initials=0,replies=0;
    for(let now=start;now<start+9*3600000;now+=15000){
      const delivery=scheduler.claim(sender,undefined,now,()=>0);
      if(!delivery)continue;
      scheduler.finish(delivery,'accepted',now);
      if(delivery.kind==='initial'){
        initials++;
        scheduler.enqueue({id:`reply-${delivery.id}`,runId:delivery.runId,sender,kind:'reply'},now);
      }else replies++;
    }
    assert.equal(initials,135);assert.equal(replies,135);
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM delivery_queue WHERE state='accepted'").get()?.n,270);
    store.close();store=new OutreachStore(join(directory,'workflows.sqlite'));scheduler=new OutreachScheduler(store);
    assert.equal(scheduler.claim(sender,undefined,start+8.9*3600000),undefined);
    const next=scheduler.claim(sender,undefined,start+24*3600000,()=>0);
    assert.equal(next?.kind,'initial');
    assert.equal(next?.id,'initial-135');
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});

test('saved sender limits validate and legacy saves preserve operator configuration',()=>{
  const store=new OutreachStore(':memory:');
  try{
    const registry=new CampaignRegistry(store);
    const {updatedAt: _updatedAt,...settings}=registry.preferences();
    registry.savePreferences({...settings,deliveryLimits:{dailyStarts:25,dailyTotal:100}});
    assert.deepEqual(readDeliveryLimits(store),{dailyStarts:25,dailyTotal:100});
    const legacy={...settings};delete (legacy as Partial<typeof legacy>).deliveryLimits;
    registry.savePreferences(legacy);
    assert.deepEqual(readDeliveryLimits(store),{dailyStarts:25,dailyTotal:100});
    assert.equal(deliveryLimitsSchema.safeParse({dailyStarts:135,dailyTotal:100}).success,false);
    assert.equal(deliveryLimitsSchema.safeParse({dailyStarts:0,dailyTotal:100}).success,false);
    assert.equal(deliveryLimitsSchema.safeParse({dailyStarts:135,dailyTotal:Infinity}).success,false);
  }finally{store.close();}
});
