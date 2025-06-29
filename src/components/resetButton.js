export const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      searchMaterials.query = "";
      searchMaterials.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
