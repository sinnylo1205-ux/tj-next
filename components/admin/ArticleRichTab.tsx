"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus } from "lucide-react";
import ArticleRichTiptap from "./ArticleRichTiptap";

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] } as const;

type ArticlePick = {
  id: string;
  item_name: string;
  slug: string;
  content_mode: string | null;
  body_json: unknown;
  faq: unknown;
  related_reading: unknown;
  is_published: boolean | null;
  seo_noindex: boolean | null;
  og_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  editor_path: string | null;
};

/** 文章編輯：單一入口（Tiptap + slug／SEO／editor_path） */
export default function ArticleRichTab() {
  const { toast } = useToast();
  const [list, setList] = useState<ArticlePick[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_articles")
      .select(
        "id, item_name, slug, content_mode, body_json, faq, related_reading, is_published, seo_noindex, og_image_url, meta_title, meta_description, editor_path",
      )
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "載入失敗", description: error.message, variant: "destructive" });
      setList([]);
    } else {
      setList((data || []) as ArticlePick[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selected = list.find((a) => a.id === selectedId);

  const handleCreateArticle = async () => {
    setCreating(true);
    const slug = `draft-${Date.now()}`;
    const { data, error } = await supabase
      .from("product_articles")
      .insert({
        product_id: "blog",
        slug,
        item_name: "新文章",
        intro: "",
        why_custom: "",
        custom_options: [],
        use_cases: [],
        faq: [],
        related_reading: [],
        editor_path: "richtext",
        meta_title: null,
        meta_description: null,
        og_image_url: null,
        is_published: false,
        seo_noindex: false,
        content_mode: "richtext",
        body_json: EMPTY_DOC,
      })
      .select("id")
      .single();

    if (error) {
      toast({ title: "建立失敗", description: error.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    toast({ title: "✅ 已建立文章", description: "請修改 slug、標題與內文後儲存。" });
    await loadList();
    setSelectedId(data.id);
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(200px,280px)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">文章列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" className="w-full justify-start" variant="outline" size="sm" disabled={creating} onClick={() => void handleCreateArticle()}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            新增文章
          </Button>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無文章，請點「新增文章」。</p>
          ) : (
            <ul className="space-y-1 max-h-[50vh] overflow-y-auto text-sm">
              {list.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-muted ${selectedId === a.id ? "bg-muted font-medium" : ""}`}
                  >
                    {a.item_name}
                    <span className="block text-xs text-muted-foreground truncate">/{a.slug}</span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {a.content_mode !== "richtext" && (
                        <span className="text-[10px] text-amber-800 bg-amber-100 px-1 rounded">套版資料</span>
                      )}
                      {!a.is_published && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1 rounded">未發布</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 右欄內獨立捲動，sticky 功能列才有正確的捲動容器（整頁 main 捲動時 sticky 常被吃掉） */}
      <Card className="flex min-h-0 max-h-[calc(100dvh-14rem)] flex-col overflow-hidden sm:max-h-[calc(100dvh-12rem)] lg:max-h-[calc(100dvh-7rem)]">
        <CardHeader className="shrink-0">
          <CardTitle className="text-lg">編輯文章</CardTitle>
          <p className="text-sm text-muted-foreground">
            格式列可插入表格、調整列欄，並可開啟文末 FAQ 與延伸閱讀；slug 與 SEO 在內文下方。
          </p>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6 pt-0">
          {!selectedId || !selected ? (
            <p className="text-muted-foreground text-sm">請從左側選擇一篇文章，或點「新增文章」。</p>
          ) : (
            <ArticleRichTiptap
              key={selectedId}
              articleId={selectedId}
              initialSlug={selected.slug}
              initialItemName={selected.item_name}
              initialBody={selected.body_json}
              initialFaq={selected.faq}
              initialRelatedReading={selected.related_reading}
              initialMetaTitle={selected.meta_title}
              initialMetaDescription={selected.meta_description}
              initialEditorPath={selected.editor_path ?? "richtext"}
              initialContentMode={selected.content_mode}
              initialIsPublished={!!selected.is_published}
              initialSeoNoindex={!!selected.seo_noindex}
              initialOgImageUrl={selected.og_image_url}
              onSaved={loadList}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
