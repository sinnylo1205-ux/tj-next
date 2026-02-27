"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const registerSchema = z.object({
  name: z.string().min(1, { message: "請輸入姓名" }).max(100, { message: "姓名過長" }),
  email: z.string().email({ message: "請輸入有效的 Email" }),
  password: z.string().min(8, { message: "密碼至少需要 8 個字元" }).regex(/^(?=.*[A-Za-z])(?=.*\d)/, { message: "密碼需包含字母與數字" }),
  phone: z.string().optional(),
  role: z.enum(["consumer", "admin", "business"]),
  termsAgreed: z.boolean().refine((val) => val === true, { message: "請同意服務條款" }),
});

function RegisterPageContent() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "", role: "consumer", termsAgreed: false },
  });

  const handleSubmit = async (data: z.infer<typeof registerSchema>) => {
    setIsLoading(true);
    try {
      const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/` : "/";
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { name: data.name, phone: data.phone || "", role: data.role },
        },
      });
      if (error) {
        const msg = error.message;
        if (msg.includes("already registered") || msg.includes("User already registered") || msg.includes("already exists") || msg.includes("already been registered") || msg.includes("email address is already")) {
          toast({ title: "此 Email 已被註冊，請直接登入", variant: "destructive" });
        } else {
          toast({ title: "註冊失敗", description: error.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "註冊成功！請檢查您的 Email 以驗證帳號" });
      setRegisteredEmail(data.email);
      setShowEmailDialog(true);
    } catch {
      toast({ title: "註冊時發生錯誤，請稍後再試", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailDialogClose = () => {
    setShowEmailDialog(false);
    const redirectTo = searchParams.get("redirect");
    if (redirectTo === "/cart" || redirectTo === "/checkout") router.push("/cart");
    else router.push("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">建立帳號</CardTitle>
          <CardDescription className="text-center">填寫以下資訊以註冊 T&J 客製化甜點</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名 / Name *</Label>
              <Input id="name" type="text" placeholder="請輸入您的姓名" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="example@email.com" {...form.register("email")} />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼 *</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} placeholder="至少 8 碼、含字母與數字" {...form.register("password")} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground">{showPassword ? "隱藏" : "顯示"}</button>
              </div>
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">電話</Label>
              <Input id="phone" type="tel" placeholder="0912-345-678" {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">身份</Label>
              <Select onValueChange={(v) => form.setValue("role", v as "consumer" | "admin" | "business")} defaultValue="consumer">
                <SelectTrigger id="role"><SelectValue placeholder="請選擇" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumer">個人顧客</SelectItem>
                  <SelectItem value="business">企業 / 活動主辦方</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox id="terms" checked={form.watch("termsAgreed")} onCheckedChange={(c) => form.setValue("termsAgreed", c as boolean)} />
                <label htmlFor="terms" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  我同意 <Link href="/terms" className="text-primary hover:underline">服務條款</Link> 與 <Link href="/privacy" className="text-primary hover:underline">隱私權政策</Link>
                </label>
              </div>
              {form.formState.errors.termsAgreed && <p className="text-sm text-destructive">{form.formState.errors.termsAgreed.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !form.watch("termsAgreed")}>
              {isLoading ? "註冊中..." : "註冊"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              已有帳號？{" "}
              <Link href={searchParams.get("redirect") ? `/login?redirect=${searchParams.get("redirect")}` : "/login"} className="text-primary hover:underline font-medium">登入</Link>
            </p>
          </form>
        </CardContent>
      </Card>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>註冊成功！請驗證您的 Email</DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>我們已發送驗證信到 <strong>{registeredEmail}</strong></p>
              <p>請到您的收件匣尋找來自 T&J 客製化甜點的驗證信，點擊信中連結完成驗證。</p>
              <p className="text-muted-foreground text-xs">若未找到，請檢查垃圾郵件資料夾。</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">前往 Gmail</a>
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleEmailDialogClose}>我知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse text-muted-foreground">載入中...</div></div>}>
      <RegisterPageContent />
    </Suspense>
  );
}
