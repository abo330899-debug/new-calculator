import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Database, Calculator, FileText, Shield, Scale, BookOpen, Percent } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function About() {
  const { data: stats, isLoading } = useQuery<{
    rows_total: number;
    hs_unique: number;
    units_unique: number;
  }>({
    queryKey: ["/api/stats"],
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-card via-card to-primary/5 border border-border/50">
        <div className="absolute top-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="relative">
          <h1 className="text-2xl font-bold" data-testid="text-about-title">
            <span className="text-gradient-gold">حول النظام</span>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            معلومات عن حاسبة فرق الرسم الكمركي — تحديث 2026
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Calculator className="h-4 w-4 text-primary" />
            </div>
            حاسبة فرق الرسم الكمركي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            نظام إلكتروني متكامل لحساب فرق الرسوم الكمركية في المنافذ الحدودية العراقية.
            يتيح النظام البحث عن المنتجات باستخدام رمز النظام المنسق (HS Code) أو الوصف النصي،
            وعرض القيم الاستدلالية المعتمدة (أدنى، متوسط، أقصى) لكل منتج.
          </p>
          <p>
            يعتمد النظام على بيانات جدول التعرفة الكمركية (TSC) لعام 2025 الصادر
            عن الهيئة العامة للكمارك العراقية، محدّث وفق قرار مجلس الوزراء 957/2025 النافذ اعتباراً من يناير 2026.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Database className="h-4 w-4 text-primary" />
            </div>
            إحصائيات قاعدة البيانات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-40" />
            </div>
          ) : stats ? (
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="px-3 py-1.5" data-testid="badge-total-products">
                إجمالي المنتجات: {stats.rows_total.toLocaleString("ar-SA")}
              </Badge>
              <Badge variant="secondary" className="px-3 py-1.5" data-testid="badge-unique-hs">
                رموز HS فريدة: {stats.hs_unique.toLocaleString("ar-SA")}
              </Badge>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            طريقة الحساب
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>يتم حساب فرق الرسم الكمركي وفق الخطوات التالية:</p>
          <ol className="list-decimal list-inside space-y-2 pr-2">
            <li>تحديد قيمة الوحدة المعتمدة (CIF): مقارنة مع الحد الأدنى GDS — إذا أقل يُرفع</li>
            <li>القيمة الكمركية = قيمة الوحدة المعتمدة × الكمية</li>
            <li>الرسم الكمركي = القيمة الكمركية × (نسبة الرسم + نسبة الحماية)</li>
            <li>الرسم بعد التخفيض = الرسم × (1 - نسبة التخفيض)</li>
            <li>المجموع = الرسم بعد التخفيض</li>
            <li>الفرق = المجموع - المبلغ المدفوع</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            الإطار القانوني
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <ul className="space-y-3 pr-2">
            <li className="flex items-start gap-2.5">
              <Scale className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
              <span><strong>قرار مجلس الوزراء 957/2025</strong> — تعديل نسب الرسوم الكمركية، نافذ اعتباراً من يناير 2026</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Scale className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
              <span><strong>قانون التعرفة الكمركية رقم 22 لسنة 2010</strong> — القانون الأساسي للتعرفة الكمركية العراقية</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Scale className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
              <span><strong>قانون حماية المنتجات الوطنية رقم 11 لسنة 2010</strong> — فرض رسوم حماية إضافية على المنتجات المنافسة للإنتاج المحلي</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            حماية المنتج الوطني
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>يتم فرض رسوم حماية إضافية على بعض المنتجات المنافسة للإنتاج المحلي العراقي:</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right py-2.5 px-3">المنتج</th>
                  <th className="text-right py-2.5 px-3">رمز HS</th>
                  <th className="text-right py-2.5 px-3">نسبة الحماية</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">حديد تسليح (10-32 ملم)</td>
                  <td className="py-2.5 px-3 font-mono text-primary">72142</td>
                  <td className="py-2.5 px-3">+30%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">حاويات بلاستيك</td>
                  <td className="py-2.5 px-3 font-mono text-primary">3924</td>
                  <td className="py-2.5 px-3">+60%</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">أنابيب بلاستيك</td>
                  <td className="py-2.5 px-3 font-mono text-primary">3917</td>
                  <td className="py-2.5 px-3">+60%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            تُضاف نسبة الحماية تلقائياً عند إدخال رمز HS المطابق، ويمكن تعديلها يدوياً.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Percent className="h-4 w-4 text-primary" />
            </div>
            الأمانة الضريبية (Tax Deposit)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>تُحتسب الأمانة الضريبية كنسبة من القيمة الكمركية حسب تصنيف البضاعة:</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right py-2.5 px-3">النسبة</th>
                  <th className="text-right py-2.5 px-3">التصنيفات</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3 font-mono text-primary">1%</td>
                  <td className="py-2.5 px-3">مواد غذائية أساسية، أدوية، مدخلات زراعية، مواد تعليمية، معدات طاقة شمسية</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3 font-mono text-primary">2%</td>
                  <td className="py-2.5 px-3">مجوهرات وذهب، مكائن ومعدات إنتاجية</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-mono text-primary">3%</td>
                  <td className="py-2.5 px-3">باقي التصنيفات (مواد غذائية مصنعة، مواد خام، إلكترونيات، ملابس، مركبات، سلع كمالية، تبغ، كحول، إلخ)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Scale className="h-4 w-4 text-primary" />
            </div>
            جدول التعرفة 2026
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>نسب الرسوم الكمركية وفق قرار 957/2025:</p>
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right py-2.5 px-3">التصنيف</th>
                  <th className="text-right py-2.5 px-3">النسبة</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">مواد غذائية أساسية / أدوية / مدخلات زراعية / تعليمية / طاقة شمسية / حواسيب / مجوهرات</td>
                  <td className="py-2.5 px-3 font-mono text-primary">5%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">مواد خام / مكائن ومعدات إنتاجية</td>
                  <td className="py-2.5 px-3 font-mono text-primary">10%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">مدخلات صناعية / مواد بناء / كهربائيات / مركبات (موحد)</td>
                  <td className="py-2.5 px-3 font-mono text-primary">15%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">إلكترونيات استهلاكية / هواتف ذكية / ملابس</td>
                  <td className="py-2.5 px-3 font-mono text-primary">20%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">أدوات منزلية</td>
                  <td className="py-2.5 px-3 font-mono text-primary">25%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">سلع استهلاكية عامة / بلاستيك محمي / حديد تسليح محمي</td>
                  <td className="py-2.5 px-3 font-mono text-primary">30%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">سلع كمالية</td>
                  <td className="py-2.5 px-3 font-mono text-primary">40%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">منتجات تنظيف</td>
                  <td className="py-2.5 px-3 font-mono text-primary">65%</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-2.5 px-3">تبغ وسكائر</td>
                  <td className="py-2.5 px-3 font-mono text-primary">100%</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">مشروبات كحولية</td>
                  <td className="py-2.5 px-3 font-mono text-primary">150%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Calculator className="h-4 w-4 text-primary" />
            </div>
            تخفيض أسيكودا 25%
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            اعتباراً من فبراير 2026، يُطبّق تخفيض 25% على القيم الاستدلالية (TSC) ضمن نظام أسيكودا
            الإلكتروني. عند تفعيل هذا الخيار في الحاسبة، تُضرب قيمة TSC بمعامل 0.75 قبل
            مقارنتها بقيمة الفاتورة لتحديد القيمة المعتمدة.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
              <Shield className="h-4 w-4 text-destructive" />
            </div>
            إخلاء المسؤولية
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground leading-relaxed">
          <p>
            هذا النظام أداة استرشادية فقط ولا يُعد بديلاً عن الحسابات الرسمية.
            القيم المعروضة مبنية على بيانات جدول التعرفة الكمركية وقد تختلف
            عن القيم الفعلية المعتمدة في المنافذ. يُرجى مراجعة الجهات المختصة
            للحصول على الحسابات النهائية الرسمية.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
