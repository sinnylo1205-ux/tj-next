import { Card } from "@/components/ui/card";
import { Mail, Phone, MapPin, Clock, MessageCircle } from "lucide-react";
import { getFullUrl, SITE_CONFIG } from "@/lib/site";
import type { Metadata } from "next";
import { TrackedLineLink } from "@/components/TrackedLineLink";

export const metadata: Metadata = {
  title: "聯絡我們｜T&J 客製化甜點",
  description:
    "聯繫 T&J 客製化甜點，電話：02-2918-3981，Email：tj.tjump@gmail.com，工作室地址：新北市新店區博愛街25巷3號1樓，週一至週五 09:00-18:00 採預約制。",
  alternates: { canonical: getFullUrl("/contact") },
  openGraph: {
    title: "聯絡我們｜T&J 客製化甜點",
    description: "聯繫 T&J 客製化甜點，週一至週五 09:00-18:00 採預約制。",
    url: getFullUrl("/contact"),
    images: [{ url: SITE_CONFIG.OG_IMAGE }],
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] py-12 bg-background">
      <div className="container">
        <div className="text-center mb-12">
          <h1 className="mb-4 text-ink">聯絡我們</h1>
          <p className="text-ink-muted text-lg">有任何問題或需求，歡迎隨時與我們聯繫</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <div className="space-y-6">
            <Card className="p-6" style={{ boxShadow: "var(--elev-card)" }}>
              <h2 className="mb-6 text-ink">聯絡資訊</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-1">官方 LINE</p>
                    <TrackedLineLink
                      href="https://lin.ee/lFsTJ6G"
                      target="_blank"
                      rel="noopener noreferrer"
                      position="contact"
                      className="text-brand-600 hover:underline break-all"
                    >
                      https://lin.ee/lFsTJ6G
                    </TrackedLineLink>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-1">電子郵件</p>
                    <a href="mailto:tj.tjump@gmail.com" className="text-brand-600 hover:underline">
                      tj.tjump@gmail.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-1">聯絡電話</p>
                    <a href="tel:0229183981" className="text-brand-600 hover:underline">
                      0229183981
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-1">工作室地址</p>
                    <p className="text-ink-muted">231新北市新店區博愛街25巷3號1樓</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-brand-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-1">營業時間</p>
                    <p className="text-ink-muted">週一至週五 09:00 - 18:00</p>
                    <p className="text-ink-muted text-sm">（採預約制）</p>
                  </div>
                </div>
              </div>
            </Card>
            <Card className="p-6 bg-brand-50" style={{ boxShadow: "var(--elev-card)" }}>
              <h3 className="mb-3 text-ink">回覆時間</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                我們會在收到您的訊息後 24 小時內回覆。若您需要緊急協助，請直接撥打電話聯繫我們。
              </p>
            </Card>
          </div>
          <Card className="p-6" style={{ boxShadow: "var(--elev-card)" }}>
            <h2 className="mb-6 text-ink">線上詢問</h2>
            <div className="rounded-lg overflow-hidden" style={{ height: "800px" }}>
              <iframe
                src="https://docs.google.com/forms/d/e/1FAIpQLScrt3q-K9zGyYLxzJGoK0HpYuqy1qDrtHuL52_5QjeExaB3tw/viewform?embedded=true"
                width="100%"
                height="100%"
                frameBorder={0}
                marginHeight={0}
                marginWidth={0}
                title="聯絡我們表單"
                loading="eager"
              >
                載入中…
              </iframe>
            </div>
            <p className="mt-4 text-sm text-ink-muted leading-relaxed">
              若嵌入表單顯示「拒絕連線 / 需要允許 Cookie」，通常是因為瀏覽器阻擋第三方 Cookie
              或隱私設定所致。你也可以改用新視窗開啟：
              <a
                href="https://docs.google.com/forms/d/e/1FAIpQLScrt3q-K9zGyYLxzJGoK0HpYuqy1qDrtHuL52_5QjeExaB3tw/viewform"
                target="_blank"
                rel="noreferrer"
                className="ml-1 text-brand-600 hover:underline"
              >
                點此填寫表單
              </a>
              。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
