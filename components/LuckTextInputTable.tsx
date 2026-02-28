import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { X, ExternalLink, FileText, Palette } from "lucide-react";

import type { TextRow } from "@/components/text-input/TextInputInterface";
import { TEXT_INPUT_CONFIGS } from "@/components/text-input/TextInputInterface";

// ✅ 新的 payload 類型（擴展 random 模式）
export interface LuckTextPayload {
  mode: "text" | "design" | "random";
  csvUrl?: string;
  designLink?: string;
}

interface LuckTextInputTableProps {
  orderQuantity: number;
  onConfirm: (payload: LuckTextPayload) => void;
  onCancel: () => void;
}

const LuckTextInputTable = ({ orderQuantity, onConfirm, onCancel }: LuckTextInputTableProps) => {
  // ✅ 新增模式選擇狀態（null = 尚未選擇）
  const [selectedMode, setSelectedMode] = useState<"text" | "design" | null>(null);

  const [rows, setRows] = useState<TextRow[]>([{ text: "", quantity: 0 }]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // 自訂設計連結
  const [customDesignLink, setCustomDesignLink] = useState("");

  // 使用統一的驗證規則
  const config = TEXT_INPUT_CONFIGS.luck;
  const validateText = (text: string): boolean => {
    return config.validationRule.validate(text);
  };

  // 計算總數量
  const getTotalQuantity = (): number => {
    return rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
  };

  // 新增一行
  const addRow = () => {
    setRows([...rows, { text: "", quantity: 0 }]);
  };

  // 刪除一行
  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  // 更新某行的資料
  const updateRow = (index: number, field: keyof TextRow, value: string | number) => {
    const newRows = [...rows];
    if (field === "quantity") {
      newRows[index][field] = Math.max(0, Number(value));
    } else {
      newRows[index][field] = value as string;
    }
    setRows(newRows);
  };

  // 提交純文字模式
  const handleTextSubmit = () => {
    const total = getTotalQuantity();

    // 檢查每行的文字和數量
    for (const row of rows) {
      if (!row.text.trim()) {
        alert("請填寫所有簽文內容");
        return;
      }
      if (!validateText(row.text)) {
        alert(config.validationRule.errorMessage);
        return;
      }
      if (row.quantity <= 0) {
        alert("每行數量必須大於 0");
        return;
      }
    }

    if (total < orderQuantity) {
      alert(`您指定的內容，未達您購買的數量（${orderQuantity}個），沒有指定內容的籤餅將以相似風格製作（無簽文）。`);
      uploadCSV();
    } else if (total === orderQuantity) {
      setShowConfirmDialog(true);
    } else {
      alert("指定數量超過訂購數量。");
    }
  };

  // 提交自行設計模式
  const handleDesignSubmit = () => {
    if (!customDesignLink.trim()) {
      alert("請貼上您的雲端設計檔案連結");
      return;
    }

    // 直接回傳 design payload
    onConfirm({
      mode: "design",
      designLink: customDesignLink.trim(),
    });
  };

  // 上傳 CSV
  const uploadCSV = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // ✅ 加入 BOM 解決 Excel 中文亂碼
      const BOM = "\uFEFF";
      const csvData = rows.map((row) => `"${row.text}",${row.quantity}`).join("\n");
      const blob = new Blob([BOM + `text,quantity\n${csvData}`], { type: "text/csv;charset=utf-8;" });
      const fileName = `${config.csvPrefix}_${Date.now()}.csv`;

      // 上傳到 Supabase
      const { error: uploadError } = await supabase.storage.from("customizer_uploads").upload(fileName, blob, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadError) throw uploadError;

      // 獲取公開連結
      const { data } = supabase.storage.from("customizer_uploads").getPublicUrl(fileName);

      // ✅ 回傳 text payload
      onConfirm({
        mode: "text",
        csvUrl: data.publicUrl,
      });
    } catch (error) {
      console.error("❌ CSV 上傳失敗:", error);
      alert("上傳失敗，請稍後再試");
    }
  };

  // 確認後上傳
  const handleConfirmSubmit = () => {
    if (!confirmed) return;
    setShowConfirmDialog(false);
    uploadCSV();
  };

  // ✅ 模式選擇入口 UI
  if (selectedMode === null) {
    return (
      <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
        {/* 白底黑字提示 */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700 font-medium">⚠️ 提醒：幸運籤餅固定白底黑字</p>
        </div>

        <h4 className="font-semibold text-lg">選擇簽文設計方式</h4>
        <p className="text-sm text-muted-foreground">請選擇您想要的簽文製作方式</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {/* 選項 A：純文字輸入 */}
          <button
            onClick={() => setSelectedMode("text")}
            className="flex flex-col items-center gap-3 p-6 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
          >
            <FileText className="w-10 h-10 text-primary" />
            <span className="font-medium">輸入純文字</span>
            <span className="text-xs text-muted-foreground text-center">輸入簽文內容並分配數量</span>
          </button>

          {/* 選項 B：自行設計 */}
          <button
            onClick={() => setSelectedMode("design")}
            className="flex flex-col items-center gap-3 p-6 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
          >
            <Palette className="w-10 h-10 text-primary" />
            <span className="font-medium">自行設計、排版</span>
            <span className="text-xs text-muted-foreground text-center">下載模板自行設計後上傳</span>
          </button>

          {/* 選項 C：隨機正向小語 */}
          <button
            onClick={() => {
              // 直接回傳 random payload，不進入子頁面
              onConfirm({ mode: "random" });
            }}
            className="flex flex-col items-center gap-3 p-6 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all"
          >
            <span className="w-10 h-10 flex items-center justify-center text-3xl">🎲</span>
            <span className="font-medium">店家隨機填寫正向小語</span>
            <span className="text-xs text-muted-foreground text-center">由店家隨機挑選正向小語</span>
          </button>
        </div>

        <Button variant="outline" onClick={onCancel} className="w-full mt-4">
          取消
        </Button>
      </div>
    );
  }

  // ✅ 模式 B：自行設計簽文
  if (selectedMode === "design") {
    return (
      <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
        {/* 白底黑字提示 */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700 font-medium">⚠️ 提醒：幸運籤餅固定白底黑字</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedMode(null)}>
            ← 返回
          </Button>
          <h4 className="font-semibold text-lg">🎨 自行設計簽文</h4>
        </div>

        <div className="space-y-4">
          <a
            href="https://drive.google.com/drive/folders/11gsl4xu4lCGz39Yo5YwObQZQVpmLMumc?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
          >
            <ExternalLink size={16} />
            📥 下載空白設計模板
          </a>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-700">
            <p className="font-medium mb-1">⚠️ 上傳前請確保：</p>
            <ul className="list-disc list-inside text-xs space-y-1">
              <li>雲端連結已開啟共享權限（「知道連結的人都可以查看」）</li>
              <li>檔案格式正確（依照模板設計）</li>
            </ul>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">貼上您的雲端分享連結</label>
            <Input
              placeholder="Google Drive、Dropbox 等雲端連結，或寫下「下單後補上（私訊客服）」不可留空！"
              value={customDesignLink}
              onChange={(e) => setCustomDesignLink(e.target.value)}
              className="w-full"
            />
            {customDesignLink && <p className="text-xs text-green-600">✓ 已填寫設計檔連結</p>}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={() => setSelectedMode(null)} className="flex-1">
            返回選擇
          </Button>
          <Button onClick={handleDesignSubmit} className="flex-1" disabled={!customDesignLink.trim()}>
            確認
          </Button>
        </div>
      </div>
    );
  }

  // ✅ 模式 A：純文字輸入（原有 UI）
  return (
    <div className="space-y-4 bg-card p-6 rounded-xl border border-border">
      {/* 白底黑字提示 */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-700 font-medium">⚠️ 提醒：幸運籤餅固定白底黑字</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedMode(null)}>
          ← 返回
        </Button>
        <h4 className="font-semibold text-lg">輸入簽文內容</h4>
      </div>
      <p className="text-sm text-muted-foreground">每筆簽文最多 35 字（含標點符號），總數量需 ≤ {orderQuantity} 個</p>

      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_120px_40px] gap-3 font-semibold text-sm">
          <span>簽文內容</span>
          <span>數量</span>
          <span></span>
        </div>

        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_120px_40px] gap-3 items-center">
            <Input
              type="text"
              value={row.text}
              onChange={(e) => updateRow(index, "text", e.target.value)}
              placeholder="最多 35 字"
              maxLength={35}
              className="w-full"
            />
            <Input
              type="number"
              value={row.quantity || ""}
              onChange={(e) => updateRow(index, "quantity", e.target.value)}
              placeholder="數量"
              min="0"
              className="w-full"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              className="h-10 w-10"
            >
              <X size={16} />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={addRow} className="w-full">
        + 新增一列
      </Button>

      <div className="pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground">
          已指定數量：<span className="font-bold text-foreground">{getTotalQuantity()}</span> / {orderQuantity}
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setSelectedMode(null)} className="flex-1">
          返回選擇
        </Button>
        <Button onClick={handleTextSubmit} className="flex-1">
          確認
        </Button>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認您指定的簽文內容</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>您指定的內容如下：</p>
                <div className="bg-white p-4 rounded-lg space-y-2 max-h-60 overflow-y-auto">
                  {rows.map((row, index) => (
                    <div key={index} className="text-sm">
                      <span className="font-medium">{row.text}</span> - {row.quantity} 個
                    </div>
                  ))}
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="confirm-check"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                  />
                  <label
                    htmlFor="confirm-check"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    我已確認以上內容
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              返回修改
            </Button>
            <AlertDialogAction onClick={handleConfirmSubmit} disabled={!confirmed}>
              確認送出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LuckTextInputTable;
