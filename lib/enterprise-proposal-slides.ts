/**
 * 企業合作提案投影片 — 對應 TJ-Proposal-Website.html 結構與文案。
 * 圖片：於各 PhotoSlot 補上 `src` 即可顯示（與 HTML TODO 一致）。
 */

export type PhotoSlot = {
  slotId: string;
  alt: string;
  label: string;
  src?: string;
};

export type ProposalTemplate =
  | "cover"
  | "toc"
  | "sectionHeader"
  | "statement"
  | "serviceSplit"
  | "clientWall"
  | "plansOverview"
  | "planA"
  | "planB"
  | "planC"
  | "caseSplitL"
  | "caseSplitR"
  | "galleryWall"
  | "caseCorpL"
  | "caseCorpR"
  | "whyGrid"
  | "process"
  | "thanks";

export type ProposalSlide = {
  id: number;
  template: ProposalTemplate;
  dataLabel?: string;
  cornerRule?: string;
  slideNum?: string;
  /** 深色章節頁：背景裝飾用（無圖時可略） */
  motifSrc?: string;
  /** sectionHeader */
  displayNum?: string;
  chapterEyebrow?: string;
  kicker?: string;
  sectionTitle?: string;
  sectionLede?: string;
  /** cover */
  coverEyebrow?: string;
  coverTitleBeforeEm?: string;
  coverTitleEm?: string;
  coverTitleAfterEm?: string;
  coverSub?: string;
  coverMeta?: string[];
  stampLines?: string[];
  coverHeroSlot?: PhotoSlot;
  /** toc */
  tocQuoteLine1?: string;
  tocQuoteLine2?: string;
  tocItems?: { num: string; zh: string; en: string }[];
  /** statement */
  statementEyebrow?: string;
  statementLine1?: string;
  statementMid1?: string;
  statementEm1?: string;
  statementMid2?: string;
  statementEm2?: string;
  statementEnd?: string;
  statementCaption?: string;
  /** serviceSplit */
  serviceEyebrow?: string;
  serviceTitleLine1?: string;
  serviceTitleEm?: string;
  serviceTitleLine2?: string;
  serviceBody?: string;
  serviceNumLabel?: string;
  serviceNum?: string;
  serviceAxesLabel?: string;
  serviceAxes?: string;
  servicePhotoSlot?: PhotoSlot;
  /** clientWall */
  wallEyebrow?: string;
  wallTitle?: string;
  wallClients?: { nameZh: string; nameEn: string; photo: PhotoSlot }[];
  wallQuote?: string;
  wallFootLabel?: string;
  /** plansOverview */
  plansEyebrow?: string;
  plansTitle?: string;
  planCards?: {
    letter: string;
    featured?: boolean;
    tagEn: string;
    zhLines: string[];
    desc: string;
    footEn: string;
  }[];
  /** planA / B / C */
  planCorner?: string;
  planItalic?: string;
  planLetter?: string;
  planTitleLines?: string[];
  planTitleEm?: string;
  planBody?: string;
  planTags?: string[];
  planPhotoSlot?: PhotoSlot;
  /** planB：多張橫向作品圖 */
  planPhotoSlots?: PhotoSlot[];
  planBullets?: string[];
  planGrid3?: { num: string; text: string }[];
  /** case splits */
  caseMeta?: string;
  caseTitleLines?: string[];
  caseTitleEm?: string;
  caseDetail?: string;
  casePhotoSlot?: PhotoSlot;
  palette?: { color: string; caption?: string }[];
  caseStatLeftNum?: string;
  caseStatLeftLabel?: string;
  caseStatRightNum?: string;
  caseStatRightLabel?: string;
  caseQuote?: string;
  /** gallery */
  galleryEyebrow?: string;
  galleryTitleBeforeEm?: string;
  galleryTitleEm?: string;
  galleryBody?: string;
  gallerySlots?: (PhotoSlot & { span2?: boolean })[];
  /** 相簿滿版：僅左上小標，不顯示大標題／說明 */
  galleryPhotoOnly?: boolean;
  /** why */
  whyEyebrow?: string;
  whyTitleBeforeEm?: string;
  whyTitleEm?: string;
  whyTitleAfterEm?: string;
  whyCards?: { num: string; en: string; title: string; desc: string }[];
  /** process */
  processEyebrow?: string;
  processTitleBeforeEm?: string;
  processTitleEm?: string;
  processTitleAfterEm?: string;
  processLead?: string;
  processSteps?: { num: string; en: string; title: string; desc: string }[];
  /** thanks */
  thanksRose?: string;
  thanksHero?: string;
  thanksLines?: string[];
  contactRow?: { title: string; val: string }[];
};

export type TocItem = { label: string; slideId: number };

export const enterpriseProposalSlides: ProposalSlide[] = [
  {
    id: 1,
    template: "sectionHeader",
    dataLabel: "01 章節 1 合作一覽",
    cornerRule: "Chapter One",
    slideNum: "01 / 20",
    displayNum: "01",
    chapterEyebrow: "CHAPTER   01",
    kicker: "Our Clients",
    sectionTitle: "合作一覽",
    sectionLede: "知名品牌都選擇我們客製甜點作品，\n創造專屬回憶。",
  },
  {
    id: 2,
    template: "clientWall",
    dataLabel: "02 合作企業",
    cornerRule: "Clients · 01",
    slideNum: "02 / 20",
    wallEyebrow: "SELECTED CLIENTS",
    wallTitle: "合作企業",
    wallQuote: "Brands that trust our craft.",
    wallFootLabel: "SELECTED   PARTNERS",
    wallClients: [
      {
        nameZh: "國泰",
        nameEn: "CATHAY",
        photo: {
          slotId: "client-1",
          alt: "國泰 合作照片",
          label: "國泰 合作照片",
          src: "/images/ppt_p7/國泰.webp",
        },
      },
      {
        nameZh: "桃園機場",
        nameEn: "TAOYUAN AIRPORT",
        photo: {
          slotId: "client-2",
          alt: "桃園機場 合作照片",
          label: "桃園機場 合作照片",
          src: "/images/ppt_p7/桃園機場.webp",
        },
      },
      {
        nameZh: "ETtoday",
        nameEn: "ETTODAY",
        photo: {
          slotId: "client-3",
          alt: "ETtoday 合作照片",
          label: "ETtoday 合作照片",
          src: "/images/ppt_p7/Etoday.webp",
        },
      },
      {
        nameZh: "LG",
        nameEn: "LG ELECTRONICS",
        photo: {
          slotId: "client-4",
          alt: "LG 合作照片",
          label: "LG 合作照片",
          src: "/images/ppt_p7/LG.webp",
        },
      },
      {
        nameZh: "小米",
        nameEn: "XIAOMI",
        photo: {
          slotId: "client-5",
          alt: "小米 合作照片",
          label: "小米 合作照片",
          src: "/images/ppt_p7/小米.webp",
        },
      },
      {
        nameZh: "DIOR",
        nameEn: "CHRISTIAN DIOR",
        photo: {
          slotId: "client-6",
          alt: "DIOR 合作照片",
          label: "DIOR 合作照片",
          src: "/images/ppt_p7/Dior.webp",
        },
      },
      {
        nameZh: "台新",
        nameEn: "TAISHIN",
        photo: {
          slotId: "client-7",
          alt: "台新 合作照片",
          label: "台新 合作照片",
          src: "/images/ppt_p7/台新.webp",
        },
      },
      {
        nameZh: "New Balance",
        nameEn: "NEW BALANCE",
        photo: {
          slotId: "client-8",
          alt: "New Balance 合作照片",
          label: "New Balance 合作照片",
          src: "/images/ppt_p7/NB.webp",
        },
      },
    ],
  },
  {
    id: 3,
    template: "sectionHeader",
    dataLabel: "03 章節 3 方案選擇",
    cornerRule: "Chapter Three",
    slideNum: "03 / 20",
    displayNum: "03",
    chapterEyebrow: "CHAPTER   03",
    kicker: "Choose Your Plan",
    sectionTitle: "方案選擇",
    sectionLede: "三種規模、三種陣仗，\n為不同型態的企業活動而生。",
  },
  {
    id: 4,
    template: "plansOverview",
    dataLabel: "04 方案總覽",
    cornerRule: "Plans · 01",
    slideNum: "04 / 20",
    plansEyebrow: "THREE PLANS",
    plansTitle: "方案總覽",
    planCards: [
      {
        letter: "A",
        tagEn: "Plan · Single Item",
        zhLines: [
          "客製化",
          "企業活動單品",
        ],
        desc: "客製化甜點製作（不包含場地佈置），依企業需求訂製造型、品牌色與包裝。",
        footEn: "FOR   EVENTS   &   GIFTS",
      },
      {
        letter: "B",
        featured: true,
        tagEn: "Plan · Gift Box",
        zhLines: [
          "客製化",
          "企業禮盒",
        ],
        desc: "企業禮盒，加上部分客製化的甜點品項，適合伴手禮、小型活動使用。",
        footEn: "FOR   CORPORATE   GIFTS",
      },
      {
        letter: "C",
        tagEn: "Plan · Candy Bar",
        zhLines: [
          "Candy Bar",
          "設計",
        ],
        desc: "包含場地佈置、客製化甜點製作，以及前兩項服務的完整方案。",
        footEn: "FULL   STYLING   SERVICE",
      },
    ],
  },
  {
    id: 5,
    template: "planA",
    dataLabel: "05 A 方案",
    cornerRule: "Plan A · 01",
    slideNum: "05 / 20",
    planItalic: "Plan · A",
    planLetter: "A",
    planTitleLines: [
      "客製化",
      "企業活動單品",
    ],
    planBody: "依企業需求訂製餅乾、杯子蛋糕、爆米花、蛋糕、甜甜圈⋯⋯等多種品項，靈活搭配活動主題。",
    planTags: [
      "餅乾",
      "杯子蛋糕",
      "爆米花",
      "蛋糕",
      "甜甜圈",
      "⋯⋯",
    ],
    planPhotoSlot: {
      slotId: "plan-a",
      alt: "A 方案 — 單品作品照",
      label: "A 方案 — 單品作品照",
      src: "/images/ppt/p10單品.webp",
    },
  },
  {
    id: 6,
    template: "planB",
    dataLabel: "06 B 方案",
    cornerRule: "Plan B · 01",
    slideNum: "06 / 20",
    planItalic: "Plan · B",
    planLetter: "B",
    planTitleLines: [
      "客製化",
      "企業禮盒",
    ],
    planBody: "依企業需求訂製甜點品牌色、造型、LOGO 字樣、甜點插卡、吊牌、緞帶，每個細節都呼應品牌。",
    planBullets: [
      "品牌色",
      "造型",
      "LOGO 字樣",
      "甜點插卡",
      "吊牌",
      "緞帶",
    ],
    planPhotoSlots: [
      {
        slotId: "plan-b-1",
        alt: "B 方案 — 企業禮盒作品照 一",
        label: "企業禮盒 一",
        src: "/images/ppt/p11-1.webp",
      },
      {
        slotId: "plan-b-2",
        alt: "B 方案 — 企業禮盒作品照 二",
        label: "企業禮盒 二",
        src: "/images/ppt/p11-2.webp",
      },
      {
        slotId: "plan-b-3",
        alt: "B 方案 — 企業禮盒作品照 三",
        label: "企業禮盒 三",
        src: "/images/ppt/p11-3.webp",
      },
    ],
  },
  {
    id: 7,
    template: "planC",
    dataLabel: "07 C 方案 企業茶會",
    cornerRule: "Plan C · 01",
    slideNum: "07 / 20",
    planItalic: "Plan · C",
    planLetter: "C",
    planTitleLines: [
      "企業茶會",
    ],
    planTitleEm: "Candy Bar",
    planBody: "為企業品牌量身打造的專屬茶會，從造型、色彩、口味到包裝、布置，一次到位的整體體驗。",
    planGrid3: [
      {
        num: "01",
        text: "主題設計",
      },
      {
        num: "02",
        text: "甜點製作",
      },
      {
        num: "03",
        text: "現場布置",
      },
    ],
    planPhotoSlot: {
      slotId: "plan-c",
      alt: "C 方案 — 企業茶會 / Candy Bar 全景",
      label: "C 方案 — 企業茶會 / Candy Bar 全景",
      src: "/images/ppt/p12.webp",
    },
  },
  {
    id: 8,
    template: "sectionHeader",
    dataLabel: "08 章節 4 案例展示",
    cornerRule: "Chapter Four",
    slideNum: "08 / 20",
    displayNum: "04",
    chapterEyebrow: "CHAPTER   04",
    kicker: "Case Studies",
    sectionTitle: "案例展示",
    sectionLede: "從名人派對到品牌週年慶，\n每一場都有它專屬的甜點語彙。",
  },
  {
    id: 9,
    template: "caseSplitL",
    dataLabel: "09 案例 王陽明 蔡詩芸",
    cornerRule: "Case · 01",
    slideNum: "09 / 20",
    caseMeta: "CELEBRITY · BIRTHDAY",
    caseTitleLines: [
      "王陽明 & 蔡詩芸",
    ],
    caseTitleEm: "生日派對",
    caseDetail: "以馬卡龍粉、藍、紫、綠為主色調，營造夢幻柔和的海洋派對。整體以氣球拱門環繞甜點桌，搭配人魚尾旗幟與珊瑚造型裝飾，呼應「海底世界」主題。",
    palette: [
      {
        color: "#f4c5d3",
      },
      {
        color: "#b9d4ec",
      },
      {
        color: "#c9b9e3",
      },
      {
        color: "#bcd9c3",
      },
      {
        color: "transparent",
        caption: "Macaron palette",
      },
    ],
    casePhotoSlot: {
      slotId: "case-wym",
      alt: "海底世界主題 — Candy Bar 全景",
      label: "海底世界主題 — Candy Bar 全景",
      src: "/images/ppt/p14王陽明.webp",
    },
  },
  {
    id: 10,
    template: "caseSplitR",
    dataLabel: "10 案例 蔡桃貴",
    cornerRule: "Case · 02",
    slideNum: "10 / 20",
    caseMeta: "KOL · BIRTHDAY CAKE",
    caseTitleLines: [
      "蔡桃貴",
    ],
    caseTitleEm: "生日客製蛋糕",
    caseDetail: "蔡桃貴兩歲、五歲的生日，我們都特別為他製作了專屬主題的客製蛋糕，每一年都記錄著他不同的喜好。",
    caseStatLeftNum: "02",
    caseStatLeftLabel: "2 YEARS OLD",
    caseStatRightNum: "05",
    caseStatRightLabel: "5 YEARS OLD",
    casePhotoSlot: {
      slotId: "case-tg",
      alt: "蔡桃貴主題客製蛋糕",
      label: "蔡桃貴主題客製蛋糕",
      src: "/images/ppt/p15蔡桃貴.webp",
    },
  },
  {
    id: 11,
    template: "caseSplitL",
    dataLabel: "11 案例 二伯",
    cornerRule: "Case · 03",
    slideNum: "11 / 20",
    caseMeta: "KOL · BIRTHDAY CAKE",
    caseTitleLines: [
      "二伯",
    ],
    caseTitleEm: "生日客製蛋糕",
    caseDetail: "特別以她喜歡的日本歌手、演員為主題設計。每一個細節都融入她的喜好，讓這份甜點不只是蛋糕，更是專屬她的生日回憶。",
    caseQuote: "不只是蛋糕，\n更是專屬她的生日回憶。",
    casePhotoSlot: {
      slotId: "case-eb",
      alt: "二伯主題客製蛋糕",
      label: "二伯主題客製蛋糕",
      src: "/images/ppt/p16.webp",
    },
  },
  {
    id: 12,
    template: "galleryWall",
    dataLabel: "12 名人合作",
    cornerRule: "Case · Gallery",
    slideNum: "12 / 20",
    galleryEyebrow: "CELEBRITY",
    galleryTitleBeforeEm: "名人",
    galleryTitleEm: "合作",
    galleryBody: "精選名人合作甜點與現場紀錄。",
    gallerySlots: [
      {
        slotId: "g-celeb-1",
        alt: "名人合作作品 一",
        label: "名人合作 一",
        src: "/images/ppt/p17名人合作1.webp",
      },
      {
        slotId: "g-celeb-2",
        alt: "名人合作作品 二",
        label: "名人合作 二",
        src: "/images/ppt/p17名人合作2.webp",
      },
      {
        slotId: "g-celeb-3",
        alt: "名人合作作品 三",
        label: "名人合作 三",
        src: "/images/ppt/p17名人合作3.webp",
      },
    ],
  },
  {
    id: 13,
    template: "caseCorpL",
    dataLabel: "13 企業 foodpanda",
    cornerRule: "Corporate · 01",
    slideNum: "13 / 20",
    caseMeta: "CORPORATE · FOODPANDA",
    caseTitleLines: [
      "企業合作",
      "foodpanda",
    ],
    caseTitleEm: "foodpanda",
    caseDetail: "以 Foodpanda 品牌色為核心，結合熊臉元素延伸到甜點與裝飾，營造出甜美、歡樂、派對感的整體氛圍，凸顯品牌年輕活潑的形象。",
    palette: [
      {
        color: "#d70f64",
      },
      {
        color: "#f4a3b8",
      },
      {
        color: "#fcd2d8",
      },
      {
        color: "transparent",
        caption: "Brand pink",
      },
    ],
    casePhotoSlot: {
      slotId: "case-fp",
      alt: "foodpanda 主題甜點桌",
      label: "foodpanda 主題甜點桌",
      src: "/images/ppt/p18foodpanda.webp",
    },
  },
  {
    id: 14,
    template: "caseCorpR",
    dataLabel: "14 企業 桃園機場",
    cornerRule: "Corporate · 02",
    slideNum: "14 / 20",
    caseMeta: "CORPORATE · TPE · 40TH",
    caseTitleLines: [
      "桃園機場",
    ],
    caseTitleEm: "40 週年慶",
    caseDetail: "以「航空啟航」為主題，結合天空藍與白雲元素延伸至甜點與桌面裝飾，透過跑道延伸與對稱層次的擺設，營造視覺焦點。",
    palette: [
      {
        color: "#9ec5e8",
      },
      {
        color: "#cfe4f3",
      },
      {
        color: "#f7f4ec",
      },
      {
        color: "transparent",
        caption: "Sky & Cloud",
      },
    ],
    casePhotoSlot: {
      slotId: "case-tpe",
      alt: "桃園機場 40 週年甜點桌",
      label: "桃園機場 40 週年甜點桌",
      src: "/images/ppt/p19.webp",
    },
  },
  {
    id: 15,
    template: "caseCorpL",
    dataLabel: "15 企業 moderna",
    cornerRule: "Corporate · 03",
    slideNum: "15 / 20",
    caseMeta: "CORPORATE · MODERNA",
    caseTitleLines: [
      "企業合作",
      "moderna",
    ],
    caseTitleEm: "moderna",
    caseDetail: "在這充滿歡樂的歡慶生日派對，我們用最經典的紅、白、藍，點亮專屬時刻，呼應品牌的精神色彩。",
    palette: [
      {
        color: "#c4142a",
      },
      {
        color: "#f5f1e9",
      },
      {
        color: "#1f3f7e",
      },
      {
        color: "transparent",
        caption: "Red · White · Blue",
      },
    ],
    casePhotoSlot: {
      slotId: "case-md",
      alt: "moderna 主題派對",
      label: "moderna 主題派對",
      src: "/images/ppt/p20.webp",
    },
  },
  {
    id: 16,
    template: "caseCorpR",
    dataLabel: "16 企業 micron",
    cornerRule: "Corporate · 04",
    slideNum: "16 / 20",
    caseMeta: "CORPORATE · MICRON",
    caseTitleLines: [
      "企業合作",
      "micron",
    ],
    caseTitleEm: "micron",
    caseDetail: "我們以「星光」作為本次慶祝活動的核心意象。每一位員工與合作夥伴，都如同夜空中的一顆星，各自閃耀著獨特的光芒。",
    palette: [
      {
        color: "#0e1d3f",
      },
      {
        color: "#3c4e7c",
      },
      {
        color: "#d4b572",
      },
      {
        color: "#e8688a",
      },
      {
        color: "transparent",
        caption: "Starry night",
      },
    ],
    casePhotoSlot: {
      slotId: "case-micron",
      alt: "micron 星光主題",
      label: "micron 星光主題",
      src: "/images/ppt/p21.webp",
    },
  },
  {
    id: 17,
    template: "caseCorpL",
    dataLabel: "17 企業 TAK",
    cornerRule: "Corporate · 05",
    slideNum: "17 / 20",
    caseMeta: "CORPORATE · TAK",
    caseTitleLines: [
      "企業合作",
      "TAK",
    ],
    caseTitleEm: "TAK",
    caseDetail: "以 TAK 品牌色為主軸，整體以甜點塔與氣球作為主視覺焦點，營造出溫馨又充滿儀式感的部門聚餐主題。",
    palette: [
      {
        color: "#dfb98d",
      },
      {
        color: "#f4ead7",
      },
      {
        color: "#7a5236",
      },
      {
        color: "transparent",
        caption: "Brand tone",
      },
    ],
    casePhotoSlot: {
      slotId: "case-tak",
      alt: "TAK 部門聚餐甜點塔",
      label: "TAK 部門聚餐甜點塔",
      src: "/images/ppt/p22.png",
    },
  },
  {
    id: 18,
    template: "whyGrid",
    dataLabel: "18 為何選擇我們",
    cornerRule: "Why · 01",
    slideNum: "18 / 20",
    whyEyebrow: "WHY   T&J",
    whyTitleBeforeEm: "為何",
    whyTitleEm: "選擇",
    whyTitleAfterEm: "我們？",
    whyCards: [
      {
        num: "01",
        en: "PROFESSIONAL CRAFT",
        title: "專業客製能力",
        desc: "可依活動主題、品牌色設計，客製化伴手禮 — 每一份甜點都是為你的品牌量身手作。",
      },
      {
        num: "02",
        en: "AESTHETICS & QUALITY",
        title: "美感與質感",
        desc: "拍照效果好，能放大活動價值 — 讓你的活動同時是 social media 上的最佳素材。",
      },
      {
        num: "03",
        en: "EFFICIENT & RELIABLE",
        title: "效率與安心",
        desc: "一說就懂的默契，精準完成你想要的 — 完整流程從討論、設計、配送到現場布置，一氣呵成。",
      },
    ],
  },
  {
    id: 19,
    template: "process",
    dataLabel: "19 合作流程",
    cornerRule: "Process · 01",
    slideNum: "19 / 20",
    processEyebrow: "CHAPTER   05 · PROCESS",
    processTitleBeforeEm: "合作",
    processTitleEm: "流程",
    processTitleAfterEm: "",
    processLead: "從第一次討論到活動當天，四個階段一站到位。",
    processSteps: [
      {
        num: "01",
        en: "DISCUSS",
        title: "需求討論",
        desc: "了解品牌調性、活動主題、預算與時程，確認方案方向。",
      },
      {
        num: "02",
        en: "DESIGN",
        title: "設計提案",
        desc: "提案甜點造型、色彩、口味與包裝，確認視覺與細節。",
      },
      {
        num: "03",
        en: "DELIVERY",
        title: "純手工製作",
        desc: "純手工製作完成甜點，依約定時程準時配送到現場。",
      },
      {
        num: "04",
        en: "ON-SITE",
        title: "現場布置",
        desc: "於活動現場完成甜點桌與氛圍布置，呈現完整成果。",
      },
    ],
  },
  {
    id: 20,
    template: "thanks",
    dataLabel: "20 結語 Thank You",
    cornerRule: "Closing",
    slideNum: "— FIN —",
    thanksRose: "— with gratitude —",
    thanksHero: "Thank You",
    thanksLines: [
      "我們不只是甜點供應，",
      "而是「活動亮點製造者」。",
      "",
      "T&J 客製化甜點．純手工客製化專屬於您的甜點",
      "企業活動．甜點佈置．婚禮小物．幸運籤餅",
    ],
  },
];

export const enterpriseProposalToc: TocItem[] = [
  {
    label: "合作一覽",
    slideId: 1,
  },
  {
    label: "方案選擇",
    slideId: 3,
  },
  {
    label: "方案介紹",
    slideId: 5,
  },
  {
    label: "案例展示",
    slideId: 8,
  },
  {
    label: "為何選擇我們",
    slideId: 18,
  },
  {
    label: "合作流程",
    slideId: 19,
  },
  {
    label: "結語",
    slideId: 20,
  },
];
