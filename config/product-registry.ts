// ======================================================================
// product-registry.ts — 最終正式版（無 baseLayers, main=50, photo=40）
// ======================================================================

// --------------------------------------------------
// 型別定義
// --------------------------------------------------

export type ProductFeature =
  | "color_selection"
  | "flavor_selection"
  | "size_selection"
  | "shape_selection"
  | "decorations"
  | "hierarchical_decorations"
  | "photo_upload"
  | "text_input"
  | "color_quantity_allocation" // 馬卡龍專用：顏色數量分配
  | "skip_package_customizer"; // 禮盒專用：跳過包裝設計器，直接加入購物車

export type ProductComplexity = "simple" | "medium" | "complex" | "special";

export interface BusinessRules {
  min_color_quantity?: number;
  photo_card_min_qty?: number;
  photo_card_fixed_fee?: number;

  // 條件加價（需數量 < threshold 且上傳照片）
  conditionalFees?: Array<{
    triggerOptionId: number;
    condition: "quantity_less_than_and_photo_uploaded";
    threshold: number;
    fee: number;
    confirmMessage: string;
  }>;

  // 選項依賴規則（cookie 專用：形狀匹配糖霜）
  optionDependencies?: Array<{
    sourceOptionId: number;
    requiredOptionId: number;
    errorMessage: string;
  }>;

  // ✅ optionDependencies 例外：這些 option（或其後代）不受形狀限制（cookie 專用）
  optionDependencyBypassOptionIds?: number[];

  // 強制搭配規則（米紙 + 巧克力塗層）
  requiredCombinations?: Array<{
    triggerGroupId: number;
    requireColorSelection: boolean;
    colorRootId: number;
    defaultColorOptionId: number;
    excludeDefaultColor: boolean;
    errorMessage: string;
  }>;

  // ✅ 包裝款式根據 size 選項篩選（popcorn 專用：S/M/L 匹配）
  packageFilterBySize?: {
    sizeRootId: number;
    filterField: string; // option_name_zh 中匹配 S/M/L
  };

  // ✅ 無載體直噴規則（cotton 專用）
  directPrintRule?: {
    directPrintOptionId: number;
    requiredColorOptionId: number;
    colorRootId: number;
    errorMessage: string;
    incompatibleOptionIds: number[];
    incompatibleErrorMessage: string;
  };
}

export interface LayerConfig {
  id: string;
  zIndex: number;
  src: (state: any) => string | string[] | null;
}

export interface RenderStrategy {
  type: "layer-stack" | "single-image" | "canvas-composite";
  layers?: LayerConfig[];
}

export interface LayerStackItem {
  type: "color" | "flavor" | "decoration" | "photo" | "size" | "shape" | "text";
  rootId: number;
  zIndex: number;
  name: string;
  fallbackUrl?: string;
}

export interface ProductConfig {
  enabledNew: boolean;
  complexity: ProductComplexity;
  features: ProductFeature[];
  colorRootIds?: number[];
  flavorRootIds?: number[];
  sizeRootIds?: number[];
  shapeRootId?: number | null;
  decorationRootId?: number | null;
  photoRootId?: number | null;
  preloadDefault?: boolean;
  textInputRenderer?: string;
  businessRules?: BusinessRules;
  renderStrategy: RenderStrategy;
  layerStack: LayerStackItem[];
  // ✅ 包裝設計器相關配置
  packageStyleRootId?: number; // 7027 包裝款式
  packageDecorationRootId?: number; // 7028 包裝裝飾
  // ✅ 禮盒顏色選擇（禮盒專用）
  giftBoxColorRootId?: number;
  // ✅ 用戶設計上傳觸發選項（luck/popcorn 專用）
  userDesignTriggerOptionId?: number;
  // ✅ 手機版照片框額外縮放係數（cookie 專用：照片框太大時額外縮小）
  mobilePhotoScaleFactor?: number;
}

const LOGIC_REGISTRY: Record<string, ProductConfig> = {
  cupcake_cream: {
    enabledNew: true,
    complexity: "complex",
    features: ["color_selection", "decorations", "hierarchical_decorations", "photo_upload"],
    colorRootIds: [10, 11],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      photo_card_min_qty: 100,
      photo_card_fixed_fee: 3000,
      conditionalFees: [
        {
          triggerOptionId: 3006,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
        {
          triggerOptionId: 3007,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 3000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$3,000，是否繼續？",
        },
        {
          triggerOptionId: 7300,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
        {
          triggerOptionId: 7301,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
      ],
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "wrapper", zIndex: 10, src: (s) => s.getWrapperImage() },
        { id: "cream", zIndex: 20, src: (s) => s.getCreamImage() },
        { id: "decor", zIndex: 30, src: (s) => s.getAccentDecorImages() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 11, zIndex: 10, name: "杯子" },
      { type: "color", rootId: 10, zIndex: 20, name: "奶油" },
      { type: "decoration", rootId: 4001, zIndex: 30, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  cupcake_choco: {
    enabledNew: true,
    complexity: "complex",
    features: ["color_selection", "decorations", "hierarchical_decorations", "photo_upload", "text_input"],
    colorRootIds: [12, 11],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    textInputRenderer: "CupcakeChocoTextInput",
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      photo_card_min_qty: 100,
      photo_card_fixed_fee: 3000,
      conditionalFees: [
        {
          triggerOptionId: 3006,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
        {
          triggerOptionId: 3007,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 3000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$3,000，是否繼續？",
        },
        {
          triggerOptionId: 7300,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
        {
          triggerOptionId: 7301,
          condition: "quantity_less_than_and_photo_uploaded",
          threshold: 100,
          fee: 1000,
          confirmMessage: "訂購數量未達 100 個，選擇此照片選項需額外加價 NT$1,000，是否繼續？",
        },
      ],
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "cup", zIndex: 10, src: (s) => s.getWrapperImage() },
        { id: "chocoTop", zIndex: 20, src: (s) => s.getChocolateTopImage() },
        { id: "decor", zIndex: 30, src: (s) => s.getAccentDecorImages() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 11, zIndex: 10, name: "杯子" },
      { type: "color", rootId: 12, zIndex: 20, name: "巧克力" },
      { type: "text", rootId: 0, zIndex: 25, name: "文字照片" },
      { type: "decoration", rootId: 4001, zIndex: 30, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  donut: {
    enabledNew: true,
    complexity: "complex",
    features: ["color_selection", "decorations", "hierarchical_decorations", "photo_upload"],
    colorRootIds: [16],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      requiredCombinations: [
        {
          triggerGroupId: 3003,
          requireColorSelection: true,
          colorRootId: 16,
          defaultColorOptionId: 2067,
          excludeDefaultColor: false, // donut 可以選預設
          errorMessage: "米紙照片必須要有巧克力塗層當作黏著物，請先選擇巧克力塗層顏色",
        },
      ],
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "donutBase", zIndex: 10, src: (s) => s.getDonutBaseImage() },
        { id: "decor", zIndex: 20, src: (s) => s.getAccentDecorImages() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage?.() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 16, zIndex: 10, name: "甜甜圈" },
      { type: "decoration", rootId: 4001, zIndex: 20, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  popcorn: {
    enabledNew: true,
    complexity: "medium",
    features: ["color_selection", "size_selection"],
    colorRootIds: [14],
    sizeRootIds: [5000],
    flavorRootIds: [],
    decorationRootId: null,
    photoRootId: null,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    // ✅ 用戶設計上傳配置
    userDesignTriggerOptionId: 7299, // 選擇此選項時觸發設計上傳模組
    businessRules: {
      // ✅ 包裝款式根據 size 選項篩選（S/M/L 匹配）
      packageFilterBySize: {
        sizeRootId: 5000,
        filterField: "option_name_zh", // 根據選項名稱中的 S/M/L 篩選
      },
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [{ id: "popcornBase", zIndex: 10, src: (s) => s.getPopcornBaseImage() }],
    },
    layerStack: [{ type: "color", rootId: 14, zIndex: 10, name: "爆米花" }],
  },

  ice: {
    enabledNew: true,
    complexity: "simple",
    features: ["color_selection"],
    colorRootIds: [15],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: null,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    renderStrategy: {
      type: "single-image",
      layers: [{ id: "iceBase", zIndex: 10, src: (s) => s.getIceImage() }],
    },
    layerStack: [{ type: "color", rootId: 15, zIndex: 10, name: "冰棒" }],
  },

  cakeball: {
    enabledNew: true,
    complexity: "complex",
    features: ["color_selection", "decorations", "hierarchical_decorations", "photo_upload"],
    colorRootIds: [17],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      requiredCombinations: [
        {
          triggerGroupId: 3003,
          requireColorSelection: true,
          colorRootId: 17,
          defaultColorOptionId: 2088,
          excludeDefaultColor: false, // cakeball 可以選預設
          errorMessage: "米紙照片必須要有巧克力塗層當作黏著物，請先選擇巧克力塗層顏色",
        },
      ],
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "ball", zIndex: 10, src: (s) => s.getCakeballBaseImage() },
        { id: "decor", zIndex: 20, src: (s) => s.getSingleDecorationImage() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage?.() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 17, zIndex: 10, name: "蛋糕球" },
      { type: "decoration", rootId: 4001, zIndex: 20, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  cotton: {
    enabledNew: true,
    complexity: "medium",
    features: ["color_selection", "decorations", "hierarchical_decorations", "photo_upload"],
    colorRootIds: [21],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      requiredCombinations: [
        {
          triggerGroupId: 3003,
          requireColorSelection: true,
          colorRootId: 21,
          defaultColorOptionId: 2129,
          excludeDefaultColor: true,
          errorMessage: "米紙照片必須要有巧克力塗層當作黏著物，請先選擇巧克力塗層顏色",
        },
        // ✅ 新增：4500/4501 裝飾品群組需要非預設顏色
        {
          triggerGroupId: 4500,
          requireColorSelection: true,
          colorRootId: 21,
          defaultColorOptionId: 2129,
          excludeDefaultColor: true,
          errorMessage: "您必須先選擇巧克力塗層，才可以黏著裝飾品",
        },
        {
          triggerGroupId: 4501,
          requireColorSelection: true,
          colorRootId: 21,
          defaultColorOptionId: 2129,
          excludeDefaultColor: true,
          errorMessage: "您必須先選擇巧克力塗層，才可以黏著裝飾品",
        },
      ],
      // ✅ 新增：3005 無載體直噴必須與 2129 素體綁定
      directPrintRule: {
        directPrintOptionId: 3005,
        requiredColorOptionId: 2129, // 素體
        colorRootId: 21,
        errorMessage: "如要選擇無載體直噴，您必須點擊顏色：素體選項",
        // 選擇素體 + 3005 後，禁止選擇以下選項
        incompatibleOptionIds: [3003, 4500, 4501],
        incompatibleErrorMessage: "選擇無載體直噴時，不可選擇米紙或裝飾品",
      },
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "cottonBase", zIndex: 10, src: (s) => s.getCottonBaseImage() },
        { id: "decor", zIndex: 20, src: (s) => s.getAccentDecorImages() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage?.() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 21, zIndex: 10, name: "棉花糖" },
      { type: "decoration", rootId: 4001, zIndex: 20, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  luck: {
    enabledNew: true,
    complexity: "medium",
    features: ["flavor_selection", "color_selection", "decorations", "photo_upload", "text_input"],
    flavorRootIds: [20],
    colorRootIds: [18],
    sizeRootIds: [],
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    textInputRenderer: "LuckTextInput",
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    // ✅ 用戶設計上傳配置
    userDesignTriggerOptionId: 7082, // 選擇此選項時觸發設計上傳模組
    businessRules: {
      requiredCombinations: [
        {
          triggerGroupId: 3003,
          requireColorSelection: true,
          colorRootId: 18,
          defaultColorOptionId: 7233,
          excludeDefaultColor: true,
          errorMessage: "米紙照片必須要有巧克力塗層當作黏著物，請先選擇巧克力塗層顏色",
        },
        // ✅ 新增：4500/4501 裝飾品群組需要非預設顏色
        {
          triggerGroupId: 4500,
          requireColorSelection: true,
          colorRootId: 18,
          defaultColorOptionId: 7233,
          excludeDefaultColor: true,
          errorMessage: "您必須先選擇巧克力塗層，才可以黏著裝飾品",
        },
        {
          triggerGroupId: 4501,
          requireColorSelection: true,
          colorRootId: 18,
          defaultColorOptionId: 7233,
          excludeDefaultColor: true,
          errorMessage: "您必須先選擇巧克力塗層，才可以黏著裝飾品",
        },
      ],
    },
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "flavor", zIndex: 20, src: (s) => s.getFlavorImage() },
        { id: "choco", zIndex: 18, src: (s) => s.getChocoLayerImage() },
        { id: "decor", zIndex: 30, src: (s) => s.getAccentDecorImages() },
        { id: "main", zIndex: 50, src: (s) => s.getMainVisualImage?.() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "flavor", rootId: 20, zIndex: 15, name: "口味" },
      { type: "color", rootId: 18, zIndex: 20, name: "巧克力" },
      { type: "decoration", rootId: 4001, zIndex: 30, name: "點綴裝飾" },
      { type: "decoration", rootId: 4000, zIndex: 40, name: "主視覺裝飾" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  longcake: {
    enabledNew: true,
    complexity: "simple",
    features: ["flavor_selection"],
    flavorRootIds: [19],
    colorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: null,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    renderStrategy: {
      type: "single-image",
      layers: [{ id: "longcakeBase", zIndex: 10, src: (s) => s.getLongcakeImage() }],
    },
    layerStack: [{ type: "flavor", rootId: 19, zIndex: 10, name: "長條蛋糕" }],
  },

  cookie: {
    enabledNew: true,
    complexity: "complex",
    features: ["shape_selection", "hierarchical_decorations", "photo_upload", "size_selection"],
    colorRootIds: [],
    flavorRootIds: [],
    sizeRootIds: [5001],
    shapeRootId: 7,
    decorationRootId: 4,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    // ✅ Cookie 專用：手機版照片框額外縮放（440px → ~109px）
    mobilePhotoScaleFactor: 0.9,
    businessRules: {
      optionDependencies: [
        {
          sourceOptionId: 7006,
          requiredOptionId: 3001,
          errorMessage: "必須選擇與餅乾形狀相同的糖霜形狀。",
        },
        {
          sourceOptionId: 7002,
          requiredOptionId: 3012,
          errorMessage: "必須選擇與餅乾形狀相同的糖霜形狀。",
        },
      ],
      // 無載體-直噴：不受任何形狀限制
      optionDependencyBypassOptionIds: [3005],
    },

    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "shape", zIndex: 10, src: (s) => s.getShapeImage() },
        { id: "size_cookie_photo", zIndex: 20, src: (s) => s.getSizePhotoImage() },
        { id: "photo", zIndex: 40, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "shape", rootId: 7, zIndex: 10, name: "餅乾形狀" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  macaron: {
    enabledNew: true,
    complexity: "special",
    features: ["color_quantity_allocation", "photo_upload"],
    colorRootIds: [13], // 馬卡龍顏色
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: 3,
    preloadDefault: true,
    packageStyleRootId: 7027,
    packageDecorationRootId: 7028,
    businessRules: {
      min_color_quantity: 100, // 每100個可選1色
    },
    renderStrategy: {
      type: "single-image",
      layers: [{ id: "macaron", zIndex: 10, src: (s) => s.getMacaronImage() }],
    },
    layerStack: [
      { type: "color", rootId: 13, zIndex: 10, name: "馬卡龍" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  // ====== 禮盒系列 ======
  giftbox_big: {
    enabledNew: true,
    complexity: "medium",
    features: ["color_selection", "photo_upload", "skip_package_customizer"],
    colorRootIds: [22],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: 3,
    preloadDefault: true,
    giftBoxColorRootId: 7287, // ✅ 禮盒顏色選擇 root
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "giftbox", zIndex: 10, src: (s) => s.getGiftboxImage() },
        { id: "photo", zIndex: 50, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 22, zIndex: 10, name: "顏色" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  giftbox_midium: {
    enabledNew: true,
    complexity: "medium",
    features: ["color_selection", "photo_upload", "skip_package_customizer"],
    colorRootIds: [23],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: 3,
    preloadDefault: true,
    giftBoxColorRootId: 7288, // ✅ 禮盒顏色選擇 root
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "giftbox", zIndex: 10, src: (s) => s.getGiftboxImage() },
        { id: "photo", zIndex: 50, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 23, zIndex: 10, name: "顏色" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },

  giftbox_small: {
    enabledNew: true,
    complexity: "medium",
    features: ["color_selection", "photo_upload", "skip_package_customizer"],
    colorRootIds: [24],
    flavorRootIds: [],
    sizeRootIds: [],
    decorationRootId: null,
    photoRootId: 3,
    preloadDefault: true,
    giftBoxColorRootId: 7289, // ✅ 禮盒顏色選擇 root
    renderStrategy: {
      type: "layer-stack",
      layers: [
        { id: "giftbox", zIndex: 10, src: (s) => s.getGiftboxImage() },
        { id: "photo", zIndex: 50, src: (s) => s.getPhotoFrameImage() },
      ],
    },
    layerStack: [
      { type: "color", rootId: 24, zIndex: 10, name: "顏色" },
      { type: "photo", rootId: 3, zIndex: 50, name: "照片" },
    ],
  },
};

export function getProductConfig(productId: string): ProductConfig | null {
  return LOGIC_REGISTRY[productId] ?? null;
}

export function isProductEnabled(productId: string): boolean {
  const config = getProductConfig(productId);
  return config?.enabledNew === true;
}

export function getAllEnabledProducts(): string[] {
  return Object.keys(LOGIC_REGISTRY).filter((id) => LOGIC_REGISTRY[id].enabledNew);
}

export function getProductsByComplexity(complexity: ProductComplexity): string[] {
  return Object.keys(LOGIC_REGISTRY).filter((id) => LOGIC_REGISTRY[id].complexity === complexity);
}

export default LOGIC_REGISTRY;
