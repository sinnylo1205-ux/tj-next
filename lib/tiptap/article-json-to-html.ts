import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { injectH2AnchorIdsIntoHtml } from "@/lib/article-html-h2-ids";
import { getArticleEditorExtensions } from "./article-extensions";

export function articleJsonToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  try {
    const raw = generateHTML(doc as JSONContent, getArticleEditorExtensions());
    return injectH2AnchorIdsIntoHtml(raw);
  } catch {
    return "";
  }
}
