/** 與目錄／錨點共用：穩定、可作為 HTML id 首字元（toc-h2-…） */
export function articleTocSlugId(index: number, text: string): string {
  const t = text.trim().slice(0, 48);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h << 5) - h + t.charCodeAt(i);
  const seg = Math.abs(h).toString(36).slice(0, 10);
  return `toc-h2-${index}-${seg}`;
}
