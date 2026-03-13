"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const packages = [
  {
    id: "package-19000",
    name: "經典午茶方案",
    price: 19000,
    features: ["鹹/甜食點品項13種", "僅按照背板色系搭配甜點", "無風格展現", "經典桌面佈置（不含背板）"],
  },
  {
    id: "package-25000",
    name: "品牌風格方案",
    price: 28800,
    features: [
      "鹹/甜食點品項15種",
      "簡單桌上佈置按照背板風格＆色系客製化甜點",
      "贈送六吋蛋糕（早鳥限定）",
      "精緻桌面佈置（不含背板）",
    ],
    popular: true,
  },
  {
    id: "package-35000",
    name: "奢華全境方案",
    price: 38800,
    features: [
      "鹹/甜食點品項16種",
      "可指定（主題款）風格",
      "外加籤餅活動遊戲設計",
      "包含背板場地佈置",
      "贈送八吋蛋糕（早鳥限定）",
    ],
  },
];

const LINE_URL = "https://lin.ee/Tp9U5bf";
const DETAIL_IMAGE_URL =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/candybar_pro-01.webp";

function StylePackagesPageContent() {
  const searchParams = useSearchParams();
  const styleName = searchParams.get("style") || "風格方案";
  const router = useRouter();

  useEffect(() => {
    document.title = `${styleName}｜T&J 客製化甜點`;
  }, [styleName]);

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-ink">{styleName}</h1>
          <p className="text-ink-muted max-w-2xl mx-auto">選擇適合您的方案，打造專屬的活動體驗</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {packages.map((pkg) => (
            <Card
              key={pkg.id}
              className={`p-8 relative ${pkg.popular ? "border-brand-500 border-2" : ""}`}
              style={{ boxShadow: "var(--elev-card)" }}
            >
              {pkg.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                  最受歡迎
                </div>
              )}

              <div className="text-center mb-6">
                <h2 className="mb-2 text-ink">{pkg.name}</h2>
                <div className="flex items-end justify-center gap-1 mb-2 whitespace-nowrap">
                  <span className="text-4xl font-bold text-brand-600">${pkg.price.toLocaleString()}</span>
                  <span className="text-sm text-brand-500">起</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {pkg.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
                    <span className="text-ink-muted">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="w-full"
                size="lg"
                variant={pkg.popular ? "default" : "outline"}
                onClick={() => window.open(LINE_URL)}
              >
                加官方 LINE 聊聊方案
              </Button>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex text-lg font-medium items-center justify-between">
          <Button variant="ghost" onClick={() => router.push("/gallery")}>
            ← 返回作品集
          </Button>
          <a
            href={DETAIL_IMAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-5 py-2 text-lg font-medium"
          >
            點擊查看三種方案詳情→
          </a>
        </div>
      </div>
    </div>
  );
}

export default function StylePackagesPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-64px)] flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <StylePackagesPageContent />
    </Suspense>
  );
}
