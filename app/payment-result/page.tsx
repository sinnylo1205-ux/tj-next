"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ArrowLeft } from "lucide-react";

function PaymentResultPageContent() {
  const searchParams = useSearchParams();
  const rtnCode = searchParams.get("RtnCode");
  const rtnMsg = searchParams.get("RtnMsg");
  const merchantTradeNo = searchParams.get("MerchantTradeNo");
  const isSuccess = rtnCode === "1";

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-gradient-to-b from-background to-brand-50 flex items-center justify-center">
      <div className="container max-w-md">
        <Card className="text-center">
          <CardHeader className="pb-4">
            {isSuccess ? (
              <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            ) : (
              <XCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
            )}
            <CardTitle className="text-2xl">
              {isSuccess ? "付款成功" : "付款失敗"}
            </CardTitle>
            <CardDescription className="text-base">
              {isSuccess
                ? "感謝您的訂購，我們將盡快為您處理訂單"
                : rtnMsg || "付款過程中發生錯誤，請稍後再試"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {merchantTradeNo && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground">訂單編號</p>
                <p className="text-lg font-mono font-semibold">#{merchantTradeNo.slice(0, 8).toUpperCase()}</p>
              </div>
            )}
            <div className="space-y-3">
              <Button className="w-full" asChild>
                <Link href="/member?tab=processing">查看訂單</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回首頁
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-64px)] flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <PaymentResultPageContent />
    </Suspense>
  );
}
