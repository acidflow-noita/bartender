import {pageHeading} from '../ui/heading.js';
import {html} from 'htl';
import noticeUrl from '../fungal/NOTICE.txt?url';

export function mount(host) {
  host.replaceChildren(html`<section class="prose">${pageHeading("Thank You!")}<p>I’d like to thank (in no particular order):</p><ul>
    <li>myndzi — for recommending <a href="https://github.com/Choices-js/Choices">Choices.js</a> and providing early feedback.</li>
    <li>DexterCD — for <a href="https://github.com/dextercd/Noita-Component-Explorer">Component Explorer</a> and data extraction scripts.</li>
    <li>ArganVain — for the first version of the logo.</li>
    <li>necauqua — for the list of reactions extracted directly from the engine’s CellFactory.</li>
    <li>NathanSnail — for <a href="https://github.com/NathanSnail/luanxml">LuaNXML</a>.</li>
    <li>Horscht — for <a href="https://github.com/TheHorscht/EZWand">EZWand</a>.</li>
    <li><a href="https://github.com/kedesiklem">Kedesiklem</a> — for the <a href="/reactions_graph_finder">graph extension</a>.</li>
    <li>「sophie」, DunkOrSlam, UserK, FuryForged — for early feedback.</li>
    <li><a href="https://github.com/liquidcake1/noita-fungal">liquidcake1</a>, <a href="https://github.com/Lymm37/noita-telescope">Lymm</a>, and <a href="https://github.com/TwoAbove/noita-tools">Seva Maltsev</a> — for the fungal-shifting planner, prediction logic, and Noita PRNG. <a href=${noticeUrl}>Licenses and attribution</a>.</li>
  </ul></section>`);
}
