import express, { type Router } from "express";
import type { Driver } from "neo4j-driver";
import neo4j from "neo4j-driver";

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function neoNodeToJson(n: unknown) {
  if (n && typeof n === "object" && "properties" in n) {
    const p = (n as { properties: Record<string, unknown>; labels?: string[] }).properties;
    const labels = (n as { labels?: string[] }).labels;
    return { labels, ...p };
  }
  return n;
}

export function graphRouter(driver: Driver): Router {
  const r = express.Router();

  r.get("/graph", async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 400, 2000);
    const session = driver.session();
    try {
      const nodeLimit = neo4j.int(Math.max(50, Math.floor(limit * 0.6)));
      const edgeLimit = neo4j.int(limit);

      const nodeRes = await session.run(
        `
        MATCH (n)
        WHERE n.gid IS NOT NULL
        RETURN labels(n)[0] AS label, n.gid AS id, properties(n) AS props
        LIMIT $nodeLimit
        `,
        { nodeLimit },
      );
      const nodes = nodeRes.records.map((rec) => {
        const props = (rec.get("props") as Record<string, unknown>) ?? {};
        return {
          data: {
            id: rec.get("id") as string,
            label: rec.get("label") as string,
            ...props,
          },
        };
      });

      const edgeRes = await session.run(
        `
        MATCH (a)-[r]->(b)
        WHERE a.gid IS NOT NULL AND b.gid IS NOT NULL
        RETURN elementId(r) AS eid, type(r) AS relType, a.gid AS source, b.gid AS target
        LIMIT $edgeLimit
        `,
        { edgeLimit },
      );
      const edges = edgeRes.records.map((rec) => ({
        data: {
          id: String(rec.get("eid") ?? `${rec.get("source")}-${rec.get("relType")}-${rec.get("target")}`),
          source: rec.get("source") as string,
          target: rec.get("target") as string,
          label: rec.get("relType") as string,
        },
      }));

      res.json({ nodes, edges });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: errMsg(e) });
    } finally {
      await session.close();
    }
  });

  /** One-hop neighborhood as cytoscape-style nodes + edges (for “expand” in UI). */
  r.get("/graph/expand", async (req, res) => {
    const gidRaw = req.query.gid;
    if (!gidRaw || typeof gidRaw !== "string") {
      res.status(400).json({ error: "Query parameter gid is required" });
      return;
    }
    const gid = decodeURIComponent(gidRaw);
    const session = driver.session();
    try {
      const result = await session.run(
        `
        MATCH (n { gid: $gid })
        OPTIONAL MATCH (n)-[r]-(m)
        WHERE m IS NOT NULL AND m.gid IS NOT NULL
        WITH n, collect(DISTINCT m) AS ms, collect(DISTINCT r) AS rs
        WITH [n] + ms AS nodeList, rs AS relList
        RETURN
          [x IN nodeList | {
            id: x.gid,
            label: head(labels(x)),
            props: properties(x)
          }] AS nodes,
          [rel IN relList WHERE rel IS NOT NULL | {
            id: elementId(rel),
            relType: type(rel),
            source: startNode(rel).gid,
            target: endNode(rel).gid
          }] AS edges
        `,
        { gid },
      );
      if (!result.records.length) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      const rec = result.records[0];
      const rawNodes = rec.get("nodes") as { id: string; label: string; props: Record<string, unknown> }[];
      const rawEdges = rec.get("edges") as {
        id: string;
        relType: string;
        source: string;
        target: string;
      }[];

      const nodes = rawNodes.map(({ id, label, props }) => ({
        data: {
          id,
          label,
          ...props,
        },
      }));
      const edges = rawEdges.map((e) => ({
        data: {
          id: String(e.id),
          source: e.source,
          target: e.target,
          label: e.relType,
        },
      }));

      res.json({ nodes, edges });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: errMsg(e) });
    } finally {
      await session.close();
    }
  });

  r.get("/graph/node/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const session = driver.session();
    try {
      const gid =
        type === "JournalEntry" && id.includes("|")
          ? `JournalEntry:${id}`
          : `${type}:${decodeURIComponent(id)}`;

      const result = await session.run(
        `
        MATCH (n { gid: $gid })
        OPTIONAL MATCH (n)-[r]-(m)
        WHERE m.gid IS NOT NULL
        RETURN n,
               collect(DISTINCT {
                 rel: type(r),
                 other: m.gid,
                 dir: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END
               }) AS links
        `,
        { gid },
      );
      if (!result.records.length) {
        res.status(404).json({ error: "Node not found" });
        return;
      }
      const rec = result.records[0];
      res.json({ node: neoNodeToJson(rec.get("n")), links: rec.get("links") });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: errMsg(e) });
    } finally {
      await session.close();
    }
  });

  return r;
}
