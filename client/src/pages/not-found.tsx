import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-6">
        <div className="relative mx-auto w-fit">
          <div className="absolute inset-0 bg-destructive/10 rounded-full blur-xl scale-150" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-404-title">الصفحة غير موجودة</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            الصفحة التي تبحث عنها غير موجودة. تأكد من الرابط أو عد للصفحة الرئيسية.
          </p>
        </div>
        <Button
          className="gradient-gold text-white"
          onClick={() => navigate("/")}
          data-testid="button-go-home"
        >
          <Home className="h-4 w-4" />
          <span className="mr-2">العودة للرئيسية</span>
        </Button>
      </div>
    </div>
  );
}
