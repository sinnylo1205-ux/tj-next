"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, ArrowLeft } from "lucide-react";

const resetPasswordSchema = z.object({
  email: z.string().email({ message: "請輸入有效的 Email" }),
});

export default function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { email: "" },
  });

  const handleSubmit = async (data: z.infer<typeof resetPasswordSchema>) => {
    setIsLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      // 正式站請在 Supabase → Auth → URL configuration → Redirect URLs 加入：
      // https://tjcookies.com/reset-password/confirm
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${origin}/reset-password/confirm`,
      });
      if (error) {
        toast({ title: "發送失敗", description: error.message || "請稍後再試", variant: "destructive" });
        return;
      }
      setEmailSent(true);
      toast({ title: "重設密碼信已發送", description: "請檢查您的信箱" });
    } catch {
      toast({ title: "發送失敗，請確認 Email 是否正確", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (emailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">重設信已發送</CardTitle>
            <CardDescription className="text-base">
              請檢查您的信箱（包含垃圾郵件夾），並點擊信中的連結重設密碼
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4" />
                已發送至：<span className="font-medium text-foreground">{form.getValues("email")}</span>
              </p>
              <p>若 5 分鐘內未收到信件，請檢查垃圾郵件夾或重新發送</p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setEmailSent(false)}>重新發送</Button>
            <Link href="/login" className="block">
              <Button type="button" variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入頁
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
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">忘記密碼</CardTitle>
          <CardDescription className="text-center">輸入您的 Email，我們會發送重設密碼的連結給您</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="請輸入您註冊時使用的 Email" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "發送中..." : "發送重設密碼信"}
            </Button>
            <Link href="/login" className="block">
              <Button type="button" variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                返回登入頁
              </Button>
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
