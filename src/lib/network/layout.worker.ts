import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from 'd3-force';
import { analyzeTopology, type Position, type Topology } from './topology';
type SimNode = SimulationNodeDatum & { id: string; community: number; degree: number };

self.onmessage = (
  event: MessageEvent<{ ids: string[]; edges: { s: string; t: string }[]; request: number }>,
) => {
  try {
    const analyzed = analyzeTopology(event.data.ids, event.data.edges);
    const positions: Position[] = [];
    for (const component of analyzed.components) {
      const communities = analyzed.communities.filter((c) => c.component === component.id);
      const groupById = new Map(communities.map((c) => [c.id, c]));
      const centres = communities.map((c, i) => ({
        id: String(c.id),
        x: Math.cos(i * 2.399) * Math.sqrt(i + 1) * 95,
        y: Math.sin(i * 2.399) * Math.sqrt(i + 1) * 95,
      }));
      const metrics = analyzed.metrics.filter((n) => n.component === component.id);
      const metricMap = new Map(metrics.map((n) => [n.id, n]));
      const links = analyzed.pairs.filter((e) => metricMap.has(e.s) && metricMap.has(e.t));
      const groupLinks = links
        .filter((e) => metricMap.get(e.s)!.community !== metricMap.get(e.t)!.community)
        .map((e) => ({
          source: String(metricMap.get(e.s)!.community),
          target: String(metricMap.get(e.t)!.community),
        }));
      forceSimulation(centres)
        .stop()
        .force(
          'link',
          forceLink(groupLinks)
            .id((n: any) => n.id)
            .distance(180)
            .strength(0.015),
        )
        .force('charge', forceManyBody().strength(-1800))
        .force(
          'collide',
          forceCollide<any>()
            .radius((n) => Math.sqrt(groupById.get(Number(n.id))!.members.length) * 18 + 25)
            .strength(1),
        )
        .force('x', forceX(0).strength(0.015))
        .force('y', forceY(0).strength(0.015))
        .tick(330);
      const centreMap = new Map(centres.map((c) => [Number(c.id), c]));
      const nodes: SimNode[] = metrics.map((n, i) => ({
        id: n.id,
        degree: n.degree,
        community: n.community,
        x: centreMap.get(n.community)!.x + Math.cos(i * 2.399) * Math.sqrt(i + 1) * 5,
        y: centreMap.get(n.community)!.y + Math.sin(i * 2.399) * Math.sqrt(i + 1) * 5,
      }));
      const simLinks = links.map((e) => ({ source: e.s, target: e.t }));
      forceSimulation(nodes)
        .stop()
        .force(
          'link',
          forceLink<SimNode, (typeof simLinks)[number]>(simLinks)
            .id((n) => n.id)
            .distance(62)
            .strength((e) => {
              const a = e.source as unknown as SimNode,
                b = e.target as unknown as SimNode;
              return a.community === b.community ? 0.16 : 0.035;
            }),
        )
        .force('charge', forceManyBody<SimNode>().strength(-95))
        .force(
          'collision',
          forceCollide<SimNode>()
            .radius((n) => 10 + Math.sqrt(n.degree) * 1.4)
            .iterations(2),
        )
        .force('x', forceX<SimNode>((n) => centreMap.get(n.community)!.x).strength(0.12))
        .force('y', forceY<SimNode>((n) => centreMap.get(n.community)!.y).strength(0.12))
        .tick(420);
      const minX = Math.min(...nodes.map((n) => n.x!)),
        maxX = Math.max(...nodes.map((n) => n.x!)),
        minY = Math.min(...nodes.map((n) => n.y!)),
        maxY = Math.max(...nodes.map((n) => n.y!));
      const scale = Math.min(780 / Math.max(1, maxX - minX), 780 / Math.max(1, maxY - minY));
      for (const n of nodes)
        positions.push({
          ...metricMap.get(n.id)!,
          x: (component.id % 2) * 960 + 100 + (n.x! - minX) * scale,
          y: Math.floor(component.id / 2) * 1030 + 140 + (n.y! - minY) * scale,
        });
    }
    const result: Topology = {
      positions,
      communities: analyzed.communities,
      components: analyzed.components,
      pairs: analyzed.pairs,
    };
    self.postMessage({ request: event.data.request, result });
  } catch (error) {
    self.postMessage({
      request: event.data.request,
      error: error instanceof Error ? error.message : '布局计算失败',
    });
  }
};
