import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { ArticleExternalLink } from "./article-external-link";

/** 站內文章編輯器：僅 h1–h3、黑/紅字、段落、圖片（宋體由 CSS 套用） */
export function getArticleEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bold: false,
      italic: false,
      strike: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      link: false,
      underline: false,
    }),
    TextStyle,
    Color.configure({ types: ["textStyle"] }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: "rounded-lg article-rich-body-img my-4",
      },
    }),
    ArticleExternalLink,
  ];
}

/** 允許的文字顏色（與後台工具列一致） */
export const ARTICLE_TEXT_COLORS = {
  black: "#000000",
  red: "#b91c1c",
} as const;
