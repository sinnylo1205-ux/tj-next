"use client";

import { useRouter } from "next/navigation";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function HomePaymentResultDialog({
  open,
  onOpenChange,
  paymentStatus,
  paymentMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentStatus: "checking" | "success" | "failed";
  paymentMessage: string;
}) {
  const router = useRouter();
  const paymentSuccess = paymentStatus === "success";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {paymentStatus === "checking" ? (
              <>
                <Clock className="h-6 w-6 text-amber-500" />
                信用卡付款確認中
              </>
            ) : paymentSuccess ? (
              <>
                <CheckCircle className="h-6 w-6 text-green-500" />
                信用卡付款成功
              </>
            ) : (
              <>
                <XCircle className="h-6 w-6 text-red-500" />
                信用卡付款失敗
              </>
            )}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {paymentMessage}
            {paymentSuccess && (
              <p className="mt-2 text-sm">您的訂單狀態已更新為「處理中」，可至會員中心查看訂單進度。</p>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              router.push(paymentSuccess ? "/member?tab=processing" : "/member?tab=pending");
            }}
          >
            前往會員中心
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
