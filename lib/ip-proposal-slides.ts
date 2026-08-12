/**
 * IP 授權提案投影片 — 做法同企業簡報：圖檔 URL / alt 寫死於前端。
 * 圖源：custom_asset/website_img/IP_ppt/
 * 多數為 `{n}_{n}_11zon.webp`；2／3／5 為 `{n}._{n}_11zon.webp`。
 */

import type { PhotoSlot, ProposalSlide, TocItem } from "@/lib/enterprise-proposal-slides";

const IP_PPT_BASE =
  "https://akrxbdoxiopiubksgcrl.supabase.co/storage/v1/object/public/custom_asset/website_img/IP_ppt";

/** 2／3／5 壓縮後檔名多一個點（例如 2._2_11zon.webp） */
const DOTTED_FILENAME_NS = new Set([2, 3, 5]);

function ipSrc(n: number): string {
  const file = DOTTED_FILENAME_NS.has(n) ? `${n}._${n}_11zon.webp` : `${n}_${n}_11zon.webp`;
  return `${IP_PPT_BASE}/${file}`;
}

function ipSlot(n: number, workName: string): PhotoSlot {
  return {
    slotId: `ip-${n}`,
    alt: `${workName} 主題甜點作品集`,
    label: workName,
    src: ipSrc(n),
  };
}

/** 依檔名序號 1–20 排列 */
const IP_PHOTOS: { n: number; workName: string }[] = [
  { n: 1, workName: "獵人" },
  { n: 2, workName: "排球少年！！" },
  { n: 3, workName: "轉生史萊姆" },
  { n: 4, workName: "咒術迴戰" },
  { n: 5, workName: "鏈鋸人" },
  { n: 6, workName: "葬送的芙莉蓮" },
  { n: 7, workName: "伊藤潤二" },
  { n: 8, workName: "遊戲王" },
  { n: 9, workName: "美少女戰士" },
  { n: 10, workName: "光與夜之戀" },
  { n: 11, workName: "膽大黨" },
  { n: 12, workName: "新世紀福音戰士" },
  { n: 13, workName: "葬送的芙莉蓮" },
  { n: 14, workName: "間諜家家酒" },
  { n: 15, workName: "真珠美人魚" },
  { n: 16, workName: "我推的孩子" },
  { n: 17, workName: "Hololive" },
  { n: 18, workName: "庫洛魔法使" },
  { n: 19, workName: "七龍珠" },
  { n: 20, workName: "國王排名" },
];

const PER_SLIDE = 3;

function chunkPhotos<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const photoChunks = chunkPhotos(IP_PHOTOS, PER_SLIDE);
const totalSlides = photoChunks.length;

export const ipProposalSlides: ProposalSlide[] = photoChunks.map((chunk, idx) => {
  const id = idx + 1;
  const names = chunk.map((p) => p.workName).join("／");
  return {
    id,
    template: "galleryWall",
    dataLabel: names,
    slideNum: `${String(id).padStart(2, "0")} / ${String(totalSlides).padStart(2, "0")}`,
    galleryEyebrow: "合作作品",
    galleryPhotoOnly: true,
    gallerySlots: chunk.map((p) => ipSlot(p.n, p.workName)),
  };
});

export const ipProposalToc: TocItem[] = photoChunks.map((chunk, idx) => ({
  label: chunk.map((p) => p.workName).join("／"),
  slideId: idx + 1,
}));
