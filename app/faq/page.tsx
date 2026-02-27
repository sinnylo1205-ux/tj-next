import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { getFullUrl } from "@/lib/site";
import type { Metadata } from "next";

const faqData = [
  {
    question: "最晚什麼時候需要下訂？",
    answer: "建議至少保留兩個星期的製作時間。只要在兩週前完成下單，一定能排入製作檔期；兩週內（14 天內）的訂單屬於急單，需由我們人工確認檔期後才能接單。",
    answerJsx: (
      <>
        建議至少保留 <strong>兩個星期</strong> 的製作時間。
        <br />
        只要在兩週前完成下單，一定能排入製作檔期；兩週內（14 天內）的訂單屬於急單，需由我們 <strong>人工確認檔期</strong> 後才能接單。
      </>
    ),
  },
  {
    question: "客製化甜點需要提供什麼資料？",
    answer: "依您的客製化需求不同而定，歡迎直接到官網點擊您需要的客製化選項，依照指示填寫即可。",
    answerJsx: "依您的客製化需求不同而定，歡迎直接到官網點擊您需要的客製化選項，依照指示填寫即可。",
  },
  {
    question: "甜點可以宅配嗎？",
    answer: "奶油杯子蛋糕建議使用專件配送或到店自取。其他甜點可使用黑貓宅配。若活動日期為週日，黑貓宅配無法配送，請特別留意。",
    answerJsx: (
      <>
        <strong>奶油杯子蛋糕：</strong>建議使用專件配送或到店自取
        <br />
        <br />
        <strong>其他甜點：</strong>可使用黑貓宅配
        <br />⚠️ 若活動日期為週日，黑貓宅配無法配送，請特別留意。
      </>
    ),
  },
  {
    question: "付款方式有哪些？",
    answer: "目前付款方式為銀行轉帳。",
    answerJsx: "目前付款方式為銀行轉帳。",
  },
  {
    question: "宅配費用是多少？",
    answer:
      "黑貓宅配 $240（可指定配送時段）、專件配送 $650（可指定日期與時間，限雙北地區）、到店自取免費。",
    answerJsx: (
      <ul className="list-disc list-inside space-y-1">
        <li>
          <strong>黑貓宅配：</strong>$240（可指定配送時段）
        </li>
        <li>
          <strong>專件配送：</strong>$650（可指定日期與時間，限雙北地區）
        </li>
        <li>
          <strong>到店自取：</strong>免費
        </li>
      </ul>
    ),
  },
  {
    question: "客製化商品可以加小裝飾嗎？",
    answer:
      "可以的！請至官網的「單品甜點設計」頁面加購，裡面都有詳細的裝飾選項與價格說明。",
    answerJsx: (
      <>
        可以的！請至官網的「單品甜點設計」頁面加購，裡面都有詳細的裝飾選項與價格說明：
        <br />
        <a
          href="https://www.tjcookies.com.tw/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-1"
        >
          👉 https://www.tjcookies.com.tw/ <ExternalLink size={14} />
        </a>
      </>
    ),
  },
  {
    question: "下禮拜／下下禮拜／14 天內的訂單可以接嗎？",
    answer: "兩週內的訂單屬於急單，需由我們人工確認檔期後回覆是否可接單。",
    answerJsx: "兩週內的訂單屬於急單，需由我們人工確認檔期後回覆是否可接單。",
  },
  {
    question: "可以開發票或統編嗎？",
    answer: "我們是免用統一發票店家，會開立收據，可填寫抬頭與統編。會隨貨附上空白收據供您填寫。",
    answerJsx: (
      <>
        我們是 <strong>免用統一發票</strong> 店家，會開立 <strong>收據</strong>，可填寫抬頭與統編。
        <br />
        📦 會隨貨附上空白收據供您填寫。
      </>
    ),
  },
  {
    question: "客製化品項要怎麼下單？",
    answer: "請填寫我們的訂購表單：https://forms.gle/mhbgquhJaRnxG92X6",
    answerJsx: (
      <>
        請填寫我們的訂購表單：
        <br />
        <a
          href="https://forms.gle/mhbgquhJaRnxG92X6"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-1"
        >
          👉 https://forms.gle/mhbgquhJaRnxG92X6 <ExternalLink size={14} />
        </a>
      </>
    ),
  },
  {
    question: "經典款、禮盒、甜點佈置、非客製化品項要怎麼下單？",
    answer: "一樣請填寫訂購表單即可：https://forms.gle/mhbgquhJaRnxG92X6",
    answerJsx: (
      <>
        一樣請填寫訂購表單即可：
        <br />
        <a
          href="https://forms.gle/mhbgquhJaRnxG92X6"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-1"
        >
          👉 https://forms.gle/mhbgquhJaRnxG92X6 <ExternalLink size={14} />
        </a>
      </>
    ),
  },
  {
    question: "可以直接在 LINE 下單嗎？／我想更快取得報價／需求比較特殊怎麼辦？",
    answer:
      "如果官網無法完全滿足您的需求，我們可以另行為您報價。請協助填寫表單，提交後我們會將完整報價單寄到您的信箱。",
    answerJsx: (
      <>
        如果官網無法完全滿足您的需求，我們可以另行為您報價。
        <br />
        請協助填寫以下表單，提供報價所需資料，提交後我們會將完整報價單寄到您的信箱：
        <br />
        <a
          href="https://forms.gle/mhbgquhJaRnxG92X6"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-1"
        >
          👉 https://forms.gle/mhbgquhJaRnxG92X6 <ExternalLink size={14} />
        </a>
      </>
    ),
  },
  {
    question: "我有圖片，或想問「你們有做這種甜點嗎？」",
    answer:
      "有的！但需依您的數量與目前檔期評估是否能排入製作。也建議您先使用官網的客製化甜點設計器自行設計、合成圖片，確認是否能達到相近效果。",
    answerJsx: (
      <>
        有的！但需依您的數量與目前檔期評估是否能排入製作。
        <br />
        也建議您先使用官網的 <strong>客製化甜點設計器</strong> 自行設計、合成圖片，確認是否能達到相近效果。
      </>
    ),
  },
  {
    question: "你們有提供試吃服務嗎？",
    answer:
      "有的！以下品項提供宅配試吃：幸運籤餅、手工餅乾、棉花棒棒糖、杯子蛋糕。試吃需自付運費 190 元。",
    answerJsx: (
      <>
        有的！以下品項提供宅配試吃：
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>幸運籤餅</li>
          <li>手工餅乾</li>
          <li>棉花棒棒糖</li>
          <li>杯子蛋糕</li>
        </ul>
        <p className="mt-2">📦 試吃需自付運費 190 元</p>
      </>
    ),
  },
  {
    question: "我已完成轉帳，接下來呢？",
    answer: "好的！我們會請同仁查帳並更新您的訂單狀態，請您稍候。",
    answerJsx: "好的！我們會請同仁查帳並更新您的訂單狀態，請您稍候。",
  },
  {
    question: "可以幫忙設計籤文嗎？",
    answer:
      "若自行設計可使用官網的幸運籤餅設計器，自行上傳籤文檔案。若需我們協助設計將另行收取設計費用。",
    answerJsx: (
      <ul className="list-disc list-inside space-y-1">
        <li>
          <strong>若自行設計：</strong>可使用官網的幸運籤餅設計器，自行上傳籤文檔案
        </li>
        <li>
          <strong>若需我們協助設計：</strong>將另行收取設計費用
        </li>
      </ul>
    ),
  },
];

export const metadata: Metadata = {
  title: "常見問題 Q&A｜T&J 客製化甜點",
  description:
    "T&J 客製化甜點常見問題解答，包含下單流程、付款方式、宅配費用、客製化需求等資訊，幫助您快速了解訂購流程。",
  alternates: { canonical: getFullUrl("/faq") },
  openGraph: {
    title: "常見問題 Q&A｜T&J 客製化甜點",
    description: "T&J 客製化甜點常見問題解答，幫助您快速了解訂購流程。",
    url: getFullUrl("/faq"),
    images: [
      "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/og.png",
    ],
  },
};

export default function FAQPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="mb-4 text-ink">常見問題 Q&A</h1>
          <p className="text-ink-muted text-lg">以下是顧客最常詢問的問題，希望能幫助您快速找到答案</p>
        </div>
        <div className="space-y-4">
          {faqData.map((faq, index) => (
            <Card key={index} className="p-6" style={{ boxShadow: "var(--elev-card)" }}>
              <h2 className="text-ink font-semibold mb-3 flex gap-2 text-base">
                <span className="text-brand-600">Q：</span>
                {faq.question}
              </h2>
              <div className="text-ink-muted text-base leading-relaxed pl-6">
                <span className="text-brand-600 font-semibold">A：</span> {faq.answerJsx}
              </div>
            </Card>
          ))}
        </div>
        <Card className="p-6 bg-brand-50 mt-8" style={{ boxShadow: "var(--elev-card)" }}>
          <p className="text-sm text-ink-muted leading-relaxed text-center">
            還有其他問題嗎？歡迎透過 <Link href="/contact" className="text-brand-600 hover:underline">聯絡我們</Link> 頁面與我們聯繫！
          </p>
        </Card>
      </div>
    </div>
  );
}
