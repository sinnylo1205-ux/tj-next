"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";

const DESKTOP_IMG =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/product/compu.png";
const MOBILE_IMG =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/product/phone.png";

/** 產品頁共用：客製化編輯器導覽圖，點擊任意處關閉 */
export function ProductCustomizerIntroDialog() {
  const [open, setOpen] = useState(true);

  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          "cursor-pointer gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none outline-none",
          // 手機：盡量滿版，圖片 object-contain 不裁切
          "fixed inset-0 left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center rounded-none",
          // 電腦：大視窗但不滿版
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[min(90vh,920px)] sm:w-[min(1080px,92vw)] sm:max-w-[min(1080px,92vw)] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
          "z-[100] focus:outline-none focus-visible:outline-none [&>button.absolute]:hidden",
        )}
        onClick={close}
        aria-label="關閉客製化編輯器導覽"
      >
        <DialogTitle className="sr-only">歡迎來到客製化編輯器</DialogTitle>
        <DialogDescription className="sr-only">
          關閉視窗後請先選定取貨日期。點擊任意處即可關閉。
        </DialogDescription>

        <SafeImage
          src={MOBILE_IMG}
          alt="客製化編輯器導覽"
          priority
          draggable={false}
          className="h-auto max-h-[100dvh] w-full object-contain sm:hidden"
        />
        <SafeImage
          src={DESKTOP_IMG}
          alt="客製化編輯器導覽"
          priority
          draggable={false}
          className="hidden h-auto max-h-[min(90vh,920px)] w-full object-contain sm:block"
        />
      </DialogContent>
    </Dialog>
  );
}
