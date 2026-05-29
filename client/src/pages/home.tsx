import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calculator,
  Package,
  Hash,
  ArrowLeft,
  Search,
  MapPin,
  TrendingUp,
  FileImage,
  Sparkles,
  Zap,
  Shield,
  ChevronLeft,
} from "lucide-react";
import { useLocation } from "wouter";

type StatsData = {
  rows_total: number;
  hs_unique: number;
  units_unique: number;
};

type Checkpoint = {
  id: string;
  name: string;
  fees: { code: string; label: string; amount_iqd: number }[];
};

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  testId,
  color = "gold",
}: {
  label: string;
  value: string;
  icon: typeof Package;
  loading?: boolean;
  testId: string;
  color?: "gold" | "blue" | "green" | "purple";
}) {
  const colors = {
    gold: {
      bg: "bg-amber-500/10 dark:bg-amber-400/10",
      icon: "text-amber-600 dark:text-amber-400",
      glow: "group-hover:shadow-[0_0_20px_-4px_hsl(38_95%_55%/0.4)]",
      border: "group-hover:border-amber-500/30 dark:group-hover:border-amber-400/25",
    },
    blue: {
      bg: "bg-blue-500/10 dark:bg-blue-400/10",
      icon: "text-blue-600 dark:text-blue-400",
      glow: "group-hover:shadow-[0_0_20px_-4px_hsl(210_80%_60%/0.35)]",
      border: "group-hover:border-blue-500/30",
    },
    green: {
      bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
      icon: "text-emerald-600 dark:text-emerald-400",
      glow: "group-hover:shadow-[0_0_20px_-4px_hsl(160_70%_50%/0.35)]",
      border: "group-hover:border-emerald-500/30",
    },
    purple: {
      bg: "bg-violet-500/10 dark:bg-violet-400/10",
      icon: "text-violet-600 dark:text-violet-400",
      glow: "group-hover:shadow-[0_0_20px_-4px_hsl(270_70%_60%/0.35)]",
      border: "group-hover:border-violet-500/30",
    },
  };
  const c = colors[color];

  return (
    <Card
      className={`group premium-card overflow-hidden cursor-default transition-all duration-300 ${c.glow} ${c.border}`}
      data-testid={testId}
    >
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${c.bg} shrink-0 transition-transform duration-300 group-hover:scale-110`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium mb-1 tracking-wide">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-24 rounded-lg" />
          ) : (
            <p className="text-2xl font-black font-mono tracking-tight stat-number">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NavCard({
  title,
  description,
  icon: Icon,
  actionText,
  onClick,
  variant = "default",
  testId,
  badge,
}: {
  title: string;
  description: string;
  icon: typeof Calculator;
  actionText: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "accent" | "default";
  testId: string;
  badge?: string;
}) {
  const isPrimary = variant === "primary";

  return (
    <button
      className={`nav-card w-full text-right rounded-2xl border p-5 flex items-start gap-4 transition-all duration-300 group cursor-pointer
        ${isPrimary
          ? "gradient-gold border-transparent text-white shadow-lg hover:shadow-[0_8px_32px_-4px_hsl(38_95%_50%/0.5)] hover:-translate-y-1"
          : "premium-card bg-card"
        }`}
      onClick={onClick}
      data-testid={testId}
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 transition-all duration-300 group-hover:scale-110
        ${isPrimary ? "bg-white/20" : "bg-primary/10 group-hover:bg-primary/16"}`}>
        <Icon className={`h-6 w-6 ${isPrimary ? "text-white" : "text-primary"}`} />
      </div>
      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-2 justify-end mb-1">
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPrimary ? "bg-white/25 text-white" : "badge-gold"}`}>
              {badge}
            </span>
          )}
          <h3 className={`font-bold text-base ${isPrimary ? "text-white" : "text-foreground"}`}>{title}</h3>
        </div>
        <p className={`text-sm mt-1 leading-relaxed ${isPrimary ? "text-white/80" : "text-muted-foreground"}`}>
          {description}
        </p>
        <div className={`flex items-center gap-1.5 mt-3 text-xs font-semibold transition-all duration-200 group-hover:gap-2.5 justify-end
          ${isPrimary ? "text-white/90" : "text-primary"}`}>
          <ChevronLeft className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
          <span>{actionText}</span>
        </div>
      </div>
    </button>
  );
}

export default function Home() {
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
  });

  const { data: checkpoints, isLoading: cpLoading } = useQuery<Checkpoint[]>({
    queryKey: ["/api/checkpoints"],
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Hero ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 gradient-hero p-8 md:p-10">
        {/* Orbs */}
        <div className="orb orb-gold w-80 h-80 -top-20 -right-20 float-slow" style={{ animationDelay: "0s" }} />
        <div className="orb orb-blue w-60 h-60 -bottom-16 left-10 float-medium" style={{ animationDelay: "2s" }} />
        <div className="orb orb-purple w-40 h-40 top-10 left-1/3 float-slow" style={{ animationDelay: "4s" }} />

        <div className="relative z-10 flex items-center gap-6">
          {/* Logo */}
          <div className="relative shrink-0 float-slow" style={{ animationDelay: "1s" }}>
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150 animate-pulse" />
            <div className="relative w-20 h-20 flex items-center justify-center rounded-2xl bg-white/10 dark:bg-white/5 backdrop-blur-sm border border-white/20 dark:border-white/10 shadow-xl">
              <Shield className="w-14 h-14 text-primary" data-testid="img-logo-home" />
            </div>
          </div>

          {/* Text */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 badge-gold px-3 py-1 rounded-full text-xs font-bold">
                <Sparkles className="h-3 w-3" />
                <span>النظام الإلكتروني الرسمي</span>
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-black leading-tight mb-2" data-testid="text-home-title">
              <span className="text-shimmer">حاسبة فرق الرسم</span>
              <br />
              <span className="text-foreground/90">الكمركي العراقي</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-md">
              نظام متكامل لحساب الرسوم الجمركية للمنافذ الحدودية — سريع، دقيق، وشامل
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              {[
                { icon: Shield, text: "بيانات رسمية" },
                { icon: Zap, text: "نتائج فورية" },
                { icon: TrendingUp, text: "12,601 منتج" },
              ].map((tag) => (
                <div key={tag.text} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 dark:bg-muted/30 px-3 py-1.5 rounded-full border border-border/50">
                  <tag.icon className="h-3 w-3 text-primary" />
                  <span>{tag.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard
          label="إجمالي المنتجات"
          value={stats ? stats.rows_total.toLocaleString("en-US") : "—"}
          icon={Package}
          loading={statsLoading}
          testId="stat-products"
          color="gold"
        />
        <StatCard
          label="رموز HS فريدة"
          value={stats ? stats.hs_unique.toLocaleString("en-US") : "—"}
          icon={Hash}
          loading={statsLoading}
          testId="stat-hs"
          color="blue"
        />
        <StatCard
          label="المنافذ الحدودية"
          value={checkpoints ? checkpoints.length.toString() : "—"}
          icon={MapPin}
          loading={cpLoading}
          testId="stat-checkpoints"
          color="green"
        />
      </div>

      {/* ── Main nav cards ───────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NavCard
          title="حاسبة الرسوم"
          description="احسب فرق الرسم الكمركي بدقة عالية مع دعم جميع المنتجات وأسعار الصرف"
          icon={Calculator}
          actionText="ابدأ الحساب الآن"
          onClick={() => navigate("/calculator")}
          variant="primary"
          badge="الأكثر استخداماً"
          testId="card-go-calculator"
        />
        <NavCard
          title="قراءة المنفست"
          description="ارفع صورة البيان الجمركي واحصل على حساب الرسوم فوراً بضغطة زر واحدة"
          icon={FileImage}
          actionText="احسب المنفست"
          onClick={() => navigate("/manifest")}
          variant="accent"
          badge="جديد — احسب تلقائياً"
          testId="card-go-manifest"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NavCard
          title="تصفح المنتجات"
          description="ابحث في قاعدة البيانات الشاملة برمز HS أو وصف المنتج باللغة العربية"
          icon={Search}
          actionText="ابحث الآن"
          onClick={() => navigate("/search")}
          variant="default"
          testId="card-go-products"
        />
        <NavCard
          title="التعرفة الجمركية"
          description="استعرض جداول التعرفة الكمركية الكاملة مع نسب الرسوم لجميع الفئات"
          icon={TrendingUp}
          actionText="عرض التعرفة"
          onClick={() => navigate("/tariff")}
          variant="default"
          testId="card-go-tariff"
        />
      </div>

      {/* ── Checkpoints + How it works ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Checkpoints */}
        <Card className="premium-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              المنافذ الحدودية المتاحة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {cpLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {checkpoints?.map((cp, idx) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 dark:bg-muted/20 hover:bg-muted/60 dark:hover:bg-muted/30 transition-colors border border-transparent hover:border-border/50"
                    data-testid={`checkpoint-${cp.id}`}
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_0_hsl(160_70%_50%/0.6)]" />
                      <span className="text-sm font-medium truncate">{cp.name}</span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] font-bold tabular-nums">
                      {cp.fees.length} رسوم
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="premium-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              كيف يعمل النظام
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              {[
                { icon: Search, title: "ابحث عن المنتج", desc: "ابحث برمز HS أو الوصف العربي", step: "١", color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/10" },
                { icon: Calculator, title: "أدخل بيانات الشحنة", desc: "الكمية، القيمة، نسبة الرسم", step: "٢", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-500/10" },
                { icon: TrendingUp, title: "احصل على النتيجة فوراً", desc: "فرق الرسم بالدولار والدينار", step: "٣", color: "text-emerald-500 dark:text-emerald-400", bg: "bg-emerald-500/10" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg} transition-transform duration-200 group-hover:scale-110`}>
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full gradient-gold text-white text-[10px] font-black shadow">
                      {item.step}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold">{item.title}</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
