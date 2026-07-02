import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LINE_LINKED_BUYER_CLASS,
  SPECIAL_ORDER_BADGE_CLASS,
  type OrderBuyerDisplay,
} from "@/lib/order-display";

type OrderBuyerDisplayBlockProps = {
  buyer: OrderBuyerDisplay;
  /** 網站會員訂單：顯示 email 第二行 */
  memberEmail?: string | null;
  /** 手動／報價單：訂購欄位與收件人不同時的補充 */
  ordererFieldName?: string | null;
  recipientName?: string | null;
  className?: string;
  /** 詳情內聯（單行）vs 列表（多行） */
  variant?: "table" | "inline";
};

export function OrderBuyerDisplayBlock({
  buyer,
  memberEmail,
  ordererFieldName,
  recipientName,
  className,
  variant = "table",
}: OrderBuyerDisplayBlockProps) {
  const showOrdererHint =
    !buyer.linePrimary &&
    buyer.badge &&
    ordererFieldName &&
    recipientName &&
    ordererFieldName !== recipientName;

  if (buyer.showMemberAndLine && buyer.memberName && buyer.lineName) {
    return (
      <div className={cn("text-xs leading-snug", className)}>
        <span>{buyer.memberName}</span>
        {variant === "table" ? <br /> : <span className="text-muted-foreground"> · </span>}
        <span className={LINE_LINKED_BUYER_CLASS}>{buyer.lineName}</span>
        {memberEmail ? (
          <>
            <br />
            <span className="text-muted-foreground">{memberEmail}</span>
          </>
        ) : null}
      </div>
    );
  }

  if (!buyer.badge && buyer.memberName && !buyer.showMemberAndLine) {
    return (
      <div className={cn("text-xs leading-snug", className)}>
        <span>{buyer.memberName}</span>
        {memberEmail ? (
          <>
            <br />
            <span className="text-muted-foreground">{memberEmail}</span>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("text-xs leading-snug", className)}>
      <span className={cn(buyer.linePrimary && LINE_LINKED_BUYER_CLASS)}>{buyer.name}</span>
      {showOrdererHint ? (
        <>
          <br />
          <span className="text-sm text-muted-foreground">訂購欄位：{ordererFieldName}</span>
        </>
      ) : null}
      {buyer.badge ? (
        <>
          <br />
          <Badge variant="outline" className={cn("mt-0.5", SPECIAL_ORDER_BADGE_CLASS)}>
            {buyer.badge}
          </Badge>
        </>
      ) : null}
    </div>
  );
}

/** 詳情面板「訂購人」單行 */
export function OrderBuyerInline({ buyer }: { buyer: OrderBuyerDisplay }) {
  if (buyer.showMemberAndLine && buyer.memberName && buyer.lineName) {
    return (
      <>
        <span>{buyer.memberName}</span>
        <span className="text-muted-foreground"> · </span>
        <span className={LINE_LINKED_BUYER_CLASS}>{buyer.lineName}</span>
      </>
    );
  }
  return <span className={cn(buyer.linePrimary && LINE_LINKED_BUYER_CLASS)}>{buyer.name}</span>;
}
