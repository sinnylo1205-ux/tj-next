/**
 * 部落格文章閱讀縮放：前台文章頁與後台 Tiptap 編輯區共用同一組數值與 localStorage，
 * 比例才會一致（皆使用 CSS zoom）。
 */
export const ARTICLE_FONT_ZOOM_STORAGE_KEY = "tj-blog-article-font-zoom";

/** 三檔皆比瀏覽器預設「整體」更大；索引 1 為預設「舒適」 */
export const ARTICLE_FONT_ZOOM_LEVELS = [
  { zoom: 1.18, label: "標準" },
  { zoom: 1.32, label: "舒適" },
  { zoom: 1.48, label: "大" },
] as const;

export type ArticleFontZoom = (typeof ARTICLE_FONT_ZOOM_LEVELS)[number]["zoom"];

export const ARTICLE_FONT_ZOOM_DEFAULT_INDEX = 1;

/** 前台切換字級後通知同分頁其他元件（storage 事件僅跨分頁） */
export const ARTICLE_FONT_ZOOM_CHANGE_EVENT = "tj-article-font-zoom-change";

export function applyArticleFontZoomFromStorage(setZoom: (z: ArticleFontZoom) => void): void {
  try {
    const raw = localStorage.getItem(ARTICLE_FONT_ZOOM_STORAGE_KEY);
    if (raw === "0" || raw === "1" || raw === "2") {
      setZoom(ARTICLE_FONT_ZOOM_LEVELS[Number(raw)].zoom);
    }
  } catch {
    /* ignore */
  }
}
