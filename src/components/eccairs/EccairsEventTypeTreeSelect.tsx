import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const SUPABASE_URL = "https://pmucsvrypogtttrajqxq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE";

// Top-level category IDs for VL390
const TOP_LEVEL_IDS = new Set([
  '1000000',   // Equipment
  '3000000',   // Consequential Events
  '99000000',  // Unknown
  '99010158',  // Operational
  '99010159',  // Personnel
  '99010164',  // Organisational
  '99010401',  // RPAS Specific Events
  '99012035',  // Any Other Events
]);

// RPAS-specific children of 99010401
const RPAS_CHILDREN = new Set([
  '1090000', '1091000',
  '99012383', '99012384', '99012385', '99012386',
  '99200004', '99200005', '99200013', '99200014', '99200015', '99200016',
  '99200017', '99200018', '99200019', '99200020', '99200021', '99200022',
  '99200023', '99200025', '99200026',
]);

// Known level-2 children for each top-level group (99xxxxxx series)
// Operational (99010158) children: 99010165–99010207 range roughly
// Personnel (99010159) children: 99010160–99010163
// Organisational (99010164) children: 99010165–99010207 (ATM-related)
// These are derived by examining the database structure

interface TreeNode {
  value_id: string;
  label: string;
  children: TreeNode[];
}

interface EccairsEventTypeTreeSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Derive the parent ID for a given VL390 value_id.
 * Equipment (1xxxxxx): ATA-chapter numeric hierarchy (trailing zeros = parent level).
 * 99xxxxxx: grouped under top-level categories by known ranges.
 */
function deriveParent(valueId: string): string | null {
  if (TOP_LEVEL_IDS.has(valueId)) return null;

  // RPAS children → 99010401
  if (RPAS_CHILDREN.has(valueId)) return '99010401';

  const num = parseInt(valueId, 10);
  if (isNaN(num)) return null;

  // Equipment tree (1,000,001 – 1,999,999): derive parent by zeroing trailing digits
  if (num > 1000000 && num < 2000000) {
    // Find parent by zeroing last non-zero digit group
    const s = valueId.padStart(7, '0');
    // Try progressively broader parents
    for (let zeros = 1; zeros <= 5; zeros++) {
      const parentStr = s.substring(0, 7 - zeros) + '0'.repeat(zeros);
      const parentNum = parseInt(parentStr, 10);
      if (parentNum !== num && parentNum >= 1000000) {
        return parentNum.toString();
      }
    }
    return '1000000';
  }

  // Consequential Events children (3,000,001 – 3,999,999)
  if (num > 3000000 && num < 4000000) {
    // Similar zeroing approach
    const s = valueId.padStart(7, '0');
    for (let zeros = 1; zeros <= 5; zeros++) {
      const parentStr = s.substring(0, 7 - zeros) + '0'.repeat(zeros);
      const parentNum = parseInt(parentStr, 10);
      if (parentNum !== num && parentNum >= 3000000) {
        return parentNum.toString();
      }
    }
    return '3000000';
  }

  // 99xxxxxx series: group under top-level categories
  if (num >= 99000000 && num < 100000000) {
    // Personnel children
    if (num >= 99010160 && num <= 99010163) return '99010159';
    // Organisational children
    if (num >= 99010165 && num <= 99010207) return '99010164';
    // Operational: anything else in 99010xxx range not already covered
    if (num > 99010207 && num < 99010401) return '99010158';
    if (num > 99010401 && num < 99012035) return '99010158';
    // After Any Other Events
    if (num > 99012035 && num < 99200000) return '99012035';
    // 99200000+ not in RPAS set → Operational
    if (num >= 99200000 && !RPAS_CHILDREN.has(valueId)) return '99010158';
    // Fallback
    if (num > 99000000 && num < 99010158) return '99000000';
    return '99010158';
  }

  return null;
}

/** Build a reverse parent map for path-to-root lookups */
function getAncestors(valueId: string, allIds: Set<string>): string[] {
  const path: string[] = [];
  let current = valueId;
  let safety = 0;
  while (safety++ < 10) {
    const parent = deriveParent(current);
    if (!parent || !allIds.has(parent)) break;
    path.push(parent);
    current = parent;
  }
  return path;
}

function useVL390Items(enabled: boolean) {
  return useQuery({
    queryKey: ['eccairs-vl390-all'],
    queryFn: async () => {
      // Fetch in batches since there are ~3100+ items
      const allItems: Array<{ value_id: string; label: string }> = [];
      const batchSize = 1000;
      for (let offset = 0; offset < 5000; offset += batchSize) {
        const url = `${SUPABASE_URL}/rest/v1/value_list_items?value_list_key=eq.VL390&order=value_description&limit=${batchSize}&offset=${offset}&select=value_id,value_description,value_synonym`;
        const res = await fetch(url, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept-Profile': 'eccairs',
          },
        });
        if (!res.ok) throw new Error('Failed to fetch VL390');
        const batch = await res.json();
        if (batch.length === 0) break;
        for (const item of batch) {
          if (item.value_description?.trim()) {
            allItems.push({ value_id: item.value_id, label: item.value_description });
          }
        }
      }
      return allItems;
    },
    staleTime: 1000 * 60 * 10,
    enabled,
  });
}

export function EccairsEventTypeTreeSelect({
  value,
  onChange,
  placeholder = "Velg hendelsestype...",
  disabled = false,
}: EccairsEventTypeTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: items, isLoading } = useVL390Items(open);
  const { data: selectedItem } = useEccairsTaxonomyItem("VL390", value, !!value);

  // Build tree
  const tree = useMemo(() => {
    if (!items) return [];
    const allIds = new Set(items.map(i => i.value_id));
    const map = new Map<string, TreeNode>();
    for (const item of items) {
      map.set(item.value_id, { value_id: item.value_id, label: item.label, children: [] });
    }

    const roots: TreeNode[] = [];
    for (const item of items) {
      const node = map.get(item.value_id)!;
      const parentId = deriveParent(item.value_id);
      if (parentId && map.has(parentId)) {
        map.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortChildren = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.label.localeCompare(b.label));
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);

    // Move top-level categories to front in a specific order
    const order = ['1000000', '99010158', '99010159', '99010164', '99010401', '3000000', '99012035', '99000000'];
    const topMap = new Map(roots.filter(r => TOP_LEVEL_IDS.has(r.value_id)).map(r => [r.value_id, r]));
    const rest = roots.filter(r => !TOP_LEVEL_IDS.has(r.value_id));
    const ordered = order.filter(id => topMap.has(id)).map(id => topMap.get(id)!);
    return [...ordered, ...rest];
  }, [items]);

  // Filtered tree for search
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const term = search.toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.reduce<TreeNode[]>((acc, node) => {
        const childMatches = filterNodes(node.children);
        const selfMatches = node.label.toLowerCase().includes(term) ||
          node.value_id.includes(term);
        if (selfMatches || childMatches.length > 0) {
          acc.push({ ...node, children: selfMatches ? node.children : childMatches });
        }
        return acc;
      }, []);
    return filterNodes(tree);
  }, [tree, search]);

  // Auto-expand when searching
  const searchExpanded = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const ids = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { ids.add(n.value_id); collect(n.children); }
      }
    };
    collect(filteredTree);
    return ids;
  }, [filteredTree, search]);

  const effectiveExpanded = search.trim() ? searchExpanded : expanded;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandPathToValue = () => {
    if (!value || !items) return;
    const allIds = new Set(items.map(i => i.value_id));
    const ancestors = getAncestors(value, allIds);
    if (ancestors.length > 0) {
      setExpanded(prev => new Set([...prev, ...ancestors]));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) setTimeout(expandPathToValue, 100);
    if (!isOpen) setSearch("");
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = effectiveExpanded.has(node.value_id);
    const isSelected = value === node.value_id;
    const isTopLevel = TOP_LEVEL_IDS.has(node.value_id);

    return (
      <div key={node.value_id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 px-2 rounded-sm cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
            isSelected && "bg-accent text-accent-foreground font-medium",
            isTopLevel && "font-semibold text-muted-foreground"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            onChange(node.value_id);
            setOpen(false);
            setSearch("");
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => toggleExpand(node.value_id, e)}
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")}
              />
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <Check
            className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
          />
          <span className="truncate">{node.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (isLoading && !selectedItem) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedItem?.value_description || (value ? `ID: ${value}` : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3" role="search">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk hendelsestype..."
            className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Laster...</div>
            ) : filteredTree.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Ingen treff</div>
            ) : (
              filteredTree.map(node => renderNode(node, 0))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
