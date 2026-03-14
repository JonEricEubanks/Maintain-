/**
 * MAINTAIN AI — Work Order Table (v2)
 *
 * Premium TanStack Table powered by shadcn/ui primitives.
 * Features: multi-column sort, faceted filters, row selection,
 * inline severity + status badges, priority heat-bar, row actions,
 * pagination, and keyboard navigation.
 */

import React, { useId, useMemo, useRef, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  PaginationState,
  Row,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

import {
  AlertTriangle,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleX,
  Columns3,
  Ellipsis,
  Filter,
  ListFilter,
  MapPin,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Wrench,
  HardHat,
  AlertCircle,
  Clock,
  CheckCircle2,
  PauseCircle,
  Construction,
  Footprints,
  CircleDot,
} from "lucide-react";

import type { WorkOrder, Severity, IssueType, WorkOrderStatus } from "../types/infrastructure";

/* ================================================================
   Props
   ================================================================ */

interface WorkOrderTableProps {
  workOrders: WorkOrder[];
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onDispatchWorkOrder: (woId: string) => void;
  onViewOnMap: (wo: WorkOrder) => void;
  onCreateNew: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  selectedWorkOrderId?: string | null;
}

/* ================================================================
   Constants & helpers
   ================================================================ */

const SEVERITY_ORDER: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_COLORS: Record<Severity, string> = {
  critical: "bg-red-600 text-white border-red-600",
  high: "bg-orange-500 text-white border-orange-500",
  medium: "bg-amber-500 text-white border-amber-500",
  low: "bg-emerald-500 text-white border-emerald-500",
};
const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; className: string; icon: React.ReactNode }> = {
  open: {
    label: "Open",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: <Clock className="h-3 w-3" />,
  },
  assigned: {
    label: "Assigned",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: <HardHat className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    icon: <Construction className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  deferred: {
    label: "Deferred",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    icon: <PauseCircle className="h-3 w-3" />,
  },
};

const TYPE_CONFIG: Record<IssueType, { label: string; className: string; icon: React.ReactNode }> = {
  pothole: {
    label: "Pothole",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    icon: <CircleDot className="h-3 w-3" />,
  },
  sidewalk: {
    label: "Sidewalk",
    className: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    icon: <Footprints className="h-3 w-3" />,
  },
  concrete: {
    label: "Concrete",
    className: "bg-slate-500/15 text-slate-300 border-slate-500/25",
    icon: <Construction className="h-3 w-3" />,
  },
};

/* ================================================================
   Custom filter fns
   ================================================================ */

const multiColumnSearchFn: FilterFn<WorkOrder> = (row, _columnId, filterValue) => {
  const q = (filterValue ?? "").toLowerCase();
  return (
    row.original.title.toLowerCase().includes(q) ||
    row.original.address.toLowerCase().includes(q) ||
    row.original.description.toLowerCase().includes(q) ||
    row.original.id.toLowerCase().includes(q)
  );
};

const severityFilterFn: FilterFn<WorkOrder> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(row.getValue(columnId) as string);
};

const statusFilterFn: FilterFn<WorkOrder> = (row, columnId, filterValue: string[]) => {
  if (!filterValue?.length) return true;
  return filterValue.includes(row.getValue(columnId) as string);
};

/* ================================================================
   Column definitions
   ================================================================ */

function buildColumns(
  onViewOnMap: (wo: WorkOrder) => void,
  onDispatchWorkOrder: (woId: string) => void,
): ColumnDef<WorkOrder>[] {
  return [
    // Checkbox select
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      size: 36,
      enableSorting: false,
      enableHiding: false,
    },

    // Severity
    {
      header: "Severity",
      accessorKey: "severity",
      cell: ({ row }) => {
        const sev = row.getValue("severity") as Severity;
        return (
          <span className={`iw-severity ${sev}`}>
            <span className="iw-severity-dot" />
            {sev}
          </span>
        );
      },
      size: 110,
      sortingFn: (rowA, rowB) =>
        SEVERITY_ORDER[rowA.original.severity] - SEVERITY_ORDER[rowB.original.severity],
      filterFn: severityFilterFn,
    },

    // Type
    {
      header: "Type",
      accessorKey: "issueType",
      cell: ({ row }) => {
        const t = row.original.issueType;
        const cfg = TYPE_CONFIG[t];
        return (
          <span className={`iw-type ${t}`}>
            {cfg.icon}
            {cfg.label}
          </span>
        );
      },
      size: 110,
    },

    // Title / Address
    {
      header: "Work Order",
      accessorKey: "title",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-semibold text-[13px] leading-tight truncate" style={{ color: "var(--text-primary)" }}>
            {row.original.title}
          </div>
          <div className="text-xs mt-0.5 flex items-center gap-1 truncate" style={{ color: "var(--text-secondary)" }}>
            <MapPin className="h-3 w-3 shrink-0 opacity-50" />
            {row.original.address}
            {row.original.nearSchool && (
              <AlertTriangle className="h-3 w-3 shrink-0 text-red-400 ml-1" />
            )}
          </div>
        </div>
      ),
      size: 280,
      filterFn: multiColumnSearchFn,
      enableHiding: false,
    },

    // Status
    {
      header: "Status",
      accessorKey: "status",
      cell: ({ row }) => {
        const s = row.getValue("status") as WorkOrderStatus;
        const cfg = STATUS_CONFIG[s];
        return (
          <span className={`iw-status ${s}`}>
            {cfg.icon}
            {cfg.label}
          </span>
        );
      },
      size: 130,
      filterFn: statusFilterFn,
    },

    // Estimated Cost
    {
      header: "Est. Cost",
      accessorKey: "estimatedCost",
      cell: ({ row }) => {
        const amount = row.getValue("estimatedCost") as number;
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(amount);
        return (
          <span className="font-semibold tabular-nums text-[13px]" style={{ color: "var(--text-primary)" }}>
            {formatted}
          </span>
        );
      },
      size: 110,
    },

    // Priority Score
    {
      header: "Priority",
      accessorKey: "priorityScore",
      cell: ({ row }) => {
        const score = row.original.priorityScore;
        const fillClass =
          score >= 75 ? "danger" : score >= 50 ? "warning" : "success";
        return (
          <div className="iw-priority-wrap">
            <div className="iw-priority-track">
              <div
                className={`iw-priority-fill ${fillClass}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="iw-priority-label">{score}</span>
          </div>
        );
      },
      size: 120,
    },

    // Created date
    {
      header: "Created",
      accessorKey: "createdAt",
      cell: ({ row }) => {
        const d = new Date(row.getValue("createdAt") as string);
        return (
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        );
      },
      size: 90,
    },

    // Actions
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions row={row} onViewOnMap={onViewOnMap} onDispatch={onDispatchWorkOrder} />
      ),
      size: 60,
      enableHiding: false,
    },
  ];
}

/* ================================================================
   Row Actions
   ================================================================ */

function RowActions({
  row,
  onViewOnMap,
  onDispatch,
}: {
  row: Row<WorkOrder>;
  onViewOnMap: (wo: WorkOrder) => void;
  onDispatch: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex justify-end">
          <Button size="icon" variant="ghost" className="shadow-none h-8 w-8" aria-label="Row actions">
            <Ellipsis size={16} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onViewOnMap(row.original)}>
            <MapPin className="mr-2 h-4 w-4 opacity-60" />
            <span>View on Map</span>
            <DropdownMenuShortcut>⌘M</DropdownMenuShortcut>
          </DropdownMenuItem>
          {row.original.status === "open" && (
            <DropdownMenuItem onClick={() => onDispatch(row.original.id)}>
              <Send className="mr-2 h-4 w-4 opacity-60" />
              <span>Dispatch Crew</span>
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Wrench className="mr-2 h-4 w-4 opacity-60" />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <AlertCircle className="mr-2 h-4 w-4 opacity-60" />
            <span>Escalate</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ================================================================
   Main Component
   ================================================================ */

const WorkOrderTable: React.FC<WorkOrderTableProps> = ({
  workOrders,
  onSelectWorkOrder,
  onDispatchWorkOrder,
  onViewOnMap,
  onCreateNew,
  onRefresh,
  isLoading,
  selectedWorkOrderId,
}) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: "severity", desc: true },
  ]);

  const columns = useMemo(
    () => buildColumns(onViewOnMap, onDispatchWorkOrder),
    [onViewOnMap, onDispatchWorkOrder],
  );

  const table = useReactTable({
    data: workOrders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    enableSortingRemoval: false,
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: {
      sorting,
      pagination,
      columnFilters,
      columnVisibility,
    },
  });

  /* ---- Faceted filter helpers ---- */

  const sevColumn = table.getColumn("severity");
  const sevFaceted = sevColumn?.getFacetedUniqueValues();
  const sevFilterVal = sevColumn?.getFilterValue() as string[] | undefined;

  const statColumn = table.getColumn("status");
  const statFaceted = statColumn?.getFacetedUniqueValues();
  const statFilterVal = statColumn?.getFilterValue() as string[] | undefined;

  const uniqueSeverityValues = useMemo(() => {
    if (!sevFaceted) return [];
    return Array.from(sevFaceted.keys()).sort(
      (a, b) => SEVERITY_ORDER[b as Severity] - SEVERITY_ORDER[a as Severity],
    );
  }, [sevFaceted]);

  const severityCounts = useMemo(() => {
    return sevFaceted ?? new Map();
  }, [sevFaceted]);

  const selectedSeverities = useMemo(() => {
    return (sevFilterVal as string[]) ?? [];
  }, [sevFilterVal]);

  const uniqueStatusValues = useMemo(() => {
    if (!statFaceted) return [];
    return Array.from(statFaceted.keys()).sort();
  }, [statFaceted]);

  const statusCounts = useMemo(() => {
    return statFaceted ?? new Map();
  }, [statFaceted]);

  const selectedStatuses = useMemo(() => {
    return (statFilterVal as string[]) ?? [];
  }, [statFilterVal]);

  const handleFacetChange = (column: string, checked: boolean, value: string) => {
    const col = table.getColumn(column);
    if (!col) return;
    const fv = (col.getFilterValue() as string[]) ?? [];
    const next = checked ? [...fv, value] : fv.filter((v) => v !== value);
    col.setFilterValue(next.length ? next : undefined);
  };

  /* ---- Stats ---- */
  const stats = useMemo(() => {
    const critical = workOrders.filter((w) => w.severity === "critical").length;
    const open = workOrders.filter((w) => w.status === "open").length;
    const totalCost = workOrders.reduce((s, w) => s + w.estimatedCost, 0);
    return { total: workOrders.length, critical, open, totalCost };
  }, [workOrders]);

  /* ================================================================
     Render
     ================================================================ */

  return (
    <div className="tw" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ──── Toolbar ──── */}
      <div className="iw-toolbar">
        <div className="iw-toolbar-left">
          {/* Search */}
          <div className="iw-search-wrap">
            <Input
              id={`${id}-search`}
              ref={inputRef}
              className={cn(
                "peer min-w-[220px] ps-9 h-[34px] text-[12.5px]",
                Boolean(table.getColumn("title")?.getFilterValue()) && "pe-9",
              )}
              value={(table.getColumn("title")?.getFilterValue() ?? "") as string}
              onChange={(e) => table.getColumn("title")?.setFilterValue(e.target.value)}
              placeholder="Search work orders..."
              type="text"
              aria-label="Search work orders"
            />
            <div className="iw-search-icon">
              <ListFilter size={14} />
            </div>
            {Boolean(table.getColumn("title")?.getFilterValue()) && (
              <button
                className="iw-search-clear"
                aria-label="Clear search"
                onClick={() => {
                  table.getColumn("title")?.setFilterValue("");
                  inputRef.current?.focus();
                }}
              >
                <CircleX size={14} />
              </button>
            )}
          </div>

          {/* Severity filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="iw-filter-btn" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)", color: "var(--text-secondary)" }}>
                <Filter size={13} style={{ opacity: 0.6 }} />
                Severity
                {selectedSeverities.length > 0 && (
                  <span className="iw-filter-count">{selectedSeverities.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[180px] p-3" align="start">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Filter by severity</div>
                {uniqueSeverityValues.map((value, i) => (
                  <div key={value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Checkbox
                      id={`${id}-sev-${i}`}
                      checked={selectedSeverities.includes(value)}
                      onCheckedChange={(checked: boolean) => handleFacetChange("severity", checked, value)}
                    />
                    <Label
                      htmlFor={`${id}-sev-${i}`}
                      className="flex grow items-center justify-between gap-2 font-normal text-[13px] capitalize cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={cn("h-2 w-2 rounded-full", SEVERITY_DOT[value as Severity])} />
                        {value}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {severityCounts.get(value) ?? 0}
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Status filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="iw-filter-btn" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)", color: "var(--text-secondary)" }}>
                <Filter size={13} style={{ opacity: 0.6 }} />
                Status
                {selectedStatuses.length > 0 && (
                  <span className="iw-filter-count">{selectedStatuses.length}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="min-w-[180px] p-3" align="start">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Filter by status</div>
                {uniqueStatusValues.map((value, i) => {
                  const cfg = STATUS_CONFIG[value as WorkOrderStatus];
                  return (
                    <div key={value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Checkbox
                        id={`${id}-stat-${i}`}
                        checked={selectedStatuses.includes(value)}
                        onCheckedChange={(checked: boolean) => handleFacetChange("status", checked, value)}
                      />
                      <Label
                        htmlFor={`${id}-stat-${i}`}
                        className="flex grow items-center justify-between gap-2 font-normal text-[13px] cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          {cfg?.icon}
                          {cfg?.label ?? value}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {statusCounts.get(value) ?? 0}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="iw-filter-btn" style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)", color: "var(--text-secondary)" }}>
                <Columns3 size={13} style={{ opacity: 0.6 }} />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuItem
                    key={column.id}
                    className="capitalize"
                    onClick={(e) => { e.preventDefault(); column.toggleVisibility(!column.getIsVisible()); }}
                  >
                    <Checkbox
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      className="mr-2"
                    />
                    {column.id}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="iw-toolbar-right">
          {/* Delete selected */}
          {table.getSelectedRowModel().rows.length > 0 && (
            <button type="button" className="iw-action-btn danger">
              <Trash2 size={14} />
              Delete
              <span className="iw-filter-count" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                {table.getSelectedRowModel().rows.length}
              </span>
            </button>
          )}

          {/* Refresh */}
          <button
            type="button"
            className="iw-action-btn ghost icon-only"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>

          {/* New */}
          <button type="button" className="iw-action-btn primary" onClick={onCreateNew}>
            <Plus size={14} />
            New Work Order
          </button>
        </div>
      </div>

      {/* ──── Table ──── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="iw-tr">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: `${header.getSize()}px` }}
                    className="iw-th h-10"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <div
                        className="flex h-full cursor-pointer select-none items-center justify-between gap-2"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={(e) => {
                          if (header.column.getCanSort() && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }}
                        tabIndex={0}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ChevronUp className="shrink-0 opacity-60" size={14} />,
                          desc: <ChevronDown className="shrink-0 opacity-60" size={14} />,
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => onSelectWorkOrder(row.original)}
                  className={cn("iw-tr", selectedWorkOrderId === row.original.id && "iw-selected")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="iw-td last:py-0"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isLoading ? (
              /* ── Skeleton Rows ── */
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skel-${i}`} className="iw-tr">
                  {columns.map((_, ci) => (
                    <TableCell key={ci} className="iw-td">
                      <div
                        className="skeleton-shimmer"
                        style={{
                          height: ci === 0 ? 14 : ci === 1 ? 10 : 12,
                          width: ci === 0 ? '70%' : ci === columns.length - 1 ? 28 : `${45 + Math.random() * 40}%`,
                          borderRadius: ci === 2 || ci === 3 ? 10 : 4,
                          animationDelay: `${i * 0.08 + ci * 0.04}s`,
                        }}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="iw-tr">
                <TableCell colSpan={columns.length} className="iw-td h-24 text-center" style={{ color: "var(--text-secondary)" }}>
                  {workOrders.length === 0
                    ? "No work orders loaded yet."
                    : "No work orders match the current filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ──── Pagination ──── */}
      <div className="iw-pagination">
        {/* Rows per page */}
        <div className="iw-pagination-rpp">
          <Label htmlFor={`${id}-rpp`} className="text-xs whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Rows</Label>
          <Select
            value={table.getState().pagination.pageSize.toString()}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger
              id={`${id}-rpp`}
              className="w-fit whitespace-nowrap h-8 text-xs"
              style={{ background: "var(--glass-bg)", borderColor: "var(--glass-border)", color: "var(--text-primary)" }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 15, 25, 50].map((ps) => (
                <SelectItem key={ps} value={ps.toString()}>
                  {ps}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Info */}
        <div className="iw-pagination-info">
          <strong>
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getRowCount(),
            )}
          </strong>{" "}
          of <strong>{table.getRowCount()}</strong>
        </div>

        {/* Buttons */}
        <div className="iw-page-btns">
          <button
            type="button"
            className="iw-page-btn"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronFirst size={14} />
          </button>
          <button
            type="button"
            className="iw-page-btn"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="iw-page-btn"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            className="iw-page-btn"
            onClick={() => table.lastPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronLast size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkOrderTable;
