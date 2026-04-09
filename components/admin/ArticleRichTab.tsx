"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import ArticleRichTiptap from "./ArticleRichTiptap";

type ArticlePick = {
  id: string;
  item_name: string;
  slug: string;
  content_mode: string | null;
  body_json: unknown;
  is_published: boolean | null;
  seo_noindex: boolean | null;
  og_image_url: string | null;
};

/** 新排版：選擇文章後以 Tiptap 編輯 body_json */
export default function ArticleRichTab() {
  const { toast } = useToast();
  const [list, setList] = useState<ArticlePick[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_articles")
      .select("id, item_name, slug, content_mode, body_json, is_published, seo_noindex, og_image_url")
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(200px,280px)_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">選擇文章</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無文章。請先到「套版撰寫」新增一篇文章。</p>
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
                      {a.content_mode === "richtext" && (
                        <span className="text-[10px] text-primary">新排版</span>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tiptap 編輯</CardTitle>
          <p className="text-sm text-muted-foreground">
            字型與前台一致（宋體／明體系）。僅 H1–H3、黑色／紅色、段落與圖片。圖片請務必填寫 alt。
          </p>
        </CardHeader>
        <CardContent>
          {!selectedId || !selected ? (
            <p className="text-muted-foreground text-sm">請從左側選擇一篇文章。</p>
          ) : (
            <ArticleRichTiptap
              key={selectedId}
              articleId={selectedId}
              articleSlug={selected.slug}
              initialBody={selected.body_json}
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
