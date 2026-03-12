import { Loader2 } from "lucide-react";

export default function BlogLoading() {
  return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
