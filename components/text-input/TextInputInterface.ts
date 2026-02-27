// ======================================================================
// TextInputInterface.ts — 統一文字輸入介面定義
// ======================================================================

export interface TextRow {
  text: string;
  quantity: number;
}

export interface TextValidationRule {
  validate: (text: string) => boolean;
  errorMessage: string;
  placeholder: string;
}

export interface TextInputConfig {
  // 產品識別
  productId: string;
  
  // 驗證規則
  validationRule: TextValidationRule;
  
  // 是否需要上傳 CSV
  uploadCSV?: boolean;
  
  // CSV 檔案名稱前綴
  csvPrefix?: string;
  
  // 自訂標籤文字
  labels?: {
    textColumn?: string;
    quantityColumn?: string;
    addButton?: string;
    submitButton?: string;
    cancelButton?: string;
  };
}

export interface BaseTextInputProps {
  orderQuantity: number;
  config: TextInputConfig;
  onConfirm: (data: TextRow[] | string) => void;
  onCancel: () => void;
}

// 預設驗證規則
export const TEXT_VALIDATION_RULES = {
  // 杯子蛋糕：2 個中文或 8 個英文
  cupcake: {
    validate: (text: string): boolean => {
      const chineseCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
      return chineseCount <= 2 && englishCount <= 8;
    },
    errorMessage: "文字格式錯誤：最多 2 個中文字或 8 個英文字母",
    placeholder: "最多 2 中文 / 8 英文"
  },

  // 幸運籤餅：最多 35 字
  luck: {
    validate: (text: string): boolean => text.length <= 35,
    errorMessage: "簽文超過 35 字限制",
    placeholder: "最多 35 字"
  }
};

// 預設配置
export const TEXT_INPUT_CONFIGS: Record<string, TextInputConfig> = {
  cupcake_choco: {
    productId: "cupcake_choco",
    validationRule: TEXT_VALIDATION_RULES.cupcake,
    uploadCSV: true,
    csvPrefix: "cupcake_text",
    labels: {
      textColumn: "杯子蛋糕文字",
      quantityColumn: "款式數量"
    }
  },

  luck: {
    productId: "luck",
    validationRule: TEXT_VALIDATION_RULES.luck,
    uploadCSV: true,
    csvPrefix: "luck_text",
    labels: {
      textColumn: "簽文內容",
      quantityColumn: "數量分配"
    }
  }
};
