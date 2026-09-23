export type Company = { id: string; n: string; c: string; s: string; p: string[]; note?: string };
export type SupplyEdge = { s: string; t: string; p: string; w: 'd' | 'i' };
export type Segment = { id: string; name: string; short: string; stage: string; slot: number };
export type Chain = {
  nodes: Company[];
  edges: SupplyEdge[];
  segments: Segment[];
  tags: Record<string, string[]>;
  sources: [string, string][];
};
export type Position = {
  id: string;
  x: number;
  y: number;
  community: number;
  component: number;
  degree: number;
  bridge: number;
};
export type Topology = {
  positions: Position[];
  communities: { id: number; members: string[]; component: number }[];
  components: { id: number; members: string[] }[];
  pairs: { s: string; t: string }[];
};

/** Undirected simple topology: parallel products count once, all evidence included. */
export function analyzeTopology(
  ids: string[],
  edges: { s: string; t: string }[],
): Omit<Topology, 'positions'> & {
  metrics: { id: string; degree: number; bridge: number; community: number; component: number }[];
} {
  const sorted = [...ids].sort();
  const index = new Map(sorted.map((id, i) => [id, i]));
  const adjacency = sorted.map(() => new Set<number>());
  const pairs: { s: string; t: string }[] = [];
  const unique = new Set<string>();
  for (const edge of edges) {
    const a = index.get(edge.s),
      b = index.get(edge.t);
    if (a === undefined || b === undefined || a === b) continue;
    const s = Math.min(a, b),
      t = Math.max(a, b),
      key = s + ':' + t;
    if (unique.has(key)) continue;
    unique.add(key);
    adjacency[s].add(t);
    adjacency[t].add(s);
    pairs.push({ s: sorted[s], t: sorted[t] });
  }
  pairs.sort((a, b) => a.s.localeCompare(b.s) || a.t.localeCompare(b.t));
  const neighbors = adjacency.map((a) => [...a].sort((a, b) => a - b));
  const components: number[][] = [];
  const visited = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    if (visited.has(i)) continue;
    const queue = [i];
    visited.add(i);
    for (let head = 0; head < queue.length; head++)
      for (const n of neighbors[queue[head]])
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
    components.push(queue);
  }
  components.sort((a, b) => b.length - a.length || a[0] - b[0]);
  const componentOf = new Map<number, number>();
  components.forEach((c, i) => c.forEach((n) => componentOf.set(n, i)));

  // Exact Brandes betweenness, normalized separately within each connected component.
  const bridge = sorted.map(() => 0);
  for (let source = 0; source < sorted.length; source++) {
    const predecessors = sorted.map(() => [] as number[]),
      distance = sorted.map(() => -1),
      paths = sorted.map(() => 0),
      queue = [source],
      stack: number[] = [];
    distance[source] = 0;
    paths[source] = 1;
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      stack.push(v);
      for (const w of neighbors[v]) {
        if (distance[w] < 0) {
          distance[w] = distance[v] + 1;
          queue.push(w);
        }
        if (distance[w] === distance[v] + 1) {
          paths[w] += paths[v];
          predecessors[w].push(v);
        }
      }
    }
    const delta = sorted.map(() => 0);
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of predecessors[w]) delta[v] += (paths[v] / paths[w]) * (1 + delta[w]);
      if (w !== source) bridge[w] += delta[w];
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    const n = components[componentOf.get(i)!].length;
    bridge[i] = n > 2 ? bridge[i] / ((n - 1) * (n - 2)) : 0;
  }

  // Deterministic local modularity optimization; no industry labels used in clustering.
  const membership = sorted.map((_, i) => i),
    totals = neighbors.map((a) => a.length),
    m2 = 2 * pairs.length;
  const order = sorted
    .map((_, i) => i)
    .sort((a, b) => neighbors[b].length - neighbors[a].length || a - b);
  for (let pass = 0; pass < 40 && m2 > 0; pass++) {
    let changes = 0;
    for (const node of order) {
      const degree = neighbors[node].length;
      if (!degree) continue;
      const old = membership[node];
      totals[old] -= degree;
      const counts = new Map<number, number>();
      for (const n of neighbors[node])
        counts.set(membership[n], (counts.get(membership[n]) ?? 0) + 1);
      let best = old,
        bestScore = (counts.get(old) ?? 0) - (totals[old] * degree) / m2;
      for (const [candidate, count] of [...counts].sort((a, b) => a[0] - b[0])) {
        const score = count - (totals[candidate] * degree) / m2;
        if (score > bestScore + 1e-9) {
          best = candidate;
          bestScore = score;
        }
      }
      membership[node] = best;
      totals[best] += degree;
      if (best !== old) changes++;
    }
    if (!changes) break;
  }
  // Merge communities while modularity still improves; prevents the local pass
  // from leaving many two-node islands. No forced target community count.
  for (let pass = 0; pass < sorted.length; pass++) {
    const volumes = new Map<number, number>(),
      crossings = new Map<string, { a: number; b: number; count: number }>();
    for (let i = 0; i < sorted.length; i++)
      volumes.set(membership[i], (volumes.get(membership[i]) ?? 0) + neighbors[i].length);
    for (let i = 0; i < sorted.length; i++)
      for (const j of neighbors[i])
        if (i < j && membership[i] !== membership[j]) {
          const a = Math.min(membership[i], membership[j]),
            b = Math.max(membership[i], membership[j]),
            key = a + ':' + b;
          const edge = crossings.get(key) || { a, b, count: 0 };
          edge.count++;
          crossings.set(key, edge);
        }
    let best: { a: number; b: number } | null = null,
      gain = 1e-9;
    for (const edge of [...crossings.values()].sort((a, b) => a.a - b.a || a.b - b.b)) {
      const delta = edge.count - (volumes.get(edge.a)! * volumes.get(edge.b)!) / m2;
      if (delta > gain) {
        gain = delta;
        best = edge;
      }
    }
    if (!best) break;
    for (let i = 0; i < membership.length; i++)
      if (membership[i] === best.b) membership[i] = best.a;
  }
  const groups = new Map<number, number[]>();
  membership.forEach((c, n) => {
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(n);
  });
  const communities = [...groups.values()].sort(
    (a, b) => componentOf.get(a[0])! - componentOf.get(b[0])! || b.length - a.length || a[0] - b[0],
  );
  const communityOf = new Map<number, number>();
  communities.forEach((g, c) => g.forEach((n) => communityOf.set(n, c)));
  return {
    pairs,
    components: components.map((c, id) => ({ id, members: c.map((n) => sorted[n]) })),
    communities: communities.map((g, id) => ({
      id,
      members: g.map((n) => sorted[n]),
      component: componentOf.get(g[0])!,
    })),
    metrics: sorted.map((id, i) => ({
      id,
      degree: neighbors[i].length,
      bridge: bridge[i],
      community: communityOf.get(i)!,
      component: componentOf.get(i)!,
    })),
  };
}

/** Stable envelopes for the background communities, never substitutes for companies. */
export function hull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const expanded = points.flatMap((p) =>
    Array.from({ length: 8 }, (_, i) => ({
      x: p.x + Math.cos((i * Math.PI) / 4) * 23,
      y: p.y + Math.sin((i * Math.PI) / 4) * 23,
    })),
  );
  const sorted = expanded.sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const cross = (a: (typeof sorted)[number], b: typeof a, c: typeof a) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: typeof sorted = [],
    upper: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...sorted].reverse()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
