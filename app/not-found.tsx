import Image from "next/image";
import Link from "next/link";

const ASSET_BASE = "/images/404page";

/** public 檔名含空格、冒號等，需編碼後才能正確載入 */
function asset404(filename: string) {
  return `${ASSET_BASE}/${encodeURIComponent(filename)}`;
}

const BG_FILE = "404 BG_11zon.jpg";
const HOME_FILE = "返回首頁.webp";

/**
 * 雲朵 01–06：由左上到右下（三欄兩列）。
 * 檔名內路徑已對應為站內完整路徑。
 */
const CLOUD_NAV: { file: string; href: string; label: string }[] = [
  { file: "雲朵_01 :luck.webp", href: "/customizer/luck", label: "籤詩餅乾（客製）" },
  { file: "雲朵_02:cupcake_choco .webp", href: "/customizer/cupcake_choco", label: "杯子蛋糕（客製）" },
  { file: "雲朵_03 :cookie.webp", href: "/customizer/cookie", label: "餅乾（客製）" },
  { file: "雲朵_04 :order.webp", href: "/order", label: "訂購說明" },
  { file: "雲朵_05:giftbox.webp", href: "/gift-boxes", label: "禮盒專區" },
  { file: "雲朵_06 :gallery.webp", href: "/gallery", label: "作品Gallery" },
];

/** 與 NavBar `h-14` / `md:h-16` 對齊，避免 404 區塊高度超出首屏被 footer 擠壓裁切 */
const NOT_FOUND_VIEWPORT =
  "h-[calc(100svh-3.5rem)] min-h-0 max-h-[calc(100svh-3.5rem)] md:h-[calc(100svh-4rem)] md:max-h-[calc(100svh-4rem)]";

export default function NotFound() {
  return (
    <div
      className={`relative flex w-full flex-col overflow-x-visible overflow-y-visible bg-[#f6f0ea] ${NOT_FOUND_VIEWPORT}`}
      role="presentation"
    >
      {/* 背景：完整納入可視區（不裁切主體） */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src={asset404(BG_FILE)}
          alt=""
          fill
          priority
          className="object-contain object-center"
          sizes="100vw"
        />
      </div>

      {/* 返回首頁：樣式見 globals.css `.tj-notfound-home`（fixed + top 避開 NavBar z-1000） */}
      <Link
        href="/"
        className="tj-notfound-home transition-opacity hover:opacity-90 active:opacity-80"
        aria-label="返回首頁"
      >
        <span className="relative block aspect-[5/2] w-full">
          <Image
            src={asset404(HOME_FILE)}
            alt="返回首頁"
            fill
            className="object-contain object-right object-top"
            sizes="(max-width:768px) 210px, 238px"
          />
        </span>
      </Link>

      {/* 前景：雲朵網格（頂部留白避免與 fixed 按鈕重疊） */}
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col pt-[min(26vw,118px)] sm:pt-[min(24vw,126px)] md:pt-32 lg:pt-36">
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-visible px-4 pb-6 sm:px-6 sm:pb-8 md:px-8 md:pb-10">
          <div className="w-max max-w-[min(96vw,900px)] -translate-x-8 -translate-y-2 sm:-translate-x-12 sm:-translate-y-3 md:-translate-x-16 md:-translate-y-4 lg:-translate-x-[min(18vw,9rem)] lg:-translate-y-5">
            {/* 雲朵拼貼：零 gap、欄寬 auto 依圖檔；Link 不強制比例、img 不用 object-contain 填格 */}
            {/* 外層 scale：六張雲整組等比縮小，不影響個別 translate 對齊 */}
            <div className="origin-center scale-[0.7] sm:scale-[0.7] md:scale-[0.7]">
              <nav
                className="inline-grid w-max grid-cols-[repeat(3,auto)] gap-0 overflow-visible leading-none"
                aria-label="404 導覽捷徑"
              >
                {CLOUD_NAV.map((item, index) => {
                  const isMiddleColumn = index === 1 || index === 4;
                  return (
                    <Link
                      key={item.file}
                      href={item.href}
                      className={`m-0 block p-0 leading-none outline-none ring-brand-500/40 transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-90${isMiddleColumn ? " -translate-y-1 sm:-translate-y-1.5 md:-translate-y-2" : ""}`}
                      aria-label={item.label}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 依素材原始像素拼貼，避免 next/image 填格 */}
                      <img
                        src={asset404(item.file)}
                        alt=""
                        loading={index < 3 ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        className="m-0 block h-auto w-auto max-h-[min(38vmin,300px)] max-w-[min(32vmin,260px)] select-none sm:max-h-[min(36vmin,320px)] sm:max-w-[min(30vmin,280px)] md:max-h-[340px] md:max-w-[300px]"
                      />
                      <span className="sr-only">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
