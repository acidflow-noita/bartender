// See https://observablehq.com/framework/config for documentation.
export default {
  // The app’s title; used in the sidebar and webpage titles.
  title: "Noita Bartender",

  pages: [
    {
      name: "Mixology",
      pages: [
        { name: "Reactions Finder", path: "/reactions" },
        { name: "Reactions Graph", path: "/reactions_graph_finder" },
      ],
    },
    {
      name: "Materials properties",
      pages: [
        // { name: "Materials Explorer", path: "/materials" },
        { name: "Hardness (β)", path: "/hardness" },
        { name: "Density (β)", path: "/density" },
        { name: "Durability (β)", path: "/durability" },
        { name: "Glow (β)", path: "/glow" },
      ],
    },
    // {
    //   name: "Spells",
    //   pages: [{ name: "Spells' Digging Ability", path: "/digging" }],
    // },
    // {
    //   name: "Work in progress",
    //   pages: [
    //     { name: "Materials Distribution Graph", path: "/exploration" },
    //     { name: "Streamer Wands Integration", path: "/onlywands_integration" },
    //     { name: "Status Effects", path: "/status_effects" },
    //     { name: "Material Tags", path: "/tags" },
    //     { name: "WIP creatures", path: "/creatures" },
    //   ],
    // },
    {
      name: "Upcoming Features",
      pages: [{ name: "The Future", path: "/upcoming" }],
    },
    {
      name: "Main Website",
      pages: [
        {
          name: "Noita Bartender",
          path: "https://runfast.stream/",
        },
      ],
    },
    {
      name: "Credits",
      pages: [{ name: "Thanks", path: "/thanks" }],
    },
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: `<link rel="icon" href="favicon.svg" type="image/png">
<style>
  nav a[href="https://runfast.stream/"],
  nav a[href="https://runfast.stream/"]:hover,
  nav a[href="https://runfast.stream/"]:focus,
  nav a[href="https://runfast.stream/"]:active {
    display: block !important;
    height: 1.2em !important;
    background-image: url("https://noita-bartender-images.acidflow.stream/images/logo/runfast-logo.svg") !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: 1rem center !important;
    text-indent: -9999px !important;
    overflow: hidden !important;
    width: 100% !important;
    margin-left: 0 !important;
    padding-left: 0 !important;
  }
</style>`,

  // The path to the source root.
  root: "src",

  // Some additional configuration options and their defaults:
  theme: ["ocean-floor", "alt", "wide"],
  home: '<img src="https://noita-bartender-images.acidflow.stream/images/logo/bartender_logo.svg" alt="Noita Bartender">', // the content of the home page, which is shown in the sidebar
  footer:
    '<div style="display: flex; align-items: center; gap: 2px;">Made by<a href="https://www.twitch.tv/WUOTE"><img src="https://noita-bartender-images.acidflow.stream/images/logo/WUOTE_LOGO.svg" style="width:100px;"></a>',
  sidebar: true, // whether to show the sidebar
  toc: false, // whether to show the table of contents
  pager: false, // whether to show previous & next links in the footer
  output: "dist", // path to the output root for build
  search: false, // activate search
  linkify: true, // convert URLs in Markdown to links
  typographer: true, // smart quotes and other typographic improvements
  cleanUrls: true, // drop .html from URLs
};
