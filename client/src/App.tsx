import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

import Home from "./pages/home";
import Login from "./pages/login";
import About from "./pages/about";
import SearchPage from "./pages/search";
import CalculatorPage from "./pages/calculator";
import ManifestPage from "./pages/manifest";
import TariffPage from "./pages/tariff";
import CustomsOfficerPage from "./pages/customs-officer";
import NotFound from "./pages/not-found";

export const ThemeContext = createContext<{
  theme: "light" | "dark";
  toggleTheme: () => void;
  isDark: boolean;
}>({
  theme: "dark",
  toggleTheme: () => {},
  isDark: true,
});

const PAGE_TITLES: Record<string, string> = {
  "/": "الرئيسية",
  "/calculator": "حاسبة الرسوم",
  "/search": "تصفح المنتجات",
  "/manifest": "قراءة المنفست",
  "/tariff": "التعرفة الجمركية",
  "/customs-officer": "الموظف الكمركي",
  "/about": "حول النظام",
  "/login": "تسجيل الدخول",
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/about" component={About} />
      <Route path="/search" component={SearchPage} />
      <Route path="/calculator" component={CalculatorPage} />
      <Route path="/manifest" component={ManifestPage} />
      <Route path="/tariff" component={TariffPage} />
      <Route path="/customs-officer" component={CustomsOfficerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { theme, toggleTheme, isDark } = useTheme();

  const style = {
    "--sidebar-width": "15.5rem",
    "--sidebar-width-icon": "3.25rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full overflow-hidden bg-background">
              <AppSidebar className="print:hidden" />

              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <header className="relative flex items-center gap-3 px-4 py-3 border-b border-border/40 shrink-0 sticky top-0 z-50 print:hidden"
                  style={{
                    background: isDark
                      ? "hsl(224 28% 5% / 0.85)"
                      : "hsl(220 18% 97% / 0.85)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  }}
                >
                  {/* Subtle top border glow */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                  <SidebarTrigger
                    data-testid="button-sidebar-toggle"
                    className="h-8 w-8 rounded-lg hover:bg-muted transition-colors"
                  />

                  <div className="h-4 w-px bg-border/60" />

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-primary tracking-wide">
                      حاسبة فرق الرسم الكمركي
                    </span>
                  </div>

                  <div className="flex-1" />

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="h-8 w-8 rounded-xl hover:bg-muted/80 transition-all duration-200"
                    data-testid="button-theme-toggle"
                  >
                    {isDark
                      ? <Sun className="h-4 w-4 text-amber-400 drop-shadow-[0_0_6px_hsl(38_95%_60%/0.6)]" />
                      : <Moon className="h-4 w-4 text-primary" />
                    }
                  </Button>
                </header>

                <main className="flex-1 overflow-auto p-4 md:p-6">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </ThemeContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
