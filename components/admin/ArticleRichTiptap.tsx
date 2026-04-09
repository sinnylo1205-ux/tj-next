"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getArticleEditorExtensions, ARTICLE_TEXT_COLORS } from "@/lib/tiptap/article-extensions";
import { Loader2, Save, ImagePlus, Upload, Link2 } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import { convertToWebP } from "@/lib/convert-to-webp";

/** custom_asset bucket 內路徑（文章新排版自訂上傳） */
export const ARTICLE_SELF_UPLOAD_STORAGE_PREFIX = "website_img/article/self_upload";

const defaultDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function normalizeDoc(raw: unknown): JSONContent {
  if (!raw || typeof raw !== "object") return defaultDoc;
  const o = raw as { type?: string };
  if (o.type !== "doc") return defaultDoc;
  return raw as JSONContent;
}

interface ArticleRichTiptapProps {
  articleId: string;
  /** 前台網址 /blog/{slug} */
  articleSlug: string;
  initialBody: unknown;
  initialIsPublished: boolean;
  /** 與套版相同：true = noindex */
  initialSeoNoindex: boolean;
  onSaved: () => void;
}

function normalizeExternalHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/** 新排版：受限 Tiptap（宋體由 CSS、h1–h3、黑／紅、段落圖片） */
export default function ArticleRichTiptap({
  articleId,
  articleSlug,
  initialBody,
  initialIsPublished,
  initialSeoNoindex,
  onSaved,
}: ArticleRichTiptapProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgAlt, setImgAlt] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [seoNoindex, setSeoNoindex] = useState(initialSeoNoindex);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsPublished(initialIsPublished);
  }, [articleId, initialIsPublished]);

  useEffect(() => {
    setSeoNoindex(initialSeoNoindex);
  }, [articleId, initialSeoNoindex]);

  const editor = useEditor({
    extensions: [
      ...getArticleEditorExtensions(),
      Placeholder.configure({
        placeholder: "開始撰寫…（建議全文僅一個 H1，其餘用 H2、H3）",
      }),
    ],
    content: normalizeDoc(initialBody),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "article-tiptap-editor font-serif min-h-[320px] px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring",
      },
    },
  });

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      const webpFile = file.type.startsWith("image/") ? await convertToWebP(file) : file;
      const fileName = `${ARTICLE_SELF_UPLOAD_STORAGE_PREFIX}/${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
      const { error } = await supabase.storage.from("custom_asset").upload(fileName, webpFile, { upsert: true, contentType: "image/webp" });
      if (error) {
        toast({ title: "圖片上傳失敗", description: error.message, variant: "destructive" });
        return null;
      }
      const { data } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
      return data.publicUrl;
    },
    [toast],
  );

  const applyImage = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !editor) {
      toast({ title: "請選擇圖片", variant: "destructive" });
      return;
    }
    if (!imgAlt.trim()) {
      toast({ title: "請填寫圖片說明（alt）以利 SEO", variant: "destructive" });
      return;
    }
    setImgUploading(true);
    const url = await uploadFile(file);
    setImgUploading(false);
    if (url) {
      editor.chain().focus().setImage({ src: url, alt: imgAlt.trim() }).run();
      setImgOpen(false);
      setImgAlt("");
      setPickedFileName(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "已插入圖片" });
    }
  }, [editor, imgAlt, toast, uploadFile]);

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    const body_json = editor.getJSON();
    const { error } = await supabase
      .from("product_articles")
      .update({
        body_json,
        content_mode: "richtext",
        is_published: isPublished,
        seo_noindex: seoNoindex,
      })
      .eq("id", articleId);
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    } else {
      const path = `/blog/${articleSlug}`;
      toast({
        title: "✅ 新排版內容已儲存",
        description: isPublished
          ? `前台網址：${path}（若仍看不到請重新整理頁面）`
          : "目前為「未發布」，甜點部落格與文章頁不會顯示此文。請開啟「發布至前台」後再儲存。",
      });
      onSaved();
    }
  };

  if (!editor) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setImgOpen(true)}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center transition-colors hover:border-primary hover:bg-muted/40"
      >
        <ImagePlus className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">上傳圖片插入內文</span>
        <span className="text-xs text-muted-foreground max-w-md">
          檔案會上傳至 Storage 路徑：<code className="rounded bg-muted px-1 py-0.5 text-[11px]">{ARTICLE_SELF_UPLOAD_STORAGE_PREFIX}/</code>
          請填寫 alt 以利 SEO。
        </span>
      </button>

      <div className="flex flex-wrap gap-2 items-center border rounded-md p-2 bg-muted/30 justify-start">
        <span className="text-xs text-muted-foreground mr-2">標題</span>
        {[1, 2, 3].map((level) => (
          <Button
            key={level}
            type="button"
            size="sm"
            variant={editor.isActive("heading", { level }) ? "default" : "outline"}
            className="h-8"
            onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
          >
            H{level}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground mx-2">顏色</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => editor.chain().focus().setColor(ARTICLE_TEXT_COLORS.black).run()}
        >
          黑
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[#b91c1c] border-[#b91c1c]"
          onClick={() => editor.chain().focus().setColor(ARTICLE_TEXT_COLORS.red).run()}
        >
          紅
        </Button>
        <Button type="button" size="sm" variant="secondary" className="h-8" onClick={() => setImgOpen(true)}>
          <ImagePlus className="h-4 w-4 mr-1" />
          插入圖片
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          onClick={() => {
            setLinkHref("");
            setLinkLabel("");
            setLinkOpen(true);
          }}
        >
          <Link2 className="h-4 w-4 mr-1" />
          加入連結
        </Button>
      </div>

      <EditorContent editor={editor} />

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex items-center gap-3">
          <Switch id="article-publish" checked={isPublished} onCheckedChange={setIsPublished} />
          <Label htmlFor="article-publish" className="cursor-pointer leading-snug">
            發布至前台（甜點部落格列表與 <code className="text-xs bg-muted px-1 rounded">/blog/{articleSlug}</code> 僅在發布後顯示）
          </Label>
        </div>
        <div className="flex flex-col gap-1 rounded-md border border-border bg-background/80 p-3">
          <div className="flex items-center gap-2">
            <Switch id="article-seo-noindex" checked={seoNoindex} onCheckedChange={setSeoNoindex} />
            <Label htmlFor="article-seo-noindex" className="cursor-pointer leading-snug">
              搜尋引擎不索引此頁（noindex）
            </Label>
          </div>
          <p className="text-xs text-muted-foreground pl-10">
            新文章建議不要勾選，以利搜尋引擎收录；舊文或不想參與排名時可勾選。
          </p>
        </div>
        {!isPublished && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            若未勾選，儲存後前台不會出現此文章；與「套版撰寫」的發布開關為同一欄位。
          </p>
        )}
      </div>

      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        儲存新排版
      </Button>

      <Dialog
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (!open) {
            setLinkHref("");
            setLinkLabel("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>加入外連</DialogTitle>
            <p className="text-sm text-muted-foreground">
              插入後會顯示「連結名稱」與外連圖示；網址若未含 http 會自動補上 https://
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="ext-link-href">連結網址</Label>
              <Input
                id="ext-link-href"
                value={linkHref}
                onChange={(e) => setLinkHref(e.target.value)}
                placeholder="https://example.com 或 example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-link-label">連結名稱（顯示文字）</Label>
              <Input
                id="ext-link-label"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="例：活動報名頁"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!editor) return;
                const href = normalizeExternalHref(linkHref);
                const label = linkLabel.trim();
                if (!href || !label) {
                  toast({ title: "請填寫連結網址與名稱", variant: "destructive" });
                  return;
                }
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "articleExternalLink",
                    attrs: { href, label },
                  })
                  .run();
                setLinkOpen(false);
                setLinkHref("");
                setLinkLabel("");
                toast({ title: "已插入連結" });
              }}
            >
              插入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={imgOpen}
        onOpenChange={(open) => {
          setImgOpen(open);
          if (!open) {
            setImgAlt("");
            setPickedFileName(null);
            if (fileRef.current) fileRef.current.value = "";
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>上傳並插入圖片</DialogTitle>
            <p className="text-sm text-muted-foreground">
              儲存位置：<code className="text-xs bg-muted px-1 rounded">{ARTICLE_SELF_UPLOAD_STORAGE_PREFIX}/</code>（bucket：custom_asset）
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="img-alt">圖片說明 alt（SEO 必填）</Label>
              <Input id="img-alt" value={imgAlt} onChange={(e) => setImgAlt(e.target.value)} placeholder="簡短描述圖片內容" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="article-img-file-input">選擇檔案</Label>
              <input
                id="article-img-file-input"
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPickedFileName(f?.name ?? null);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  選擇檔案
                </Button>
                {pickedFileName ? (
                  <span className="text-sm text-muted-foreground truncate max-w-[200px]" title={pickedFileName}>
                    已選：{pickedFileName}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">尚未選擇檔案</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImgOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={() => void applyImage()} disabled={imgUploading}>
              {imgUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "上傳並插入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
