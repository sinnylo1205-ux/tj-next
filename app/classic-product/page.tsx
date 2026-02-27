"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/CartContext";
import { calculatePrice } from "@/lib/priceApi";
import { useQuantityInput } from "@/hooks/useQuantityInput";

interface Product {
  id: string;
  name: string;
  description: string;
  product_image_url: string;
  category: string;
  price: number;
  metadata_classic: { category: string } | null;
}

interface ProductNotice {
  size: string | null;
  ingredient: string | null;
  allergy: string | null;
  min_order_qty: number | null;
}

const TABS = [
  {
    key: "mermaid",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/mermaid.webp",
  },
  {
    key: "pony",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/corn.webp",
  },
  {
    key: "fairy",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/f.webp",
  },
  {
    key: "ice",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/ice.webp",
  },
  {
    key: "star",
    image:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/classic/all_botton/st.webp",
  },
];

function ClassicProductPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  const tabCategory = searchParams.get("tab");
  const { addToCartCustom } = useCart();
  const { toast } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [productNotice, setProductNotice] = useState<ProductNotice | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [minOrderQty, setMinOrderQty] = useState(1);
  const [subtotal, setSubtotal] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [productId]);

  useEffect(() => {
    setIsDataReady(false);
  }, [productId]);

  useEffect(() => {
    const fetchData = async () => {
      if (!productId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("id, name, description, product_image_url, category, price, metadata_classic")
          .eq("id", productId)
          .single();

        if (productError || !productData) {
          console.error("Error fetching product:", productError);
          setIsLoading(false);
          return;
        }

        setProduct({
          ...productData,
          name: productData.name || "",
          description: productData.description || "",
          product_image_url: productData.product_image_url || "",
          price: productData.price || 0,
          metadata_classic: productData.metadata_classic as { category: string } | null,
        });

        const { data: noticeData } = await supabase
          .from("product_notice")
          .select("size, ingredient, allergy, min_order_qty")
          .eq("product_id", productId)
          .maybeSingle();

        if (noticeData) {
          setProductNotice(noticeData);
          const minQty = noticeData.min_order_qty || 1;
          setMinOrderQty(minQty);
          setQuantity(minQty);
        }

        setIsDataReady(true);

        const categoryToUse = (tabCategory || productData.metadata_classic?.category)?.toLowerCase();
        if (categoryToUse) {
          const { data: bgList, error: bgError } = await supabase
            .from("Website_photo_material")
            .select("photo_url, metadata_tab")
            .eq("category", "classic_product");

          if (!bgError && bgList) {
            const match = bgList
              .filter((bg) => bg.metadata_tab !== null)
              .find((bg) => {
                const meta = bg.metadata_tab as { category?: string };
                return meta.category?.toLowerCase() === categoryToUse;
              });
            if (match?.photo_url) setBackgroundImage(match.photo_url);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [productId, tabCategory]);

  useEffect(() => {
    const calculateSubtotal = async () => {
      if (!product || !isDataReady) return;
      const requestId = ++latestRequestId.current;
      setIsCalculating(true);
      try {
        const response = await calculatePrice({
          product_id: product.id,
          quantity,
          selected_option_ids: [],
        });

        if (requestId !== latestRequestId.current) return;

        if (response.success && response.data?.breakdown) {
          const backendTotal = response.data.breakdown.grand_total;
          const expectedTotal = product.price * quantity;
          if (backendTotal >= expectedTotal) {
            setSubtotal(backendTotal);
          } else {
            setSubtotal(expectedTotal);
          }
        } else {
          setSubtotal(product.price * quantity);
        }
      } catch {
        if (requestId !== latestRequestId.current) return;
        setSubtotal(product.price * quantity);
      } finally {
        if (requestId === latestRequestId.current) setIsCalculating(false);
      }
    };

    calculateSubtotal();
  }, [product, quantity, isDataReady]);

  const handleQuantityChange = (newQuantity: number) => {
    setQuantity(Math.max(minOrderQty, newQuantity));
  };

  const { localValue, handleInputChange, handleInputBlur, handleKeyDown } = useQuantityInput({
    quantity,
    minQuantity: minOrderQty,
    onQuantityChange: handleQuantityChange,
  });

  const handleAddToCart = async () => {
    if (!product) return;
    if (isCalculating) {
      toast({ title: "請稍候", description: "正在計算價格..." });
      return;
    }
    const expectedTotal = product.price * quantity;
    const finalPrice = subtotal ?? expectedTotal;
    if (finalPrice < expectedTotal) {
      toast({
        title: "價格計算異常",
        description: "請重新整理頁面後再試",
        variant: "destructive",
      });
      return;
    }

    try {
      const cartItem = {
        product_id: product.id,
        name: product.name,
        category: product.category || "classic",
        quantity,
        total_price: finalPrice,
        preview_url: product.product_image_url,
        customizations: [],
        expected_pickup_date: typeof window !== "undefined" ? localStorage.getItem("expected_pickup_date") || undefined : undefined,
      };

      addToCartCustom(cartItem);

      toast({
        title: "已加入購物車",
        description: "您已加入購物車，點擊前往購物車頁面",
        action: (
          <Button variant="outline" size="sm" onClick={() => router.push("/cart")}>
            前往購物車
          </Button>
        ),
      });
    } catch (error) {
      console.error("Error adding to cart:", error);
      toast({
        title: "加入購物車失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    }
  };

  const handleBackClick = () => {
    router.push("/classic-styles");
  };

  const handleTabClick = (tabKey: string) => {
    router.push(`/classic-styles?tab=${tabKey}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground animate-pulse">載入中…</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">找不到此商品</p>
        <Button variant="outline" onClick={handleBackClick}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* ===== MOBILE LAYOUT ===== */}
      <div className="lg:hidden bg-background min-h-screen">
        <button
          onClick={handleBackClick}
          className="fixed top-4 left-4 z-20 flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-md"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </button>

        <div className="px-6 pt-20 pb-8 flex flex-col gap-6">
          <h1 className="text-3xl font-semibold leading-tight text-foreground">{product.name}</h1>

          {product.description && (
            <p className="text-base leading-relaxed text-muted-foreground">{product.description}</p>
          )}

          <div className="w-full bg-white rounded-2xl p-6 flex items-center justify-center">
            <img
              src={product.product_image_url}
              alt={product.name}
              className="w-full max-w-xs h-auto object-contain"
              width={320}
              height={320}
            />
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="size" className="border-b">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="text-sm font-medium">📐 產品尺寸</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 py-3 text-muted-foreground text-sm">
                {productNotice?.size || "暫無資訊"}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ingredient" className="border-b">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="text-sm font-medium">🧁 產品原料</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 py-3 text-muted-foreground text-sm">
                {productNotice?.ingredient || "暫無資訊"}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="allergy" className="border-b-0">
              <AccordionTrigger className="py-3 hover:no-underline">
                <span className="text-sm font-medium">⚠️ 產品過敏原</span>
              </AccordionTrigger>
              <AccordionContent className="px-2 py-3 text-muted-foreground text-sm">
                {productNotice?.allergy || "暫無資訊"}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="bg-muted/30 rounded-2xl p-6 flex flex-col gap-4">
            <div className="text-2xl font-semibold text-primary">NT$ {product.price.toLocaleString()}</div>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center border border-border rounded-lg">
                <button
                  onClick={() => handleQuantityChange(quantity - 1)}
                  className="p-3 hover:bg-accent/20 transition-colors rounded-l-lg"
                  disabled={quantity <= minOrderQty}
                >
                  <Minus className="w-5 h-5" />
                </button>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={localValue}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  onKeyDown={handleKeyDown}
                  className="w-16 text-center text-lg font-semibold border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <button
                  onClick={() => handleQuantityChange(quantity + 1)}
                  className="p-3 hover:bg-accent/20 transition-colors rounded-r-lg"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <Button onClick={handleAddToCart} className="flex-1 h-12 gap-2">
                <ShoppingCart className="w-5 h-5" />
                加入購物車
              </Button>
            </div>
            {minOrderQty > 1 && <p className="text-xs text-muted-foreground">最小訂購量：{minOrderQty} 件</p>}
            <div className="pt-4 border-t border-border">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  <span className="px-3 py-1 rounded-md bg-white/60">小計</span>
                </span>
                <span className="text-xl font-bold text-primary">
                  <span className="px-4 py-1 rounded-md bg-white/60">
                    {isCalculating ? (
                      <span className="animate-pulse">計算中...</span>
                    ) : (
                      `NT$ ${(subtotal || 0).toLocaleString()}`
                    )}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-8 pb-4">
            <h3 className="text-center text-xs tracking-widest text-foreground/50 mb-4">探索其他</h3>
            <div className="flex justify-center gap-3 flex-wrap">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`w-16 h-20 rounded-lg overflow-hidden transition-all duration-200 hover:scale-105 ${
                    tabCategory === tab.key ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                >
                  <img src={tab.image} alt={tab.key} className="w-full h-full object-contain" width={64} height={80} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT ===== */}
      <section
        className="hidden lg:block relative w-full min-h-screen"
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {!backgroundImage && <div className="absolute inset-0 bg-gradient-to-b from-accent/30 to-background" />}

        <button
          onClick={handleBackClick}
          className="absolute top-6 left-6 z-20 flex items-center gap-2 text-foreground/80 hover:text-foreground transition-colors bg-background/50 backdrop-blur-sm rounded-full px-4 py-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </button>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-4 py-20">
          <div className="grid grid-cols-3 gap-8 items-start min-h-[70vh]">
            <div className="relative pr-6 mt-96">
              {product.description && (
                <p className="text-base font-semibold leading-relaxed tracking-wide text-foreground max-w-md">
                  {product.description}
                </p>
              )}
              <Accordion type="single" collapsible className="mt-8 space-y-2">
                <AccordionItem value="size" className="border-b last:border-b-0">
                  <AccordionTrigger className="py-3 text-xs text-foreground/80 hover:no-underline">
                    <span className="text-sm font-medium">📐 產品尺寸</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 text-muted-foreground">
                    {productNotice?.size || "暫無資訊"}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="ingredient" className="border-b last:border-b-0">
                  <AccordionTrigger className="py-3 text-xs text-foreground/80 hover:no-underline">
                    <span className="text-sm font-medium">🧁 產品原料</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 text-muted-foreground">
                    {productNotice?.ingredient || "暫無資訊"}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="allergy" className="border-b last:border-b-0">
                  <AccordionTrigger className="py-3 text-xs text-foreground/80 hover:no-underline">
                    <span className="text-sm font-medium">⚠️ 產品過敏原</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 py-3 text-muted-foreground">
                    {productNotice?.allergy || "暫無資訊"}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="flex items-center justify-center mt-20">
              <img
                src={product.product_image_url}
                alt={product.name}
                className="w-full max-w-xl h-auto object-contain drop-shadow-2xl"
                width={576}
                height={576}
              />
            </div>

            <div className="relative flex flex-col gap-6 mt-12">
              <h1 className="text-5xl font-semibold leading-tight text-foreground">{product.name}</h1>
              <div className="text-3xl font-medium text-primary ml-1">NT$ {product.price.toLocaleString()}</div>
              <div className="flex items-center gap-4">
                <div className="flex items-center border-b">
                  <button
                    onClick={() => handleQuantityChange(quantity - 1)}
                    className="p-3 hover:bg-accent/20 transition-colors"
                    disabled={quantity <= minOrderQty}
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={localValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    className="w-16 text-center text-lg font-semibold border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <button
                    onClick={() => handleQuantityChange(quantity + 1)}
                    className="p-3 hover:bg-accent/20 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <button
                  onClick={handleAddToCart}
                  className="p-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors shadow-lg"
                  title="加入購物車"
                >
                  <ShoppingCart className="w-6 h-6" />
                </button>
              </div>
              {minOrderQty > 1 && <p className="text-xs text-muted-foreground">最小訂購量：{minOrderQty} 件</p>}
              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    <span className="px-3 py-1 rounded-md bg-white/60">小計</span>
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    <span className="px-4 py-1 rounded-md bg-white/60">
                      {isCalculating ? (
                        <span className="animate-pulse">計算中...</span>
                      ) : (
                        `NT$ ${(subtotal || 0).toLocaleString()}`
                      )}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-16 pb-8">
            <h3 className="text-center text-xs tracking-widest text-foreground/50 mb-4">探索其他</h3>
            <div className="flex justify-center gap-4 flex-wrap">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`w-24 h-32 rounded-xl overflow-hidden transition-all duration-200 hover:scale-105 ${
                    tabCategory === tab.key ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                >
                  <img src={tab.image} alt={tab.key} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function ClassicProductPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <ClassicProductPageContent />
    </Suspense>
  );
}
