import test from 'node:test';
import assert from 'node:assert/strict';
import {init, run_queue_step} from '../src/vendor/noita-fungal/main.mjs';
import {recipeSteps,recipeSatisfiesGoals} from '../src/fungal/engine.js';
import {createModel} from '../src/fungal/model.js';
import {emptySession} from '../src/fungal/session.js';

const goal={base:'slime_mist',target:'milk',stain:'urine'};
const shift=(from,to)=>({NOTHING:{fromMaterials:[from],toMaterial:to,useHeld:null,convertTries:0}});

// Feed completed candidate recipes to the actual upstream acceptance check.
// These deterministic sequences do not depend on finding a particular seed.
function check(shifts, constraints=[goal]) {
  const state=init(0,constraints,'vanilla');
  state.world_state.shifts=shifts;
  state.jobs=[{constraints:[],held_materials:[]}];
  run_queue_step(state);
  return state;
}

test('the reported stain-only outcome is rejected and cannot shorten the search', () => {
  const shifts=[shift('milk','urine'),shift('slime_mist','milk')];
  assert.deepEqual(recipeSteps(shifts,[]).world,{milk:'urine',slime_mist:'urine'});
  const state=check(shifts);
  assert.equal(state.solutions.length,0);
  assert.equal(state.failed_checks,1);
  assert.equal(state.world_state.best_length,null);
});

test('a stain goal requires both the requested target and the requested effects', () => {
  for(const shifts of [[shift('slime_mist','milk')],[shift('slime_mist','milk'),shift('milk','oil')]]) {
    assert.equal(check(shifts).solutions.length,0);
  }
  const shifts=[shift('slime_mist','milk'),shift('milk','urine')];
  const state=check(shifts);
  assert.equal(state.solutions.length,1);
  assert.equal(state.solutions[0].length,2);
  assert.deepEqual(state.solutions[0].state,{slime_mist:'milk',milk:'urine'});
  assert.deepEqual(recipeSteps(shifts,[],2).world,state.solutions[0].state);
});

test('all goals must hold at the same endpoint and steps after it are not part of the solution', () => {
  const shifts=[shift('slime_mist','milk'),shift('milk','urine'),shift('slime_mist','urine')];
  assert.equal(check(shifts,[goal,{base:'water',target:'oil'}]).solutions.length,0);
  const [recipe]=check(shifts).solutions;
  assert.equal(recipe.length,2);
  assert.deepEqual(recipeSteps(recipe.shifts,recipe.held_materials,recipe.length).world,recipe.state);
  assert.equal(recipeSteps(shifts,[]).world.slime_mist,'urine','executing later shifts would destroy the requested target');
});

test('recipe validation rejects both an incorrect target and a fabricated final-state summary', () => {
  const shifts=[shift('milk','urine'),shift('slime_mist','milk')];
  const bad={shifts,held_materials:[],length:2,state:{milk:'urine',slime_mist:'urine'}};
  assert.equal(recipeSatisfiesGoals(bad,[goal]),false);
  assert.equal(recipeSatisfiesGoals({...bad,state:{slime_mist:'milk',milk:'urine'}},[goal]),false);
  const [good]=check([shift('slime_mist','milk'),shift('milk','urine')]).solutions;
  assert.equal(recipeSatisfiesGoals(good,[goal]),true);
  assert.equal(recipeSatisfiesGoals(good,[goal,{base:'water',target:'oil'}]),false);
});

test('same-material goals can require a material to remain unchanged', () => {
  const goals=[{base:'magic_liquid_hp_regeneration',target:'magic_liquid_hp_regeneration'}];
  const [recipe]=check([shift('water','oil')],goals).solutions;
  assert.ok(recipe);
  assert.equal(recipeSatisfiesGoals(recipe,goals),true);
  assert.equal(recipeSatisfiesGoals({...recipe,state:{magic_liquid_hp_regeneration:'oil'}},goals),false);
});

test('a bad stain result stops the search before any unverified recipe is displayed', () => {
  const workers=[];
  const model=createModel({...emptySession(),seed:'0',goals:[goal]}, {base:[],apotheosis:[],workerFactory:()=>{
    const worker={postMessage(){},terminate(){this.terminated=true;}};workers.push(worker);return worker;
  }});
  try {
    model.startSearch();
    const shifts=[shift('milk','urine'),shift('slime_mist','milk')];
    workers[0].onmessage({data:{type:'progress',progress:{finished:false,found:1,shortest:2},
      recipes:[{shifts,held_materials:[],length:2,state:{milk:'urine',slime_mist:'urine'}}]}});
    assert.equal(model.get().search.status,'error');
    assert.match(model.get().search.error,/does not satisfy every goal/);
    assert.equal(model.get().search.recipes.length,0);
    assert.equal(workers[0].terminated,true);
  } finally {model.dispose();}
});
