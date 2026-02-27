"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CustomizerNewPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.slug as string[] | undefined)?.join("/") || "";

  return (
    <div className="container py-12 px-4 max-w-lg mx-auto text-center">
      <Card>
        <CardHeader>
          <CardTitle>客製化編輯器</CardTitle>
          <CardDescription>
            此頁面（{slug || "首頁"}）由 Legacy 的 UniversalCustomizer 遷移，完整功能開發中。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button asChild>
            <Link href="/order">返回選購</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">返回首頁</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
