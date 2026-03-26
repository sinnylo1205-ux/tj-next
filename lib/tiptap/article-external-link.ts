import { Node, mergeAttributes } from "@tiptap/core";

/**
 * 文章內「加入連結」：前台顯示為連結文字 + 外連圖示（非一般 <a> 樣板）
 */
export const ArticleExternalLink = Node.create({
  name: "articleExternalLink",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      href: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-article-external-link]" }];
  },

  renderHTML({ node }) {
    const href = String(node.attrs.href || "").trim() || "#";
    const label = String(node.attrs.label ?? "");
    return [
      "a",
      mergeAttributes({
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        "data-article-external-link": "",
        class: "article-rich-external-link",
      }),
      ["span", { class: "article-rich-external-link__text" }, label],
      [
        "span",
        { class: "article-rich-external-link__icon", "aria-hidden": "true" },
        [
          "svg",
          {
            xmlns: "http://www.w3.org/2000/svg",
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            "stroke-width": "2",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            class: "article-rich-external-link__svg",
          },
          ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
          ["polyline", { points: "15 3 21 3 21 9" }],
          ["line", { x1: "10", y1: "14", x2: "21", y2: "3" }],
        ],
      ],
    ];
  },
});
