"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { prepareImageForUpload } from "@/lib/prepare-upload-image-client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Upload, Loader2 } from "lucide-react";
import BatchUploadTab from "./BatchUploadTab";
import AdminPopupMaterialsSection from "./AdminPopupMaterialsSection";
import { SafeImage } from "@/components/SafeImage";

interface Product {
  id: string;
  name: string | null;
  description: string | null;
  product_image_url: string | null;
  hover_image_url: string | null;
  category: string | null;
}

interface WebsiteMaterial {
  id: string;
  item_name: string | null;
  category: string | null;
  photo_url: string | null;
  photo_url_mobile: string | null;
  put_where: string | null;
  sort_order: number | null;
  description: string | null;
}

/** 內容管理 → 網站素材：產品圖文、頁面素材、批次上傳 */
const AdminWebsiteMaterialsSection = () => {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<WebsiteMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Record<string, { name: string; description: string }>>({});
  const [savingProduct, setSavingProduct] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [productsRes, materialsRes] = await Promise.all([
      supabase.from("products").select("id, name, description, product_image_url, hover_image_url, category").order("created_at"),
      supabase.from("Website_photo_material").select("id, item_name, category, photo_url, photo_url_mobile, put_where, sort_order, description").order("sort_order"),
    ]);
    setProducts(productsRes.data || []);
    setMaterials(materialsRes.data || []);
    setLoading(false);
  };

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    const webpFile = file.type.startsWith("image/") ? await prepareImageForUpload(file) : file;
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.webp`;
    const { error } = await supabase.storage.from("custom_asset").upload(fileName, webpFile, { upsert: true, contentType: "image/webp" });
    if (error) {
      toast({ title: "上傳失敗", description: error.message, variant: "destructive" });
      return null;
    }
    const { data } = supabase.storage.from("custom_asset").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleProductImageUpload = async (productId: string, field: "product_image_url" | "hover_image_url", file: File) => {
    setUploadingImage(`${productId}_${field}`);
    const url = await uploadImage(file, "admin_new_add");
    if (url) {
      const { error } = await supabase.from("products").update({ [field]: url }).eq("id", productId);
      if (error) {
        toast({ title: "更新失敗", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ 圖片已更新" });
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, [field]: url } : p)));
      }
    }
    setUploadingImage(null);
  };

  const startEditProduct = (product: Product) => {
    setEditingProduct((prev) => ({
      ...prev,
      [product.id]: { name: product.name || "", description: product.description || "" },
    }));
  };

  const saveProduct = async (productId: string) => {
    const edits = editingProduct[productId];
    if (!edits) return;
    setSavingProduct(productId);
    const { error } = await supabase.from("products").update({ name: edits.name, description: edits.description }).eq("id", productId);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ 產品資訊已更新" });
      setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, name: edits.name, description: edits.description } : p)));
      setEditingProduct((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    setSavingProduct(null);
  };

  const handleMaterialImageUpload = async (materialId: string, field: "photo_url" | "photo_url_mobile", file: File) => {
    setUploadingImage(`mat_${materialId}_${field}`);
    const url = await uploadImage(file, "admin_new_add");
    if (url) {
      const { error } = await supabase.from("Website_photo_material").update({ [field]: url }).eq("id", materialId);
      if (error) {
        toast({ title: "更新失敗", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ 素材圖片已更新" });
        setMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, [field]: url } : m)));
      }
    }
    setUploadingImage(null);
  };

  const groupedMaterials = materials.reduce<Record<string, WebsiteMaterial[]>>((acc, mat) => {
    const cat = mat.category || "未分類";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mat);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <p className="text-muted-foreground">載入網站素材...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">管理產品圖片、首頁／頁面用素材、彈跳視窗照片與批次上傳。</p>

      <Tabs defaultValue="batch-upload">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-md bg-secondary p-1 text-secondary-foreground">
          <TabsTrigger value="batch-upload">IG 素材上傳</TabsTrigger>
          <TabsTrigger value="sea-upload">海巡素材上傳</TabsTrigger>
          <TabsTrigger value="products">產品圖片與文字</TabsTrigger>
          <TabsTrigger value="materials">頁面素材</TabsTrigger>
          <TabsTrigger value="popup">彈跳視窗照片管理</TabsTrigger>
        </TabsList>

        <TabsContent value="batch-upload" className="mt-6">
          <BatchUploadTab preset="ig" />
        </TabsContent>

        <TabsContent value="sea-upload" className="mt-6">
          <BatchUploadTab preset="sea" />
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          <div className="grid gap-6">
            {products.map((product) => {
              const isEditing = !!editingProduct[product.id];
              const edits = editingProduct[product.id];

              return (
                <Card key={product.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{product.name || product.id}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-6">
                      <ImageUploadBox
                        label="產品主圖"
                        imageUrl={product.product_image_url}
                        isUploading={uploadingImage === `${product.id}_product_image_url`}
                        onUpload={(file) => handleProductImageUpload(product.id, "product_image_url", file)}
                      />
                      <ImageUploadBox
                        label="Hover 圖片"
                        imageUrl={product.hover_image_url}
                        isUploading={uploadingImage === `${product.id}_hover_image_url`}
                        onUpload={(file) => handleProductImageUpload(product.id, "hover_image_url", file)}
                      />

                      <div className="flex-1 min-w-[250px] space-y-3">
                        {isEditing ? (
                          <>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">名稱</label>
                              <Input
                                value={edits.name}
                                onChange={(e) =>
                                  setEditingProduct((prev) => ({ ...prev, [product.id]: { ...prev[product.id], name: e.target.value } }))
                                }
                              />
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">描述</label>
                              <Textarea
                                value={edits.description}
                                onChange={(e) =>
                                  setEditingProduct((prev) => ({ ...prev, [product.id]: { ...prev[product.id], description: e.target.value } }))
                                }
                                rows={3}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveProduct(product.id)} disabled={savingProduct === product.id}>
                                {savingProduct === product.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                                儲存
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditingProduct((prev) => {
                                    const n = { ...prev };
                                    delete n[product.id];
                                    return n;
                                  })
                                }
                              >
                                取消
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-sm">
                              <span className="font-medium">名稱：</span>
                              {product.name || "（未設定）"}
                            </p>
                            <p className="text-sm">
                              <span className="font-medium">描述：</span>
                              {product.description || "（未設定）"}
                            </p>
                            <Button size="sm" variant="outline" onClick={() => startEditProduct(product)}>
                              編輯文字
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="materials" className="mt-6">
          <div className="space-y-8">
            {Object.entries(groupedMaterials).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-xl font-semibold mb-4 border-b pb-2">{category}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((mat) => (
                    <Card key={mat.id}>
                      <CardContent className="p-4 space-y-3">
                        <p className="font-medium text-sm">{mat.item_name || "（無名稱）"}</p>
                        {mat.put_where && <p className="text-xs text-muted-foreground">位置：{mat.put_where}</p>}
                        {mat.sort_order != null && <p className="text-xs text-muted-foreground">排序：{mat.sort_order}</p>}

                        <div className="flex gap-3">
                          <ImageUploadBox
                            label="桌面版"
                            imageUrl={mat.photo_url}
                            isUploading={uploadingImage === `mat_${mat.id}_photo_url`}
                            onUpload={(file) => handleMaterialImageUpload(mat.id, "photo_url", file)}
                            small
                          />
                          <ImageUploadBox
                            label="手機版"
                            imageUrl={mat.photo_url_mobile}
                            isUploading={uploadingImage === `mat_${mat.id}_photo_url_mobile`}
                            onUpload={(file) => handleMaterialImageUpload(mat.id, "photo_url_mobile", file)}
                            small
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="popup" className="mt-6">
          <AdminPopupMaterialsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface ImageUploadBoxProps {
  label: string;
  imageUrl: string | null;
  isUploading: boolean;
  onUpload: (file: File) => void;
  small?: boolean;
}

const ImageUploadBox = ({ label, imageUrl, isUploading, onUpload, small }: ImageUploadBoxProps) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const size = small ? "w-28 h-28" : "w-36 h-36";

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div
        className={`${size} relative rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer overflow-hidden flex items-center justify-center bg-muted/30 transition-colors`}
        onClick={() => !isUploading && fileRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : imageUrl ? (
          <SafeImage src={imageUrl} alt={label} fill className="object-cover" sizes="144px" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
};

export default AdminWebsiteMaterialsSection;
