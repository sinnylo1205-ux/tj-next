"use client";

import ArticleRichTab from "./ArticleRichTab";

/** 內容管理 → 文章管理（僅 Tiptap 編輯；舊套版欄位請於資料庫維護） */
export default function AdminArticlesSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        在此新增／編輯部落格文章：內文為 Tiptap（儲存為 body_json），並可設定網址 slug、SEO 與 OG 圖。若仍需維護舊「套版」欄位（intro、FAQ、product_id
        等），請直接操作資料庫。
      </p>
      <ArticleRichTab />
    </div>
  );
}
