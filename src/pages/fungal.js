import {loadDatasets} from '../ui/data.js';
import {createFungalApp} from '../fungal/app.js';
import '../fungal/fungal.css';

export async function mount(host) {
  const [base, apotheosis] = await loadDatasets(['materials', 'apotheosisMaterials']);
  const app = createFungalApp({base, apotheosis});
  host.replaceChildren(app);
  return () => app.dispose();
}
