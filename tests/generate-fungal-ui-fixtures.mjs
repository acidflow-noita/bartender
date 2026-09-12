// Optional fixture generation: requires the pinned source in task/noita-fungal.
// Do not regenerate fixtures to mask a mismatch in the implementation.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {init,run_queue_step} from '../task/noita-fungal/main.mjs';
const root=fileURLToPath(new URL('../', import.meta.url));
const source=fs.readFileSync(root+'task/noita-fungal/index.html','utf8');
const functionSource=(name,next)=>source.slice(source.indexOf(`function ${name}(`),source.indexOf(`\n\t\t\tfunction ${next}(`)).replaceAll('\n\t\t\t','\n');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
// Data collector only: executes original table-producing functions in Node,
// recording values. No browser, rendering, DOM package or page testing.
function record(tag='text',value='') {
 return {tag,childNodes:[],value, appendChild(child){this.childNodes.push(child);return child;},
 removeChild(child){this.childNodes.splice(this.childNodes.indexOf(child),1);},setAttribute(){},
 get text(){return this.value+this.childNodes.map(n=>n.text).join('');}};
}
function context(ids,state) {
 const document={getElementById:id=>ids[id],createElement:tag=>record(tag),createTextNode:text=>record('text',String(text))};
 const ctx=vm.createContext({document,state,console:{log(){}}});
 for(const [name,next]of [['make_td','make_material'],['make_material','make_material_td'],['make_material_td','cycle_changed'],['cycle_changed','pray_to_gods'],['recipe_changed','mode_changed']])vm.runInContext(functionSource(name,next),ctx);
 vm.runInContext('function td_text(text){let td=document.createElement("td");td.appendChild(document.createTextNode(text));return td;}',ctx);
 return ctx;
}
const fixture=JSON.parse(fs.readFileSync(root+'tests/fungal-upstream-fixtures.json','utf8'));
fixture.ui={goalFunction:hash(functionSource('pray_to_gods','clear_tablet')),goals:[],predictions:[],recipes:[]};
const goalCases=[[],[{base:'air',target:'air',stain:'air'}],[{base:'air',target:'oil',stain:'air'}],[{base:'air',target:'air',stain:'blood'}],[{base:'water',target:'air',stain:'air'}],[{base:'water',target:'oil',stain:'air'}],[{base:'water',target:'oil',stain:'blood'}],[{base:'water',target:'oil',stain:'air'},{base:'water',target:'blood',stain:'air'}],[{base:'water',target:'oil',stain:'blood'},{base:'oil',target:'sand',stain:'air'}],[{base:'water',target:'oil',stain:'blood'},{base:'oil',target:'blood',stain:'air'}],[{base:'air',target:'air',stain:'air'},{base:'water',target:'water',stain:'air'}]];
for(const goals of goalCases){
 const ctx=vm.createContext({transmutations:goals.map(g=>({sacrifice:{value:g.base},product:{value:g.target},stain:{value:g.stain}}))});
 vm.runInContext(functionSource('pray_to_gods','clear_tablet'),ctx);
 fixture.ui.goals.push({goals,result:JSON.parse(vm.runInContext('JSON.stringify((()=>{let constraints=[];let error=pray_to_gods(constraints);return {constraints,error};})())',ctx))});
}
const log=console.log;console.log=()=>{};
try {
for(const mode of ['vanilla','apotheosis','apotheosis_bungal','apotheosis_bungal_spam']){
 for(const seed of [1,12,600,3073,418190922])for(const cycle of [0,3,28]){
  const state=init(seed,[],mode);
  const ids={cycle:{valueAsNumber:cycle},shifts:record('tbody')};
  const ctx=context(ids,state);ctx.cycle_changed();
  let iteration=0;
  const rows=ids.shifts.childNodes.map(tr=>{
    const cells=tr.childNodes.slice();if(cells.length===5)iteration=Number(cells.shift().text);
    return {iteration,presentation:cells[0].text,interpretation:cells[1].text,sacrifices:cells[2].childNodes.filter(n=>n.tag!=='br').map(n=>n.text),product:cells[3].text};
  });
  fixture.ui.predictions.push({mode,seed,cycle,sha256:hash(rows)});
 }
 const state=init(970230895,[{base:'blood',target:'magic_liquid_hp_generation'}],mode);
 while(!state.finished)run_queue_step(state);
 for(const index of [...new Set([0,state.solutions.length-1,...state.solutions.map((r,i)=>r.shift_nr<r.length?i:-1).filter(i=>i>=0).slice(0,1)])]){
  const recipe=state.solutions[index];if(!recipe)continue;
  const ids={recipe_nr:{valueAsNumber:index+1},pre_state:record('p'),world:record('table'),recipe:record('table')};
  for(const id of ['world','recipe'])ids[id].childNodes=[record('thead'),record('thead')];
  const ctx=context(ids,state);ctx.recipe_changed();
  let i=0,cycle=recipe.base_ng;
  const steps=[];
  for(const tr of ids.recipe.childNodes.slice(2)){
    const cells=tr.childNodes;
    if(cells.length===1){cycle++;continue;}
    const role=cells.length===4?cells[1].text:'';
    steps.push({iteration:++i,cycle,presentation:cells[0].text,interpretation:role,sacrifices:cells.at(-2).childNodes.map(n=>n.text),product:cells.at(-1).text});
  }
  const world=ids.world.childNodes.slice(2).map(tr=>({material:tr.childNodes[0].text,appearance:tr.childNodes[1].text,effects:tr.childNodes[2]?.text||''}));
  fixture.ui.recipes.push({mode,seed:970230895,index,sha256:hash({steps,world})});
 }
}
}finally{console.log=log;}
// Execute original dropdown lifecycle functions with option-data collectors.
// This records actual source additions/order, not a reimplementation of them.
fixture.ui.catalogLifecycles = [];
const journeys = [
  [{type:'seed',seed:'418190922',mode:'vanilla'}, {type:'custom',id:'custom_shift_material'},
    {type:'mode',mode:'apotheosis'}, {type:'mode',mode:'apotheosis_bungal'},
    {type:'mode',mode:'apotheosis_bungal_spam'}, {type:'seed',seed:'12'},
    {type:'mode',mode:'vanilla'}, {type:'seed',seed:''},
    {type:'custom',id:'air'}, {type:'custom',id:'custom_shift_material'}],
  ...['vanilla','apotheosis','apotheosis_bungal','apotheosis_bungal_spam'].map(mode => [
    {type:'seed',seed:'12',mode}, {type:'seed',seed:'418190922'}, {type:'seed',seed:'12'},
  ]),
];
for (const actions of journeys) {
  const seedField = {value:'', valueAsNumber:NaN};
  const makeCup = () => ({values:[], appendChild(option){this.values.push(option.text);}});
  const cup = makeCup();
  const ctx = vm.createContext({init, mode:actions[0].mode, seed:0, transmutations:[], cycle_changed(){},
    document:{getElementById(){return seedField;}, createElement(){return {};}}, console:{log(){}}});
  for (const [name,next] of [['dream','thought'],['thought','imagine'],['imagine_real','seed_changed'],['seed_changed','make_td'],['mode_changed','td_text']]) {
    vm.runInContext(functionSource(name,next),ctx);
  }
  const snapshots = [];
  for (const [index, action] of actions.entries()) {
    if (action.type === 'seed') {
      seedField.value = action.seed; seedField.valueAsNumber = Number(action.seed);
      ctx.seed_changed();
    } else if (action.type === 'mode') ctx.mode_changed({target:{value:action.mode}});
    else ctx.imagine_real(action.id);
    if (index === 0) {ctx.dream(cup); ctx.transmutations.push({sacrifice:cup});}
    const newCup = makeCup(); ctx.dream(newCup);
    snapshots.push({action, ids:[...ctx.materials].sort(), existingOptions:[...cup.values], newOptions:[...newCup.values]});
  }
  fixture.ui.catalogLifecycles.push(snapshots);
}
fs.writeFileSync(root+'tests/fungal-upstream-fixtures.json',JSON.stringify(fixture,null,2)+'\n');
console.log('Original UI oracles:',fixture.ui.goals.length,'goal cases;',fixture.ui.predictions.length,'prediction tables;',fixture.ui.recipes.length,'recipes.');
