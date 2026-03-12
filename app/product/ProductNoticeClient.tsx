"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { format, addDays, isSameDay, isWithinInterval, getDay } from "date-fns";
import { CUSTOMIZER_PATHS } from "@/lib/product-notice-url";

export interface ProductNoticeData {
  product_id: string;
  preserve_info: string | null;
  consume_info: string | null;
  price_min: number | null;
  min_order_qty: number | null;
  customize_item: string[] | null;
  customize_pack: string[] | null;
  size: string | null;
  ingredient: string | null;
  allergy: string | null;
}

interface ProductNoticeClientProps {
  productId: string;
  productNotice: ProductNoticeData;
  productName: string | null;
  productImageUrl: string | null;
}

export function ProductNoticeClient({
  productId,
  productNotice,
  productName,
  productImageUrl,
}: ProductNoticeClientProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showUrgentDialog, setShowUrgentDialog] = useState(false);
  const [showMinOrderDialog, setShowMinOrderDialog] = useState(false);
  const [showDateAlert, setShowDateAlert] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDateOnly = new Date(date);
    selectedDateOnly.setHours(0, 0, 0, 0);
    const fourteenDaysLater = addDays(today, 14);
    const isUrgent =
      isSameDay(selectedDateOnly, today) ||
      isWithinInterval(date, { start: addDays(today, 1), end: fourteenDaysLater });
    if (isUrgent) setShowUrgentDialog(true);
    setSelectedDate(date);
    if (typeof window !== "undefined") localStorage.setItem("expected_pickup_date", format(date, "yyyy-MM-dd"));
  };

  const getShippingInfo = () => {
    if (!selectedDate) return null;
    const dayOfWeek = getDay(selectedDate);
    if (dayOfWeek === 0) return "您選擇週日取件，僅提供專件配送服務喔！（運費650元，僅限雙北地區）";
    if (dayOfWeek === 6) return "您選擇的取件時間，可選擇黑貓宅配（240元）、專件配送（650元）等配送方式喔";
    return "您選擇的取件時間，可選擇黑貓宅配（240元）、專件配送（650元）、自取...等幾種取貨方式喔！（注意：奶油杯子蛋糕不建議宅配喔，建議專件配送或自取）";
  };

  const disabledDays = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const handleEnterDesign = () => {
    if (!selectedDate) {
      setShowDateAlert(true);
      return;
    }
    setShowMinOrderDialog(true);
  };

  const handleMinOrderConfirm = () => {
    setShowMinOrderDialog(false);
    router.push(CUSTOMIZER_PATHS[productId] ?? "/order");
  };

  const displayName = productName || productId;

  return (
    <div className="min-h-screen py-8 px-4 md:px-6" style={{ backgroundColor: "#fdfbfa" }}>
      <div className="max-w-6xl mx-auto">
        <div className="rounded-t-lg p-6 mb-6 bg-transparent">
          <div className="hidden md:grid grid-cols-[120px_auto_120px] items-center gap-4">
            <div />
            <div className="text-center">
              <h1 className="text-4xl font-bold text-black">客製化訂購須知</h1>
              <p className="mt-2 text-lg text-black opacity-95">商品：{displayName}</p>
            </div>
            {productImageUrl ? (
              <div className="flex justify-center -ml-3">
                <img src={productImageUrl} alt={displayName} className="w-28 h-28 object-contain rounded-xl shadow-sm" loading="lazy" />
              </div>
            ) : (
              <div />
            )}
          </div>
          <div className="md:hidden text-center">
            <h1 className="text-3xl font-bold text-black">客製化訂購須知</h1>
            <p className="mt-2 text-base text-black opacity-95">商品：{displayName}</p>
          </div>
          {productImageUrl && (
            <div className="mt-4 flex justify-center md:hidden">
              <img src={productImageUrl} alt={displayName} className="w-32 h-32 object-contain rounded-xl shadow-sm" loading="lazy" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-6 border border-border">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">📅 預約取件時間</h2>
              <div className="p-4 rounded-lg flex justify-center" style={{ backgroundColor: "#f0e5e3" }}>
                <div className="inline-block scale-125 origin-top">
                  <Calendar
                    mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={disabledDays}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  className="rounded-md border-2 border-border bg-white p-4 pointer-events-auto"
                  modifiers={{
                    twoWeekGray: (date: Date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const fourteenDaysLater = addDays(today, 14);
                      return isWithinInterval(date, { start: today, end: fourteenDaysLater });
                    },
                  }}
                  modifiersClassNames={{
                    twoWeekGray: "!text-red-600 font-bold",
                  }}
                  />
                </div>
              </div>
              {selectedDate && (
                <div className="mt-4 space-y-3">
                  <p className="text-center text-base font-medium" style={{ color: "#8b6b68" }}>
                    已選擇：{format(selectedDate, "yyyy年MM月dd日")}
                  </p>
                  <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: "#fff5f5" }}>
                    <p className="leading-relaxed text-gray-700">{getShippingInfo()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <Tabs defaultValue="pricing" className="w-full">
              <TabsList className="w-full flex flex-wrap h-auto gap-2 bg-transparent p-0 mb-4">
                <TabsTrigger value="preservation" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  🍴保存與食用
                </TabsTrigger>
                <TabsTrigger value="size" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  📐 產品尺寸
                </TabsTrigger>
                <TabsTrigger value="ingredient" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  🧁 產品原料
                </TabsTrigger>
                <TabsTrigger value="allergy" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  ⚠️ 產品過敏原
                </TabsTrigger>
                <TabsTrigger value="pricing" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  📦最低訂購量與金額
                </TabsTrigger>
                <TabsTrigger value="customization" className="flex-1 min-w-[140px] px-4 py-3 rounded-lg text-sm font-semibold data-[state=active]:bg-[#ffc3c3] data-[state=active]:text-black bg-white shadow-sm border border-border">
                  🎨客製化設計導覽
                </TabsTrigger>
              </TabsList>

              <div className="bg-white rounded-xl shadow-md p-6 min-h-[300px] border border-border">
                <TabsContent value="preservation" className="mt-0 space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">保存方式：</h3>
                    <p className="leading-relaxed text-gray-700">{productNotice.preserve_info || "暫無資訊"}</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-3 text-lg">食用建議：</h3>
                    <p className="leading-relaxed text-gray-700">{productNotice.consume_info || "暫無資訊"}</p>
                  </div>
                </TabsContent>
                <TabsContent value="size" className="mt-0">
                  <h3 className="font-semibold mb-3 text-lg">📐 產品尺寸</h3>
                  <p className="leading-relaxed text-gray-700">{productNotice.size || "暫無資訊"}</p>
                </TabsContent>
                <TabsContent value="ingredient" className="mt-0">
                  <h3 className="font-semibold mb-3 text-lg">🧁 產品原料</h3>
                  <p className="leading-relaxed text-gray-700">{productNotice.ingredient || "暫無資訊"}</p>
                </TabsContent>
                <TabsContent value="allergy" className="mt-0">
                  <h3 className="font-semibold mb-3 text-lg">⚠️ 產品過敏原</h3>
                  <p className="leading-relaxed text-gray-700">{productNotice.allergy || "暫無資訊"}</p>
                </TabsContent>
                <TabsContent value="pricing" className="mt-0">
                  <h3 className="font-semibold mb-3 text-lg">最低訂購量與起售價</h3>
                  <p className="text-2xl font-bold" style={{ color: "#8b6b68" }}>
                    NT${productNotice.price_min ?? "—"} / {productNotice.min_order_qty ?? "—"}顆起
                  </p>
                </TabsContent>
                <TabsContent value="customization" className="mt-0">
                  <h3 className="font-semibold mb-4 text-lg">客製化設計導覽</h3>
                  <Accordion type="single" collapsible className="space-y-3">
                    <AccordionItem value="item" className="border border-border rounded-lg">
                      <AccordionTrigger className="px-4 py-3 hover:bg-pink-50">
                        <span className="text-base font-semibold">甜點本身客製化項目</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 py-3">
                        {productNotice.customize_item?.length ? (
                          <ul className="space-y-2">
                            {productNotice.customize_item.map((i, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-pink-400 mt-0.5">●</span>
                                <span className="text-sm">{i}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500 text-sm">暫無資訊</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="pack" className="border border-border rounded-lg">
                      <AccordionTrigger className="px-4 py-3 hover:bg-pink-50">
                        <span className="text-base font-semibold">包裝客製化項目</span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 py-3">
                        {productNotice.customize_pack?.length ? (
                          <ul className="space-y-2">
                            {productNotice.customize_pack.map((i, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-pink-400 mt-0.5">●</span>
                                <span className="text-sm">{i}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500 text-sm">暫無資訊</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>

        <div className="mt-8 flex flex-row justify-center items-center gap-4">
          <Link href="/order">
            <Button variant="outline" size="lg" className="text-base px-6 py-5 border-2 bg-white hover:bg-gray-50" style={{ borderColor: "#ffc0ba", color: "#8b6b68" }}>
              返回商品列表
            </Button>
          </Link>
          <Button
            size="lg"
            className="text-white px-12 py-6 rounded-full text-xl font-bold shadow-lg transition-all hover:opacity-90 bg-primary hover:bg-primary/90"
            onClick={handleEnterDesign}
          >
            進入設計
          </Button>
        </div>
      </div>

      <AlertDialog open={showUrgentDialog} onOpenChange={setShowUrgentDialog}>
        <AlertDialogContent className="bg-white/90 backdrop-blur-sm max-w-lg">
          <AlertDialogTitle className="text-2xl font-bold">提醒</AlertDialogTitle>
          <AlertDialogDescription className="text-lg leading-relaxed">
            您預約的是兩週內的急件，是否已和店家取得聯絡，確保可以取件？
            <strong className="block mt-3 text-xl">店家電話：0229183981</strong>
          </AlertDialogDescription>
          <AlertDialogFooter className="flex gap-4">
            <Button onClick={() => setShowUrgentDialog(false)} className="flex-1 text-lg py-6" variant="default">是，我已聯絡</Button>
            <Button onClick={() => setShowUrgentDialog(false)} className="flex-1 text-lg py-6" variant="outline">還沒，我現在去聯絡</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDateAlert} onOpenChange={setShowDateAlert}>
        <AlertDialogContent className="bg-white/90 backdrop-blur-sm max-w-md rounded-2xl">
          <AlertDialogTitle className="flex items-center gap-2 text-xl font-bold">⚠️ 請先選擇取件日期</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">請在日曆中選擇預計取件的日期後，才能進入設計流程。</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-full px-8">我知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showMinOrderDialog} onOpenChange={setShowMinOrderDialog}>
        <AlertDialogContent className="bg-white/90 backdrop-blur-sm max-w-lg">
          <AlertDialogTitle className="text-2xl font-bold">📦 最低訂購量提醒</AlertDialogTitle>
          <AlertDialogDescription className="text-lg leading-relaxed">
            此商品最低訂購量為
            <strong className="text-primary text-xl mx-1">{productNotice.min_order_qty || 1} 顆/組</strong>
            ，請確認後再進入設計。
          </AlertDialogDescription>
          <AlertDialogFooter className="flex gap-4">
            <AlertDialogCancel asChild>
              <Button className="flex-1 text-lg py-6" variant="outline">返回</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button className="flex-1 text-lg py-6" onClick={handleMinOrderConfirm}>
                我已了解，進入設計
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
