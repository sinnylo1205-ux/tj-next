"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ArticleTemplateTab from "./ArticleTemplateTab";
import ArticleRichTab from "./ArticleRichTab";

/** 內容管理 → 文章管理 */
export default function AdminArticlesSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        套版撰寫對應資料表欄位；新排版使用 Tiptap，儲存為 JSON 並於前台轉成語意化 HTML。
      </p>
      <Tabs defaultValue="template">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md bg-secondary p-1 text-secondary-foreground">
          <TabsTrigger value="template">套版撰寫</TabsTrigger>
          <TabsTrigger value="rich">新排版</TabsTrigger>
        </TabsList>
        <TabsContent value="template" className="mt-6">
          <ArticleTemplateTab />
        </TabsContent>
        <TabsContent value="rich" className="mt-6">
          <ArticleRichTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
