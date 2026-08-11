import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Gapcursor } from "@tiptap/extension-gapcursor";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { ArticleExternalLink } from "./article-external-link";

/** 站內文章編輯器：h1–h3、黑/紅字、段落、圖片、表格、外連（宋體由 CSS 套用） */
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
    Gapcursor,
    Table.configure({
      resizable: false,
      HTMLAttributes: { class: "article-editor-table" },
    }),
    TableRow,
    TableHeader.configure({
      HTMLAttributes: { class: "article-editor-table-header-cell" },
    }),
    TableCell.configure({
      HTMLAttributes: { class: "article-editor-table-cell" },
    }),
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: {
        class: "rounded-xl article-rich-body-img my-4",
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
