"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, XCircle, ArrowLeft } from "lucide-react";
import {
  clearPendingCreditCardPayment,
  getCreditCardReturnSignal,
  readPendingCreditCardPayment,
  waitForCreditCardOrderVerification,
} from "@/lib/credit-card-payment-status";

function PaymentResultPageContent() {
  const searchParams = useSearchParams();
  const [paymentStatus, setPaymentStatus] = useState<"checking" | "success" | "failed">("checking");
  const [paymentMessage, setPaymentMessage] = useState("正在確認信用卡付款狀態。");
  const isSuccess = paymentStatus === "success";

  useEffect(() => {
    let cancelled = false;
    const returnSignal = getCreditCardReturnSignal(searchParams);

    const confirmPayment = async () => {
      if (returnSignal === "failed") {
        setPaymentStatus("failed");
        setPaymentMessage(searchParams.get("message") || "信用卡付款未完成，訂單尚未進入處理中。");
        clearPendingCreditCardPayment();
        return;
      }

      if (returnSignal !== "success") {
        setPaymentStatus("checking");
        setPaymentMessage("請至會員中心確認最新訂單狀態。");
        return;
      }

      const pendingPayment = readPendingCreditCardPayment();
      if (!pendingPayment?.isFresh) {
        setPaymentStatus("checking");
        setPaymentMessage("已收到付款平台回傳，請至會員中心確認訂單狀態。");
        clearPendingCreditCardPayment();
        return;
      }

      const isVerified = await waitForCreditCardOrderVerification(pendingPayment.orderId);
      if (cancelled) return;
      clearPendingCreditCardPayment();
      if (isVerified) {
        setPaymentStatus("success");
        setPaymentMessage("付款已確認，感謝您的訂購。");
      } else {
        setPaymentStatus("checking");
        setPaymentMessage("付款結果尚未完成系統確認，請稍後至會員中心查看訂單狀態。");
      }
    };

    confirmPayment();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-gradient-to-b from-background to-brand-50 flex items-center justify-center">
      <div className="container max-w-md">
        <Card className="text-center">
          <CardHeader className="pb-4">
            {paymentStatus === "checking" ? (
              <Clock className="mx-auto h-16 w-16 text-amber-500 mb-4" />
            ) : isSuccess ? (
              <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
            ) : (
              <XCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
            )}
            <CardTitle className="text-2xl">
              {paymentStatus === "checking" ? "付款確認中" : isSuccess ? "付款成功" : "付款未完成"}
            </CardTitle>
            <CardDescription className="text-base">
              {paymentMessage}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Button className="w-full" asChild>
                <Link href={isSuccess ? "/member?tab=processing" : "/member?tab=pending"}>查看訂單</Link>
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
