"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { LoadingScreen } from "@/components/LoadingScreen";
import ProgressiveImage from "@/components/ProgressiveImage";

interface Product {
  id: string;
  name: string;
  description: string;
  product_image_url: string;
  category: string;
}

const GALLERY_QUERY_KEY = ["gallery"] as const;

export default function GalleryPage() {
  const router = useRouter();
  const { data: styleWorks = [], isLoading } = useQuery({
    queryKey: GALLERY_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("category", "candyBar");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });

  if (isLoading) {
    return <LoadingScreen fullScreen message="載入中..." />;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container">
        <h1 className="sr-only">甜點茶會佈置</h1>
        <div className="max-w-7xl mx-auto mb-12">
          <div className="relative w-full flex justify-center">
            <img
              src="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/CanyBar/fuof.webp"
              alt="你的專屬風格甜點茶會佈置"
              className="max-w-[700px] w-full object-contain border-0 shadow-none"
            />
          </div>
        </div>
        <div className="max-w-7xl mx-auto">
          <div className="relative w-full flex justify-center">
            <img
              src="https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/CanyBar/newgellery.png"
              alt=""
              className="max-w-[700px] w-full "
            />
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {styleWorks.map((work) => (
              <Card
                key={work.id}
                className="p-8 hover:scale-105 transition-transform duration-300 cursor-pointer"
                style={{ boxShadow: "var(--elev-card)" }}
                onClick={() => router.push(`/style-packages?style=${encodeURIComponent(work.name)}`)}
              >
                {work.product_image_url ? (
                  <ProgressiveImage
                    src={work.product_image_url}
                    alt={work.name}
                    aspectRatio={4 / 5}
                    containerClassName="rounded-md mb-4"
                    className="hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="aspect-[4/5] bg-gradient-to-br from-brand-100 to-brand-300 rounded-md mb-4 flex items-center justify-center">
                    <span className="text-4xl">🎨</span>
                  </div>
                )}
                <h3 className="mb-2 text-ink">{work.name}</h3>
                <p className="text-ink-muted mb-2">{work.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
