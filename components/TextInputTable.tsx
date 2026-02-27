import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

import type { TextRow, BaseTextInputProps } from "@/components/text-input/TextInputInterface";
import { TEXT_INPUT_CONFIGS } from "@/components/text-input/TextInputInterface";

interface TextInputTableProps {
  orderQuantity: number;
  onConfirm: (csvUrl: string) => void; // ✅ 改為回傳 URL
  onCancel: () => void;
}

export function TextInputTable({ orderQuantity, onConfirm, onCancel }: TextInputTableProps) {
  const [rows, setRows] = useState<TextRow[]>([{ text: "", quantity: 1 }]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // 使用統一的驗證規則
  const config = TEXT_INPUT_CONFIGS.cupcake_choco;
  const validateText = (text: string): boolean => {
    return config.validationRule.validate(text);
  };

  const getTotalQuantity = () => {
    return rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
  };

  const addRow = () => {
    setRows([...rows, { text: "", quantity: 1 }]);
  };

  const removeRow = (index: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== index));
    }
  };

  const updateRow = (index: number, field: keyof TextRow, value: string | number) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const handleSubmit = () => {
    const total = getTotalQuantity();
    
    // 驗證所有文字
    for (const row of rows) {
      if (row.text && !validateText(row.text)) {
        alert(config.validationRule.errorMessage);
        return;
      }
    }

    // 驗證數量
    if (total > orderQuantity) {
      alert("指定數量超過訂購數量。");
      return;
    }

    if (total < orderQuantity) {
      alert("您指定的內容，未達您購買的數量，沒有指定內容的蛋糕將以相似風格製作（無文字）。");
      setShowConfirmDialog(true);
    } else if (total === orderQuantity) {
      setShowConfirmDialog(true);
    }
  };

  // ✅ 上傳 CSV 到 Supabase
  const uploadCSV = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");

      // ✅ 加入 BOM 解決 Excel 中文亂碼
      const BOM = "\uFEFF";
      const csvData = rows
        .filter((row) => row.text.trim() !== "")
        .map((row) => `"${row.text}",${row.quantity}`)
        .join("\n");
      const csvContent = BOM + `text,quantity\n${csvData}`;

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const fileName = `${config.csvPrefix}_${Date.now()}.csv`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("customizer_uploads")
        .upload(fileName, blob, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("customizer_uploads").getPublicUrl(uploadData.path);
      onConfirm(data.publicUrl); // ✅ 回傳 URL
    } catch (error) {
      console.error("❌ CSV 上傳失敗:", error);
      alert("上傳失敗，請稍後再試");
    }
  };

  const handleConfirm = () => {
    if (confirmed) {
      uploadCSV(); // ✅ 改為呼叫 uploadCSV
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_120px_40px] gap-2 items-center font-medium text-sm">
          <span>{config.labels?.textColumn || "文字內容"}</span>
          <span>{config.labels?.quantityColumn || "數量"}</span>
          <span></span>
        </div>
        
        {rows.map((row, index) => (
          <div key={index} className="grid grid-cols-[1fr_120px_40px] gap-2 items-start">
            <Input
              value={row.text}
              onChange={(e) => updateRow(index, "text", e.target.value)}
              placeholder={config.validationRule.placeholder}
              className={!validateText(row.text) && row.text ? "border-red-500" : ""}
            />
            <Input
              type="number"
              min="1"
              value={row.quantity}
              onChange={(e) => updateRow(index, "quantity", parseInt(e.target.value) || 1)}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>

      <Button onClick={addRow} variant="outline" size="sm" className="w-full">
        <Plus size={16} className="mr-2" />
        新增一列
      </Button>

      <div className="flex items-center justify-between pt-2 border-t">
        <span className="text-sm">
          總計：<span className={getTotalQuantity() > orderQuantity ? "text-red-500 font-bold" : "font-bold"}>{getTotalQuantity()}</span> / {orderQuantity}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={handleSubmit}>
            確認
          </Button>
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認指定內容</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>您指定的內容如下：</p>
                <ul className="list-disc list-inside space-y-1">
                  {rows.filter(row => row.text.trim() !== "").map((row, index) => (
                    <li key={index}>
                      {row.text} × {row.quantity}
                    </li>
                  ))}
                </ul>
                {getTotalQuantity() < orderQuantity && (
                  <p className="text-amber-600 mt-2">
                    ⚠️ 剩餘 {orderQuantity - getTotalQuantity()} 個將以相似風格製作（無文字）
                  </p>
                )}
                <div className="flex items-center space-x-2 pt-4">
                  <Checkbox
                    id="confirm"
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked as boolean)}
                  />
                  <label
                    htmlFor="confirm"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    我已確認上述內容
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmed(false)}>返回修改</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={!confirmed}>
              確認送出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
