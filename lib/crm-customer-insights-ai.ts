import { z } from "zod";

export const crmInsightsSchema = z.object({
  interested_products: z.array(z.string()).default([]),
  last_ordered_products: z.array(z.string()).default([]),
  purchase_motivation: z.string().default(""),
  usage_occasion: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  rationale_zh: z.string().default(""),
  suggested_tag: z.enum(["緊急", "待處理", "已下單"]).nullable().default(null),
  recommended_products: z.array(z.string()).default([]),
  suggested_send_window: z.string().default(""),
});

export type CrmInsights = z.infer<typeof crmInsightsSchema>;

export const crmMessageDraftSchema = z.object({
  draft_text: z.string().min(1),
  tone: z.string().default("溫暖、專業"),
  objective: z.string().default("回購關懷"),
});

export type CrmMessageDraft = z.infer<typeof crmMessageDraftSchema>;

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
  const hasUrgent =
    /急|趕|今天|明天|最快|立刻|馬上|deadline|截止/i.test(latestText) ||
    /急|趕|今天|明天|最快|立刻|馬上|deadline|截止/i.test(userTexts.join(" "));

  const suggested_tag: CrmInsights["suggested_tag"] = hasUrgent
    ? "緊急"
    : orderFact.order_count > 0
      ? "已下單"
      : "待處理";

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
  if (!res.ok) {
    throw new Error(`OpenAI 請求失敗: ${txt.slice(0, 500)}`);
  }
  const parsed = JSON.parse(txt) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = parsed.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("OpenAI 回傳空內容");
  return JSON.parse(content) as T;
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
    "你是電商 CRM 助理。請只回傳 JSON 物件，不要 markdown。語言使用繁體中文。";
  const userPrompt = JSON.stringify(
    {
      task: "分析單一客戶，萃取有用 CRM 洞察",
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
      allowed_tags: ["緊急", "待處理", "已下單", null],
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
}): Promise<{ draft: CrmMessageDraft; model: string }> {
  const model = process.env.OPENAI_CRM_MODEL?.trim() || "gpt-4o-mini";
  const objective = params.objective?.trim() || "回購關懷";
  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    const summary = params.insights.recommended_products.join("、") || "熱門品項";
    return {
      model: "fallback-rule",
      draft: {
        draft_text: `您好，我們看到您之前對 ${summary} 有興趣，最近若有送禮或活動需求，我們可以協助您快速安排。若方便我可先幫您整理本週可出貨時段與建議組合。`,
        tone: "溫暖、專業",
        objective,
      },
    };
  }

  const systemPrompt =
    "你是品牌 CRM 文案助理，撰寫 LINE 短訊。請回傳 JSON：draft_text,tone,objective。避免過度銷售，語氣真誠。";
  const userPrompt = JSON.stringify(
    {
      line_user_id: params.lineUserId,
      objective,
      insights: params.insights,
      order_fact: params.orderFact,
      constraints: {
        max_chars: 180,
        must_include: ["關懷語氣", "下一步邀請"],
      },
    },
    null,
    2,
  );
  const raw = await callOpenAiJson<Record<string, unknown>>({ systemPrompt, userPrompt, model });
  return { draft: crmMessageDraftSchema.parse(raw), model };
}
