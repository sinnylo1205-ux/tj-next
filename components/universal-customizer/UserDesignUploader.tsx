// ======================================================================
// UserDesignUploader.tsx — 用戶自行設計上傳模組（luck 刊頭 / popcorn 包裝）
// ======================================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Check, AlertCircle } from "lucide-react";

interface UserDesignUploaderProps {
  productId: string;
  onDesignLinkChange: (link: string | null) => void;
  designLink: string | null;
}

// 用戶下載連結配置
const DESIGN_LINKS: Record<string, { title: string; downloadUrl: string }> = {
  popcorn: {
    title: "爆米花包裝設計區",
    downloadUrl: "https://drive.google.com/drive/folders/1J2TTrZYXQ56kVMy6CEISggbMnpNVXoPU?usp=sharing",
  },
  luck: {
    title: "刊頭設計區",
    downloadUrl: "https://drive.google.com/drive/folders/1cF7-Rn0k_PXX21a_lmi00PZQy3tJz0TB?usp=sharing",
  },
};

export function UserDesignUploader({ productId, onDesignLinkChange, designLink }: UserDesignUploaderProps) {
  const [inputLink, setInputLink] = useState(designLink || "");
  const [isConfirmed, setIsConfirmed] = useState(!!designLink);

  const config = DESIGN_LINKS[productId];
  if (!config) return null;

  const handleConfirm = () => {
    if (inputLink.trim()) {
      onDesignLinkChange(inputLink.trim());
      setIsConfirmed(true);
    }
  };

  const handleClear = () => {
    setInputLink("");
    onDesignLinkChange(null);
    setIsConfirmed(false);
  };

  return (
    <Card className="border-2 border-dashed border-brand-200 bg-brand-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="text-brand-600">📁</span>
          {config.title}
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground leading-relaxed">
          請點擊包裝 AI
          檔案的雲端連結並下載為副本，設計完畢後，上傳檔案到您自己的雲端，並提供給我們雲端分享連結（記得開共享喔！），雲端檔案須包含
          illustrator 檔案（.ai）與 png 檔案共兩份檔案
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 下載模板連結 */}
        <div>
          <a
            href={config.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium underline underline-offset-4"
          >
            <ExternalLink className="w-4 h-4" />
            點擊下載設計模板
          </a>
        </div>

        {/* 上傳連結輸入 */}
        {isConfirmed ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-700">已提供設計連結</p>
              <a
                href={designLink || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 hover:underline truncate block"
              >
                {designLink}
              </a>
            </div>
            <Button variant="outline" size="sm" onClick={handleClear}>
              修改
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">請確保您的雲端連結已開啟共享權限，讓我們能夠存取您的設計檔案</p>
            </div>
            <Input
              placeholder="請貼上您的雲端分享連結，或寫：「下單後補上」..."
              value={inputLink}
              onChange={(e) => setInputLink(e.target.value)}
              className="w-full"
            />
            <Button onClick={handleConfirm} disabled={!inputLink.trim()} className="w-full">
              確認提交設計連結
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
