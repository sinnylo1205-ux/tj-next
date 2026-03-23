"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import type { CustomOption, FaqItem, UseCase } from "@/app/blog/[slug]/BlogArticleContent";

type ArticleRow = {
  id: string;
  product_id: string;
  slug: string;
  item_name: string;
  intro: string;
  why_custom: string;
  custom_options: CustomOption[];
  use_cases: UseCase[];
  faq: FaqItem[];
  editor_path: string;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  is_published: boolean | null;
  content_mode?: string | null;
};

const emptyForm = (): Omit<ArticleRow, "id"> => ({
  product_id: "",
  slug: "",
  item_name: "",
  intro: "",
  why_custom: "",
  custom_options: [],
  use_cases: [],
  faq: [],
  editor_path: "template",
  meta_title: "",
  meta_description: "",
  og_image_url: null,
  is_published: false,
});

/** 套版撰寫：依 product_articles 欄位編輯 */
export default function ArticleTemplateTab() {
  const { toast } = useToast();
  const [list, setList] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Omit<ArticleRow, "id"> & { id?: string }>(emptyForm());

  const loadList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("product_articles").select("*").order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "載入失敗", description: error.message, variant: "destructive" });
      setList([]);
    } else {
      setList((data || []) as ArticleRow[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const pickArticle = (id: string) => {
    const row = list.find((a) => a.id === id);
    if (!row) return;
    setSelectedId(id);
    setForm({
      id: row.id,
      product_id: row.product_id,
      slug: row.slug,
      item_name: row.item_name,
      intro: row.intro,
      why_custom: row.why_custom,
      custom_options: row.custom_options?.length ? row.custom_options : [],
      use_cases: row.use_cases?.length ? row.use_cases : [],
      faq: row.faq?.length ? row.faq : [],
      editor_path: row.editor_path || "template",
      meta_title: row.meta_title || "",
      meta_description: row.meta_description || "",
      og_image_url: row.og_image_url,
      is_published: !!row.is_published,
    });
  };

  const startNew = () => {
    setSelectedId("new");
    setForm({ ...emptyForm() });
  };

  const uploadOg = async (file: File) => {
    const ext = file.name.split(".").pop();
    const fileName = `blog_og/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("custom_asset").upload(fileName, file, { upsert: true });
    if (error) {
      toast({ title: "上傳失敗", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
    setForm((f) => ({ ...f, og_image_url: data.publicUrl }));
    toast({ title: "OG 圖已上傳" });
  };

  const save = async () => {
    if (!form.slug.trim() || !form.item_name.trim() || !form.product_id.trim()) {
      toast({ title: "請填寫 slug、品項名稱、product_id", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      product_id: form.product_id.trim(),
      slug: form.slug.trim(),
      item_name: form.item_name.trim(),
      intro: form.intro,
      why_custom: form.why_custom,
      custom_options: form.custom_options,
      use_cases: form.use_cases,
      faq: form.faq,
      editor_path: form.editor_path || "template",
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
      og_image_url: form.og_image_url,
      is_published: form.is_published,
      content_mode: "template" as const,
      body_json: null,
    };

    if (selectedId === "new" || !form.id) {
      const { data, error } = await supabase.from("product_articles").insert(payload).select("id").single();
      if (error) {
        toast({ title: "建立失敗", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ 文章已建立（套版）" });
        setSelectedId(data.id);
        setForm((f) => ({ ...f, id: data.id }));
        await loadList();
      }
    } else {
      const { error } = await supabase.from("product_articles").update(payload).eq("id", form.id);
      if (error) {
        toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ 已儲存（套版）" });
        await loadList();
      }
    }
    setSaving(false);
  };

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
          <CardTitle className="text-base">文章列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={startNew}>
            <Plus className="h-4 w-4 mr-2" />
            新增文章
          </Button>
          <ul className="space-y-1 max-h-[50vh] overflow-y-auto text-sm">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => pickArticle(a.id)}
                  className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-muted ${selectedId === a.id ? "bg-muted font-medium" : ""}`}
                >
                  {a.item_name}
                  <span className="block text-xs text-muted-foreground truncate">/{a.slug}</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{selectedId ? "編輯套版內容" : "請選擇或新增文章"}</CardTitle>
          <p className="text-sm text-muted-foreground">欄位對應資料表 product_articles。儲存後為套版模式，並會清空 Tiptap 內文（body_json）。</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedId == null && <p className="text-muted-foreground text-sm">從左側選擇一篇文章，或點「新增文章」。</p>}
          {selectedId != null && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>product_id</Label>
                  <Input value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))} placeholder="例：cupcake_cream" />
                </div>
                <div className="space-y-2">
                  <Label>slug（網址）</Label>
                  <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="唯一英文 slug" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>品項名稱 item_name</Label>
                  <Input value={form.item_name} onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>intro</Label>
                  <Textarea rows={3} value={form.intro} onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>why_custom</Label>
                  <Textarea rows={4} value={form.why_custom} onChange={(e) => setForm((f) => ({ ...f, why_custom: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>meta_title</Label>
                  <Input value={form.meta_title || ""} onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>meta_description</Label>
                  <Textarea rows={2} value={form.meta_description || ""} onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>editor_path</Label>
                  <Input value={form.editor_path} onChange={(e) => setForm((f) => ({ ...f, editor_path: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch checked={!!form.is_published} onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))} id="pub" />
                  <Label htmlFor="pub">發布 is_published</Label>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>og_image_url</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={form.og_image_url || ""} placeholder="上傳或貼網址" />
                    <input
                      type="file"
                      accept="image/*"
                      className="text-sm"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadOg(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  {form.og_image_url && <img src={form.og_image_url} alt="" className="max-h-32 rounded border mt-2" />}
                </div>
              </div>

              <JsonSection
                title="custom_options（標題＋說明）"
                items={form.custom_options}
                onChange={(custom_options) => setForm((f) => ({ ...f, custom_options }))}
                empty={{ title: "", description: "" }}
                renderFields={(item, i, set) => (
                  <>
                    <Input placeholder="標題" value={item.title} onChange={(e) => set({ ...item, title: e.target.value })} />
                    <Textarea placeholder="說明" rows={2} value={item.description} onChange={(e) => set({ ...item, description: e.target.value })} />
                  </>
                )}
              />
              <JsonSection
                title="use_cases"
                items={form.use_cases}
                onChange={(use_cases) => setForm((f) => ({ ...f, use_cases }))}
                empty={{ title: "", description: "" }}
                renderFields={(item, i, set) => (
                  <>
                    <Input placeholder="標題" value={item.title} onChange={(e) => set({ ...item, title: e.target.value })} />
                    <Textarea placeholder="說明" rows={2} value={item.description} onChange={(e) => set({ ...item, description: e.target.value })} />
                  </>
                )}
              />
              <JsonSection
                title="faq"
                items={form.faq}
                onChange={(faq) => setForm((f) => ({ ...f, faq }))}
                empty={{ question: "", answer: "" }}
                renderFields={(item, i, set) => (
                  <>
                    <Input placeholder="問題" value={item.question} onChange={(e) => set({ ...item, question: e.target.value })} />
                    <Textarea placeholder="回答" rows={2} value={item.answer} onChange={(e) => set({ ...item, answer: e.target.value })} />
                  </>
                )}
              />

              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                儲存套版文章
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function JsonSection<T extends Record<string, string>>({
  title,
  items,
  onChange,
  empty,
  renderFields,
}: {
  title: string;
  items: T[];
  onChange: (next: T[]) => void;
  empty: T;
  renderFields: (item: T, index: number, set: (next: T) => void) => ReactNode;
}) {
  const add = () => onChange([...items, { ...empty }]);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const setItem = (i: number, next: T) => onChange(items.map((it, j) => (j === i ? next : it)));

  return (
    <div className="space-y-2 border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-base">{title}</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="h-4 w-4 mr-1" />
          新增一筆
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-start border-b pb-3 last:border-0">
            <div className="flex-1 space-y-2">{renderFields(item, i, (next) => setItem(i, next))}</div>
            <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => remove(i)} aria-label="刪除">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">尚無項目</p>}
      </div>
    </div>
  );
}
