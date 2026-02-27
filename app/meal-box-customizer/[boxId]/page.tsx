"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MealBoxCustomizerPage() {
  const params = useParams();
  const boxId = params?.boxId as string;

  return (
    <div className="container py-12 px-4 max-w-lg mx-auto text-center">
      <Card>
        <CardHeader>
          <CardTitle>餐盒客製化</CardTitle>
          <CardDescription>
            方案 {boxId} 的客製化編輯器由 Legacy MealBoxCustomizer 遷移，完整功能開發中。
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
