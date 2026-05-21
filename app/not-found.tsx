import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const ASSET_BASE = "/images/404page";

/** public 檔名含空格、冒號等，需編碼後才能正確載入 */
function asset404(filename: string) {
  return `${ASSET_BASE}/${encodeURIComponent(filename)}`;
}

const BG_FILE = "404 background.webp";
const BG_MOBILE_FILE = "404_iphone461x640 拷貝.webp";
const HOME_FILE = "返回首頁.webp";
const CLOUD_BASE_FILE = "雲朵 背景.webp";

/** 雲朵底圖原始尺寸，供 aspect-ratio 與 overlay 對齊（僅桌機） */
const CLOUD_BASE_WIDTH = 1605;
const CLOUD_BASE_HEIGHT = 1125;

/**
 * 物件 01–06：桌機三欄兩列疊於雲朵底圖；手機兩欄三列。
 */
const CLOUD_NAV: { file: string; href: string; label: string }[] = [
  { file: "雲朵_01 拷貝.webp", href: "/product/luck", label: "籤詩餅乾" },
  { file: "雲朵_02 拷貝.webp", href: "/product/cupcake_choco", label: "杯子蛋糕" },
  { file: "雲朵_03 拷貝.webp", href: "/product/cookie", label: "餅乾" },
  { file: "雲朵_04 拷貝.webp", href: "/order", label: "訂購說明" },
  { file: "雲朵_05 拷貝.webp", href: "/gift-boxes", label: "禮盒專區" },
  { file: "雲朵_06 拷貝.webp", href: "/gallery", label: "作品 Gallery" },
];

/** 手機：個別物件微調（index 0 = 01） */
const MOBILE_OBJECT_TWEAKS: Record<number, { linkClass?: string; imgClass?: string }> = {
  0: {
    linkClass: "translate-x-12 -translate-y-30",
    imgClass: "max-h-[min(20vw,92px)] max-w-[min(30vw,120px)]",
  }, // 01
  1: { linkClass: "-translate-x-8 -translate-y-30" }, // 02 往上
  2: {
    linkClass: "-translate-x-8 -translate-y-17",
    imgClass: "max-h-[min(20vw,92px)] max-w-[min(30vw,120px)]",
  }, // 03
  3: { linkClass: "-translate-x-23 -translate-y-17" }, // 04 往左
  4: { linkClass: "-translate-x-18 -translate-y-8" }, // 05 往左（大步）
  5: {
    linkClass: "-translate-x-30 -translate-y-5",
    imgClass: "max-h-[min(20vw,92px)] max-w-[min(30vw,120px)]",
  }, // 06
};

const MOBILE_OBJECT_IMG =
  "max-h-[min(24vw,108px)] max-w-[min(36vw,148px)]";

/** 桌機：個別物件微調（index 0 = 01） */
const CLOUD_OBJECT_TWEAKS: Record<number, { linkClass?: string; imgClass?: string }> = {
  1: { linkClass: "max-h-[84%] max-w-[84%] -translate-y-2 sm:-translate-y-10" },
  2: { imgClass: "max-h-[64%] max-w-[64%] sm:-translate-y-4" },
  3: {
    linkClass: "translate-y-2 sm:translate-y-10",
    imgClass: "max-h-[104%] max-w-[104%] sm:max-h-[100%] sm:max-w-[100%]",
  },
  4: { imgClass: "max-h-[74%] max-w-[74%] sm:translate-y-6" },
  5: { linkClass: "translate-x-3 translate-y-2 sm:translate-x-6 sm:translate-y-10" },
};

/** 與 NavBar `h-14` / `md:h-16` 對齊，避免 404 區塊高度超出首屏被 footer 擠壓裁切 */
const NOT_FOUND_VIEWPORT =
  "h-[calc(100svh-3.5rem)] min-h-0 max-h-[calc(100svh-3.5rem)] md:h-[calc(100svh-4rem)] md:max-h-[calc(100svh-4rem)]";

/** 與舊版六張雲拼貼相近的可視寬度（桌機） */
const CLOUD_COMPOSITE_WIDTH =
  "w-[min(96vw,900px)] max-w-[min(96vw,900px)] sm:w-[min(94vw,880px)] md:w-[min(92vw,860px)]";

function CloudObjectLink({
  item,
  linkClass,
  imgClass,
  eager,
}: {
  item: (typeof CLOUD_NAV)[number];
  linkClass?: string;
  imgClass?: string;
  eager?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center justify-center outline-none ring-brand-500/40 transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2 active:opacity-90",
        linkClass,
      )}
      aria-label={item.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 依素材比例置中疊加於底圖 */}
      <img
        src={asset404(item.file)}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={cn("h-auto w-auto select-none object-contain", imgClass)}
      />
      <span className="sr-only">{item.label}</span>
    </Link>
  );
}

export default function NotFound() {
  return (
    <div
      className={`relative flex w-full flex-col overflow-x-visible overflow-y-visible bg-[#f6f0ea] ${NOT_FOUND_VIEWPORT}`}
      role="presentation"
    >
      {/* 背景：手機 / 桌機各一張 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <Image
          src={asset404(BG_MOBILE_FILE)}
          alt=""
          fill
          priority
          className="object-cover object-center md:hidden"
          sizes="100vw"
        />
        <Image
          src={asset404(BG_FILE)}
          alt=""
          fill
          priority
          className="hidden object-cover object-center md:block"
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

      {/* 前景 */}
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        {/* 手機：無雲朵底圖，01–06 兩欄三列 */}
        <div className="flex min-h-0 flex-1 flex-col justify-end px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[min(26vw,118px)] md:hidden">
          <nav
            className="mx-auto grid w-full max-w-[min(92vw,420px)] grid-cols-2 grid-rows-3 gap-x-3 gap-y-2 place-items-center"
            aria-label="404 導覽捷徑"
          >
            {CLOUD_NAV.map((item, index) => {
              const mobileTweak = MOBILE_OBJECT_TWEAKS[index];
              return (
                <CloudObjectLink
                  key={item.file}
                  item={item}
                  eager={index < 4}
                  linkClass={cn("h-full w-full min-h-0", mobileTweak?.linkClass)}
                  imgClass={cn(MOBILE_OBJECT_IMG, mobileTweak?.imgClass)}
                />
              );
            })}
          </nav>
        </div>

        {/* 桌機：雲朵底圖 + 六個物件（頂部留白避免與 fixed 按鈕重疊） */}
        <div className="hidden min-h-0 flex-1 flex-col pt-32 lg:pt-36 md:flex">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-visible px-8 pb-10 md:px-8">
            <div
              className={`origin-center -translate-x-[9.5rem] scale-[0.7] sm:-translate-x-[12rem] sm:scale-[0.72] md:-translate-x-[18rem] md:scale-[0.75] ${CLOUD_COMPOSITE_WIDTH}`}
            >
              <div
                className="relative w-full"
                style={{ aspectRatio: `${CLOUD_BASE_WIDTH} / ${CLOUD_BASE_HEIGHT}` }}
              >
                <Image
                  src={asset404(CLOUD_BASE_FILE)}
                  alt=""
                  fill
                  priority
                  className="pointer-events-none select-none object-contain"
                  sizes="900px"
                />

                <nav
                  className="absolute inset-[7%_5.5%_9%_5.5%] grid grid-cols-3 grid-rows-2 place-items-center"
                  aria-label="404 導覽捷徑"
                >
                  {CLOUD_NAV.map((item, index) => {
                    const tweak = CLOUD_OBJECT_TWEAKS[index];
                    return (
                      <CloudObjectLink
                        key={item.file}
                        item={item}
                        eager={index < 3}
                        linkClass={cn("h-full w-full", tweak?.linkClass)}
                        imgClass={cn("max-h-[88%] max-w-[88%]", tweak?.imgClass)}
                      />
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
