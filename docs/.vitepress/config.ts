import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Typed Tasks",
  description: "A type-safe abstraction for Google Cloud Tasks with Firebase",
  base: "/",
  cleanUrls: true,

  themeConfig: {
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Task Definitions", link: "/task-definitions" },
          { text: "Handlers", link: "/handlers" },
          { text: "Scheduling", link: "/scheduling" },
          { text: "Deduplication", link: "/deduplication" },
        ],
      },
      {
        text: "Topics",
        items: [
          { text: "Configuration", link: "/configuration" },
          { text: "Real-World Examples", link: "/real-world-examples" },
          { text: "Migration from v1", link: "/migration" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/0x80/typed-tasks" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright &copy; Thijs Koerselman",
    },
  },
});
