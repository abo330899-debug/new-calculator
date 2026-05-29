import { useLocation } from "wouter";
import { useContext } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Home, Package, Info, LogIn, LogOut, Calculator, User, FileImage, Sun, Moon, Table, Zap, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeContext } from "@/App";

const menuItems = [
  { title: "الرئيسية", url: "/", icon: Home },
  { title: "المنتجات", url: "/search", icon: Package },
  { title: "الحاسبة", url: "/calculator", icon: Calculator },
  { title: "قراءة المنفست", url: "/manifest", icon: FileImage },
  { title: "الموظف الكمركي", url: "/customs-officer", icon: ShieldCheck, badge: "جديد" },
  { title: "التعرفة الجمركية", url: "/tariff", icon: Table },
  { title: "حول النظام", url: "/about", icon: Info },
];

export function AppSidebar({ className }: { className?: string }) {
  const [location, navigate] = useLocation();
  const { user, isLoggedIn, logout } = useAuth();
  const { toggleTheme, isDark } = useContext(ThemeContext);

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
  };

  return (
    <Sidebar side="right" collapsible="icon" className={cn(className)}>
      {/* Header */}
      <SidebarHeader className="p-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/20 rounded-xl blur-md scale-110" />
            <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Calculator
                className="h-6 w-6 text-primary"
                aria-label="الكمارك العراقية"
                data-testid="img-logo-sidebar"
              />
            </div>
          </div>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-black tracking-wide text-gradient-gold leading-tight">الحاسبة الكمركية</span>
            <span className="text-[10px] text-muted-foreground/70 mt-0.5">فرق الرسم — العراق</span>
          </div>
        </div>
      </SidebarHeader>

      <div className="px-3 group-data-[collapsible=icon]:hidden">
        <div className="sep-gradient" />
      </div>

      {/* Menu */}
      <SidebarContent className="pt-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-widest text-muted-foreground/50 uppercase font-bold mb-1">
            القائمة
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      data-testid={`link-${item.url === "/" ? "home" : item.url.slice(1)}`}
                      className={cn(
                        "relative rounded-xl transition-all duration-200",
                        active && "font-bold"
                      )}
                    >
                      <a
                        href={item.url}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(item.url);
                        }}
                      >
                        <item.icon className={cn("h-4 w-4 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover/menu-button:text-foreground")} />
                        <span>{item.title}</span>
                        {"badge" in item && item.badge && (
                          <span className="mr-auto text-[9px] font-black badge-gold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                            <Zap className="h-2.5 w-2.5" />
                            {item.badge}
                          </span>
                        )}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] tracking-widest text-muted-foreground/50 uppercase font-bold mb-1">
            المظهر
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={toggleTheme}
                  className="rounded-xl"
                  data-testid="button-theme-sidebar"
                >
                  {isDark
                    ? <Sun className="h-4 w-4 text-amber-400" />
                    : <Moon className="h-4 w-4 text-primary" />
                  }
                  <span>{isDark ? "الوضع الفاتح" : "الوضع الداكن"}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3">
        <div className="group-data-[collapsible=icon]:hidden mb-2">
          <div className="sep-gradient" />
        </div>
        {isLoggedIn ? (
          <div className="space-y-2.5 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-gold shrink-0 shadow-md">
                <User className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" data-testid="text-username">
                  {user?.username}
                </p>
                <p className="text-[10px] text-emerald-500 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_0_hsl(160_70%_50%/0.8)]" />
                  مسجل الدخول
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-all duration-200 rounded-xl"
              onClick={() => logout.mutate()}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              <span className="mr-2 text-sm">خروج</span>
            </Button>
          </div>
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location === "/login"}
                className="rounded-xl"
                data-testid="link-login"
              >
                <a
                  href="/login"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/login");
                  }}
                >
                  <LogIn className="h-4 w-4" />
                  <span>تسجيل الدخول</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
