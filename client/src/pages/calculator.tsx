import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calculator,
  Search,
  Plus,
  Trash2,
  ArrowLeftRight,
  Loader2,
  Package,
  Copy,
  RotateCcw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const GOODS_CATEGORIES = [
  { id: "food_basic", label: "مواد غذائية أساسية", dutyRate: 0.05 },
  { id: "food_processed", label: "مواد غذائية مصنعة", dutyRate: 0.05 },
  { id: "medical", label: "أدوية ومستلزمات طبية", dutyRate: 0.05 },
  { id: "agriculture", label: "مدخلات زراعية", dutyRate: 0.05 },
  { id: "education", label: "مواد تعليمية وقرطاسية", dutyRate: 0.05 },
  { id: "solar", label: "معدات طاقة شمسية", dutyRate: 0.05 },
  { id: "jewelry", label: "مجوهرات وذهب", dutyRate: 0.05 },
  { id: "computers", label: "حواسيب ولوازمها", dutyRate: 0.05 },
  { id: "raw_materials", label: "مواد خام", dutyRate: 0.10 },
  { id: "machinery", label: "مكائن ومعدات إنتاجية", dutyRate: 0.10 },
  { id: "industrial", label: "مدخلات صناعية", dutyRate: 0.15 },
  { id: "construction", label: "مواد بناء", dutyRate: 0.15 },
  { id: "electrical", label: "كهربائيات (ثلاجات، مكيفات، غسالات)", dutyRate: 0.15 },
  { id: "vehicles", label: "مركبات (موحد 15%)", dutyRate: 0.15 },
  { id: "electronics", label: "إلكترونيات استهلاكية", dutyRate: 0.20 },
  { id: "smartphones", label: "هواتف ذكية", dutyRate: 0.20 },
  { id: "clothing", label: "ملابس ومنسوجات", dutyRate: 0.20 },
  { id: "household", label: "أدوات منزلية", dutyRate: 0.25 },
  { id: "consumer", label: "سلع استهلاكية عامة", dutyRate: 0.30 },
  { id: "plastic_protected", label: "بلاستيك (حاويات/أكواب)", dutyRate: 0.30 },
  { id: "steel_rebar", label: "حديد تسليح", dutyRate: 0.30 },
  { id: "luxury_goods", label: "سلع كمالية", dutyRate: 0.40 },
  { id: "cleaning", label: "منتجات تنظيف", dutyRate: 0.65 },
  { id: "tobacco", label: "تبغ وسكائر", dutyRate: 1.00 },
  { id: "alcohol", label: "مشروبات كحولية", dutyRate: 1.50 },
  { id: "custom", label: "نسبة مخصصة", dutyRate: 0 },
];

const PROTECTION_RULES: { hsPrefix: string; rate: number; label: string }[] = [
  { hsPrefix: "72142", rate: 0.30, label: "حديد تسليح - حماية منتج وطني" },
  { hsPrefix: "3924", rate: 0.60, label: "حاويات بلاستيك - حماية منتج وطني" },
  { hsPrefix: "3917", rate: 0.60, label: "أنابيب بلاستيك - حماية منتج وطني" },
];

function getProtectionRate(hsCode: string): number {
  const normalized = hsCode.replace(/[^\d]/g, "");
  for (const rule of PROTECTION_RULES) {
    if (normalized.startsWith(rule.hsPrefix)) {
      return rule.rate;
    }
  }
  return 0;
}

type Product = {
  id: number;
  hs_code: string;
  cst_code: string | null;
  description: string | null;
  unit: string | null;
  is_protected: boolean | null;
  protection_level: string | null;
  protection_percentage: number | null;
  min_value: number | null;
  avg_value: number | null;
  max_value: number | null;
  duty_rate: number | null;
  currency: string | null;
};

type CalcItem = {
  localId: string;
  hs_code: string;
  description: string;
  quantity: number;
  unit: string;
  avg_value: number;
  category: string;
  paid_duty: number;
  tsc_avg_hint: number | null;
  protection_rate: number;
};

type CalcResult = {
  fx_rate: number;
  items: {
    hs_code: string;
    description: string;
    quantity: number;
    unit: string;
    avg_value: number;
    duty_rate: number;
    goods_category: string;
    duty_usd: number;
    paid_duty_usd: number;
    difference_usd: number;
    difference_iqd: number;
  }[];
  summary: {
    total_duty_usd: number;
    total_paid_usd: number;
    total_difference_usd: number;
    total_difference_iqd: number;
  };
};

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatIQD(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

let idCounter = 0;
function nextId() {
  return `item-${++idCounter}`;
}

function ProductSearchPopup({
  onSelect,
  onClose,
}: {
  onSelect: (product: Product) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (val: string) => {
    setQ(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebounced(val.trim()), 300);
    setTimer(t);
  };

  const { data: results, isLoading } = useQuery<Product[]>({
    queryKey: [`/api/search?q=${encodeURIComponent(debounced)}&limit=20`],
    enabled: debounced.length >= 2,
    staleTime: 30000,
  });

  return (
    <Card data-testid="card-product-search-popup">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Search className="h-4 w-4" />
          ابحث عن المنتج
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          data-testid="input-product-search"
          placeholder="رمز HS أو وصف المنتج..."
          value={q}
          onChange={(e) => handleChange(e.target.value)}
          autoFocus
        />
        {isLoading && <Skeleton className="h-8 w-full" />}
        {results && results.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">لا توجد نتائج</p>
        )}
        {results && results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {results.map((p) => (
              <button
                key={p.id}
                className="w-full text-right p-2 rounded-md text-sm hover-elevate cursor-pointer"
                onClick={() => {
                  onSelect(p);
                  onClose();
                }}
                data-testid={`btn-select-product-${p.id}`}
              >
                <span className="font-mono text-xs text-muted-foreground">{p.hs_code}</span>
                <span className="mx-2">-</span>
                <span className="truncate">{p.description || "-"}</span>
              </button>
            ))}
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={onClose} className="w-full" data-testid="button-close-search-popup">
          إلغاء
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CalculatorPage() {
  const { toast } = useToast();
  const [fxRate, setFxRate] = useState(1320);
  const [items, setItems] = useState<CalcItem[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const prefilled = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const extractBestValue = (products: Product[]): { avgUsd: number; dutyRate: number | null } => {
    const usdProduct = products.find(p => p.currency === "USD" && p.avg_value && p.avg_value > 0);
    if (usdProduct) {
      return { avgUsd: usdProduct.avg_value!, dutyRate: usdProduct.duty_rate ?? null };
    }
    const iqdProduct = products.find(p => p.avg_value && p.avg_value > 0);
    if (iqdProduct) {
      return { avgUsd: parseFloat((iqdProduct.avg_value! / 1320).toFixed(4)), dutyRate: iqdProduct.duty_rate ?? null };
    }
    return { avgUsd: 0, dutyRate: products[0]?.duty_rate ?? null };
  };

  const fetchAvgValueForHsCode = async (hsCode: string, description?: string): Promise<{ avgUsd: number; dutyRate: number | null }> => {
    if (!hsCode && !description) return { avgUsd: 0, dutyRate: null };
    try {
      const codesToTry = [];
      if (hsCode) {
        codesToTry.push(hsCode);
        if (hsCode.length >= 8) codesToTry.push(hsCode.slice(0, 6));
        if (hsCode.length >= 6) codesToTry.push(hsCode.slice(0, 4));
      }

      for (const code of codesToTry) {
        const res = await fetch(`/api/hs/${encodeURIComponent(code)}?limit=50`);
        if (!res.ok) continue;
        const products: Product[] = await res.json();
        if (products.length > 0) {
          const result = extractBestValue(products);
          if (result.avgUsd > 0) return result;
          if (result.dutyRate !== null) return result;
        }
      }

      if (description && description.length >= 3) {
        const searchRes = await fetch(`/api/search?q=${encodeURIComponent(description)}&limit=10`);
        if (searchRes.ok) {
          const searchProducts: Product[] = await searchRes.json();
          if (searchProducts.length > 0) {
            const result = extractBestValue(searchProducts);
            if (result.avgUsd > 0) return result;
          }
        }
      }

      return { avgUsd: 0, dutyRate: null };
    } catch {
      return { avgUsd: 0, dutyRate: null };
    }
  };

  useEffect(() => {
    if (prefilled.current) return;
    const params = new URLSearchParams(window.location.search);

    const manifestData = params.get("manifest");
    if (manifestData) {
      prefilled.current = true;
      try {
        const parsed = JSON.parse(decodeURIComponent(manifestData));
        const manifestItems = Array.isArray(parsed) ? parsed : (parsed.items || []);

        if (manifestItems.length > 0) {
          const newItems: CalcItem[] = manifestItems.map((p: any) => {
            let matchedCatId = "consumer";
            if (p.goods_category && GOODS_CATEGORIES.some(c => c.id === p.goods_category)) {
              matchedCatId = p.goods_category;
            } else if (Number(p.duty_rate) > 0) {
              matchedCatId = GOODS_CATEGORIES.filter(c => c.id !== "custom").reduce((best, c) =>
                Math.abs(c.dutyRate - Number(p.duty_rate)) < Math.abs(best.dutyRate - Number(p.duty_rate)) ? c : best
              ).id;
            }
            return {
              localId: nextId(),
              hs_code: String(p.hs_code || ""),
              description: String(p.description || ""),
              quantity: Number(p.quantity) || 1,
              unit: String(p.unit || ""),
              avg_value: Number(p.avg_value) || 0,
              category: matchedCatId,
              paid_duty: Number(p.duty_amount) || 0,
              tsc_avg_hint: null,
              protection_rate: getProtectionRate(String(p.hs_code || "")),
            };
          });
          setItems(newItems);

          Promise.all(
            newItems.map(async (item) => {
              if (!item.hs_code) return null;
              const { avgUsd, dutyRate } = await fetchAvgValueForHsCode(item.hs_code, item.description);
              return { localId: item.localId, avgUsd, dutyRate };
            })
          ).then((results) => {
            setItems((prev) =>
              prev.map((it) => {
                const match = results.find((r) => r && r.localId === it.localId);
                if (match && match.avgUsd > 0) {
                  const updatedItem = {
                    ...it,
                    avg_value: match.avgUsd,
                    tsc_avg_hint: match.avgUsd,
                  };
                  if (match.dutyRate !== null) {
                    const bestCat = GOODS_CATEGORIES.filter(c => c.id !== "custom").reduce((best, c) =>
                      Math.abs(c.dutyRate - match.dutyRate!) < Math.abs(best.dutyRate - match.dutyRate!) ? c : best
                    );
                    updatedItem.category = bestCat.id;
                  }
                  return updatedItem;
                }
                return it;
              })
            );
          });
        }
      } catch {}
      window.history.replaceState({}, "", "/calculator");
      return;
    }

    const hs = params.get("hs");
    if (hs) {
      prefilled.current = true;
      const localId = nextId();
      setItems((prev) => [
        ...prev,
        {
          localId,
          hs_code: hs,
          description: params.get("desc") || "",
          quantity: 1,
          unit: params.get("unit") || "",
          avg_value: 0,
          category: "consumer",
          paid_duty: 0,
          tsc_avg_hint: null,
          protection_rate: getProtectionRate(hs),
        },
      ]);

      fetchAvgValueForHsCode(hs, params.get("desc") || "").then(({ avgUsd, dutyRate }) => {
        if (avgUsd > 0) {
          setItems((prev) =>
            prev.map((it) => {
              if (it.localId === localId) {
                const updated = { ...it, avg_value: avgUsd, tsc_avg_hint: avgUsd };
                if (dutyRate !== null) {
                  const bestCat = GOODS_CATEGORIES.filter(c => c.id !== "custom").reduce((best, c) =>
                    Math.abs(c.dutyRate - dutyRate) < Math.abs(best.dutyRate - dutyRate) ? c : best
                  );
                  updated.category = bestCat.id;
                }
                return updated;
              }
              return it;
            })
          );
        }
      });

      window.history.replaceState({}, "", "/calculator");
    }
  }, []);

  const calcMutation = useMutation({
    mutationFn: async (body: unknown) => {
      const res = await apiRequest("POST", "/api/calculate", body);
      return res.json() as Promise<CalcResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    },
    onError: (err: Error) => {
      let msg = err.message;
      try {
        const json = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        msg = json.error || msg;
      } catch {}
      toast({ title: "خطأ في الحساب", description: msg, variant: "destructive" });
    },
  });

  const addProduct = (product: Product) => {
    const lawRate = product.duty_rate ?? 0.20;
    const matchedCat = GOODS_CATEGORIES.reduce((best, c) =>
      Math.abs(c.dutyRate - lawRate) < Math.abs(best.dutyRate - lawRate) ? c : best
    , GOODS_CATEGORIES[0]);

    let avgUsd = 0;
    if (product.avg_value) {
      avgUsd = product.currency === "USD" ? product.avg_value : product.avg_value / 1320;
    }

    const protRate = product.protection_percentage != null ? product.protection_percentage : getProtectionRate(product.hs_code);
    const localId = nextId();

    setItems((prev) => [
      ...prev,
      {
        localId,
        hs_code: product.hs_code,
        description: product.description || "",
        quantity: 1,
        unit: product.unit || "",
        avg_value: parseFloat(avgUsd.toFixed(4)),
        category: matchedCat.id,
        paid_duty: 0,
        tsc_avg_hint: avgUsd > 0 ? parseFloat(avgUsd.toFixed(4)) : null,
        protection_rate: protRate,
      },
    ]);
    setResult(null);

    if (avgUsd === 0 && product.hs_code) {
      fetchAvgValueForHsCode(product.hs_code, product.description || "").then(({ avgUsd: fetchedAvg, dutyRate }) => {
        if (fetchedAvg > 0) {
          setItems((prev) =>
            prev.map((it) => {
              if (it.localId === localId) {
                const updated = { ...it, avg_value: fetchedAvg, tsc_avg_hint: fetchedAvg };
                if (dutyRate !== null) {
                  const bestCat = GOODS_CATEGORIES.filter(c => c.id !== "custom").reduce((best, c) =>
                    Math.abs(c.dutyRate - dutyRate) < Math.abs(best.dutyRate - dutyRate) ? c : best
                  );
                  updated.category = bestCat.id;
                }
                return updated;
              }
              return it;
            })
          );
        }
      });
    }
  };

  const updateItem = (localId: string, field: keyof CalcItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.localId === localId ? { ...it, [field]: value } : it
      )
    );
    setResult(null);
  };

  const handleCategoryChange = (localId: string, categoryId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.localId === localId ? { ...it, category: categoryId } : it
      )
    );
    setResult(null);
  };

  const removeItem = (localId: string) => {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
    setResult(null);
  };

  const getDutyRate = (item: CalcItem) => {
    const cat = GOODS_CATEGORIES.find(c => c.id === item.category);
    return cat ? cat.dutyRate : 0.30;
  };

  const handleCalculate = () => {
    if (items.length === 0) {
      toast({ title: "أضف منتج", description: "يجب إضافة منتج واحد على الأقل", variant: "destructive" });
      return;
    }

    calcMutation.mutate({
      fx_rate: fxRate,
      items: items.map((it) => ({
        hs_code: it.hs_code,
        quantity: it.quantity,
        unit: it.unit || null,
        avg_value: it.avg_value,
        duty_rate: getDutyRate(it),
        goods_category: it.category,
        paid_duty: it.paid_duty,
      })),
    });
  };

  const handleCopy = () => {
    if (!result) return;
    let text = "📋 ملخص حساب الرسوم الكمركية\n";
    text += `سعر الصرف: ${fxRate} IQD/USD\n`;
    text += "━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    result.items.forEach((it, i) => {
      const catLabel = GOODS_CATEGORIES.find(c => c.id === it.goods_category)?.label || it.goods_category;
      text += `\n${i + 1}. ${it.description || it.hs_code}\n`;
      text += `   HS: ${it.hs_code}\n`;
      text += `   الوزن: ${it.quantity} | متوسط التقييم: $${formatUSD(it.avg_value)} | التصنيف: ${catLabel} (${(it.duty_rate * 100).toFixed(0)}%)\n`;
      text += `   المدفوع: $${formatUSD(it.paid_duty_usd)} | الرسم المحسوب: $${formatUSD(it.duty_usd)}\n`;
      text += `   الفرق: $${formatUSD(it.difference_usd)} = ${formatIQD(it.difference_iqd)} د.ع\n`;
    });
    text += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    text += `إجمالي الرسم: $${formatUSD(result.summary.total_duty_usd)}\n`;
    text += `إجمالي المدفوع: $${formatUSD(result.summary.total_paid_usd)}\n`;
    text += `إجمالي الفرق: $${formatUSD(result.summary.total_difference_usd)} = ${formatIQD(result.summary.total_difference_iqd)} د.ع\n`;

    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ" });
  };

  const handleReset = () => {
    setItems([]);
    setResult(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-border/40 gradient-hero p-6 md:p-8">
        <div className="orb orb-gold w-40 h-40 -top-10 -right-10 float-slow" />
        <div className="orb orb-purple w-28 h-28 bottom-0 left-20 float-medium" style={{ animationDelay: "3s" }} />
        <div className="relative z-10 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/25 rounded-2xl blur-xl scale-125" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold text-white shadow-xl glow-gold-sm">
              <Calculator className="h-7 w-7" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black" data-testid="text-calc-title">
              <span className="text-shimmer">حاسبة الرسوم الكمركية</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              أدخل بيانات المنتج واحسب فرق الرسم الكمركي بدقة عالية
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <Label className="flex items-center gap-1.5 text-sm">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            سعر الصرف (1 USD = ? IQD)
          </Label>
          <Input
            type="number"
            value={fxRate}
            onChange={(e) => {
              setFxRate(parseFloat(e.target.value) || 0);
              setResult(null);
            }}
            className="max-w-xs"
            data-testid="input-fx-rate"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5" />
          المنتجات
        </h2>
        <Button
          onClick={() => setShowSearch(!showSearch)}
          size="sm"
          data-testid="button-add-product"
        >
          <Plus className="h-4 w-4 ml-1" />
          إضافة منتج
        </Button>
      </div>

      {showSearch && (
        <ProductSearchPopup
          onSelect={addProduct}
          onClose={() => setShowSearch(false)}
        />
      )}

      {items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>لم تتم إضافة منتجات بعد</p>
            <p className="text-sm mt-1">اضغط "إضافة منتج" للبدء</p>
          </CardContent>
        </Card>
      )}

      {items.map((item, idx) => {
        const cat = GOODS_CATEGORIES.find(c => c.id === item.category);
        const dutyRate = cat ? cat.dutyRate : 0;
        return (
          <Card key={item.localId} data-testid={`card-item-${idx}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {item.hs_code || "—"}
                  </Badge>
                  <span className="text-sm truncate max-w-[200px]">{item.description || "منتج"}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(item.localId)}
                  data-testid={`button-remove-${idx}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">الوزن / الكمية</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(e) => updateItem(item.localId, "quantity", parseFloat(e.target.value) || 0)}
                    data-testid={`input-qty-${idx}`}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    متوسط أساس التقييم (USD)
                    {item.tsc_avg_hint !== null && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-green-500 border-green-500/30">تلقائي</Badge>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.avg_value}
                    onChange={(e) => updateItem(item.localId, "avg_value", parseFloat(e.target.value) || 0)}
                    data-testid={`input-value-${idx}`}
                  />
                  {item.tsc_avg_hint !== null && item.avg_value !== item.tsc_avg_hint && (
                    <button
                      className="text-xs text-green-500 hover:text-green-400 underline underline-offset-2 cursor-pointer"
                      onClick={() => updateItem(item.localId, "avg_value", item.tsc_avg_hint!)}
                      data-testid={`hint-avg-${idx}`}
                    >
                      تطبيق المتوسط: {item.tsc_avg_hint.toFixed(2)}
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">تصنيف البضاعة ({(dutyRate * 100).toFixed(0)}%)</Label>
                  <Select
                    value={item.category}
                    onValueChange={(val) => handleCategoryChange(item.localId, val)}
                    data-testid={`select-category-${idx}`}
                  >
                    <SelectTrigger data-testid={`trigger-category-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GOODS_CATEGORIES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label} ({(c.dutyRate * 100).toFixed(0)}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    حماية المنتج (%)
                    {item.protection_rate > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-500 border-amber-500/30">محمي</Badge>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={parseFloat((item.protection_rate * 100).toFixed(0))}
                    onChange={(e) => updateItem(item.localId, "protection_rate", (parseFloat(e.target.value) || 0) / 100)}
                    data-testid={`input-protection-${idx}`}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">الرسم المدفوع (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.paid_duty}
                    onChange={(e) => updateItem(item.localId, "paid_duty", parseFloat(e.target.value) || 0)}
                    data-testid={`input-paid-${idx}`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {items.length > 0 && (
        <Button
          className="w-full"
          size="lg"
          onClick={handleCalculate}
          disabled={calcMutation.isPending}
          data-testid="button-calculate"
        >
          {calcMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
          ) : (
            <Calculator className="h-5 w-5 ml-2" />
          )}
          احسب
        </Button>
      )}

      {result && (
        <div ref={resultRef}>
          <Card data-testid="card-result" className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="text-lg">النتائج</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy">
                    <Copy className="h-4 w-4 ml-1" />
                    نسخ
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset">
                    <RotateCcw className="h-4 w-4 ml-1" />
                    مسح
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.items.map((it, i) => {
                const catLabel = GOODS_CATEGORIES.find(c => c.id === it.goods_category)?.label || "";
                const diffColor = it.difference_usd > 0 ? "text-green-400" : it.difference_usd < 0 ? "text-red-400" : "text-muted-foreground";
                return (
                  <Card key={i} className="bg-muted/30" data-testid={`result-item-${i}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">{it.hs_code}</Badge>
                        <span className="text-sm">{it.description || "—"}</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">الوزن</span>
                          <p className="font-medium">{it.quantity}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">متوسط التقييم</span>
                          <p className="font-medium">${formatUSD(it.avg_value)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">التصنيف</span>
                          <p className="font-medium">{catLabel} ({(it.duty_rate * 100).toFixed(0)}%)</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">الرسم</span>
                          <p className="font-medium">${formatUSD(it.duty_usd)}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/50">
                        <div className="text-sm">
                          <span className="text-muted-foreground">المدفوع: </span>
                          <span>${formatUSD(it.paid_duty_usd)}</span>
                        </div>
                        <div className={`text-sm font-bold ${diffColor}`} data-testid={`text-diff-${i}`}>
                          الفرق: ${formatUSD(it.difference_usd)} = {formatIQD(it.difference_iqd)} د.ع
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Card className="border-primary/50 bg-primary/5" data-testid="card-summary">
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي الرسم</p>
                      <p className="text-lg font-bold" data-testid="text-total-duty">${formatUSD(result.summary.total_duty_usd)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
                      <p className="text-lg font-bold" data-testid="text-total-paid">${formatUSD(result.summary.total_paid_usd)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">إجمالي الفرق</p>
                      <p className={`text-lg font-bold ${result.summary.total_difference_usd > 0 ? "text-green-400" : result.summary.total_difference_usd < 0 ? "text-red-400" : ""}`} data-testid="text-total-diff">
                        ${formatUSD(result.summary.total_difference_usd)}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid="text-total-diff-iqd">
                        {formatIQD(result.summary.total_difference_iqd)} د.ع
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
