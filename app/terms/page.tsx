import { Card } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container max-w-4xl">
        <div className="text-center mb-12">
          <h1 className="mb-4 text-ink">合約條款</h1>
          <p className="text-ink-muted text-lg">請詳閱以下條款，以確保雙方權益</p>
        </div>
        <div className="space-y-6">
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">一、更改訂購內容</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">1.1</span>
                <span>如需變更訂購商品品項，甲方需於出貨日前30天主動通知乙方，乙方將調整電子訂購單作為最後出貨依據。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">1.2</span>
                <span>變更訂購商品後總金額需高於或等於原訂購總金額，如低於原訂購總金額則不予退款。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">1.3</span>
                <span>如遇特殊情況需變更取貨方式、配送地點、日期，甲方需於出貨日前30天主動通知乙方；此合約得自訂購日起一年內使用，且以提前或延長乙次為限，期間甲方需主動與乙方確認提前或延期時間，且需視乙方檔期狀況調整安排，乙方將保有檔期調整權利。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">1.4</span>
                <span>如甲方未主動確認導致提前或延期期限失效，乙方將不負任何賠償責任。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">二、商品運送注意事項</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">2.1</span>
                <span>乙方收到商品後立即開箱檢查商品狀況。商品於製作、包裝時皆考量運送安全性，並全程採強化保護措施，但宅配過程仍有一定風險，如運送毀損、商品有誤或天災不可抗拒之因素，我們將於1～2個工作天製作商品並補寄送達。如有任何運送安全疑慮，建議到店親自取貨。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">2.2</span>
                <span>若因天災或其他人力無法控制之因素導致乙方無法正常出貨，甲方得向乙方申請退回已支付款項，但不得要求乙方給付任何賠償。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">2.3</span>
                <span>由甲方依據使用日期、商品保存期限、配送限制，自行審慎評估指定到貨日期，一般配送日期建議為使用日期前1～2天。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">三、甜點佈置注意事項</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.1</span>
                <span>甲方需於前30日請主動核對品項、數量、佈置日期／時間、佈置地點／位置、點交人姓名、聯繫電話。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.2</span>
                <span>如甲方未主動確認，乙方將依據訂購確認單作為出貨依據。如甲方未主動選擇品項、口味，乙方將採同品項隨機口味製作出貨。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.3</span>
                <span>甜點佈置及收場間隔兩小時。例：午宴 11:00～13:00、晚宴 17:00～19:00。如需延長佈置時間，每小時酌收1000元費用。如需調整時間，甲方須於婚禮前一週以電話聯繫告知，且以訊息或 E-mail 確認，未完成上述程序將依原合約標註時間為主。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.4</span>
                <span>乙方完成甜點佈置後將與甲方之負責點交人進行品項及數量清點，並於點收無誤後由甲方點交人簽名確認；點交後佈置道具及陳列甜點將由甲方安排人員保管，如收場時佈置道具毀損或缺件將由甲方照價賠償。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.5</span>
                <span>乙方不涉入甲方甜點佈置中之甜點運用（如：迎賓取用、婚宴使用），請甲方自行評估並告知、安排後續人員協助運用（如：裝盤）。如甜點運用方式未達成甲方原定規劃，恕不負歸責於乙方。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.6</span>
                <span>如於合約標註之收場時間後甜點尚未取用完畢，乙方將統一裝箱後，交由甲方保管人處理，乙方將不負回收或保管之責。甜點佈置所有陳列道具將於收場時由乙方全數回收，如甲方需保留現場運用，將自行支付租金及歸還運費，如歸還時道具毀損乙方將不予歸還押金。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.7</span>
                <span>33000元甜點佈置專案公版背板，及陳列裝飾物（如：羅馬柱、人造花、大型立體字……等）於收場時由乙方確認有無缺件毀損，如有上述情況需由甲方照價賠償。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">3.8</span>
                <span>42000元甜點佈置專案客製輸出背板歸甲方所有，需由甲方自行帶回處理，乙方恕不負責背板後續回收處理。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">四、產品色差注意事項</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">4.1</span>
                <span>因螢幕色光、食用色素及手工製作、拍攝角度…等因素，實品顏色與電子檔設計稿或照片將有 10%～15% 誤差，雙方皆同意商品顏色或裝飾將以完成品為主，恕不得以色差或裝飾點綴誤差作為退換貨或客訴要求。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">五、打樣、試吃</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.1</span>
                <span>甲方如需提前打樣、試吃，須於打樣需求到貨日前 15 日 提供範例圖片…等打樣資訊，乙方將於收到打樣資訊後提供報價、運費，甲方同意後需以訊息或電話回覆，並完成打樣費用及運費全額付款，之後乙方將著手進行打樣，甲方不得以任何理由取消、變更此次打樣訂單。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.2</span>
                <span>訂製客製化輸出物（如：刊頭、插卡、喜餅腰封、背板…等）最晚須於到貨日前 30 日 提供打樣資訊、範例圖片，單一輸出物限定打樣兩次，計次辦法採設計師每 Email 傳送圖檔予甲方即為乙次。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.3</span>
                <span>依前述辦法逾限定之打樣次數，每乙次加收 1000 元，乙方得依修改次數變更合約內容及尾款金額，於甲方同意後回傳 Email 始著手打樣。為保留印刷時間，取貨日前 20 日 即使未達限定打樣次數，亦不得要求微調或修正打樣。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.4</span>
                <span>訂製客製化喜餅，如甲方有指定或期待樣式須最晚於到貨日前 30 日 提供打樣資訊、範例圖片，如未提供圖片素材，乙方將依據與甲方溝通內容提供示意圖，乙方將依甲方供挑選樣式進行打樣，並於打樣後拍照傳送圖片供甲方參考。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.5</span>
                <span>如甲方需取得打樣實體，運費將由甲方自行支付。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.6</span>
                <span>打樣限定兩次，計次辦法採設計師每 Email 傳送圖檔予甲方即為乙次。依前述辦法逾限定之打樣次數，每乙次加收 1000 元，乙方得依修改次數變更合約內容及尾款金額，於甲方同意後回傳 Email 始著手打樣。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">5.7</span>
                <span>為保留製作時間，取貨日前 20 日 即使未達限定打樣次數，亦不得要求微調或修正打樣。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">六、優惠</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">6.1</span>
                <span>特定優惠專案（如：婚紗展、周年慶…等），或乙方承諾之優惠、贈品，適用於專案特惠期間或雙方協定依付款規則，完成合約簽訂及支付尾款。逾時未完成上述程序，恕不得要求以特惠專案計費或贈送商品。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-8" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-4 text-ink">七、合約爭議</h2>
            <ul className="space-y-3 text-ink-muted text-sm leading-relaxed">
              <li className="flex gap-2">
                <span className="text-brand-600 font-bold">7.1</span>
                <span>本契約若發生爭議，雙方合意由臺灣台北地方法院為第一審管轄法院。</span>
              </li>
            </ul>
          </Card>
          <Card className="p-6 bg-brand-50" style={{ boxShadow: "var(--elev-card)" }}>
            <p className="text-sm text-ink-muted leading-relaxed">以上條款如有爭議，T&J 客製化甜點保留最終解釋權。如有任何疑問，歡迎隨時聯繫我們。</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
