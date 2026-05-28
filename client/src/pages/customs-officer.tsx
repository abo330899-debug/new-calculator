import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  Loader2,
  X,
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Printer,
  Copy,
  Calculator,
  Zap,
  DollarSign,
  ArrowLeftRight,
  Package,
  User,
  MapPin,
  Calendar,
  Hash,
  Container,
  Banknote,
  ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

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

type ManifestData = {
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
  duty_paid_usd: number;
  tax_paid_usd: number;
  total_value_usd: number;
  items: ExtractedItem[];
};

type OfficerItemRow = {
  item: ExtractedItem;
  cif: number;
  dutyRate: number;
  dutyAmount: number;
  protectionRate: number;
  protectionAmount: number;
  recalcTotal: number;
  paidAmount: number;
  differenceUsd: number;
  differenceIqd: number;
  warnings: string[];
  approvals: string[];
  isBanned: boolean;
  decision: "مقبول" | "يحتاج تدقيق" | "يحتاج موافقة" | "فرق رسم مطلوب" | "ممنوع";
};

type OfficerReport = {
  manifest: ManifestData;
  rows: OfficerItemRow[];
  totalCif: number;
  totalDuty: number;
  totalProtection: number;
  totalPaid: number;
  totalDiffUsd: number;
  totalDiffIqd: number;
  finalDecision: OfficerItemRow["decision"];
  fxRate: number;
};

type UploadedImage = { file: File; previewUrl: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_IMAGES = 8;

const PROTECTION_RULES: { prefix: string; rate: number; label: string }[] = [
  { prefix: "7214", rate: 0.30, label: "حديد تسليح — حماية منتج وطني" },
  { prefix: "72142", rate: 0.30, label: "حديد تسليح — حماية منتج وطني" },
  { prefix: "3924", rate: 0.60, label: "حاويات بلاستيك — حماية منتج وطني" },
  { prefix: "3917", rate: 0.60, label: "أنابيب بلاستيك — حماية منتج وطني" },
];

const BANNED_KEYWORDS = ["مخدرات", "أسلحة", "متفجرات", "ذخائر", "مواد مشعة", "نفايات خطرة", "drugs", "weapons", "explosives", "ammunition", "radioactive", "hazardous waste"];

const APPROVAL_RULES: { keywords: string[]; authority: string }[] = [
  { keywords: ["دواء", "أدوية", "طبي", "مستلزمات طبية", "حليب رضع", "pharma", "medicine", "medical"], authority: "وزارة الصحة" },
  { keywords: ["بذور", "تقاوي", "فسائل", "حيوانات حية", "أفراخ", "أسماك حية", "seeds", "livestock"], authority: "وزارة الزراعة / البيطرة" },
  { keywords: ["مبيدات", "مواد كيمياوية خطرة", "pesticides", "chemicals"], authority: "وزارة البيئة / الزراعة" },
  { keywords: ["أجهزة اتصالات", "أجهزة بث", "لاسلكي", "telecom", "broadcast", "wireless"], authority: "هيئة الإعلام والاتصالات" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtIQD(n: number) {
  return Math.round(n).toLocaleString("ar-IQ");
}

function normaliseRate(raw: number): { rate: number; suspicious: boolean } {
  if (raw <= 0) return { rate: 0, suspicious: false };
  if (raw <= 1) return { rate: raw, suspicious: false };
  if (raw <= 100) return { rate: raw / 100, suspicious: false };
  return { rate: 0, suspicious: true };
}

function getProtectionRate(hsCode: string): { rate: number; label: string } | null {
  const hs = hsCode.replace(/\D/g, "");
  for (const rule of PROTECTION_RULES) {
    if (hs.startsWith(rule.prefix)) return { rate: rule.rate, label: rule.label };
  }
  return null;
}

function checkBanned(desc: string): boolean {
  const lower = desc.toLowerCase();
  return BANNED_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function checkApprovals(desc: string): string[] {
  const lower = desc.toLowerCase();
  return APPROVAL_RULES
    .filter((r) => r.keywords.some((kw) => lower.includes(kw.toLowerCase())))
    .map((r) => r.authority);
}

function buildOfficerReport(manifest: ManifestData, fxRate: number, extraFees: number): OfficerReport {
  const rows: OfficerItemRow[] = manifest.items.map((item, i) => {
    const qty = Number(item.quantity) || 1;
    const unitVal = Number(item.unit_value) || 0;
    let cif = Number(item.total_value) || qty * unitVal;
    if (i === 0) cif += extraFees;

    const rawRate = Number(item.duty_rate) || 0;
    const { rate: dutyRate, suspicious } = normaliseRate(rawRate);
    const dutyAmount = cif * dutyRate;

    const protRule = getProtectionRate(item.hs_code);
    const protectionRate = protRule ? protRule.rate : 0;
    const protectionAmount = cif * protectionRate;

    const recalcTotal = dutyAmount + protectionAmount;
    const paidAmount = Number(item.duty_amount) || 0;
    const differenceUsd = recalcTotal - paidAmount;
    const differenceIqd = differenceUsd * fxRate;

    const warnings: string[] = [];
    if (suspicious) warnings.push("نسبة الرسم أكبر من 100 — غالباً رسم مقطوع أو خطأ تحويل");
    if (protRule) warnings.push(protRule.label);
    if (!item.hs_code) warnings.push("كود HS غير موجود");

    const approvals = checkApprovals(item.description || "");
    const isBanned = checkBanned(item.description || "");

    let decision: OfficerItemRow["decision"] = "مقبول";
    if (isBanned) decision = "ممنوع";
    else if (approvals.length > 0) decision = "يحتاج موافقة";
    else if (warnings.length > 0 && !protRule) decision = "يحتاج تدقيق";
    else if (Math.abs(differenceUsd) > 0.01) decision = "فرق رسم مطلوب";

    return { item, cif, dutyRate, dutyAmount, protectionRate, protectionAmount, recalcTotal, paidAmount, differenceUsd, differenceIqd, warnings, approvals, isBanned, decision };
  });

  const totalCif = rows.reduce((s, r) => s + r.cif, 0);
  const totalDuty = rows.reduce((s, r) => s + r.dutyAmount, 0);
  const totalProtection = rows.reduce((s, r) => s + r.protectionAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalDiffUsd = rows.reduce((s, r) => s + r.differenceUsd, 0);
  const totalDiffIqd = totalDiffUsd * fxRate;

  const decisionPriority: OfficerItemRow["decision"][] = ["ممنوع", "يحتاج موافقة", "فرق رسم مطلوب", "يحتاج تدقيق", "مقبول"];
  const finalDecision = decisionPriority.find((d) => rows.some((r) => r.decision === d)) ?? "مقبول";

  return { manifest, rows, totalCif, totalDuty, totalProtection, totalPaid, totalDiffUsd, totalDiffIqd, finalDecision, fxRate };
}

function buildCopyText(report: OfficerReport): string {
  const m = report.manifest;
  const lines: string[] = [
    "👮 تقرير الموظف الكمركي الذكي",
    "─────────────────────────────────",
    `القرار النهائي: ${report.finalDecision}`,
    m.declaration_number ? `رقم البيان: ${m.declaration_number}` : "",
    m.declaration_date ? `التاريخ: ${m.declaration_date}` : "",
    m.checkpoint ? `المنفذ: ${m.checkpoint}` : "",
    m.importer_name ? `المستورد: ${m.importer_name}` : "",
    `CIF: $${fmtUSD(report.totalCif)}`,
    `الرسم المحتسب: $${fmtUSD(report.totalDuty)}`,
    `حماية المنتج الوطني: $${fmtUSD(report.totalProtection)}`,
    `المدفوع: $${fmtUSD(report.totalPaid)}`,
    `فرق الرسم: $${fmtUSD(report.totalDiffUsd)} = ${fmtIQD(report.totalDiffIqd)} د.ع`,
    "",
    "─────────────────────────────────",
    "تفاصيل المواد:",
    ...report.rows.map((r, i) => [
      `\n${i + 1}. ${r.item.description || "—"}`,
      `   HS: ${r.item.hs_code || "—"} | الكمية: ${r.item.quantity} ${r.item.unit || ""}`,
      `   CIF: $${fmtUSD(r.cif)} | الرسم: ${(r.dutyRate * 100).toFixed(0)}% = $${fmtUSD(r.dutyAmount)}`,
      r.protectionAmount > 0 ? `   حماية: ${(r.protectionRate * 100).toFixed(0)}% = $${fmtUSD(r.protectionAmount)}` : "",
      `   المدفوع: $${fmtUSD(r.paidAmount)} | الفرق: $${fmtUSD(r.differenceUsd)} = ${fmtIQD(r.differenceIqd)} د.ع`,
      `   القرار: ${r.decision}`,
      r.warnings.length ? `   ملاحظات: ${r.warnings.join(" | ")}` : "",
      r.approvals.length ? `   يحتاج موافقة: ${r.approvals.join("، ")}` : "",
    ].filter(Boolean).join("\n")),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

// ── Decision badge ────────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: OfficerItemRow["decision"] }) {
  const map: Record<OfficerItemRow["decision"], { color: string; icon: React.ReactNode }> = {
    "مقبول": { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3" /> },
    "يحتاج تدقيق": { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
    "يحتاج موافقة": { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: <Shield className="h-3 w-3" /> },
    "فرق رسم مطلوب": { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: <DollarSign className="h-3 w-3" /> },
    "ممنوع": { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <ShieldAlert className="h-3 w-3" /> },
  };
  const { color, icon } = map[decision];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-bold ${color}`}>
      {icon}{decision}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomsOfficerPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<UploadedImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [fxRate, setFxRate] = useState(1320);
  const [extraFees, setExtraFees] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [report, setReport] = useState<OfficerReport | null>(null);

  // ── Image handling ────────────────────────────────────────────────────────

  const addImages = useCallback((files: File[]) => {
    const remaining = MAX_IMAGES - images.length;
    const valid = files.filter((f) => f.size <= 10 * 1024 * 1024).slice(0, remaining);
    if (valid.length < files.length) toast({ title: "تحذير", description: "بعض الصور تجاوزت 10 ميغابايت أو تجاوز العدد الأقصى", variant: "destructive" });
    const newImgs = valid.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...newImgs]);
    setReport(null);
  }, [images.length, toast]);

  const removeImage = (idx: number) => {
    setImages((prev) => { URL.revokeObjectURL(prev[idx].previewUrl); return prev.filter((_, i) => i !== idx); });
    setReport(null);
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setReport(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addImages(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
  };

  // ── Run officer check ─────────────────────────────────────────────────────

  const handleRun = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setReport(null);
    try {
      setStatusMsg("جاري قراءة صور المنفست بالذكاء الاصطناعي...");
      const formData = new FormData();
      if (images.length === 1) {
        formData.append("image", images[0].file);
      } else {
        images.forEach((img) => formData.append("images", img.file));
      }

      const endpoint = images.length === 1 ? "/api/manifest/extract" : "/api/manifest/extract-multi";
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "فشل الاستخراج" }));
        throw new Error(err.error || "فشل الاستخراج");
      }
      const manifest: ManifestData = await res.json();

      setStatusMsg("جاري تحليل المواد وحساب الرسوم...");
      const rpt = buildOfficerReport(manifest, fxRate, extraFees);
      setReport(rpt);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message || "فشل التدقيق", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setStatusMsg("");
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(buildCopyText(report)).then(() => {
      toast({ title: "تم النسخ", description: "تم نسخ التقرير إلى الحافظة" });
    });
  };

  const handleOpenCalculator = () => {
    if (!report) return;
    const data = encodeURIComponent(JSON.stringify(report.manifest));
    navigate(`/calculator?manifest=${data}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const m = report?.manifest;

  return (
    <div className="max-w-6xl mx-auto space-y-4" dir="rtl">

      {/* ── Hero header ────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 gradient-hero p-6 md:p-8">
        <div className="orb orb-gold w-48 h-48 -top-12 -right-12 float-slow" />
        <div className="orb orb-blue w-32 h-32 bottom-0 left-16 float-medium" style={{ animationDelay: "2s" }} />
        <div className="relative z-10 flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/25 rounded-2xl blur-xl scale-125" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold text-white shadow-xl glow-gold-sm text-2xl">
              👮
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold badge-gold px-2.5 py-1 rounded-full flex items-center gap-1">
                <Zap className="h-2.5 w-2.5" />
                مساعد تدقيق داخلي
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black">
              <span className="text-shimmer">الموظف الكمركي الذكي</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              قراءة منفست • تحليل HS • احتساب CIF والرسم • كشف الحماية والموافقات وفرق الرسم
            </p>
          </div>
        </div>
      </div>

      {/* ── Legal warning ───────────────────────────────────────────── */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200/80 leading-relaxed">
            <strong className="text-amber-400">تنبيه قانوني:</strong> هذا مساعد تدقيق داخلي وليس قراراً رسمياً نهائياً.
            القرار النهائي يعتمد على الجداول الرسمية والقرارات النافذة للهيئة العامة للكمارك والجهات القطاعية.
          </p>
        </CardContent>
      </Card>

      {/* ── Upload area ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) addImages(f); }} />
          <input ref={addMoreRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) addImages(f); }} />

          {images.length === 0 ? (
            <div
              className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 group overflow-hidden
                ${dragOver ? "border-primary bg-primary/8 scale-[1.01]" : "border-border/60 hover:border-primary/50 hover:bg-primary/3"}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-all duration-300 group-hover:scale-110">
                  <Upload className="h-7 w-7 text-primary" />
                </div>
                <p className="text-base font-bold mb-1">ارفع صور المنفست أو الفاتورة الكمركية</p>
                <p className="text-sm text-muted-foreground">PNG, JPG, WEBP — حتى {MAX_IMAGES} صور، 10 ميغابايت لكل صورة</p>
                <div className="mt-4 inline-flex items-center gap-2 gradient-gold text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-md">
                  <Upload className="h-4 w-4" />
                  اختر الصور
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{images.length} {images.length === 1 ? "صورة" : "صور"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {images.length < MAX_IMAGES && (
                    <Button size="sm" variant="outline" onClick={() => addMoreRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 ml-1" />إضافة صور
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={clearAll}>
                    <X className="h-3.5 w-3.5 ml-1" />مسح الكل
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, idx) => (
                  <div key={idx} className="relative shrink-0 group">
                    <img src={img.previewUrl} alt={`صفحة ${idx + 1}`} className="h-24 w-auto rounded-xl object-cover border border-border/50" />
                    <Button size="icon" variant="destructive" onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-3 w-3" />
                    </Button>
                    <span className="absolute bottom-1 left-1 text-[10px] bg-background/80 rounded px-1 font-mono">{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                <ArrowLeftRight className="h-3 w-3" />سعر الصرف (IQD/USD)
              </Label>
              <Input type="number" value={fxRate} onChange={(e) => setFxRate(Number(e.target.value) || 1320)}
                className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1 text-muted-foreground">
                <DollarSign className="h-3 w-3" />مصاريف CIF إضافية (USD)
              </Label>
              <Input type="number" value={extraFees} onChange={(e) => setExtraFees(Number(e.target.value) || 0)}
                className="h-9 text-sm" />
            </div>
            <div className="flex items-end">
              <Button className="w-full gradient-gold text-white font-bold h-9 shadow-lg hover:shadow-xl transition-shadow"
                onClick={handleRun} disabled={images.length === 0 || isProcessing}>
                {isProcessing ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />{statusMsg || "جاري التدقيق..."}</> : <>👮 دقق الشحنة</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Report ─────────────────────────────────────────────────── */}
      {report && (
        <div className="space-y-4 animate-fade-up">

          {/* Final decision banner */}
          <div className={`relative overflow-hidden rounded-2xl border p-5 flex items-center justify-between gap-4 flex-wrap
            ${report.finalDecision === "ممنوع" ? "bg-red-500/10 border-red-500/30" :
              report.finalDecision === "يحتاج موافقة" ? "bg-blue-500/10 border-blue-500/30" :
              report.finalDecision === "فرق رسم مطلوب" ? "bg-orange-500/10 border-orange-500/30" :
              report.finalDecision === "يحتاج تدقيق" ? "bg-amber-500/10 border-amber-500/30" :
              "bg-emerald-500/10 border-emerald-500/30"}`}>
            <div className="flex items-center gap-3">
              <div className="text-3xl">
                {report.finalDecision === "ممنوع" ? "🚫" :
                 report.finalDecision === "يحتاج موافقة" ? "🛡" :
                 report.finalDecision === "فرق رسم مطلوب" ? "💰" :
                 report.finalDecision === "يحتاج تدقيق" ? "⚠️" : "✅"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">القرار النهائي للشحنة</p>
                <p className="text-xl font-black">{report.finalDecision}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5 ml-1" />نسخ التقرير
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 ml-1" />طباعة
              </Button>
              <Button size="sm" className="gradient-gold text-white" onClick={handleOpenCalculator}>
                <Calculator className="h-3.5 w-3.5 ml-1" />فتح في الحاسبة
              </Button>
            </div>
          </div>

          {/* Manifest info */}
          {m && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />ملخص الشحنة
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                  {[
                    { icon: Hash, label: "رقم البيان", value: m.declaration_number },
                    { icon: Calendar, label: "التاريخ", value: m.declaration_date },
                    { icon: MapPin, label: "المنفذ", value: m.checkpoint },
                    { icon: User, label: "المستورد", value: m.importer_name },
                    { icon: Package, label: "بلد المنشأ", value: m.origin_country },
                    { icon: Container, label: "رقم الحاوية", value: m.container_number },
                    { icon: ArrowLeftRight, label: "سعر الصرف", value: report.fxRate ? `${report.fxRate} د.ع` : "" },
                    { icon: Package, label: "عدد المواد", value: String(report.rows.length) },
                  ].filter((f) => f.value).map(({ icon: Icon, label, value }) => (
                    <div key={label} className="bg-muted/40 rounded-xl p-2.5">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                        <Icon className="h-3 w-3" />{label}
                      </p>
                      <p className="font-bold text-xs truncate">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Financial summary */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {[
                    { label: "إجمالي CIF", value: `$${fmtUSD(report.totalCif)}`, color: "text-foreground" },
                    { label: "الرسم الكمركي", value: `$${fmtUSD(report.totalDuty)}`, color: "text-amber-400" },
                    { label: "حماية الوطني", value: `$${fmtUSD(report.totalProtection)}`, color: "text-blue-400" },
                    { label: "المدفوع", value: `$${fmtUSD(report.totalPaid)}`, color: "text-emerald-400" },
                    {
                      label: "فرق الرسم",
                      value: `$${fmtUSD(report.totalDiffUsd)}`,
                      sub: `${fmtIQD(report.totalDiffIqd)} د.ع`,
                      color: report.totalDiffUsd > 0.01 ? "text-orange-400" : report.totalDiffUsd < -0.01 ? "text-blue-400" : "text-emerald-400",
                    },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="bg-muted/40 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                      <p className={`font-black text-sm ${color}`}>{value}</p>
                      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Items table */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-right text-xs w-8">#</TableHead>
                    <TableHead className="text-right text-xs">HS</TableHead>
                    <TableHead className="text-right text-xs">الوصف</TableHead>
                    <TableHead className="text-right text-xs">CIF</TableHead>
                    <TableHead className="text-right text-xs">الرسم</TableHead>
                    <TableHead className="text-right text-xs">حماية الوطني</TableHead>
                    <TableHead className="text-right text-xs">المدفوع</TableHead>
                    <TableHead className="text-right text-xs">فرق الرسم</TableHead>
                    <TableHead className="text-right text-xs">الموافقات</TableHead>
                    <TableHead className="text-right text-xs">ملاحظات</TableHead>
                    <TableHead className="text-right text-xs">القرار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row, i) => (
                    <TableRow key={i} className={row.isBanned ? "bg-red-500/5" : ""}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-mono text-primary">{row.item.hs_code || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[160px]">
                        <span className="line-clamp-2">{row.item.description || "—"}</span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">
                          {row.item.quantity} {row.item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono">${fmtUSD(row.cif)}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono">${fmtUSD(row.dutyAmount)}</span>
                        <span className="text-[10px] text-muted-foreground block">{(row.dutyRate * 100).toFixed(0)}%</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.protectionAmount > 0 ? (
                          <>
                            <span className="font-mono text-blue-400">${fmtUSD(row.protectionAmount)}</span>
                            <span className="text-[10px] text-muted-foreground block">{(row.protectionRate * 100).toFixed(0)}%</span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-emerald-400">${fmtUSD(row.paidAmount)}</TableCell>
                      <TableCell className="text-xs">
                        <span className={`font-mono font-bold ${row.differenceUsd > 0.01 ? "text-orange-400" : row.differenceUsd < -0.01 ? "text-blue-400" : "text-emerald-400"}`}>
                          ${fmtUSD(row.differenceUsd)}
                        </span>
                        <span className="text-[10px] text-muted-foreground block">{fmtIQD(row.differenceIqd)} د.ع</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.approvals.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.approvals.map((a) => (
                              <Badge key={a} variant="outline" className="text-[9px] border-blue-500/30 text-blue-400 block w-max">{a}</Badge>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">—</span>}
                      </TableCell>
                      <TableCell className="text-xs max-w-[140px]">
                        {row.warnings.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.warnings.map((w, wi) => (
                              <p key={wi} className="text-[10px] text-amber-400 leading-tight">{w}</p>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground text-[10px]">—</span>}
                      </TableCell>
                      <TableCell><DecisionBadge decision={row.decision} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Bottom actions */}
          <div className="flex gap-3 flex-wrap pb-4">
            <Button variant="outline" onClick={handleCopy} className="gap-2">
              <Copy className="h-4 w-4" />نسخ التقرير الكامل
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />طباعة
            </Button>
            <Button className="gradient-gold text-white gap-2" onClick={handleOpenCalculator}>
              <Calculator className="h-4 w-4" />فتح في الحاسبة
            </Button>
            <Button variant="ghost" onClick={clearAll} className="gap-2 text-muted-foreground hover:text-foreground">
              <Upload className="h-4 w-4" />تدقيق شحنة جديدة
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
