import { Card } from "@/components/ui/card";

const steps = [
  { number: "1", title: "選擇商品", description: "從五大類甜點中選擇您喜愛的品項", icon: "🎯" },
  { number: "2", title: "客製設計", description: "使用我們的設計工具自由配色與造型", icon: "🎨" },
  { number: "3", title: "提交需求", description: "填寫訂購表單，說明數量與交付日期", icon: "📝" },
  { number: "4", title: "確認報價", description: "我們將於 24 小時內回覆報價與製作時程", icon: "💰" },
  { number: "5", title: "完成訂單", description: "付款確認後開始製作，準時交付您的甜點", icon: "✅" },
];

export default function HowToOrderPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h1 className="mb-4 text-ink">訂購須知與流程</h1>
          <p className="text-ink-muted text-lg max-w-2xl mx-auto">只需五個簡單步驟，輕鬆完成您的客製化甜點訂購</p>
        </div>
        <div className="max-w-5xl mx-auto mb-16">
          <div className="grid md:grid-cols-5 gap-4">
            {steps.map((step, index) => (
              <Card
                key={index}
                className="p-6 text-center hover:scale-125 transition-transform duration-300"
                style={{ boxShadow: "var(--elev-card)" }}
              >
                <div className="text-4xl mb-3">{step.icon}</div>
                <div className="w-10 h-10 bg-brand-500 text-ink-inverse rounded-full flex items-center justify-center font-bold mx-auto mb-3">
                  {step.number}
                </div>
                <h3 className="mb-2 text-ink text-base">{step.title}</h3>
                <p className="text-sm text-ink-muted leading-relaxed">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
        <div className="max-w-3xl mx-auto">
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-6 text-ink">重要事項</h2>
            <ul className="space-y-4 text-ink-muted">
              <li className="flex gap-3">
                <span className="text-brand-600 font-bold">•</span>
                <span>
                  <strong className="text-ink">訂購時間：</strong>
                  建議於活動日期前 7-10 個工作天下單，以確保充足的製作時間
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-600 font-bold">•</span>
                <span>
                  <strong className="text-ink">最低訂購量：</strong>
                  各品項最低訂購量為 12 個，企業訂單可協商特殊數量
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-600 font-bold">•</span>
                <span>
                  <strong className="text-ink">付款方式：</strong>
                  支援銀行轉帳、信用卡及貨到付款（需事先確認）
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-600 font-bold">•</span>
                <span>
                  <strong className="text-ink">配送範圍：</strong>
                  大台北地區提供免費配送，其他地區運費另計
                </span>
              </li>
              <li className="flex gap-3">
                <span className="text-brand-600 font-bold">•</span>
                <span>
                  <strong className="text-ink">保存期限：</strong>
                  新鮮製作的甜點建議於 3 天內食用完畢，冷藏保存
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
