// See https://observablehq.com/framework/config for documentation.
export default {
  // The app’s title; used in the sidebar and webpage titles.
  title: "Noita Bartender",

  // The pages and sections in the sidebar. If you don’t specify this option,
  // all pages will be listed in alphabetical order. Listing pages explicitly
  // lets you organize them into sections and have unlisted pages.
  pages: [
    {
      name: "Mixology",
      pages: [{ name: "Reactions Finder", path: "/reactions" }],
    },
    {
      name: "Upcoming Features",
      pages: [{ name: "The Future", path: "/upcoming" }],
    },
    {
      name: "Credits",
      pages: [{ name: "Thanks", path: "/thanks" }],
    },
    {
      name: "Materials properties",
      pages: [
        { name: "Materials Explorer", path: "/materials" },
        { name: "Hardness", path: "/hardness" },
        { name: "Density", path: "/density" },
        { name: "Durability", path: "/durability" },
      ],
    },
    {
      name: "Spells",
      pages: [{ name: "Spells' Digging Ability", path: "/digging" }],
    },
    {
      name: "Work in progress",
      pages: [
        { name: "Materials Distribution Graph", path: "/exploration" },
        { name: "Streamer Wands Integration", path: "/onlywands_integration" },
        { name: "Status Effects", path: "/status_effects" },
        { name: "Material Tags", path: "/tags" },
        { name: "WIP creatures", path: "/creatures" },
      ],
    },
  ],

  // Content to add to the head of the page, e.g. for a favicon:
  head: '<link rel="icon" href="favicon.svg" type="image/png">',

  // The path to the source root.
  root: "src",

  // Some additional configuration options and their defaults:
  theme: ["ocean-floor", "alt", "wide"],
  home: '<img src="https://noita-bartender-images.acidflow.stream/images/logo/bartender_logo.svg" alt="Noita Bartender"', // the content of the home page, which is shown in the sidebar
  footer:
    '<br /><br /><div class="footer-container"><div style="display: flex; align-items: center; gap: 8px;">Made by<a href="https://www.twitch.tv/WUOTE"><img src="https://noita-bartender-images.acidflow.stream/images/logo/WUOTE_LOGO.svg" style="width:100px;"></a></div><div class="bg-glow rounded-full inline-block"><a href="https://runfast.stream/donate/"><div id="dono-button" class="overflow-hidden bg-main text-white border border-2 border-white rounded-full px-6 py-3">Donate</div></a><div class="bg-glow-inner"></div></div></div>',
  sidebar: true, // whether to show the sidebar
  toc: false, // whether to show the table of contents
  pager: false, // whether to show previous & next links in the footer
  output: "dist", // path to the output root for build
  search: false, // activate search
  linkify: true, // convert URLs in Markdown to links
  typographer: true, // smart quotes and other typographic improvements
  cleanUrls: true, // drop .html from URLs
};
