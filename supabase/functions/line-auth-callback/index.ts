import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAndVerifyLineOAuthState } from "../_shared/line-oauth-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINE_CHANNEL_ID = "2008793012";
const N8N_WEBHOOK_URL = "https://tjcookies.app.n8n.cloud/webhook/line";
const SITE_URL = "https://tjcookies.com.tw";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // signed: user_id|order_id|exp|sig
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[line-auth-callback] Received callback with code:", code ? "present" : "missing");
    console.log("[line-auth-callback] State present:", Boolean(state));

    if (error) {
      console.error("[line-auth-callback] LINE login error:", error, errorDescription);
      return Response.redirect(`${SITE_URL}/?error=line_login_failed`, 302);
    }

    if (!code || !state) {
      console.error("[line-auth-callback] Missing code or state");
      return Response.redirect(`${SITE_URL}/?error=missing_params`, 302);
    }

    const LINE_CHANNEL_SECRET = Deno.env.get("LINE_CHANNEL_SECRET");
    if (!LINE_CHANNEL_SECRET) {
      console.error("[line-auth-callback] LINE_CHANNEL_SECRET not configured");
      return Response.redirect(`${SITE_URL}/?error=config_error`, 302);
    }

    const parsedState = await parseAndVerifyLineOAuthState(LINE_CHANNEL_SECRET, state);
    if (!parsedState) {
      console.error("[line-auth-callback] Invalid or expired OAuth state");
      return Response.redirect(`${SITE_URL}/?error=invalid_state`, 302);
    }
    const { userId, orderId } = parsedState;
    console.log("[line-auth-callback] Verified userId:", userId, "orderId:", orderId);

    // Get the redirect URI (this edge function URL)
    const redirectUri = `https://akrxbdoxiopiubksgcrl.supabase.co/functions/v1/line-auth-callback`;

    // Step 1: Exchange code for access token
    console.log("[line-auth-callback] Exchanging code for token...");
    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error("[line-auth-callback] Token exchange failed:", tokenError);
      return Response.redirect(`${SITE_URL}/?error=token_exchange_failed`, 302);
    }

    const tokenData = await tokenResponse.json();
    console.log("[line-auth-callback] Token received successfully");

    // Step 2: Get user profile using access token
    console.log("[line-auth-callback] Fetching LINE user profile...");
    const profileResponse = await fetch("https://api.line.me/v2/profile", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      const profileError = await profileResponse.text();
      console.error("[line-auth-callback] Profile fetch failed:", profileError);
      return Response.redirect(`${SITE_URL}/?error=profile_fetch_failed`, 302);
    }

    const profileData = await profileResponse.json();
    const lineUserId = profileData.userId;
    console.log("[line-auth-callback] LINE user ID:", lineUserId);

    // Step 3: Check if user is a friend of the LINE Official Account
    console.log("[line-auth-callback] Checking friendship status...");
    let isFriend = false;
    try {
      const friendshipResponse = await fetch("https://api.line.me/friendship/v1/status", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (friendshipResponse.ok) {
        const friendshipData = await friendshipResponse.json();
        isFriend = friendshipData.friendFlag === true;
        console.log("[line-auth-callback] Friendship status:", isFriend ? "is friend" : "not friend");
      } else {
        console.warn("[line-auth-callback] Failed to check friendship status:", await friendshipResponse.text());
      }
    } catch (friendshipError) {
      console.error("[line-auth-callback] Friendship check error:", friendshipError);
    }

    // Step 4: Update user_log_in with line_user_id (only after signed state + order ownership)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: ownedOrder, error: ownershipError } = await supabase
      .from("orders")
      .select("id, user_id")
      .eq("id", orderId)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownershipError || !ownedOrder) {
      console.error("[line-auth-callback] Order ownership check failed:", ownershipError);
      return Response.redirect(`${SITE_URL}/?error=order_mismatch`, 302);
    }

    // Get user name for the notification
    const { data: userData } = await supabase.from("user_log_in").select("name").eq("id", userId).single();

    const { error: updateError } = await supabase
      .from("user_log_in")
      .update({ line_user_id: lineUserId })
      .eq("id", userId);

    // Track if LINE was already linked (for redirect message)
    let lineAlreadyLinked = false;

    if (updateError) {
      // Check if it's a duplicate key error (LINE already linked to another account)
      if (updateError.code === "23505") {
        console.warn("[line-auth-callback] LINE user_id already linked to another account, continuing...");
        lineAlreadyLinked = true;
      } else {
        console.error("[line-auth-callback] Failed to update user:", updateError);
        return Response.redirect(`${SITE_URL}/?error=update_failed`, 302);
      }
    } else {
      console.log("[line-auth-callback] Successfully linked LINE account for user:", userId);
    }

    // Step 5: If user is NOT a friend and has an orderId, redirect to add-friend page
    if (!isFriend && orderId) {
      console.log("[line-auth-callback] User is not a friend, redirecting to add-friend page...");
      return Response.redirect(`${SITE_URL}/add-line-friend?orderId=${orderId}&userId=${userId}`, 302);
    }
    // Step 6: Send order notification for the owned order only
    if (orderId) {
      console.log("[line-auth-callback] Processing order notification for order:", orderId);

      // Query order details (bound to owning user)
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(
          "id, order_status, payment_step, subtotal, expected_pickup_date, notes, total_amount, shipping_fee, shipping_way, who_receive, Email, user_id",
        )
        .eq("id", orderId)
        .eq("user_id", userId)
        .single();

      if (orderError) {
        console.error("[line-auth-callback] Failed to fetch order:", orderError);
      } else if (orderData) {
        // Query order items
        const { data: orderItems, error: itemsError } = await supabase
          .from("order_items")
          .select("product_id, product_name, quantity")
          .eq("order_id", orderId);

        if (itemsError) {
          console.error("[line-auth-callback] Failed to fetch order items:", itemsError);
        }

        // Fetch products.name (Chinese) from products table
        const productIds = Array.from(new Set((orderItems ?? []).map((i) => i.product_id).filter(Boolean)));

        const productNameById = new Map<string, string>();

        if (productIds.length > 0) {
          const { data: productsData, error: productsError } = await supabase
            .from("products")
            .select("id, name")
            .in("id", productIds);

          if (productsError) {
            console.error("[line-auth-callback] Failed to fetch products:", productsError);
          }

          (productsData ?? []).forEach((p: { id?: string; name?: string | null }) => {
            if (p?.id) productNameById.set(p.id, p.name ?? "");
          });
        }

        // Prefer products.name (Chinese) if available
        const productSummary = (orderItems ?? [])
          .map((item) => {
            const displayName = productNameById.get(item.product_id) || item.product_name || item.product_id;
            return `${displayName} x${item.quantity}`;
          })
          .join("、");

        console.log("[line-auth-callback] Product summary:", productSummary);

        // Create system_events record
        const systemEventPayload = {
          order_id: orderId,
          order_status: orderData.order_status || "awaiting_payment",
          payment_step: orderData.payment_step || "pending",
          line_user_id: lineUserId,
          user_name: userData?.name || profileData.displayName || "顧客",
          product_summary: productSummary,
          // n8n 端若用舊欄位名稱（拼寫）也能吃到
          product_summury: productSummary,
          expected_pickup_date: orderData.expected_pickup_date,
          notes: orderData.notes,
          subtotal: orderData.subtotal,
          total_amount: orderData.total_amount,
          shipping_fee: orderData.shipping_fee,
          shipping_way: orderData.shipping_way,
          who_receive: orderData.who_receive,
          customer_email: orderData.Email || null, // 用戶填入的 Email
          action_type: "new_order",
          status_message: "訂單已建立，等待付款",
        };

        const { data: eventData, error: eventError } = await supabase
          .from("system_events")
          .insert({
            source: "system",
            event_type: "order_status_update",
            ref_id: orderId,
            payload: systemEventPayload,
            sent_to_n8n: false,
          })
          .select()
          .single();

        if (eventError) {
          console.error("[line-auth-callback] Failed to create system_event:", eventError);
        } else {
          console.log("[line-auth-callback] Created system_event:", eventData?.id);

          // Send n8n webhook
          try {
            console.log("[line-auth-callback] Sending n8n webhook...");
            const n8nPayload = {
              source: "system",
              event_type: "order_status_update",
              ref_id: orderId,
              // 與 update-order-status 統一：主要資料放在 payload 內
              payload: systemEventPayload,
              // 兼容：保留原本扁平欄位，避免既有 n8n workflow 壞掉
              ...systemEventPayload,
            };

            const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(n8nPayload),
            });

            console.log("[line-auth-callback] n8n response status:", n8nResponse.status);

            // Update system_events with n8n response
            await supabase
              .from("system_events")
              .update({
                sent_to_n8n: true,
                n8n_response_status: n8nResponse.status,
              })
              .eq("id", eventData?.id);
          } catch (n8nError) {
            console.error("[line-auth-callback] n8n webhook error:", n8nError);
          }
        }
      }
    }

    // Redirect back to member page with success (user is already a friend)
    const redirectMsg = lineAlreadyLinked ? "line_already_linked" : "line_linked=success";
    return Response.redirect(`${SITE_URL}/member?tab=pending&${redirectMsg}`, 302);
  } catch (error) {
    console.error("[line-auth-callback] Unexpected error:", error);
    return Response.redirect(`${SITE_URL}/?error=unexpected`, 302);
  }
});
