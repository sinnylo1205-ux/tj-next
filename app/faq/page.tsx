"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ExternalLink, Search, X } from "lucide-react";
import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/* ────────────────────────────────────────────
 *  FAQ 資料（來源：F_Q.xlsx，2026-03-27 匯入）
 * ──────────────────────────────────────────── */

interface FaqItem {
  category: string;
  question: string;
  answer: string;
  imageUrl?: string;
  imageLink?: string;
}

interface CategoryTab {
  label: string;
  id: string;
  image: string;
}

const CATEGORY_TABS: CategoryTab[] = [
  { label: "全部", id: "all", image: "/faq_tab/全部.png" },
  { label: "訂購規範與流程", id: "cat-order", image: "/faq_tab/訂購規範與流程.png" },
  { label: "產品客製化與樣式細節", id: "cat-custom", image: "/faq_tab/產品客製化與細節樣式.png" },
  { label: "付款與單據", id: "cat-payment", image: "/faq_tab/付款與單據.png" },
  { label: "配送、取貨與風險說明", id: "cat-shipping", image: "/faq_tab/配送取貨、風險說明.png" },
  { label: "食材、保存與食用方式", id: "cat-food", image: "/faq_tab/食材與食用方式.png" },
  { label: "修改、取消與退換貨政策", id: "cat-cancel", image: "/faq_tab/修改、取消與退換貨政策.png" },
  { label: "甜點佈置與特殊服務", id: "cat-service", image: "/faq_tab/甜點佈置與特殊服務.png" },
];

const CATEGORY_LABELS = CATEGORY_TABS.filter((c) => c.id !== "all").map((c) => c.label);

const faqData: FaqItem[] = [
  // ── 訂購規範與流程 ──
  {
    category: "訂購規範與流程",
    question: "最晚何時需下訂？",
    answer:
      "建議您至少提前兩週完成下單，兩週前下單的訂單原則上都能排入製作檔期。若是兩週內的急單，需由人工協助確認是否能安排製作。",
  },
  {
    category: "訂購規範與流程",
    question: "下禮拜 / 下下禮拜 / 14天內可以嗎？",
    answer:
      "兩週內屬於急單，需要人工協助確認檔期與製作狀況，建議您先嘗試官網下單，或再由我們協助評估可行性。",
  },
  {
    category: "訂購規範與流程",
    question: "客製化品項如何下單？",
    answer:
      "大多數客製化需求都可以在官網完成喔！您可以到官網選擇甜點品項，依需求點選客製化選項並即時預覽設計與價格。網站教學圖片一並傳給您，網址：https://www.tjcookies.com.tw/",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
  },
  {
    category: "訂購規範與流程",
    question: "網站上沒有我要的顏色/品項...",
    answer:
      "歡迎直接私訊Line官方聊聊",
  },
  {
    category: "訂購規範與流程",
    question: "客製化要提供什麼資料？",
    answer:
      "大多數客製化需求都可以在官網完成喔！若有特殊需求，官網無法滿足，才需填寫表單進行人工評估。",
  },
  {
    category: "訂購規範與流程",
    question: "可以急件嗎？",
    answer:
      "需要了解您想要的品項與數量才可以評估能否排入喔，另外會有急件費喔。",
  },

  // ── 產品客製化與樣式細節 ──
  {
    category: "產品客製化與樣式細節",
    question: "客製化商品可以加小裝飾嗎？",
    answer:
      "可以的！建議直接從官網的單品甜點設計進行客製化，所有可加購的小裝飾與價格都會清楚顯示在合成器中。網址：https://www.tjcookies.com.tw/",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
  },
  {
    category: "產品客製化與樣式細節",
    question: "可以設計籤文嗎？",
    answer:
      "可以的！歡迎使用官網幸運籤餅設計器自行上傳籤文設計檔案；若需我們協助設計，將另酌收設計費用。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "有客製化蛋糕嗎（官網沒看到）？",
    answer:
      "有的！蛋糕可依尺寸與需求客製，請填寫報價表單提供詳細資訊（選「客製化單品」），我們將為您進行人工報價評估。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "每個甜點可以不同款式嗎？",
    answer:
      "一批次的品項只能有一種樣式喔，以杯子蛋糕為例，最低訂購量為三十顆，每三十顆一個款式，需要第二個款式需要訂購到六十顆。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "插卡杯子蛋糕長怎樣？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/cardcup.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/cardcup.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "有杯子蛋糕的照片可以看嗎？",
    answer: "可以到我們的IG 杯子蛋糕精選動態輯參考喔！",
  },
  {
    category: "產品客製化與樣式細節",
    question: "奶油杯子蛋糕長怎樣？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/cream.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/cream.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "推桶蛋糕可以做哪些客製化？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/14_2_11zon.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/14_2_11zon.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "甜甜圈可以做哪些客製化？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/15_3_11zon.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/15_3_11zon.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "糖霜餅乾跟一般餅乾差在哪裡？",
    answer: "可以參考這個連結～裡面有兩者差異比較",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/custom_teach.png",
  },
  {
    category: "產品客製化與樣式細節",
    question: "插卡/米紙/糖霜差在哪裡？",
    answer: "您可以參考附圖說明，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/explain.jpeg",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/explain.jpeg",
  },
  {
    category: "產品客製化與樣式細節",
    question: "刊頭長怎樣？尺寸多大？",
    answer: "您可以參考這些呈現方式，尺寸為4X7.5cm(對折後2X7.5cm)",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/luck.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/luck.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "吊牌長怎樣？尺寸多大？",
    answer: "您可以參考這些呈現方式，尺寸為2.5X2.5cm",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/23_5_11zon.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/23_5_11zon.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "馬卡龍可以做哪些客製化？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/13_1_11zon.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/13_1_11zon.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "蛋糕棒棒糖可以做哪些客製化？",
    answer: "您可以參考這些樣式，或是直接到官網合成器玩玩看喔！",
    imageUrl:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/16_4_11zon.webp",
    imageLink:
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/line_service/16_4_11zon.webp",
  },
  {
    category: "產品客製化與樣式細節",
    question: "可以加緞帶嗎？",
    answer: "可以的！建議直接從官網的單品甜點設計進行客製化。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "可以加貼紙嗎？",
    answer: "可以的！建議直接從官網的單品甜點設計進行客製化。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "我可以先看設計圖或打樣嗎？",
    answer:
      "可以的。設計圖限修改兩次；實體打樣需自付費用，打樣時間至少14個工作天。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "幸運籤餅尺寸可以客製化嗎？",
    answer:
      "可以，但是價格不變喔，籤餅起售價是三十元，建議直接到官網選購。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "幸運籤餅籤文範本",
    answer:
      "這裡提供給您設計範例以及空白檔案，歡迎自行設計後上傳至官網的幸運籤餅設計器。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "你們有什麼客製化甜點？",
    answer:
      "幸運籤餅、蛋糕棒棒糖、客製化甜甜圈、馬卡龍、奶油杯子蛋糕、冰晶糖、巧克力杯子蛋糕、棉花糖、爆米花、推筒蛋糕、手工餅乾，其他未在網站上展示的甜點也歡迎跟我們一起天馬行空討論喔～",
  },
  {
    category: "產品客製化與樣式細節",
    question: "請問客製化蛋糕有哪些口味和尺寸可以選擇？",
    answer:
      "【尺寸】六寸起。\n【傳統蛋糕類型】：芋泥、水果、布丁、核桃、巧克力、草莓醬、藍莓醬、葡萄、花生、芝麻。\n【美式磅蛋糕】：香草蔓越莓、香蕉巧克力、抹茶紅豆。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "我可以傳照片請你們做一模一樣的蛋糕嗎？",
    answer:
      "我們可以參考風格、色系與元素，但為了尊重原創且手作差異，無法「複製到一模一樣」喔！建議參考我們的作品集風格。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "請問鮮奶油蛋糕跟翻糖蛋糕有什麼不一樣？",
    answer:
      "【鮮奶油】口感好但怕熱，建議自取。【翻糖】可塑性高、適合造型與送禮，甜度較高，常溫較不易融化。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "可以做「雙層」或「多層」蛋糕嗎？",
    answer:
      "可以的！想要更氣派的效果，我們有提供雙層蛋糕。需注意雙層蛋糕內部有支架結構，切蛋糕時請留意。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "蛋糕上的裝飾（如玩偶、插牌）可以食用嗎？",
    answer:
      "我們的蛋糕裝飾分為「可食用」與「不可食用」兩種。奶油霜、翻糖捏塑皆可食用；若是紙質插旗、玩具公仔或鮮花裝飾，則建議食用前先取下喔！",
  },
  {
    category: "產品客製化與樣式細節",
    question: "我想做「性別揭曉」蛋糕，切開要有顏色，可以嗎？",
    answer:
      "沒問題！我們可以調整內餡鮮奶油的顏色（藍色或粉色），外觀保持神祕，讓您切開時才有驚喜。請在訂購表格中備註「性別揭曉」需求。",
  },
  {
    category: "產品客製化與樣式細節",
    question: "你們可以畫「人像」或「寵物」嗎？會很像嗎？",
    answer:
      "我們擅長的是「Q版/插畫風格」的描繪，並非寫實素描喔！會依據您提供的照片抓取神韻與特徵（如髮型、眼鏡、毛色），呈現可愛溫馨的感覺，無法做到 100% 寫實複製。",
  },

  // ── 付款與單據 ──
  {
    category: "付款與單據",
    question: "我已轉帳（對帳問題）",
    answer:
      "好的，謝謝您！我們會協助查帳並更新訂單狀態，請提供您的網站會員姓名以利確認。",
  },
  {
    category: "付款與單據",
    question: "當客戶索要發票或統編",
    answer:
      "我們是免用統一發票，會提供收據。收據可開立抬頭與統編，並會隨貨附上喔！",
  },
  {
    category: "付款與單據",
    question: "付款方式有哪些？",
    answer: "目前主要提供銀行轉帳付款方式喔！",
  },
  {
    category: "付款與單據",
    question: "付款方式與流程是怎麼樣的？",
    answer: "所有客製商品：確認訂單後 3 日內完成全額匯款。",
  },

  // ── 配送、取貨與風險說明 ──
  {
    category: "配送、取貨與風險說明",
    question: "甜點可以宅配嗎？",
    answer:
      "可以的！除了奶油杯子蛋糕較建議自取或專件配送外，其他甜點皆可使用黑貓宅配。",
  },
  {
    category: "配送、取貨與風險說明",
    question: "宅配多少錢？",
    answer:
      "黑貓宅配 $240（可指定時段）/ 專件配送 $650（可指定日期與時間，限雙北地區）/ 到店自取免費",
  },
  {
    category: "配送、取貨與風險說明",
    question: "如果宅配收到時蛋糕損壞怎麼處理？",
    answer:
      "若收到時有嚴重毀損，請務必「保持原狀並立即拍照」，並在當天傳給我們，我們會盡快為您協助處理。",
  },
  {
    category: "配送、取貨與風險說明",
    question: "自取地點在哪裡？",
    answer:
      "自取地點位於新店區（詳細地址下單後提供）。門口可暫時停車取貨，非常方便。",
  },
  {
    category: "配送、取貨與風險說明",
    question: "宅配收到蛋糕壞掉了怎麼辦？",
    answer:
      "宅配有一定風險，若運送過程不幸毀損，我們將於 1~2 個工作天製作新品補寄。",
  },
  {
    category: "配送、取貨與風險說明",
    question: "如果遇到颱風天無法出貨怎麼辦？",
    answer:
      "若因天災等不可抗力因素導致延遲出貨，我們不負擔額外的賠償責任以及退款喔。",
  },
  {
    category: "配送、取貨與風險說明",
    question: "收到的甜點顏色跟照片一模一樣嗎？",
    answer:
      "手工製作與螢幕顯示皆會有色差，實品與設計稿/照片可能有 10%~15% 的誤差，請您理解後再下單。",
  },

  // ── 食材、保存與食用方式 ──
  {
    category: "食材、保存與食用方式",
    question: "請問甜點是蛋奶素嗎？",
    answer:
      "我們的甜點大多屬於「蛋奶素」，含有雞蛋與牛奶成分。目前暫無提供全素（無蛋奶）的選項。",
  },
  {
    category: "食材、保存與食用方式",
    question: "過敏原資訊",
    answer:
      "產品可能含有蛋、奶、麩質。若有特殊過敏原請務必在訂購前告知。",
  },
  {
    category: "食材、保存與食用方式",
    question: "可以客製化「減糖」或「低糖」嗎？",
    answer:
      "為了確保甜點的結構穩定與最佳口感，我們的配方都是固定黃金比例，暫時無法個別調整甜度。",
  },
  {
    category: "食材、保存與食用方式",
    question: "使用的奶油或巧克力品牌？",
    answer:
      "我們堅持使用高品質原料，例如進口天然發酵奶油與高品質巧克力。",
  },
  {
    category: "食材、保存與食用方式",
    question: "保存期限？",
    answer:
      "餅乾類/幸運籤餅常溫 14 天；杯子蛋糕與鮮奶油蛋糕建議冷藏 3 天。",
  },
  {
    category: "食材、保存與食用方式",
    question: "吃之前需要退冰嗎？",
    answer:
      "冷藏蛋糕建議食用前室溫退冰 15-30 分鐘，口感最滑順。",
  },
  {
    category: "食材、保存與食用方式",
    question: "常溫下可以撐多久不融化？",
    answer:
      "奶油類蛋糕室溫建議不超過 30-60 分鐘，建議攜帶保冷袋。",
  },
  {
    category: "食材、保存與食用方式",
    question: "尺寸建議",
    answer:
      "杯子蛋糕一人 1-2 顆。慶生蛋糕：6 吋(4-6人)，8 吋(8-10人)。",
  },
  {
    category: "食材、保存與食用方式",
    question: "蛋糕有附蠟燭、盤叉嗎？",
    answer:
      "寸蛋糕會附贈基本盤叉（5入）與單支蠟燭。若需更多可加購。",
  },

  // ── 修改、取消與退換貨政策 ──
  {
    category: "修改、取消與退換貨政策",
    question: "想更改訂單內容？",
    answer: "若需修改，請最晚於出貨日 30 天前通知。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "取消訂單退費標準？",
    answer:
      "客製化甜點不適用七天鑑賞期。一旦支付訂金，若因故取消，訂金恕不退還。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "下訂後可以退款或取消嗎？",
    answer: "客製化甜點不適用七天鑑賞期，訂金恕不退還。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "實品跟想像不一樣可以退貨嗎？",
    answer:
      "我們不接受因「與想像不同」、「個人美觀判斷」等主觀因素要求退貨或退款。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "甜點數量可以追加或減少嗎？",
    answer:
      "數量不得刪減。追加需於出貨前 15 天告知，且需 10 顆起跳。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "活動延期或想改時間怎麼辦？",
    answer:
      "請於出貨日 30 天前通知，可保留檔期一年（限改一次）。",
  },
  {
    category: "修改、取消與退換貨政策",
    question: "想更改訂單內容（口味、數量）？",
    answer: "可以，請於出貨日 30 天前通知，多退少補。",
  },

  // ── 甜點佈置與特殊服務 ──
  {
    category: "甜點佈置與特殊服務",
    question: "有提供試吃服務嗎？",
    answer:
      "有的！除奶油杯子蛋糕外皆可試吃（款式隨機），免費但需自付運費 $190。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "營業時間？",
    answer: "週一至週五 09:00~18:00，週六日公休。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "有提供甜點佈置服務嗎？",
    answer: "有的，歡迎參考官網方案或由我們協助介紹。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "有提袋或卡片代寫服務嗎？",
    answer: "有提供提袋。代寫卡片限 30 字內。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "大量訂購有折扣嗎？",
    answer: "歡迎填寫報價表單，我們會依照數量提供專屬優惠。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "佈置時間多久？超時費？",
    answer:
      "佈置間隔為兩小時。若需延長，每小時收費 $1,000 元。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "沒吃完的甜點跟道具怎麼處理？",
    answer: "甜點請自行帶走。道具全數回收，損壞需賠償。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "背板可以帶走嗎？",
    answer: "公版背板回收；客製化輸出背板需自行帶回。",
  },
  {
    category: "甜點佈置與特殊服務",
    question: "請問茶會佈置有哪些方案？費用大約多少？",
    answer:
      "【經典午茶方案】$19,000 起：含13種點心，依背板色系搭配（無特定風格），經典桌面佈置。\n【品牌風格方案】$28,800 起（最受歡迎）：含15種點心，依背板風格色系客製化，精緻桌面佈置。早鳥贈六寸蛋糕。\n【奢華全境方案】$38,800 起：含16種點心，可指定主題風格，含背板與場地佈置、幸運籤餅遊戲設計。早鳥贈八寸蛋糕。",
  },
];

/* ────────────────────────────────────────────
 *  元件
 * ──────────────────────────────────────────── */

/** 為每個 FAQ 產生穩定的 DOM id（用 category + index） */
function faqDomId(faq: FaqItem, idx: number): string {
  const tab = CATEGORY_TABS.find((t) => t.label === faq.category);
  return `faq-${tab?.id ?? "x"}-${idx}`;
}

export default function FAQPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleTabClick = useCallback((id: string) => {
    setActiveTab(id);
    setSearchQuery("");
    requestAnimationFrame(() => {
      if (listRef.current) {
        const offset = 80;
        const top = listRef.current.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: "smooth" });
      }
    });
  }, []);

  /** 搜尋建議：關鍵字比對 question + answer，最多顯示 8 筆 */
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) return [];
    return faqData
      .map((faq, idx) => ({ faq, idx }))
      .filter(
        ({ faq }) =>
          faq.question.toLowerCase().includes(q) ||
          faq.answer.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [searchQuery]);

  /** 點擊搜尋建議：切到對應分頁 → scroll 到該題 → 高亮 */
  const handleSuggestionClick = useCallback(
    (faq: FaqItem, globalIdx: number) => {
      const tab = CATEGORY_TABS.find((t) => t.label === faq.category);
      const tabId = tab?.id ?? "all";
      const domId = faqDomId(faq, globalIdx);

      setActiveTab(tabId);
      setSearchQuery("");
      setHighlightId(domId);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = cardRefs.current[domId];
          if (el) {
            const offset = 90;
            const top = el.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top, behavior: "smooth" });
          }
          setTimeout(() => setHighlightId(null), 2500);
        });
      });
    },
    [],
  );

  const filtered =
    activeTab === "all"
      ? faqData
      : faqData.filter(
          (f) => f.category === CATEGORY_TABS.find((t) => t.id === activeTab)?.label,
        );

  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container max-w-4xl">
        {/* 標題 */}
        <div className="text-center mb-10">
          <h1 className="mb-4 text-ink">常見問題 Q&A</h1>
          <p className="text-ink-muted text-lg">
            以下是顧客最常詢問的問題，點選分類查看
          </p>
        </div>

        {/* 關鍵字搜尋 */}
        <div className="relative mb-8 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
            <Input
              type="text"
              placeholder="輸入關鍵字搜尋問題..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              className="pl-10 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 搜尋建議下拉 */}
          {searchFocused && suggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
              {suggestions.map(({ faq, idx }) => {
                const tab = CATEGORY_TABS.find((t) => t.label === faq.category);
                return (
                  <button
                    key={`sug-${idx}`}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors border-b border-border/50 last:border-b-0"
                    onMouseDown={() => handleSuggestionClick(faq, idx)}
                  >
                    <p className="text-sm font-medium text-ink line-clamp-1">{faq.question}</p>
                    <p className="text-xs text-ink-muted mt-0.5">{tab?.label}</p>
                  </button>
                );
              })}
            </div>
          )}

          {searchFocused && searchQuery.trim().length > 0 && suggestions.length === 0 && (
            <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-border bg-background shadow-lg p-4 text-center text-sm text-ink-muted">
              找不到相關問題
            </div>
          )}
        </div>

        {/* Category Tab 圖片卡片：電腦 4 欄、手機 2 欄 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={cn(
                  "group flex flex-col items-center rounded-xl border p-3 transition-all",
                  isActive
                    ? "border-brand-500 bg-brand-50 shadow-md ring-2 ring-brand-400/40"
                    : "border-border bg-background hover:border-brand-400 hover:shadow-md hover:-translate-y-0.5",
                )}
              >
                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-brand-50">
                  <SafeImage
                    src={tab.image}
                    alt={tab.label}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 768px) 45vw, 22vw"
                  />
                </div>
                <span
                  className={cn(
                    "mt-2.5 text-sm font-medium leading-snug text-center transition-colors",
                    isActive ? "text-brand-600" : "text-ink",
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* FAQ 列表 */}
        <div ref={listRef} className="space-y-4">
          {filtered.map((faq, index) => {
            const globalIdx = faqData.indexOf(faq);
            const domId = faqDomId(faq, globalIdx);
            const isHighlighted = highlightId === domId;
            return (
              <Card
                key={domId}
                ref={(el) => { cardRefs.current[domId] = el; }}
                className={cn(
                  "p-6 transition-all duration-500",
                  isHighlighted && "ring-2 ring-brand-500 bg-brand-50/40",
                )}
                style={{ boxShadow: "var(--elev-card)" }}
              >
                {activeTab === "all" && (
                  <div className="mb-2">
                    <span className="inline-block bg-brand-50 text-brand-600 text-[11px] font-medium px-2 py-0.5 rounded-full">
                      {faq.category}
                    </span>
                  </div>
                )}
                <h2 className="text-ink font-semibold mb-3 flex gap-2 text-base">
                  <span className="text-brand-600 shrink-0">Q：</span>
                  {faq.question}
                </h2>
                <div className="text-ink-muted text-base leading-relaxed pl-6 whitespace-pre-line">
                  <span className="text-brand-600 font-semibold">A：</span>{" "}
                  {faq.answer}
                </div>

                {faq.imageUrl && (
                  <div className="mt-4 pl-6">
                    <a
                      href={faq.imageLink || faq.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block group"
                    >
                      <SafeImage
                        src={faq.imageUrl}
                        alt={`${faq.question} 參考圖`}
                        width={800}
                        height={360}
                        className="max-h-[360px] max-w-full rounded-lg border border-border object-contain shadow-sm transition-transform group-hover:scale-[1.01]"
                        sizes="(max-width: 768px) 100vw, 800px"
                      />
                      <span className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1 mt-1.5">
                        點擊查看大圖 <ExternalLink size={12} />
                      </span>
                    </a>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* 底部提示 */}
        <Card className="p-6 bg-brand-50 mt-8" style={{ boxShadow: "var(--elev-card)" }}>
          <p className="text-sm text-ink-muted leading-relaxed text-center">
            還有其他問題嗎？歡迎透過{" "}
            <Link href="/contact" className="text-brand-600 hover:underline">
              聯絡我們
            </Link>{" "}
            頁面與我們聯繫！
          </p>
        </Card>
      </div>
    </div>
  );
}
