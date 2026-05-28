import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { LogIn, UserPlus, Loader2, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import logoImg from "@assets/IMG_2293_1770690757765.png";

const loginSchema = z.object({
  username: z.string().min(2, "اسم المستخدم يجب أن يكون حرفين على الأقل"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { login, register, isLoggedIn } = useAuth();
  const { toast } = useToast();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  if (isLoggedIn) {
    navigate("/search");
    return null;
  }

  const onSubmit = async (data: LoginForm) => {
    try {
      if (isRegisterMode) {
        await register.mutateAsync(data);
        toast({ title: "تم التسجيل بنجاح", description: "مرحباً بك!" });
      } else {
        await login.mutateAsync(data);
        toast({ title: "تم تسجيل الدخول", description: "مرحباً بعودتك!" });
      }
      navigate("/search");
    } catch (err: any) {
      const msg = err?.message || "حدث خطأ";
      let parsed = msg;
      try {
        const json = JSON.parse(msg.replace(/^\d+:\s*/, ""));
        parsed = json.error || msg;
      } catch {}
      toast({ title: "خطأ", description: parsed, variant: "destructive" });
    }
  };

  const isPending = login.isPending || register.isPending;

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl scale-150" />
              <img
                src={logoImg}
                alt="الكمارك العراقية"
                className="h-20 w-auto object-contain relative z-10"
                data-testid="img-logo-login"
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gradient-gold" data-testid="text-login-title">
            {isRegisterMode ? "إنشاء حساب جديد" : "تسجيل الدخول"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2" data-testid="text-login-subtitle">
            حاسبة فرق الرسم الكمركي — العراق
          </p>
        </div>

        <Card className="glass-card glow-gold">
          <CardContent className="p-6 pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">اسم المستخدم</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-username"
                          placeholder="أدخل اسم المستخدم"
                          disabled={isPending}
                          autoComplete="username"
                          className="h-11 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">كلمة المرور</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          data-testid="input-password"
                          placeholder="أدخل كلمة المرور"
                          disabled={isPending}
                          autoComplete={isRegisterMode ? "new-password" : "current-password"}
                          className="h-11 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-11 gradient-gold text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.01]"
                  disabled={isPending}
                  data-testid="button-submit-login"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isRegisterMode ? (
                    <UserPlus className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  <span className="mr-2">
                    {isRegisterMode ? "إنشاء حساب" : "دخول"}
                  </span>
                </Button>
              </form>
            </Form>
            <div className="mt-5 text-center">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  form.reset();
                }}
                data-testid="button-toggle-mode"
              >
                {isRegisterMode
                  ? "لديك حساب؟ سجل دخولك"
                  : "ليس لديك حساب؟ أنشئ حساباً جديداً"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
          <Shield className="h-3 w-3" />
          <span>اتصال آمن ومشفر</span>
        </div>
      </div>
    </div>
  );
}
