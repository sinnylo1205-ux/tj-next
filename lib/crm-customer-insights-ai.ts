import { z } from "zod";

export const crmInsightsSchema = z.object({
  // 每個欄位都加 .catch()，避免 AI 偶爾回錯型別（例如 confidence 回字串）就讓整筆分析失敗
  interested_products: z.array(z.string()).catch([]).default([]),
  last_ordered_products: z.array(z.string()).catch([]).default([]),
  purchase_motivation: z.string().catch("").default(""),
  usage_occasion: z.string().catch("").default(""),
  confidence: z.coerce.number().min(0).max(1).catch(0.5).default(0.5),
  rationale_zh: z.string().catch("").default(""),
  suggested_tag: z.enum(["高意願", "中意願", "低意願"]).nullable().catch(null).default(null),
  recommended_products: z.array(z.string()).catch([]).default([]),
  suggested_send_window: z.string().catch("").default(""),
});

export type CrmInsights = z.infer<typeof crmInsightsSchema>;

export const crmMessageDraftSchema = z.object({
  draft_text: z.string().min(1),
  tone: z.string().default("溫暖、專業"),
  objective: z.string().default("回購關懷"),
});

export type CrmMessageDraft = z.infer<typeof crmMessageDraftSchema>;

export const crmAggregateSummarySchema = z.object({
  common_questions: z.array(z.string()).default([]),
  best_lead_profile: z.string().default(""),
  weekly_actions: z.array(z.string()).default([]),
});

export type CrmAggregateSummary = z.infer<typeof crmAggregateSummarySchema>;

type ChatLogInput = {
  received_at: string | null;
  user_text: string | null;
  ai_reply: string | null;
  admin_reply: string | null;
};

type OrderFactInput = {
  order_count: number;
  lifetime_value: number;
  last_pickup_date: string | null;
  recent_products: string[];
};

function fallbackInsights(chatLogs: ChatLogInput[], orderFact: OrderFactInput): CrmInsights {
  const userTexts = chatLogs
    .map((r) => r.user_text?.trim())
    .filter((v): v is string => Boolean(v));
  const latestText = userTexts[userTexts.length - 1] || "";
  const allText = userTexts.join(" ");
  // 高意願訊號：談到價格/數量/交期/付款/客製細節/明確想訂
  const highIntent =
    /價格|多少錢|報價|數量|幾個|幾盒|交期|什麼時候|何時|急|趕|付款|匯款|訂購|下單|想訂|怎麼買|客製|訂做/i.test(
      allText,
    );
  // 中意願訊號：在比較、詢問通用問題、表達興趣但未談細節
  const midIntent = /可以客製|有沒有|可不可以|想問|請問|介紹|口味|款式|參考/i.test(allText);

  const suggested_tag: CrmInsights["suggested_tag"] = highIntent
    ? "高意願"
    : midIntent
      ? "中意願"
      : "低意願";

  return {
    interested_products: orderFact.recent_products.slice(0, 3),
    last_ordered_products: orderFact.recent_products.slice(0, 3),
    purchase_motivation: latestText || "尚待補充",
    usage_occasion: "尚待補充",
    confidence: 0.45,
    rationale_zh: "未啟用 OpenAI，使用規則式估計結果。",
    suggested_tag,
    recommended_products: orderFact.recent_products.slice(0, 2),
    suggested_send_window: "平日 11:00-13:00 或 19:00-21:00",
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 可重試的狀態碼：429 限流、5xx 暫時性錯誤 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function callOpenAiJson<T>({
  systemPrompt,
  userPrompt,
  model,
}: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}): Promise<T> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("缺少環境變數 OPENAI_API_KEY");

  const maxAttempts = 4;
  let lastErr = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const txt = await res.text();
    if (res.ok) {
      const parsed = JSON.parse(txt) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = parsed.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error("OpenAI 回傳空內容");
      return JSON.parse(content) as T;
    }

    lastErr = `OpenAI 請求失敗(${res.status}): ${txt.slice(0, 500)}`;
    // 不可重試（401 key 錯、400 參數錯等）直接丟出
    if (!isRetryableStatus(res.status) || attempt === maxAttempts) {
      throw new Error(lastErr);
    }
    // 優先採用 Retry-After，否則指數退避 + 抖動
    const retryAfterSec = Number(res.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : 2 ** (attempt - 1) * 1000 + Math.floor(Math.random() * 400);
    await sleep(backoffMs);
  }
  throw new Error(lastErr || "OpenAI 請求失敗");
}

export async function generateCrmInsights(params: {
  lineUserId: string;
  chatLogs: ChatLogInput[];
  orderFact: OrderFactInput;
}): Promise<{ insights: CrmInsights; model: string }> {
  const model = process.env.OPENAI_CRM_MODEL?.trim() || "gpt-4o-mini";
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return { insights: fallbackInsights(params.chatLogs, params.orderFact), model: "fallback-rule" };
  }

  const systemPrompt =
    "你是電商 CRM 助理。請只回傳 JSON 物件，不要 markdown。語言使用繁體中文。" +
    "suggested_tag 代表『下單意願』：高意願=已談到價格/數量/交期/付款/客製細節或明確想訂；" +
    "中意願=有興趣、在比較或詢問通用問題但未談細節；低意願=隨口詢問、離購買很遠。" +
    "請只依對話內容判斷意願，不要把『是否已成交』當成意願標籤。";
  const userPrompt = JSON.stringify(
    {
      task: "分析單一客戶，萃取有用 CRM 洞察，並判斷其下單意願",
      required_keys: [
        "interested_products",
        "last_ordered_products",
        "purchase_motivation",
        "usage_occasion",
        "confidence",
        "rationale_zh",
        "suggested_tag",
        "recommended_products",
        "suggested_send_window",
      ],
      allowed_tags: ["高意願", "中意願", "低意願", null],
      line_user_id: params.lineUserId,
      chat_logs: params.chatLogs,
      order_fact: params.orderFact,
    },
    null,
    2,
  );
  const raw = await callOpenAiJson<Record<string, unknown>>({ systemPrompt, userPrompt, model });
  return { insights: crmInsightsSchema.parse(raw), model };
}

export async function generateCrmMessageDraft(params: {
  lineUserId: string;
  insights: CrmInsights;
  orderFact: OrderFactInput;
  objective?: string;
  extraContext?: Record<string, unknown>;
}): Promise<{ draft: CrmMessageDraft; model: string }> {
  const model = process.env.OPENAI_CRM_MODEL?.trim() || "gpt-4o-mini";
  const objective = params.objective?.trim() || "回購關懷";
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const isWakeup = objective.includes("喚醒") || objective.includes("訂後關懷");
  if (!hasKey) {
    const summary = params.insights.recommended_products.join("、") || "熱門品項";
    const rawName =
      typeof params.extraContext?.customer_name === "string" && params.extraContext.customer_name.trim()
        ? params.extraContext.customer_name.trim()
        : "";
    const greeting = rawName && rawName !== "您好" ? `${rawName}您好～` : "您好～";
    const occasions = Array.isArray(params.extraContext?.mentioned_occasions_hint)
      ? (params.extraContext!.mentioned_occasions_hint as string[]).filter(Boolean)
      : [];
    const occasionBit = occasions.length > 0 ? `還記得您提到的${occasions.join("、")}，希望一切順利！` : "";
    const draft_text = isWakeup
      ? `${greeting}感謝您上次選擇我們的${summary}！${occasionBit}近期若有需要，歡迎再跟我們說。`
      : `${greeting}我們看到您之前對 ${summary} 有興趣，最近若有送禮或活動需求，我們可以協助您快速安排。若方便我可先幫您整理本週可出貨時段與建議組合。`;
    return {
      model: "fallback-rule",
      draft: {
        draft_text,
        tone: "溫暖、專業",
        objective,
      },
    };
  }

  const systemPrompt = isWakeup
    ? "你是品牌 CRM 文案助理，撰寫訂後關懷短訊（LINE 或 Email 皆可）。請回傳 JSON：draft_text,tone,objective。" +
      "語氣真誠感謝，避免過度銷售。" +
      "開頭稱呼一律「{姓名}您好～」，禁止「親愛的」。無姓名則用「您好～」。" +
      "務必閱讀 customer_line_messages／對話紀錄：若客人提過生日、婚禮、收涎、公司活動、送禮場合等，請自然融入關心（不要生硬列表）。" +
      "感謝時必須帶「上次」，例如「感謝您上次選擇我們的{品項}」（取件約 14 天後關心）；可提品項名稱，但絕對不要提到訂購數量（如幾個、幾盒、×N）。" +
      "必須自然帶入：感謝上次訂購、邀請再次訂購。" +
      "禁止寫「希望您喜歡這些美味的產品」「期待聽到您的回饋」「若有任何回饋」「不知道實際體驗如何」這類套話。"
    : "你是品牌 CRM 文案助理，撰寫 LINE 短訊。請回傳 JSON：draft_text,tone,objective。避免過度銷售，語氣真誠。開頭稱呼用「{姓名}您好～」，不要用「親愛的」。";
  const userPrompt = JSON.stringify(
    {
      line_user_id: params.lineUserId,
      objective,
      insights: params.insights,
      order_fact: {
        ...params.orderFact,
        // 喚醒文案不強調訂單筆數／金額，避免模型扯到數量
        order_count: undefined,
        lifetime_value: undefined,
      },
      extra_context: params.extraContext ?? null,
      constraints: {
        max_chars: isWakeup ? 240 : 180,
        greeting_format: "{姓名}您好～",
        thank_you_format: "感謝您上次選擇我們的{品項}",
        forbid: isWakeup
          ? [
              "親愛的",
              "訂購數量",
              "幾個",
              "幾盒",
              "×",
              "數量",
              "希望您喜歡這些美味的產品",
              "期待聽到您的回饋",
              "若有任何回饋",
              "不知道實際體驗如何",
            ]
          : ["親愛的"],
        must_include: isWakeup
          ? ["感謝您上次…", "若有對話活動則自然關心", "邀請再次訂購"]
          : ["關懷語氣", "下一步邀請"],
        product_mention: isWakeup ? "只寫品項名稱，不寫數量；感謝句必須含「上次」" : undefined,
      },
    },
    null,
    2,
  );
  const raw = await callOpenAiJson<Record<string, unknown>>({ systemPrompt, userPrompt, model });
  return { draft: crmMessageDraftSchema.parse(raw), model };
}

/**
 * 將「全店聚合統計」交給 AI 做文字總結（常見問題、最可能下單客特徵、本週建議行動）。
 * stats 應為已在程式端算好的精簡統計，避免丟入大量原始對話，控成本。
 */
export async function generateCrmAggregateSummary(params: {
  stats: Record<string, unknown>;
}): Promise<{ summary: CrmAggregateSummary; model: string }> {
  const model = process.env.OPENAI_CRM_MODEL?.trim() || "gpt-4o-mini";
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    return {
      model: "fallback-rule",
      summary: {
        common_questions: ["（未啟用 OpenAI，無法產生文字洞察）"],
        best_lead_profile: "請設定 OPENAI_API_KEY 後重新分析。",
        weekly_actions: ["優先聯繫『高意願未成交』名單"],
      },
    };
  }

  const systemPrompt =
    "你是電商 CRM 分析師。根據提供的『全店聚合統計』，用繁體中文輸出 JSON：" +
    "common_questions(最常見的問題/需求類型，最多5項字串)、" +
    "best_lead_profile(最可能下單客戶的共同特徵，2-3 句)、" +
    "weekly_actions(本週建議行動，最多5項字串)。只回傳 JSON，不要 markdown。";
  const userPrompt = JSON.stringify({ task: "全店 CRM 聚合洞察", stats: params.stats }, null, 2);
  const raw = await callOpenAiJson<Record<string, unknown>>({ systemPrompt, userPrompt, model });
  return { summary: crmAggregateSummarySchema.parse(raw), model };
}
