import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="container py-12 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-8">隱私權政策</h1>
      <p className="text-muted-foreground text-center mb-8">Privacy Policy</p>
      <Card className="mb-6">
        <CardContent className="pt-6">
          <p className="text-foreground leading-relaxed">
            歡迎您使用本網站（以下簡稱「本網站」）。我們非常重視您的個人資料與隱私權，並致力於保護您的資訊安全。以下說明本網站如何蒐集、使用及保護您的個人資料。
          </p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">一、個人資料的蒐集</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground leading-relaxed">當您使用本網站時，我們可能在您主動提供的情況下，蒐集必要的個人資料，例如：</p>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>聯絡資訊（如電子郵件）</li>
            <li>訂單或服務相關資訊（於實際交易或申請時）</li>
          </ul>
          <p className="text-foreground leading-relaxed">本網站不會在未經您同意的情況下，主動蒐集不必要的個人資料。</p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">二、Cookie 的使用</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground leading-relaxed">本網站僅使用必要性 Cookie，用於維持網站基本功能與資訊安全，例如：</p>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>維持使用者的瀏覽狀態</li>
            <li>防止惡意攻擊或異常存取</li>
          </ul>
          <p className="text-foreground leading-relaxed">這些 Cookie 不會用於廣告追蹤或行為分析，亦不會識別您的個人身分。</p>
          <p className="text-foreground leading-relaxed">您可透過瀏覽器設定，選擇限制或停用 Cookie，但部分功能可能因此無法正常運作。</p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">三、個人資料的使用目的</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground leading-relaxed">本網站蒐集之資料，僅用於以下目的：</p>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>提供網站基本服務與功能</li>
            <li>與使用者進行必要的聯絡</li>
            <li>維護網站安全與正常運作</li>
          </ul>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">四、第三方服務</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground leading-relaxed">
            本網站可能使用第三方基礎服務（例如網站託管、資安防護），其僅於提供必要服務範圍內處理資料，並不會將資料用於其他目的。
          </p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">五、資料安全</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground leading-relaxed">我們採取合理的技術與管理措施，以保護您的個人資料，避免未經授權的存取、洩漏或竄改。</p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">六、隱私權政策的修改</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-foreground leading-relaxed">本網站保留隨時修改本隱私權政策之權利，修改後的內容將公告於本網站，恕不另行個別通知。</p>
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-xl">七、聯絡方式</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-foreground leading-relaxed">如您對本隱私權政策有任何疑問，歡迎透過以下方式與我們聯絡：</p>
          <p className="text-foreground">
            📧 電子郵件：<a href="mailto:tj.tjump@gmail.com" className="text-primary hover:underline">tj.tjump@gmail.com</a>
          </p>
        </CardContent>
      </Card>
      <p className="text-center text-muted-foreground text-sm mt-8">📅 最後更新日期：2026 年 1 月</p>
    </div>
  );
}
