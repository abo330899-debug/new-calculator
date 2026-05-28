import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search as SearchIcon,
  Package,
  X,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Hash,
  FileText,
  Ruler,
  Coins,
  ChevronRight,
  ChevronLeft,
  DollarSign,
  Calculator,
  Shield,
  Percent,
  Zap,
  Weight,
  Tag,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Product = {
  id: number;
  hs_code: string;
  cst_code: string | null;
  description: string | null;
  unit: string | null;
  weight: number | null;
  unit_price: number | null;
  is_protected: boolean | null;
  protection_level: string | null;
  protection_percentage: number | null;
  decision_action: string | null;
  decision_risk: string | null;
  decision_reason: string | null;
  min_value: number | null;
  avg_value: number | null;
  max_value: number | null;
  duty_rate: number | null;
  currency: string | null;
};

type ProductsResponse = {
  products: Product[];
  page: number;
  total_pages: number;
  total_count: number;
};

const GOODS_CATEGORIES = [
  { id: "food_basic", label: "مواد غذائية أساسية", dutyRate: 0.05, taxDeposit: 0.01 },
  { id: "food_processed", label: "مواد غذائية مصنعة", dutyRate: 0.05, taxDeposit: 0.03 },
  { id: "medical", label: "أدوية ومستلزمات طبية", dutyRate: 0.05, taxDeposit: 0.01 },
  { id: "agriculture", label: "مدخلات زراعية", dutyRate: 0.05, taxDeposit: 0.01 },
  { id: "education", label: "مواد تعليمية وقرطاسية", dutyRate: 0.05, taxDeposit: 0.01 },
  { id: "solar", label: "معدات طاقة شمسية", dutyRate: 0.05, taxDeposit: 0.01 },
  { id: "raw_materials", label: "مواد خام", dutyRate: 0.10, taxDeposit: 0.03 },
  { id: "computers", label: "حواسيب ولوازمها", dutyRate: 0.05, taxDeposit: 0.03 },
  { id: "industrial", label: "مدخلات صناعية", dutyRate: 0.15, taxDeposit: 0.03 },
  { id: "construction", label: "مواد بناء", dutyRate: 0.15, taxDeposit: 0.03 },
  { id: "electrical", label: "كهربائيات (ثلاجات، مكيفات، غسالات)", dutyRate: 0.15, taxDeposit: 0.03 },
  { id: "vehicles", label: "مركبات (موحد 15%)", dutyRate: 0.15, taxDeposit: 0.03 },
  { id: "electronics", label: "إلكترونيات استهلاكية", dutyRate: 0.20, taxDeposit: 0.03 },
  { id: "smartphones", label: "هواتف ذكية", dutyRate: 0.20, taxDeposit: 0.03 },
  { id: "clothing", label: "ملابس ومنسوجات", dutyRate: 0.20, taxDeposit: 0.03 },
  { id: "household", label: "أدوات منزلية", dutyRate: 0.25, taxDeposit: 0.03 },
  { id: "consumer", label: "سلع استهلاكية عامة", dutyRate: 0.30, taxDeposit: 0.03 },
  { id: "luxury_goods", label: "سلع كمالية", dutyRate: 0.40, taxDeposit: 0.03 },
  { id: "jewelry", label: "مجوهرات وذهب", dutyRate: 0.05, taxDeposit: 0.02 },
  { id: "machinery", label: "مكائن ومعدات إنتاجية", dutyRate: 0.10, taxDeposit: 0.02 },
  { id: "cleaning", label: "منتجات تنظيف", dutyRate: 0.65, taxDeposit: 0.03 },
  { id: "plastic_protected", label: "بلاستيك (حاويات/أكواب) - محمي", dutyRate: 0.30, taxDeposit: 0.03 },
  { id: "steel_rebar", label: "حديد تسليح (10-32 ملم) - محمي", dutyRate: 0.30, taxDeposit: 0.03 },
  { id: "tobacco", label: "تبغ وسكائر", dutyRate: 1.00, taxDeposit: 0.03 },
  { id: "alcohol", label: "مشروبات كحولية", dutyRate: 1.50, taxDeposit: 0.03 },
  { id: "custom", label: "نسبة مخصصة", dutyRate: 0, taxDeposit: 0.03 },
];

const PROTECTION_RULES: { hsPrefix: string; rate: number; label: string }[] = [
  { hsPrefix: "72142", rate: 0.30, label: "حديد تسليح - حماية منتج وطني" },
  { hsPrefix: "3924", rate: 0.60, label: "حاويات بلاستيك - حماية منتج وطني" },
  { hsPrefix: "3917", rate: 0.60, label: "أنابيب بلاستيك - حماية منتج وطني" },
];

function getAutoProtection(hsCode: string): { rate: number; label: string } | null {
  const normalized = hsCode.replace(/[^\d]/g, "");
  for (const rule of PROTECTION_RULES) {
    if (normalized.startsWith(rule.hsPrefix)) {
      return { rate: rule.rate, label: rule.label };
    }
  }
  return null;
}

function suggestCategory(hsCode: string): typeof GOODS_CATEGORIES[number] {
  const hs = hsCode.replace(/[^\d]/g, "");
  if (hs.startsWith("72142")) return GOODS_CATEGORIES.find(c => c.id === "steel_rebar")!;
  if (hs.startsWith("3924") || hs.startsWith("3917")) return GOODS_CATEGORIES.find(c => c.id === "plastic_protected")!;
  if (hs.startsWith("8703")) return GOODS_CATEGORIES.find(c => c.id === "vehicles")!;
  if (hs.startsWith("8517")) return GOODS_CATEGORIES.find(c => c.id === "smartphones")!;
  if (hs.startsWith("8471")) return GOODS_CATEGORIES.find(c => c.id === "computers")!;
  if (hs.startsWith("30")) return GOODS_CATEGORIES.find(c => c.id === "medical")!;
  if (hs.startsWith("24")) return GOODS_CATEGORIES.find(c => c.id === "tobacco")!;
  if (hs.startsWith("9401") || hs.startsWith("9402") || hs.startsWith("9403") || hs.startsWith("9404") || hs.startsWith("9405")) return GOODS_CATEGORIES.find(c => c.id === "consumer")!;
  if (hs.startsWith("8418") || hs.startsWith("8415") || hs.startsWith("8450")) return GOODS_CATEGORIES.find(c => c.id === "electrical")!;
  if (hs.startsWith("7113") || hs.startsWith("7114")) return GOODS_CATEGORIES.find(c => c.id === "jewelry")!;
  if (hs.startsWith("22")) return GOODS_CATEGORIES.find(c => c.id === "alcohol")!;
  if (hs.startsWith("61") || hs.startsWith("62")) return GOODS_CATEGORIES.find(c => c.id === "clothing")!;
  return GOODS_CATEGORIES.find(c => c.id === "consumer")!;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIQD(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function ValueCard({
  label,
  value,
  icon: Icon,
  variant,
}: {
  label: string;
  value: number | null | undefined;
  icon: typeof DollarSign;
  variant: "min" | "avg" | "max";
}) {
  const colors = {
    min: "text-blue-400",
    avg: "text-emerald-400",
    max: "text-amber-400",
  };

  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-md bg-muted/50" data-testid={`value-card-${variant}`}>
      <Icon className={`h-5 w-5 ${colors[variant]}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-bold font-mono">
        {formatNumber(value)} <span className="text-xs font-normal">د.ع</span>
      </span>
    </div>
  );
}

export default function SearchPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [estimateQty, setEstimateQty] = useState(1);
  const [estimateValue, setEstimateValue] = useState(0);

  useEffect(() => {
    setEstimateQty(1);
    setEstimateValue(0);
  }, [selectedProduct]);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        setDebouncedQuery(value.trim());
        setPage(1);
      }, 400);
      setDebounceTimer(timer);
    },
    [debounceTimer],
  );

  const clearSearch = () => {
    setQuery("");
    setDebouncedQuery("");
    setSelectedProduct(null);
    setPage(1);
    if (debounceTimer) clearTimeout(debounceTimer);
  };

  const isSearching = debouncedQuery.length >= 2;

  const { data: searchResults, isLoading: searchLoading } = useQuery<Product[]>({
    queryKey: [`/api/search?q=${encodeURIComponent(debouncedQuery)}&limit=50`],
    enabled: isSearching,
    staleTime: 30000,
  });

  const { data: browseData, isLoading: browseLoading } = useQuery<ProductsResponse>({
    queryKey: [`/api/products?page=${page}&limit=50`],
    enabled: !isSearching,
    staleTime: 60000,
  });

  const displayProducts = isSearching ? (searchResults || []) : (browseData?.products || []);
  const isLoading = isSearching ? searchLoading : browseLoading;
  const totalPages = browseData?.total_pages || 1;
  const totalCount = browseData?.total_count || 0;

  const autoProtection = selectedProduct ? getAutoProtection(selectedProduct.hs_code) : null;
  const protection = selectedProduct?.protection_percentage != null && selectedProduct.protection_percentage > 0
    ? { rate: selectedProduct.protection_percentage, label: `حماية منتج (${selectedProduct.protection_level || ""})`  }
    : autoProtection;
  const suggested = selectedProduct ? suggestCategory(selectedProduct.hs_code) : null;
  const protectionRate = protection ? protection.rate : 0;

  const invoiceIqd = estimateValue * 1320;
  const invoiceUnitIqd = estimateQty > 0 ? invoiceIqd / estimateQty : 0;
  const tscUnitIqd = selectedProduct?.avg_value || 0;
  const valuationUnitIqd = Math.max(invoiceUnitIqd, tscUnitIqd);
  const customsValue = valuationUnitIqd * estimateQty;
  const dutyRate = selectedProduct?.duty_rate ?? suggested?.dutyRate ?? 0;
  const duty = customsValue * (dutyRate + protectionRate);
  const estimateTotal = duty;

  const renderTable = (products: Product[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">رمز HS</TableHead>
            <TableHead className="text-right">الوصف</TableHead>
            <TableHead className="text-right">الوحدة</TableHead>
            <TableHead className="text-right">الوزن</TableHead>
            <TableHead className="text-right">سعر الوحدة</TableHead>
            <TableHead className="text-right">حماية</TableHead>
            <TableHead className="text-right">القرار</TableHead>
            <TableHead className="text-right">الرسم %</TableHead>
            <TableHead className="text-right">أدنى</TableHead>
            <TableHead className="text-right">متوسط</TableHead>
            <TableHead className="text-right">أقصى</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              className="cursor-pointer"
              onClick={() => setSelectedProduct(product)}
              data-testid={`row-product-${product.id}`}
            >
              <TableCell className="font-mono text-sm whitespace-nowrap">
                <button
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/calculator?hs=${encodeURIComponent(product.hs_code)}&desc=${encodeURIComponent(product.description || "")}&unit=${encodeURIComponent(product.unit || "")}`);
                  }}
                  data-testid={`link-hs-${product.id}`}
                >
                  {product.hs_code}
                </button>
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm">
                {product.description || "-"}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {product.unit || "-"}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap">
                {formatNumber(product.weight)}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap">
                {formatNumber(product.unit_price)}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap text-center">
                {product.is_protected ? (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0.5" data-testid={`badge-protected-${product.id}`}>
                    <ShieldCheck className="h-3 w-3 ml-0.5" />
                    {product.protection_percentage != null ? `${product.protection_percentage}%` : "نعم"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">{product.protection_percentage != null && product.protection_percentage > 0 ? `${product.protection_percentage}%` : "0"}</span>
                )}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap" data-testid={`text-decision-${product.id}`}>
                {product.decision_action ? (
                  <Badge variant={product.decision_risk === "عالي" ? "destructive" : product.decision_risk === "متوسط" ? "outline" : "secondary"} className="text-xs">
                    {product.decision_action}
                  </Badge>
                ) : "-"}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap" data-testid={`text-duty-rate-${product.id}`}>
                {product.duty_rate != null ? `${Math.round(product.duty_rate * 100)}%` : "-"}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap">
                {formatNumber(product.min_value)}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap">
                {formatNumber(product.avg_value)}
              </TableCell>
              <TableCell className="text-sm font-mono whitespace-nowrap">
                {formatNumber(product.max_value)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-border/40 gradient-hero p-6 md:p-8">
        <div className="orb orb-gold w-40 h-40 -top-10 -left-10 float-slow" />
        <div className="orb orb-blue w-24 h-24 bottom-0 right-24 float-medium" style={{ animationDelay: "1.5s" }} />
        <div className="relative z-10 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/25 rounded-2xl blur-xl scale-125" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold text-white shadow-xl glow-gold-sm">
              <Package className="h-7 w-7" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black" data-testid="text-page-title">
              <span className="text-shimmer">تصفح المنتجات</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              ابحث برمز HS أو وصف المنتج لمعرفة التعرفة والقيمة الاستدلالية
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          data-testid="input-search"
          placeholder="ابحث برمز HS (مثال: 87032390) أو وصف المنتج..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pr-10 pl-10"
        />
        {query && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute left-1 top-1/2 -translate-y-1/2"
            onClick={clearSearch}
            data-testid="button-clear-search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {debouncedQuery.length > 0 && debouncedQuery.length < 2 && (
        <p className="text-sm text-muted-foreground">ادخل حرفين على الأقل للبحث</p>
      )}

      {selectedProduct && suggested && (
        <Card data-testid="card-product-detail">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              تفاصيل المنتج
            </CardTitle>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSelectedProduct(null)}
              data-testid="button-close-detail"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2">
                <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">رمز HS</span>
                  <p className="font-mono font-bold text-lg" data-testid="text-detail-hs">
                    {selectedProduct.hs_code}
                  </p>
                </div>
              </div>
              {selectedProduct.cst_code && (
                <div className="flex items-start gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs text-muted-foreground">رمز CST</span>
                    <p className="font-mono" data-testid="text-detail-cst">{selectedProduct.cst_code}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2 sm:col-span-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">الوصف</span>
                  <p className="mt-0.5" data-testid="text-detail-desc">
                    {selectedProduct.description || "-"}
                  </p>
                </div>
              </div>
              {selectedProduct.unit && (
                <div className="flex items-start gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <span className="text-xs text-muted-foreground">الوحدة</span>
                    <p>{selectedProduct.unit}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Weight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">الوزن</span>
                  <p data-testid="text-detail-weight">{formatNumber(selectedProduct.weight)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">سعر الوحدة</span>
                  <p data-testid="text-detail-unit-price">{formatNumber(selectedProduct.unit_price)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                {selectedProduct.is_protected ? (
                  <ShieldCheck className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <ShieldOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="text-xs text-muted-foreground">حماية المنتج</span>
                  <p data-testid="text-detail-protection">
                    {selectedProduct.is_protected ? (
                      <span className="flex items-center gap-1">
                        <Badge variant="destructive" className="text-xs">محمي</Badge>
                        <span className="text-xs text-muted-foreground">
                          {selectedProduct.protection_percentage != null ? `${selectedProduct.protection_percentage}%` : ""}
                          {selectedProduct.protection_level ? ` (${selectedProduct.protection_level})` : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1">
                        غير محمي
                        {selectedProduct.protection_percentage != null && selectedProduct.protection_percentage > 0 && (
                          <span className="text-xs">({selectedProduct.protection_percentage}%)</span>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {selectedProduct.decision_action && (
                <div className="flex items-start gap-2 col-span-2">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${selectedProduct.decision_risk === "عالي" ? "text-red-500" : selectedProduct.decision_risk === "متوسط" ? "text-amber-500" : "text-green-500"}`} />
                  <div>
                    <span className="text-xs text-muted-foreground">القرار</span>
                    <div className="flex items-center gap-2" data-testid="text-detail-decision">
                      <Badge variant={selectedProduct.decision_risk === "عالي" ? "destructive" : selectedProduct.decision_risk === "متوسط" ? "outline" : "secondary"} className="text-xs">
                        {selectedProduct.decision_action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        خطورة: {selectedProduct.decision_risk} — {selectedProduct.decision_reason}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Coins className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-xs text-muted-foreground">العملة</span>
                  <p>{selectedProduct.currency || "USD"}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">القيم الاستدلالية (د.ع)</p>
              <div className="grid grid-cols-3 gap-3">
                <ValueCard label="أدنى قيمة" value={selectedProduct.min_value} icon={TrendingDown} variant="min" />
                <ValueCard label="متوسط القيمة" value={selectedProduct.avg_value} icon={BarChart3} variant="avg" />
                <ValueCard label="أقصى قيمة" value={selectedProduct.max_value} icon={TrendingUp} variant="max" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Percent className="h-4 w-4" />
                التصنيف الكمركي
              </p>

              {protection && (
                <Badge variant="destructive" className="text-sm" data-testid="text-protection-badge">
                  <Shield className="h-3.5 w-3.5 ml-1" />
                  {protection.label} +{Math.round(protection.rate * 100)}%
                </Badge>
              )}

              <div className="rounded-md bg-muted/50 p-3 space-y-1" data-testid="text-suggested-category">
                <p className="text-sm font-medium">الفئة المقترحة: {suggested.label}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>نسبة الرسم (قانون 22): {selectedProduct?.duty_rate != null ? `${Math.round(selectedProduct.duty_rate * 100)}%` : `${Math.round(suggested.dutyRate * 100)}%`}</span>
                  <span>حماية: {Math.round(protectionRate * 100)}%</span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                تقدير سريع
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">الكمية</Label>
                  <Input
                    type="number"
                    min={1}
                    value={estimateQty}
                    onChange={(e) => setEstimateQty(Math.max(1, parseInt(e.target.value) || 1))}
                    data-testid="input-estimate-qty"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">قيمة الفاتورة (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={estimateValue || ""}
                    onChange={(e) => setEstimateValue(parseFloat(e.target.value) || 0)}
                    data-testid="input-estimate-value"
                  />
                </div>
              </div>

              {estimateValue > 0 && (
                <div className="rounded-md bg-muted/50 p-3 space-y-1.5 text-sm font-mono">
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">القيمة بالدينار:</span>
                    <span>{formatIQD(invoiceIqd)} د.ع</span>
                  </div>
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">القيمة الكمركية:</span>
                    <span>{formatIQD(customsValue)} د.ع</span>
                  </div>
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">الرسم الكمركي ({Math.round(dutyRate * 100)}%{protectionRate > 0 ? `+${Math.round(protectionRate * 100)}%` : ""}):</span>
                    <span>{formatIQD(duty)} د.ع</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between gap-2 flex-wrap font-bold text-emerald-400" data-testid="text-estimate-total">
                    <span>الإجمالي التقديري:</span>
                    <span>{formatIQD(estimateTotal)} د.ع</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              onClick={() => {
                const params = new URLSearchParams();
                params.set("hs", selectedProduct.hs_code);
                params.set("desc", selectedProduct.description || "");
                params.set("unit", selectedProduct.unit || "");
                params.set("category", suggested.id);
                params.set("protection", String(protectionRate));
                params.set("qty", String(estimateQty));
                params.set("value", String(estimateValue));
                navigate(`/calculator?${params.toString()}`);
              }}
              data-testid="button-add-to-calc"
            >
              <Calculator className="h-4 w-4" />
              <span className="mr-1">أضف للحاسبة</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && displayProducts.length === 0 && isSearching && (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground" data-testid="text-no-results">
              لا توجد نتائج لـ "{debouncedQuery}"
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && displayProducts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              {isSearching ? "نتائج البحث" : "جدول المنتجات"}
              <Badge variant="secondary">
                {isSearching ? displayProducts.length : totalCount.toLocaleString()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {renderTable(displayProducts)}
          </CardContent>

          {!isSearching && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 p-3 border-t">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                صفحة {page} من {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                data-testid="button-next-page"
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
