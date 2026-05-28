import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Upload,
  FileImage,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Package,
  X,
  Calculator,
  MapPin,
  Receipt,
  DollarSign,
  Plus,
  Hash,
  Calendar,
  User,
  Globe,
  Banknote,
  ArrowLeftRight,
  Boxes,
  Truck,
  Container,
  FileText,
  ScanText,
  Zap,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ExtractedItem = {
  item_number: number;
  hs_code: string;
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  unit: string;
  duty_amount: number;
  duty_rate: number;
  origin: string;
  goods_category: string;
};

type ExtractionResult = {
  declaration_number: string;
  declaration_date: string;
  checkpoint: string;
  importer_name: string;
  origin_country: string;
  currency: string;
  fx_rate: number;
  total_packages: number;
  transport_method: string;
  container_number: string;
  paid_amount_usd: number;
  duty_paid_usd: number;
  tax_paid_usd: number;
  total_value_usd: number;
  items: ExtractedItem[];
};

type HsValidationResult = {
  found: boolean;
  description?: string;
  unit?: string;
  min_value?: number;
  avg_value?: number;
  max_value?: number;
};

type UploadedImage = {
  file: File;
  previewUrl: string;
};

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ManifestPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [editedItems, setEditedItems] = useState<ExtractedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [hsValidation, setHsValidation] = useState<
    Record<string, HsValidationResult>
  >({});
  const [isValidating, setIsValidating] = useState(false);
  const [isExtractingOcr, setIsExtractingOcr] = useState(false);
  const [isAutoCalc, setIsAutoCalc] = useState(false);
  const [autoCalcResult, setAutoCalcResult] = useState<{
    fx_rate: number;
    items: {
      item_number: number;
      hs_code: string;
      description: string;
      quantity: number;
      unit: string;
      avg_value: number;
      total_value_usd: number;
      duty_rate: number;
      duty_usd: number;
      duty_iqd: number;
      in_db: boolean;
      is_protected: boolean;
    }[];
    summary: {
      total_items: number;
      total_value_usd: number;
      total_duty_usd: number;
      total_duty_iqd: number;
    };
  } | null>(null);

  const MAX_IMAGES = 5;

  const addImages = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imageFiles.length === 0) {
        toast({
          title: "خطأ",
          description: "يرجى رفع صور فقط",
          variant: "destructive",
        });
        return;
      }

      const oversized = imageFiles.find((f) => f.size > 10 * 1024 * 1024);
      if (oversized) {
        toast({
          title: "خطأ",
          description: "حجم الصورة يجب أن لا يتجاوز 10 ميغابايت",
          variant: "destructive",
        });
        return;
      }

      setImages((prev) => {
        const remaining = MAX_IMAGES - prev.length;
        if (remaining <= 0) {
          toast({
            title: "تنبيه",
            description: `الحد الأقصى ${MAX_IMAGES} صور`,
            variant: "destructive",
          });
          return prev;
        }
        const toAdd = imageFiles.slice(0, remaining);
        const newImages = toAdd.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        return [...prev, ...newImages];
      });
    },
    [toast],
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const validateHsCodes = useCallback(async (items: ExtractedItem[]) => {
    const codesSet = new Set(items.map((it) => it.hs_code).filter(Boolean));
    const codes = Array.from(codesSet);
    if (codes.length === 0) return;

    setIsValidating(true);
    try {
      const res = await fetch("/api/manifest/validate-hs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hs_codes: codes }),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setHsValidation(data.results || {});
      }
    } catch {
      // silently fail validation
    } finally {
      setIsValidating(false);
    }
  }, []);

  const handleExtract = useCallback(async () => {
    if (images.length === 0) return;

    setExtraction(null);
    setEditedItems([]);
    setError(null);
    setSelectedItems(new Set());
    setHsValidation({});
    setIsExtracting(true);

    try {
      const formData = new FormData();
      let url: string;

      if (images.length === 1) {
        formData.append("image", images[0].file);
        url = "/api/manifest/extract";
      } else {
        images.forEach((img) => formData.append("images", img.file));
        url = "/api/manifest/extract-multi";
      }

      const res = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "فشل في استخراج البيانات" }));
        throw new Error(body.error || "فشل في استخراج البيانات");
      }

      const data: ExtractionResult = await res.json();
      if (data.items && data.items.length > 0) {
        setExtraction(data);
        setEditedItems(data.items.map((item) => ({ ...item })));
        const allIndices = new Set<number>(data.items.map((_, i) => i));
        setSelectedItems(allIndices);
        toast({
          title: "تم الاستخراج",
          description: `تم استخراج ${data.items.length} منتج من ${images.length > 1 ? "الصور" : "الصورة"}`,
        });
        validateHsCodes(data.items);
      } else {
        setError(
          "لم يتم العثور على منتجات في الصورة. حاول رفع صورة أوضح.",
        );
      }
    } catch (e: any) {
      setError(e.message || "فشل في استخراج البيانات");
    } finally {
      setIsExtracting(false);
    }
  }, [images, toast, validateHsCodes]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      addImages(files);
    },
    [addImages],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const toggleItem = (idx: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (editedItems.length > 0)
      setSelectedItems(new Set(editedItems.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  const updateEditedItem = (
    idx: number,
    field: keyof ExtractedItem,
    value: string | number,
  ) => {
    setEditedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  const sendToCalculator = () => {
    if (!extraction) return;
    const selected = editedItems.filter((_, i) => selectedItems.has(i));
    if (selected.length === 0) {
      toast({
        title: "تنبيه",
        description: "يرجى اختيار منتج واحد على الأقل",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      checkpoint: extraction.checkpoint,
      paid_amount_usd: extraction.paid_amount_usd,
      items: selected.map((item) => ({
        hs_code: item.hs_code,
        description: item.description,
        quantity: item.quantity,
        unit_value: item.unit_value,
        total_value: item.total_value,
        unit: item.unit,
        duty_amount: item.duty_amount,
        duty_rate: item.duty_rate,
        origin: item.origin,
        goods_category: item.goods_category,
      })),
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    navigate(`/calculator?manifest=${encoded}`);
  };

  const handleExtractOcr = useCallback(async () => {
    if (images.length === 0) return;
    setExtraction(null);
    setEditedItems([]);
    setError(null);
    setSelectedItems(new Set());
    setHsValidation({});
    setIsExtractingOcr(true);
    try {
      const formData = new FormData();
      formData.append("image", images[0].file);
      const res = await fetch("/api/manifest/extract-ocr", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "فشل في قراءة الصورة" }));
        throw new Error(body.error || "فشل في قراءة الصورة");
      }
      const data: ExtractionResult = await res.json();
      if (data.items && data.items.length > 0) {
        setExtraction(data);
        setEditedItems(data.items.map((item) => ({ ...item })));
        setSelectedItems(new Set(data.items.map((_, i) => i)));
        toast({ title: "تم الاستخراج بـ OCR", description: `تم استخراج ${data.items.length} منتج` });
        validateHsCodes(data.items);
      } else {
        setError("لم يتم العثور على منتجات. حاول رفع صورة أوضح.");
      }
    } catch (e: any) {
      setError(e.message || "فشل في قراءة الصورة بـ OCR");
    } finally {
      setIsExtractingOcr(false);
    }
  }, [images, toast, validateHsCodes]);

  const handleAutoCalculate = useCallback(async () => {
    if (images.length === 0) return;
    setAutoCalcResult(null);
    setExtraction(null);
    setEditedItems([]);
    setError(null);
    setIsAutoCalc(true);
    try {
      const formData = new FormData();
      formData.append("image", images[0].file);
      const res = await fetch("/api/manifest/auto-calculate", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "فشل في الحساب" }));
        throw new Error(body.error || "فشل في الحساب التلقائي");
      }
      const data = await res.json();
      setAutoCalcResult(data);
      toast({ title: "✅ تم الحساب", description: `${data.summary.total_items} صنف — إجمالي الرسم: $${data.summary.total_duty_usd.toFixed(2)}` });
    } catch (e: any) {
      setError(e.message || "فشل في الحساب التلقائي");
    } finally {
      setIsAutoCalc(false);
    }
  }, [images, toast]);

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setExtraction(null);
    setAutoCalcResult(null);
    setEditedItems([]);
    setError(null);
    setSelectedItems(new Set());
    setHsValidation({});
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (addMoreInputRef.current) addMoreInputRef.current.value = "";
  };

  const metadataFields = extraction
    ? [
        {
          label: "رقم البيان",
          value: extraction.declaration_number,
          icon: Hash,
        },
        {
          label: "تاريخ البيان",
          value: extraction.declaration_date,
          icon: Calendar,
        },
        {
          label: "المنفذ الكمركي",
          value: extraction.checkpoint,
          icon: MapPin,
        },
        {
          label: "المستورد",
          value: extraction.importer_name,
          icon: User,
        },
        {
          label: "بلد المنشأ",
          value: extraction.origin_country,
          icon: Globe,
        },
        {
          label: "العملة",
          value: extraction.currency,
          icon: Banknote,
        },
        {
          label: "سعر الصرف",
          value:
            extraction.fx_rate > 0
              ? extraction.fx_rate.toLocaleString()
              : "",
          icon: ArrowLeftRight,
        },
        {
          label: "عدد الطرود",
          value:
            extraction.total_packages > 0
              ? extraction.total_packages.toLocaleString()
              : "",
          icon: Boxes,
        },
        {
          label: "طريقة النقل",
          value: extraction.transport_method,
          icon: Truck,
        },
        {
          label: "رقم الحاوية",
          value: extraction.container_number,
          icon: Container,
        },
      ].filter((f) => f.value && String(f.value).trim() !== "")
    : [];

  const financialCards = extraction
    ? [
        {
          label: "القيمة الإجمالية",
          value: extraction.total_value_usd,
          icon: DollarSign,
        },
        {
          label: "الرسم المدفوع",
          value: extraction.duty_paid_usd,
          icon: Receipt,
        },
        {
          label: "الضريبة المدفوعة",
          value: extraction.tax_paid_usd,
          icon: Receipt,
        },
        {
          label: "إجمالي المدفوع",
          value: extraction.duty_paid_usd + extraction.tax_paid_usd,
          icon: Banknote,
        },
      ].filter((f) => f.value > 0)
    : [];

  const allSelected =
    editedItems.length > 0 && selectedItems.size === editedItems.length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 gradient-hero p-6 md:p-8">
        <div className="orb orb-gold w-48 h-48 -top-12 -right-12 float-slow" />
        <div className="orb orb-blue w-32 h-32 bottom-0 left-16 float-medium" style={{ animationDelay: "2s" }} />
        <div className="relative z-10 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/25 rounded-2xl blur-xl scale-125" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold text-white shadow-xl glow-gold-sm">
              <FileImage className="h-7 w-7" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold badge-gold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                احسب بضغطة واحدة
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black" data-testid="text-manifest-title">
              <span className="text-shimmer">قراءة المنفست</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              ارفع صورة البيان الكمركي — يقرأ تلقائياً ويحسب الرسوم فوراً
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) addImages(files);
            }}
            data-testid="input-manifest-file"
          />
          <input
            ref={addMoreInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) addImages(files);
            }}
            data-testid="input-manifest-add-more"
          />

          {images.length === 0 ? (
            <div
              className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 group overflow-hidden
                ${dragOver
                  ? "border-primary bg-primary/8 scale-[1.01]"
                  : "border-border/60 hover:border-primary/50 hover:bg-primary/3"
                }`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              data-testid="dropzone-manifest"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-all duration-300 group-hover:scale-110">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <p className="text-base font-bold mb-1">
                  اسحب الصور هنا أو اضغط للاختيار
                </p>
                <p className="text-sm text-muted-foreground">
                  PNG, JPG, WEBP — حتى {MAX_IMAGES} صور، 10 ميغابايت لكل صورة
                </p>
                <div className="mt-4 inline-flex items-center gap-2 gradient-gold text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md group-hover:shadow-lg transition-shadow">
                  <Upload className="h-4 w-4" />
                  اختر صورة المنفست
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <FileImage className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium" data-testid="text-image-count">
                    {images.length}{" "}
                    {images.length === 1 ? "صورة" : "صور"}
                  </span>
                  {isExtracting && (
                    <Badge variant="secondary">جاري التحليل...</Badge>
                  )}
                  {!isExtracting && editedItems.length > 0 && (
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 ml-1" />
                      {editedItems.length} منتج
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {images.length < MAX_IMAGES && !extraction && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addMoreInputRef.current?.click()}
                      data-testid="button-add-more-pages"
                    >
                      <Plus className="h-4 w-4" />
                      <span className="mr-1">إضافة صفحات</span>
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={clearAll}
                    data-testid="button-clear-manifest"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div
                className="flex gap-2 overflow-x-auto pb-2"
                data-testid="thumbnails-row"
              >
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative shrink-0 group"
                    data-testid={`thumbnail-${idx}`}
                  >
                    <img
                      src={img.previewUrl}
                      alt={`صفحة ${idx + 1}`}
                      className="h-28 w-auto rounded-md object-cover border"
                    />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeImage(idx)}
                      data-testid={`button-remove-image-${idx}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                    <span className="absolute bottom-1 left-1 text-xs bg-background/80 rounded px-1 font-mono">
                      {idx + 1}
                    </span>
                  </div>
                ))}
              </div>

              {!extraction && !isExtracting && !isExtractingOcr && !isAutoCalc && !autoCalcResult && (
                <div className="space-y-2">
                  <Button
                    className="w-full gradient-gold text-white font-bold text-base h-12 shadow-lg"
                    onClick={handleAutoCalculate}
                    data-testid="button-auto-calculate"
                  >
                    <Zap className="h-5 w-5" />
                    <span className="mr-2">احسب — نتيجة فورية بضغطة واحدة</span>
                  </Button>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleExtract} data-testid="button-extract">
                      <FileText className="h-3 w-3" />
                      <span className="mr-1">استخراج بالذكاء الاصطناعي</span>
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={handleExtractOcr} data-testid="button-extract-ocr">
                      <ScanText className="h-3 w-3" />
                      <span className="mr-1">استخراج بـ OCR فقط</span>
                    </Button>
                  </div>
                </div>
              )}
              {(isExtracting || isExtractingOcr || isAutoCalc) && (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isAutoCalc ? "جاري قراءة المنفست وحساب الرسوم..." : isExtractingOcr ? "جاري قراءة النص بـ OCR..." : "جاري التحليل بالذكاء الاصطناعي..."}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isExtracting && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">
              جاري تحليل{" "}
              {images.length > 1
                ? `${images.length} صور`
                : "الصورة"}{" "}
              بالذكاء الاصطناعي...
            </p>
            <p className="text-xs text-muted-foreground">
              قد يستغرق هذا بضع ثوان
            </p>
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-1/2 mx-auto" />
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">
                فشل في استخراج البيانات
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {error}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={clearAll}
                data-testid="button-retry-upload"
              >
                حاول مرة أخرى
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {extraction && !isExtracting && (
        <>
          {metadataFields.length > 0 && (
            <div>
              <h2
                className="text-sm font-semibold text-muted-foreground mb-2"
                data-testid="text-metadata-heading"
              >
                بيانات البيان الكمركي
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {metadataFields.map((field) => {
                  const Icon = field.icon;
                  return (
                    <Card key={field.label}>
                      <CardContent className="p-3 flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            {field.label}
                          </p>
                          <p
                            className="text-sm font-medium truncate"
                            data-testid={`text-metadata-${field.label}`}
                          >
                            {field.value}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {financialCards.length > 0 && (
            <div>
              <h2
                className="text-sm font-semibold text-muted-foreground mb-2"
                data-testid="text-financial-heading"
              >
                الملخص المالي
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {financialCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card key={card.label}>
                      <CardContent className="p-3 flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">
                            {card.label}
                          </p>
                          <p
                            className="text-sm font-medium font-mono"
                            data-testid={`text-financial-${card.label}`}
                          >
                            ${formatUSD(card.value)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <Package className="h-4 w-4" />
                المنتجات المستخرجة
                <Badge variant="secondary">
                  {selectedItems.size}/{editedItems.length}
                </Badge>
                {isValidating && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={allSelected ? deselectAll : selectAll}
                  data-testid="button-toggle-select-all"
                >
                  {allSelected ? "إلغاء التحديد" : "تحديد الكل"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) =>
                            checked ? selectAll() : deselectAll()
                          }
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead className="w-10 text-center">
                        #
                      </TableHead>
                      <TableHead className="min-w-[120px]">
                        HS Code
                      </TableHead>
                      <TableHead className="min-w-[180px]">
                        الوصف
                      </TableHead>
                      <TableHead className="min-w-[80px]">
                        الكمية
                      </TableHead>
                      <TableHead className="min-w-[60px]">
                        الوحدة
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        سعر الوحدة
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        الإجمالي
                      </TableHead>
                      <TableHead className="min-w-[70px]">
                        نسبة الرسم
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        الرسم
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        التصنيف
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editedItems.map((item, idx) => {
                      const validation = hsValidation[item.hs_code];
                      return (
                        <TableRow
                          key={idx}
                          data-state={
                            selectedItems.has(idx)
                              ? "selected"
                              : undefined
                          }
                          data-testid={`row-item-${idx}`}
                        >
                          <TableCell className="text-center">
                            <Checkbox
                              checked={selectedItems.has(idx)}
                              onCheckedChange={() => toggleItem(idx)}
                              data-testid={`checkbox-item-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-muted-foreground text-xs">
                            {item.item_number || idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="font-mono text-xs"
                              >
                                {item.hs_code || "-"}
                              </Badge>
                              {validation && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="shrink-0 cursor-default">
                                      {validation.found ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                      ) : (
                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                      )}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs max-w-[200px]">
                                      {validation.found
                                        ? validation.description ||
                                          "موجود في قاعدة البيانات"
                                        : "غير موجود في قاعدة البيانات"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {validation?.found &&
                              validation.description && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[150px]">
                                  {validation.description}
                                </p>
                              )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) =>
                                updateEditedItem(
                                  idx,
                                  "description",
                                  e.target.value,
                                )
                              }
                              className="text-xs"
                              data-testid={`input-description-${idx}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                updateEditedItem(
                                  idx,
                                  "quantity",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="text-xs font-mono w-20"
                              data-testid={`input-quantity-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.unit || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.unit_value > 0
                              ? `$${formatUSD(item.unit_value)}`
                              : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.total_value > 0
                              ? `$${formatUSD(item.total_value)}`
                              : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.duty_rate > 0
                              ? `${(item.duty_rate * 100).toFixed(0)}%`
                              : "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item.duty_amount > 0
                              ? `$${formatUSD(item.duty_amount)}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.goods_category || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              className="flex-1"
              size="lg"
              onClick={sendToCalculator}
              disabled={selectedItems.size === 0}
              data-testid="button-send-to-calculator"
            >
              <Calculator className="h-4 w-4" />
              <span className="mr-2">
                نقل إلى الحاسبة ({selectedItems.size} منتج)
              </span>
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={clearAll}
              data-testid="button-upload-another"
            >
              <Upload className="h-4 w-4" />
              <span className="mr-2">صورة جديدة</span>
            </Button>
          </div>
        </>
      )}

      {/* ── نتائج الحساب التلقائي ── */}
      {autoCalcResult && !isAutoCalc && (
        <div className="space-y-4">
          {/* ملخص */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "عدد الأصناف", value: autoCalcResult.summary.total_items.toString(), icon: Package, color: "text-blue-500" },
              { label: "إجمالي القيمة", value: `$${autoCalcResult.summary.total_value_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, icon: DollarSign, color: "text-emerald-500" },
              { label: "إجمالي الرسم (USD)", value: `$${autoCalcResult.summary.total_duty_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, icon: Receipt, color: "text-amber-500" },
              { label: "إجمالي الرسم (IQD)", value: autoCalcResult.summary.total_duty_iqd.toLocaleString("en-US"), icon: Banknote, color: "text-rose-500" },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-3 flex items-center gap-2">
                  <c.icon className={`h-5 w-5 shrink-0 ${c.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-sm font-bold font-mono">{c.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* جدول الأصناف */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                تفاصيل الحساب
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 text-center">#</TableHead>
                      <TableHead>HS Code</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead className="text-center">الكمية</TableHead>
                      <TableHead className="text-center">متوسط القيمة</TableHead>
                      <TableHead className="text-center">نسبة الرسم</TableHead>
                      <TableHead className="text-center">الرسم (USD)</TableHead>
                      <TableHead className="text-center">الرسم (IQD)</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoCalcResult.items.map((item) => (
                      <TableRow key={item.item_number}>
                        <TableCell className="text-center text-xs text-muted-foreground">{item.item_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{item.hs_code}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{item.description || "-"}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{item.quantity}</TableCell>
                        <TableCell className="text-center text-xs font-mono">${item.avg_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-center text-xs font-mono">{(item.duty_rate * 100).toFixed(0)}%</TableCell>
                        <TableCell className="text-center text-xs font-mono font-bold text-amber-600">${item.duty_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-center text-xs font-mono font-bold text-rose-600">{item.duty_iqd.toLocaleString("en-US")}</TableCell>
                        <TableCell className="text-center">
                          {item.in_db ? (
                            <Tooltip>
                              <TooltipTrigger><ShieldCheck className="h-4 w-4 text-emerald-500 mx-auto" /></TooltipTrigger>
                              <TooltipContent><p className="text-xs">موجود في قاعدة البيانات</p></TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger><ShieldAlert className="h-4 w-4 text-amber-500 mx-auto" /></TooltipTrigger>
                              <TooltipContent><p className="text-xs">غير موجود — تم تطبيق نسبة افتراضية 30%</p></TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* زر صورة جديدة */}
          <Button variant="outline" className="w-full" onClick={clearAll}>
            <Upload className="h-4 w-4" />
            <span className="mr-2">منفست جديد</span>
          </Button>
        </div>
      )}
    </div>
  );
}
