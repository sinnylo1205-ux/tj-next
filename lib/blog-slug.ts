/** Next.js [slug] 參數可能已解碼或仍含 %xx；查詢 DB 前安全解碼 */
export function decodeBlogSlugParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
