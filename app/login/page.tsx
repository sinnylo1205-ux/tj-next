"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { buildAuthCallbackUrl, loadPendingAiRender, resolveAuthNextPath } from "@/lib/pending-ai-render";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const loginSchema = z.object({
  email: z.string().email({ message: "請輸入有效的 Email" }),
  password: z.string().min(6, { message: "密碼至少需要 6 個字元" }),
});

function LoginPageContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string>("/");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const resetToastShown = useRef(false);

  useEffect(() => {
    if (resetToastShown.current) return;
    if (searchParams.get("reset") === "success") {
      resetToastShown.current = true;
      toast({
        title: "密碼已更新",
        description: "請使用新密碼登入",
      });
      window.history.replaceState(null, "", "/login");
    }
  }, [searchParams, toast]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleSuccessConfirm = () => {
    setShowSuccessDialog(false);
    router.push(pendingRedirect);
  };

  const handleSubmit = async (data: z.infer<typeof loginSchema>) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: data.email, password: data.password });
      if (error) {
        toast({
          title: "登入失敗",
          description: error.message === "Invalid login credentials" ? "帳號或密碼錯誤" : error.message,
          variant: "destructive",
        });
        return;
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        toast({ title: "登入後讀取資料發生錯誤", variant: "destructive" });
        return;
      }
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      // 非 admin：優先回到 AI pending 編輯器／redirect query
      const redirectTo = adminRole ? "/admin" : resolveAuthNextPath(searchParams.get("redirect"));
      setPendingRedirect(redirectTo);
      setShowSuccessDialog(true);
    } catch {
      toast({ title: "登入時發生錯誤，請稍後再試", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook" | "apple") => {
    try {
      // Google 等 OAuth 不需驗證信；經 /auth/callback 統一導回（含 AI resume）
      const next = resolveAuthNextPath(searchParams.get("redirect"));
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: buildAuthCallbackUrl(next) },
      });
      if (error) toast({ title: `${provider} 登入失敗`, description: error.message, variant: "destructive" });
    } catch {
      toast({ title: "登入時發生錯誤，請稍後再試", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">登入</CardTitle>
          <CardDescription className="text-center">使用您的帳號登入 T&J 客製化甜點</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 space-y-1.5">
            <p className="text-sm font-semibold text-foreground text-center">建議使用 Google 登入，免收驗證信</p>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              最快完成登入並回到客製流程；請使用 Chrome 開啟本站效果較佳。
            </p>
          </div>

          <Button type="button" className="w-full h-12 text-base font-semibold" onClick={() => handleSocialLogin("google")}>
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            使用 Google 登入
          </Button>

          <div className="relative">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              或使用 Email 登入
            </span>
          </div>

          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email / 帳號 *</Label>
              <Input id="email" type="email" placeholder="請輸入您的 Email" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼 *</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="請輸入您的密碼"
                  {...form.register("password")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground">
                  {showPassword ? "隱藏" : "顯示"}
                </button>
              </div>
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>
            <div className="text-right">
              <Link href="/reset-password" className="text-sm text-primary hover:underline">忘記密碼？</Link>
            </div>
            <Button type="submit" variant="secondary" className="w-full" disabled={isLoading}>
              {isLoading ? "登入中..." : "Email 登入"}
            </Button>
          </form>

          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-muted/40 px-4 py-4 text-center space-y-3">
            <p className="text-base font-semibold text-foreground">還沒有帳號？</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              註冊後即可使用 AI 擬真渲染。若不想收驗證信，也可直接按上方 Google 登入（首次會自動建立帳號）。
            </p>
            <Button asChild variant="outline" className="w-full h-11 font-semibold border-primary text-primary hover:bg-primary/5">
              <Link
                href={
                  searchParams.get("redirect")
                    ? `/register?redirect=${encodeURIComponent(searchParams.get("redirect")!)}`
                    : "/register"
                }
              >
                前往註冊帳號
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">🎉 登入成功！</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {loadPendingAiRender()
                ? "歡迎回來！即將回到您的設計並繼續 AI 擬真渲染。"
                : "歡迎回來！您已成功登入 T&J 客製化甜點。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleSuccessConfirm} className="w-full">確定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <LoginPageContent />
    </Suspense>
  );
}
