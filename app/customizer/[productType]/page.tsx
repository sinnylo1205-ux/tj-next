"use client";

import { useParams, useRouter } from "next/navigation";
import { UniversalCustomizerPageWithProps } from "@/components/universal-customizer/UniversalCustomizerPage";

export default function CustomizerPage() {
  const params = useParams();
  const router = useRouter();
  const productType = params?.productType as string | undefined;

  if (!productType) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-xl text-muted-foreground text-center">未指定產品類型</p>
      </div>
    );
  }

  return (
    <UniversalCustomizerPageWithProps
      productType={productType}
      navigate={(url) => router.push(url)}
    />
  );
}
