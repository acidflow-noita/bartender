import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';
import {installDom} from './dom.js';
import {fitGraphToViewport, allowGraphGesture} from '../src/noitalambic/graph/viewport.js';
import {GraphRenderer} from '../src/noitalambic/graph/GraphRenderer.js';

test('graph height reserves its legend, attribution, footer and bottom gap as controls change', t => {
  const window=installDom(t),main=document.getElementById('main');
  main.style.paddingBottom='8px';
  main.innerHTML='<section class="card" style="border-bottom:1px solid"><div id="graphContainer"></div><div id="graph-legend" style="margin-top:12px"></div></section><p id="credit" style="margin:8px 0 0"></p>';
  const footer=document.createElement('footer');footer.className='site-footer';document.body.append(footer);
  const viewport=new window.EventTarget();viewport.height=800;Object.defineProperty(window,'visualViewport',{value:viewport});
  const graph=document.getElementById('graphContainer'),credit=document.getElementById('credit'),legend=document.getElementById('graph-legend');
  let top=300,legendHeight=40,footerHeight=45,overflow;
  graph.getBoundingClientRect=()=>({top});legend.getBoundingClientRect=()=>({height:legendHeight});
  footer.getBoundingClientRect=()=>({height:footerHeight});credit.getBoundingClientRect=()=>({height:24});
  const fitting=fitGraphToViewport(graph,{credit,onOverflow:value=>overflow=value});
  try {
    assert.equal(graph.style.height,'354px');assert.equal(overflow,false);
    legendHeight=140;fitting.refresh();assert.equal(graph.style.height,'254px');
    top=340;fitting.refresh();assert.equal(graph.style.height,'214px');
    viewport.height=650;viewport.dispatchEvent(new Event('resize'));assert.equal(graph.style.height,'160px');assert.equal(overflow,true);
    viewport.height=900;viewport.dispatchEvent(new Event('resize'));assert.equal(graph.style.height,'314px');assert.equal(overflow,false);
    fitting.dispose();top=100;window.dispatchEvent(new Event('resize'));assert.equal(graph.style.height,'314px');
  } finally {fitting.dispose();}
});

test('scrolling a tall page does not zoom the graph, while modifier zoom and normal fitted-graph gestures remain available', t => {
  installDom(t);const container=document.createElement('div');document.body.append(container);
  const wheel={type:'wheel',button:0,ctrlKey:false,metaKey:false};
  assert.equal(allowGraphGesture(wheel,container),true);
  document.documentElement.style.height='5000px';
  assert.equal(allowGraphGesture(wheel,container),true,'a fully visible graph zooms even when the page itself scrolls');
  container.getBoundingClientRect=()=>({top:-50,bottom:300,height:350});
  assert.equal(allowGraphGesture(wheel,container),false,'a graph scrolled partly off screen lets the wheel scroll the page');
  delete container.getBoundingClientRect;
  container.dataset.viewportOverflow='true';
  assert.equal(allowGraphGesture(wheel,container),false);
  assert.equal(allowGraphGesture({...wheel,ctrlKey:true},container),true);
  assert.equal(allowGraphGesture({...wheel,metaKey:true},container),true);
  assert.equal(allowGraphGesture({type:'mousedown',button:0,ctrlKey:false},container),true);
  assert.equal(allowGraphGesture({type:'mousedown',button:0,ctrlKey:true},container),false);
});

test('resizing updates the SVG viewport without resetting its zoom transform', t => {
  installDom(t);const container=document.createElement('div');document.body.append(container);
  let width=800,height=300;
  Object.defineProperties(container,{clientWidth:{get:()=>width},clientHeight:{get:()=>height}});
  const renderer=new GraphRenderer({}, {}, {}),{svg}=renderer._createSVG(container,width,height);
  const zoom=d3.zoomIdentity.translate(20,30).scale(2);svg.node().__zoom=zoom;
  width=600;height=180;renderer._handleResize(container,svg);
  assert.equal(svg.attr('viewBox'),'0 0 600 180');assert.equal(svg.node().__zoom,zoom);
  height=0;renderer._handleResize(container,svg);assert.equal(svg.attr('height'),'1');
  svg.on('.zoom',null);
});
