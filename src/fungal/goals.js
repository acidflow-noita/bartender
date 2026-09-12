// Constraint compilation copied from noita-fungal/index.html (CC0).
// Air retains its original meaning in all three selectors. Only the source's
// DOM-shaped input is adapted; the validation function below is unchanged.
export function compileGoals(goals) {
  const transmutations = goals.map(({base = "air", target = "air", stain = "air"}) => ({
    sacrifice: {value: base}, product: {value: target}, stain: {value: stain},
  }));
  const constraints = [];
  function pray_to_gods(constraints) {
	let requirements = [];
	let end_state = {};
	let complaint = null;
	for(let transmutation of transmutations) {
		let sacrifice = transmutation["sacrifice"].value;
		let product = transmutation["product"].value;
		let stain = transmutation["stain"].value;
		if (sacrifice == "air") {
			if (product != "air") {
				complaint ||= "A product requires a sacrifice.";
			}
			if (stain != "air") {
				complaint ||= "A stain requires sacrifice.";
			}
		} else {
			if (product == "air") {
				complaint ||= "The gods cannot countenance annihilation.";
			}
			let constraint = {
				"base": sacrifice,
				"target": product,
			};
			if (end_state[sacrifice] && end_state[sacrifice] != product) {
				complaint ||= `The anfractuous cycle so-created contradicts the bounds of reality. ${sacrifice} must become both ${end_state[sacrifice]} and ${product}.`;
			}
			end_state[sacrifice] = product;
			if (stain != "air") {
				constraint.stain = stain;
				if (end_state[product] && end_state[product] != stain) {
					complaint ||= `The anfractuous cycle so-created contradicts the bounds of reality. ${product} must become both ${end_state[product]} and ${sacrifice}.`;
				}
				end_state[product] = stain;
			}
			constraints.push(constraint);
		}
	}
	if (constraints.length == 0) {
		complaint ||= "the gods find only emptiness";
	}
	return complaint;
}
  return {constraints, error: pray_to_gods(constraints)};
}
