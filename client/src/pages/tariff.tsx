import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table as TableIcon,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Inbox,
} from "lucide-react";

const COLUMNS = [
  { key: "0", label: "HS CODE", dbField: "hsCode" },
  { key: "1", label: "وصف البضاعة", dbField: "description" },
  { key: "2", label: "الوحدة", dbField: "unit" },
  { key: "3", label: "التعرفة الكمركية", dbField: "dutyRate" },
  { key: "4", label: "القيمة الاستدلالية", dbField: "avgValue" },
];

type TariffState = {
  page: number;
  pageSize: number;
  hsSearchTerm: string;
  descSearchTerm: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  columnFilters: Record<string, string[]>;
  data: string[][];
  filteredRecords: number;
  totalRecords: number;
  totalPages: number;
  isLoading: boolean;
};

type FilterDropdownState = {
  columnIndex: string | null;
  values: string[];
  selected: Set<string>;
  searchTerm: string;
  loading: boolean;
};

export default function TariffPage() {
  const [state, setState] = useState<TariffState>({
    page: 1,
    pageSize: 10,
    hsSearchTerm: "",
    descSearchTerm: "",
    sortColumn: null,
    sortDirection: "asc",
    columnFilters: {},
    data: [],
    filteredRecords: 0,
    totalRecords: 0,
    totalPages: 0,
    isLoading: false,
  });

  const [hsInput, setHsInput] = useState("");
  const [descInput, setDescInput] = useState("");
  const hsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filterDropdown, setFilterDropdown] = useState<FilterDropdownState>({
    columnIndex: null,
    values: [],
    selected: new Set(),
    searchTerm: "",
    loading: false,
  });

  const filterRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async (overrides?: Partial<TariffState>) => {
    const s = { ...state, ...overrides };
    setState(prev => ({ ...prev, ...overrides, isLoading: true }));

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const thisRequestId = ++requestIdRef.current;

    try {
      const res = await fetch("/api/tariff/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: s.page,
          pageSize: s.pageSize,
          hsSearchTerm: s.hsSearchTerm,
          descriptionSearchTerm: s.descSearchTerm,
          sortColumn: s.sortColumn,
          sortDirection: s.sortDirection,
          columnFilters: s.columnFilters,
        }),
        signal: controller.signal,
      });
      const json = await res.json();
      if (thisRequestId !== requestIdRef.current) return;
      if (json.success) {
        setState(prev => ({
          ...prev,
          ...overrides,
          data: json.data,
          filteredRecords: json.filteredRecords,
          totalRecords: json.totalRecords,
          totalPages: json.totalPages,
          page: json.page,
          isLoading: false,
        }));
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (thisRequestId === requestIdRef.current) {
        setState(prev => ({ ...prev, ...overrides, isLoading: false }));
      }
    }
  }, [state]);

  useEffect(() => {
    loadData();
  }, []);

  const handleHsSearch = (value: string) => {
    setHsInput(value);
    if (hsTimerRef.current) clearTimeout(hsTimerRef.current);
    hsTimerRef.current = setTimeout(() => {
      loadData({ hsSearchTerm: value, page: 1 });
    }, 300);
  };

  const handleDescSearch = (value: string) => {
    setDescInput(value);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => {
      loadData({ descSearchTerm: value, page: 1 });
    }, 300);
  };

  const handleSort = (columnKey: string) => {
    const newDir = state.sortColumn === columnKey
      ? (state.sortDirection === "asc" ? "desc" : "asc")
      : "asc";
    loadData({ sortColumn: columnKey, sortDirection: newDir, page: 1 });
  };

  const goToPage = (p: number) => {
    if (p < 1 || p > state.totalPages) return;
    loadData({ page: p });
  };

  const clearAllFilters = () => {
    setHsInput("");
    setDescInput("");
    loadData({
      hsSearchTerm: "",
      descSearchTerm: "",
      columnFilters: {},
      sortColumn: null,
      sortDirection: "asc",
      page: 1,
    });
  };

  const openFilterDropdown = async (columnIndex: string) => {
    if (filterDropdown.columnIndex === columnIndex) {
      setFilterDropdown(prev => ({ ...prev, columnIndex: null }));
      return;
    }

    setFilterDropdown({
      columnIndex,
      values: [],
      selected: new Set(),
      searchTerm: "",
      loading: true,
    });

    try {
      const res = await fetch(`/api/tariff/column-values/${columnIndex}`);
      const json = await res.json();
      const vals: string[] = json.values || [];
      const currentFilter = state.columnFilters[columnIndex];
      const sel = currentFilter
        ? new Set(currentFilter)
        : new Set(vals);
      setFilterDropdown({
        columnIndex,
        values: vals,
        selected: sel,
        searchTerm: "",
        loading: false,
      });
    } catch {
      setFilterDropdown(prev => ({ ...prev, loading: false }));
    }
  };

  const applyFilter = () => {
    if (!filterDropdown.columnIndex) return;
    const colIdx = filterDropdown.columnIndex;
    const allSelected = filterDropdown.selected.size === filterDropdown.values.length || filterDropdown.selected.size === 0;
    const newFilters = { ...state.columnFilters };

    if (allSelected) {
      delete newFilters[colIdx];
    } else {
      newFilters[colIdx] = Array.from(filterDropdown.selected);
    }

    setFilterDropdown(prev => ({ ...prev, columnIndex: null }));
    loadData({ columnFilters: newFilters, page: 1 });
  };

  const toggleFilterValue = (val: string) => {
    setFilterDropdown(prev => {
      const newSel = new Set(prev.selected);
      if (newSel.has(val)) newSel.delete(val);
      else newSel.add(val);
      return { ...prev, selected: newSel };
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setFilterDropdown(prev => {
      const filtered = prev.values.filter(v =>
        v.toLowerCase().includes(prev.searchTerm.toLowerCase())
      );
      const newSel = new Set(prev.selected);
      filtered.forEach(v => {
        if (checked) newSel.add(v);
        else newSel.delete(v);
      });
      return { ...prev, selected: newSel };
    });
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterDropdown(prev => ({ ...prev, columnIndex: null }));
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const activeFilterCount = Object.keys(state.columnFilters).length +
    (state.hsSearchTerm ? 1 : 0) +
    (state.descSearchTerm ? 1 : 0);

  const showingStart = state.filteredRecords === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const showingEnd = Math.min(state.page * state.pageSize, state.filteredRecords);

  const renderPagination = () => {
    const { page, totalPages } = state;
    if (totalPages <= 1) return null;

    const pages: (number | "...")[] = [];
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) pages.push("...");
    }
    for (let i = startPage; i <= endPage; i++) pages.push(i);
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }

    return (
      <div className="flex items-center gap-1" data-testid="pagination-controls">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === 1}
          onClick={() => goToPage(1)}
          data-testid="button-first-page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === 1}
          onClick={() => goToPage(page - 1)}
          data-testid="button-prev-page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e-${i}`} className="px-1 text-muted-foreground text-sm">...</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => goToPage(p as number)}
              data-testid={`button-page-${p}`}
            >
              {p}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === totalPages}
          onClick={() => goToPage(page + 1)}
          data-testid="button-next-page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page === totalPages}
          onClick={() => goToPage(totalPages)}
          data-testid="button-last-page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const filteredDropdownValues = filterDropdown.values.filter(v =>
    v.toLowerCase().includes(filterDropdown.searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      <div className="bg-card rounded-xl border border-border/50 shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="relative overflow-hidden flex flex-wrap items-center justify-between gap-4 p-5 gradient-hero border-b border-border/40 rounded-t-xl">
          <div className="orb orb-gold w-32 h-32 -top-8 -right-8 float-slow" style={{ zIndex: 0 }} />
          <div className="orb orb-blue w-20 h-20 bottom-0 left-20 float-medium" style={{ animationDelay: "2s", zIndex: 0 }} />
          <div className="relative z-10 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg scale-110" />
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl gradient-gold text-white shadow-lg">
                <TableIcon className="h-5 w-5" />
              </div>
            </div>
            <div dir="rtl">
              <h4 className="text-lg font-black text-shimmer" data-testid="text-tariff-title">التعرفة الجمركية</h4>
              <span className="text-sm text-muted-foreground">
                <span data-testid="text-total-records" className="text-foreground font-bold">{state.totalRecords.toLocaleString()}</span> منتج في قاعدة البيانات
              </span>
            </div>
          </div>

          <div dir="rtl" className="relative z-10 text-xs text-muted-foreground max-w-md hidden md:block">
            بيانات رسمية من هيئة الكمارك العراقية
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-foreground border-border/60 bg-background/30 backdrop-blur-sm hover:bg-background/60 transition-all"
              onClick={() => loadData()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 ml-1" />
              اعادة التحميل
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-foreground border-border/60 bg-background/30 backdrop-blur-sm hover:bg-background/60 transition-all"
              onClick={clearAllFilters}
              data-testid="button-clear-filters"
            >
              <Filter className="h-4 w-4 ml-1" />
              تفريغ البحث
            </Button>
          </div>
        </div>

        <div className="bg-card border-b border-border/50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={hsInput}
                  onChange={(e) => handleHsSearch(e.target.value)}
                  placeholder="بحث برقم HS Code"
                  className="pl-10 pr-9 rounded-full"
                  data-testid="input-hs-search"
                />
                {hsInput && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                    onClick={() => { setHsInput(""); loadData({ hsSearchTerm: "", page: 1 }); }}
                    data-testid="button-clear-hs"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative flex-1 min-w-[150px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={descInput}
                  onChange={(e) => handleDescSearch(e.target.value)}
                  placeholder="بحث بالوصف"
                  className="pl-10 pr-9 rounded-full"
                  data-testid="input-desc-search"
                />
                {descInput && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                    onClick={() => { setDescInput(""); loadData({ descSearchTerm: "", page: 1 }); }}
                    data-testid="button-clear-desc"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <span>عرض</span>
              <Select
                value={String(state.pageSize)}
                onValueChange={(v) => loadData({ pageSize: parseInt(v), page: 1 })}
              >
                <SelectTrigger className="w-20 h-8" data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                </SelectContent>
              </Select>
              <span>لكل صفحة</span>
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 border-b border-border/50 text-sm" data-testid="filter-summary">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Filter className="h-3.5 w-3.5" />
              الفلاتر النشطة:
            </span>
            {state.hsSearchTerm && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-filter-hs">
                HS: "{state.hsSearchTerm}"
              </Badge>
            )}
            {state.descSearchTerm && (
              <Badge variant="secondary" className="text-xs" data-testid="badge-filter-desc">
                وصف: "{state.descSearchTerm}"
              </Badge>
            )}
            {Object.entries(state.columnFilters).map(([colIdx, vals]) => {
              const col = COLUMNS.find(c => c.key === colIdx);
              return (
                <Badge key={colIdx} variant="secondary" className="text-xs">
                  {col?.label || `عمود ${colIdx}`} ({vals.length})
                </Badge>
              );
            })}
            <button
              className="text-destructive hover:underline text-xs mr-auto"
              onClick={clearAllFilters}
              data-testid="button-clear-all-filters"
            >
              امسح الكل
            </button>
          </div>
        )}

        <div className="relative flex-1 overflow-auto">
          {state.isLoading && (
            <div className="absolute inset-0 bg-background/80 z-20 flex items-center justify-center" data-testid="loading-overlay">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600 mx-auto" />
                <p className="mt-3 text-sm text-muted-foreground">جاري تحميل البيانات...</p>
              </div>
            </div>
          )}

          <table className="min-w-full text-sm border-collapse" data-testid="tariff-table">
            <thead className="sticky top-0 z-10">
              <tr className="bg-emerald-700 text-white">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3.5 text-right font-semibold border-l border-white/20 relative whitespace-nowrap"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                        onClick={() => handleSort(col.key)}
                        data-testid={`button-sort-${col.key}`}
                      >
                        <span>{col.label}</span>
                        {state.sortColumn === col.key ? (
                          state.sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </button>

                      <div className="relative" ref={filterDropdown.columnIndex === col.key ? filterRef : undefined}>
                        <button
                          className={`p-1 rounded hover:bg-white/20 transition-colors ${
                            state.columnFilters[col.key] ? "text-yellow-300" : "text-white/70"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openFilterDropdown(col.key);
                          }}
                          data-testid={`button-filter-${col.key}`}
                        >
                          <Filter className="h-3.5 w-3.5" />
                        </button>

                        {filterDropdown.columnIndex === col.key && (
                          <div
                            className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-xl p-3 z-50 min-w-[16rem]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              placeholder="ابحث في القيم..."
                              value={filterDropdown.searchTerm}
                              onChange={(e) => setFilterDropdown(prev => ({ ...prev, searchTerm: e.target.value }))}
                              className="mb-2 h-8 text-sm"
                              data-testid="input-filter-search"
                            />

                            <label className="flex items-center gap-2 mb-2 text-sm cursor-pointer select-none">
                              <Checkbox
                                checked={filteredDropdownValues.every(v => filterDropdown.selected.has(v))}
                                onCheckedChange={(checked) => toggleSelectAll(!!checked)}
                                data-testid="checkbox-select-all"
                              />
                              <span className="text-foreground">تحديد الكل</span>
                            </label>

                            <div className="max-h-48 overflow-y-auto space-y-0.5 mb-2">
                              {filterDropdown.loading ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              ) : (
                                filteredDropdownValues.map((val) => (
                                  <label
                                    key={val}
                                    className="flex items-center gap-2 py-1 px-1 rounded hover:bg-accent cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={filterDropdown.selected.has(val)}
                                      onCheckedChange={() => toggleFilterValue(val)}
                                    />
                                    <span className="truncate text-foreground" dir="auto">
                                      {val || "(فارغ)"}
                                    </span>
                                  </label>
                                ))
                              )}
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  toggleSelectAll(true);
                                }}
                                data-testid="button-filter-clear"
                              >
                                امسح
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                onClick={applyFilter}
                                data-testid="button-filter-apply"
                              >
                                تطبيق
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {state.data.length === 0 && !state.isLoading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="h-10 w-10 opacity-40" />
                      <p>لا توجد نتائج</p>
                    </div>
                  </td>
                </tr>
              ) : (
                state.data.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="border-b border-border/40 hover:bg-accent/50 transition-colors"
                    data-testid={`row-tariff-${rowIdx}`}
                  >
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        dir="auto"
                        className={`px-4 py-2.5 ${
                          cellIdx === 0 ? "font-mono text-sm whitespace-nowrap text-primary font-medium" :
                          cellIdx === 1 ? "max-w-xs" :
                          cellIdx === 3 || cellIdx === 4 ? "font-mono text-sm whitespace-nowrap text-center" :
                          "text-sm whitespace-nowrap"
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-muted/30 border-t border-border/50 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground shrink-0">
          <div data-testid="text-showing-info">
            عرض <span className="font-medium text-foreground">{showingStart}</span> - <span className="font-medium text-foreground">{showingEnd}</span>
            {" "}من <span className="font-medium text-foreground">{state.filteredRecords.toLocaleString()}</span>
          </div>
          {renderPagination()}
        </div>
      </div>
    </div>
  );
}
