import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface EatReservation {
  id: number;
  name: string | null;
  email: string | null;
  phone: number | null;
  address: string | null;
  eat_item: Json | null;
  tranfer_5: number | null;
  status: string | null;
  created_at: string;
  line_user_id: string | null;
}

const AdminEatReservationPanel = () => {
  const [reservations, setReservations] = useState<EatReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [editLineUserIds, setEditLineUserIds] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const fetchReservations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("eat_reservation")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch eat_reservation error:", error);
      toast({ title: "載入預約資料失敗", variant: "destructive" });
    } else {
      setReservations(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchReservations(); }, []);

  const handleApprove = async (reservation: EatReservation) => {
    setProcessingId(reservation.id);
    try {
      const updatedLineUserId = editLineUserIds[reservation.id] ?? reservation.line_user_id ?? "";

      // 1. Update status and line_user_id
      const { error: updateError } = await supabase
        .from("eat_reservation")
        .update({ status: "reply", line_user_id: updatedLineUserId || null })
        .eq("id", reservation.id);

      if (updateError) throw updateError;

      // 2. Trigger webhook with updated line_user_id
      const payload = { ...reservation, line_user_id: updatedLineUserId };
      const response = await fetch("https://tjcookies.app.n8n.cloud/webhook/eat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn("Webhook response not ok:", response.status);
      }

      toast({ title: "✅ 已排入製作/試吃" });
      fetchReservations();
    } catch (err: any) {
      console.error("Approve error:", err);
      toast({ title: "操作失敗", description: err.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const asked = reservations.filter(r => r.status === "asked" || !r.status);
  const replied = reservations.filter(r => r.status === "reply");

  const renderEatItems = (items: Json | null) => {
    if (!items) return "-";
    if (Array.isArray(items)) {
      return items.map((item, i) => (
        <div key={i} className="text-sm">{typeof item === "string" ? item : JSON.stringify(item)}</div>
      ));
    }
    return <span className="text-sm">{JSON.stringify(items)}</span>;
  };

  const ReservationCard = ({ r, showAction }: { r: EatReservation; showAction: boolean }) => (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-semibold text-lg">{r.name || "未填姓名"}</p>
            <p className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-TW")}</p>
          </div>
          {showAction && (
            <Button
              size="sm"
              onClick={() => handleApprove(r)}
              disabled={processingId === r.id}
            >
              {processingId === r.id ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-1 h-4 w-4" />
              )}
              可排入製作/試吃
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Email：</span>{r.email || "-"}</div>
          <div><span className="text-muted-foreground">電話：</span>{r.phone ?? "-"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">地址：</span>{r.address || "-"}</div>
          <div className="col-span-2"><span className="text-muted-foreground">轉帳末5碼：</span>{r.tranfer_5 ?? "-"}</div>
          <div className="col-span-2">
            <span className="text-muted-foreground">LINE User ID：</span>
            {showAction ? (
              <input
                type="text"
                className="ml-1 border rounded px-2 py-1 text-sm w-64"
                value={editLineUserIds[r.id] ?? r.line_user_id ?? ""}
                onChange={(e) => setEditLineUserIds(prev => ({ ...prev, [r.id]: e.target.value }))}
                placeholder="Uxxxxxxx..."
              />
            ) : (
              <span>{r.line_user_id || "-"}</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-sm text-muted-foreground">試吃品項：</span>
          <div className="mt-1">{renderEatItems(r.eat_item)}</div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-xl md:text-3xl font-bold mb-6">預約試吃管理</h1>
      <Tabs defaultValue="asked">
        <TabsList>
          <TabsTrigger value="asked">試吃預約詢問 ({asked.length})</TabsTrigger>
          <TabsTrigger value="reply">已排入試吃品項 ({replied.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="asked" className="space-y-4 mt-4">
          {asked.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">目前沒有新的試吃預約</p>
          ) : (
            asked.map(r => <ReservationCard key={r.id} r={r} showAction={true} />)
          )}
        </TabsContent>
        <TabsContent value="reply" className="space-y-4 mt-4">
          {replied.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">尚無已排入的試吃預約</p>
          ) : (
            replied.map(r => <ReservationCard key={r.id} r={r} showAction={false} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminEatReservationPanel;
