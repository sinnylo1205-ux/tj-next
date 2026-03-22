"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";

const newPasswordSchema = z
  .object({
    password: z.string().min(8, { message: "密碼至少 8 個字元" }),
    confirmPassword: z.string().min(1, { message: "請再次輸入密碼" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "兩次輸入的密碼不一致",
    path: ["confirmPassword"],
  });

type NewPasswordForm = z.infer<typeof newPasswordSchema>;

/**
 * 信件內重設連結導向此頁。正式網域請在 Supabase Redirect URLs 加入：
 * https://tjcookies.com/reset-password/confirm
 * 本機：http://localhost:3000/reset-password/confirm
 */
export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NewPasswordForm>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  useEffect(() => {
    let cancelled = false;

    const establishSession = async () => {
      try {
        const { data: first } = await supabase.auth.getSession();
        if (!cancelled && first.session) {
          setPhase("ready");
          return;
        }

        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          const code = params.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (!cancelled) {
              if (error) {
                setPhase("error");
                return;
              }
              const { data: second } = await supabase.auth.getSession();
              if (second.session) {
                setPhase("ready");
                return;
              }
            }
          }
        }

        const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
          if (cancelled) return;
          if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
            setPhase("ready");
          }
        });

        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) {
          sub.subscription.unsubscribe();
          return;
        }

        const { data: late } = await supabase.auth.getSession();
        sub.subscription.unsubscribe();
        if (!cancelled) {
          setPhase(late.session ? "ready" : "error");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    };

    void establishSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (data: NewPasswordForm) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) {
        toast({
          title: "更新失敗",
          description: error.message || "請稍後再試或重新從信件開啟連結",
          variant: "destructive",
        });
        return;
      }
      await supabase.auth.signOut();
      toast({ title: "密碼已更新", description: "請使用新密碼登入" });
      router.push("/login?reset=success");
    } catch {
      toast({ title: "更新時發生錯誤", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-center">驗證重設連結中…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">連結無效或已過期</CardTitle>
            <CardDescription>
              請回到忘記密碼頁重新發送信件，或確認是否已使用過同一封郵件內的連結。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/reset-password" className="block">
              <Button className="w-full">重新申請重設密碼</Button>
            </Link>
            <Link href="/login" className="block">
              <Button type="button" variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">設定新密碼</CardTitle>
          <CardDescription>請輸入新密碼並再確認一次，完成後將導向登入頁。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密碼</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="至少 8 個字元"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">再次確認密碼</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="請再輸入一次新密碼"
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword && (
                <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  更新中…
                </>
              ) : (
                "更新密碼"
              )}
            </Button>
            <Link href="/login" className="block">
              <Button type="button" variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
