"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ExternalLink, MessageCircle, ArrowRight, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LINE_OFFICIAL_ACCOUNT_ID = "@krz3717h";
const LINE_ADD_FRIEND_URL = `https://line.me/R/ti/p/${LINE_OFFICIAL_ACCOUNT_ID}`;
const AUTO_COMPLETE_DELAY = 5 * 60 * 1000;

function AddLineFriendContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [showRedirectWarning, setShowRedirectWarning] = useState(false);
  const autoCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoCompletedRef = useRef(false);

  const orderId = searchParams.get("orderId");
  const userId = searchParams.get("userId");

  const triggerAutoComplete = useCallback(async () => {
    if (!orderId || !userId || hasAutoCompletedRef.current) return;
    hasAutoCompletedRef.current = true;
    try {
      await supabase.functions.invoke("verify-line-friendship", {
        body: { orderId, userId, autoTriggered: true },
      });
      toast({ title: "系統已自動完成訂單流程" });
      router.push("/member?tab=pending&line_linked=auto");
    } catch {
      router.push("/member?tab=pending");
    }
  }, [orderId, userId, router, toast]);

  useEffect(() => {
    if (!orderId || !userId) {
      router.replace("/");
      return;
    }
    autoCompleteTimerRef.current = setTimeout(triggerAutoComplete, AUTO_COMPLETE_DELAY);
    return () => {
      if (autoCompleteTimerRef.current) clearTimeout(autoCompleteTimerRef.current);
    };
  }, [orderId, userId, triggerAutoComplete, router]);

  const handleOpenLine = () => {
    setShowRedirectWarning(true);
  };

  const handleConfirmRedirect = () => {
    setShowRedirectWarning(false);
    window.open(LINE_ADD_FRIEND_URL, "_blank");
  };

  const handleSkipped = () => {
    setIsSkipping(true);
    router.push("/member?tab=pending");
  };

  return (
    <div className="container max-w-md py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
            加入 LINE 好友
          </CardTitle>
          <CardDescription>請加入官方 LINE 以完成訂單流程與後續通知</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" size="lg" onClick={handleOpenLine}>
            <ExternalLink className="w-4 h-4 mr-2" />
            開啟 LINE 加入好友
          </Button>
          <Button variant="outline" className="w-full" onClick={handleSkipped} disabled={isSkipping}>
            {isSkipping ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            稍後再說
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <a href="/member">
              <ArrowRight className="w-4 h-4 mr-2" />
              前往會員中心
            </a>
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showRedirectWarning} onOpenChange={setShowRedirectWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>即將開啟 LINE</AlertDialogTitle>
            <AlertDialogDescription>將在新視窗開啟 LINE 加入好友頁面，請於加入後回到此頁或會員中心。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRedirect}>確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AddLineFriendPage() {
  return (
    <Suspense
      fallback={
        <div className="container max-w-md py-12 px-4 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AddLineFriendContent />
    </Suspense>
  );
}
