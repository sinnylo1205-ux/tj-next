/** 接近直式：高／寬 ≥ 此值時套用直式外框（含接近正方形） */
export const ARTICLE_PORTRAIT_RATIO_THRESHOLD = 0.95;

export const ARTICLE_IMG_FRAME_PORTRAIT = "article-rich-body-img--portrait";
export const ARTICLE_IMG_FRAME_LANDSCAPE = "article-rich-body-img--landscape";

const CLASSIFY_PENDING_ATTR = "data-article-img-frame-pending";

function applyArticleBodyImageFrameClass(img: HTMLImageElement): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return;

  img.removeAttribute(CLASSIFY_PENDING_ATTR);
  img.classList.remove(ARTICLE_IMG_FRAME_PORTRAIT, ARTICLE_IMG_FRAME_LANDSCAPE);
  if (h / w >= ARTICLE_PORTRAIT_RATIO_THRESHOLD) {
    img.classList.add(ARTICLE_IMG_FRAME_PORTRAIT);
    img.style.removeProperty("aspect-ratio");
  } else {
    img.classList.add(ARTICLE_IMG_FRAME_LANDSCAPE);
    // 以真實比例預留高度，降低 CLS，同時避免強制裁成固定橫比
    img.style.aspectRatio = `${w} / ${h}`;
  }
}

/** 依實際比例為內文圖加上橫式／直式外框 class（載入完成後才判斷） */
export function classifyArticleBodyImage(img: HTMLImageElement): void {
  if (
    img.classList.contains(ARTICLE_IMG_FRAME_PORTRAIT) ||
    img.classList.contains(ARTICLE_IMG_FRAME_LANDSCAPE)
  ) {
    return;
  }
  if (img.complete && img.naturalWidth > 0) {
    applyArticleBodyImageFrameClass(img);
    return;
  }
  if (img.getAttribute(CLASSIFY_PENDING_ATTR) === "1") return;
  img.setAttribute(CLASSIFY_PENDING_ATTR, "1");
  img.addEventListener(
    "load",
    () => {
      applyArticleBodyImageFrameClass(img);
    },
    { once: true },
  );
}

/** 掃描容器內所有內文圖並分類 */
export function classifyArticleBodyImagesIn(root: ParentNode | null | undefined): void {
  if (!root) return;
  const imgs = root.querySelectorAll<HTMLImageElement>("img.article-rich-body-img, .article-rich-body img");
  imgs.forEach(classifyArticleBodyImage);
}
