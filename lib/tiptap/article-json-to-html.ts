import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { getArticleEditorExtensions } from "./article-extensions";

export function articleJsonToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  try {
    return generateHTML(doc as JSONContent, getArticleEditorExtensions());
  } catch {
    return "";
  }
}
