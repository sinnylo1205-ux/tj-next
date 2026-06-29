import { NextRequest, NextResponse } from "next/server";

/**
 * 綠界 OrderResultURL 接收端。
 * 綠界在消費者付款完成後會以 POST (application/x-www-form-urlencoded) 導回此網址，
 * 若導回首頁 / 則 Next 只處理 GET，會導致 405 或無法取得參數而顯示「表單已失效」。
 * 此 API 接受 POST 後以 302 導向首頁，首頁再查詢自己的訂單狀態確認付款是否真的完成。
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const rtnCode = (formData.get("RtnCode") ?? formData.get("rtnCode"))?.toString() ?? "";
    const rtnMsg = (formData.get("RtnMsg") ?? formData.get("rtnMsg"))?.toString() ?? "";

    const origin = request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
      : request.nextUrl.origin;
    const baseUrl = origin || "https://tjcookies.com.tw";

    const params = new URLSearchParams();
    if (rtnCode) params.set("creditCardPayment", rtnCode === "1" ? "success" : "failed");
    if (rtnCode && rtnCode !== "1" && rtnMsg) params.set("message", rtnMsg);

    const redirectUrl = params.toString() ? `${baseUrl}/?${params.toString()}` : baseUrl;

    return NextResponse.redirect(redirectUrl, 302);
  } catch (e) {
    console.error("[ecpay-order-result] POST parse error:", e);
    const origin = request.headers.get("x-forwarded-host")
      ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
      : request.nextUrl.origin;
    return NextResponse.redirect(origin || "https://tjcookies.com.tw", 302);
  }
}
