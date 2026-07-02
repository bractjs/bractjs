import type { LoaderArgs } from "@bractjs/bractjs";
import { Link, useLoaderData } from "@bractjs/bractjs";
import { type ResolvedMenu, resolvedMenu } from "../models/menus.server.ts";
import { listPublished, type PostWithRefs } from "../models/posts.server.ts";
import { EmptyState, PostCard, SiteFrame } from "../ui.tsx";

type Data = { latest: PostWithRefs[]; header: ResolvedMenu; footer: ResolvedMenu };

export async function loader(_: LoaderArgs): Promise<Data> {
  void _;
  return {
    latest: listPublished({ limit: 6 }),
    header: resolvedMenu("header"),
    footer: resolvedMenu("footer"),
  };
}

export function meta() {
  return [{ title: "The Bract Gazette" }];
}

export default function Home() {
  const { latest, header, footer } = useLoaderData<Data>();
  const [lead, ...rest] = latest;
  return (
    <SiteFrame header={header} footer={footer}>
      {latest.length === 0 ? (
        <EmptyState>
          No published posts yet. Head to <Link to="/admin">the admin</Link> to write one.
        </EmptyState>
      ) : (
        <>
          {lead ? (
            <div style={{ marginBottom: "2rem" }}>
              <PostCard post={lead} />
            </div>
          ) : null}
          <div style={{ display: "grid", gap: "1.4rem" }}>
            {rest.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          <p style={{ textAlign: "center", marginTop: "2rem" }}>
            <Link
              to="/posts"
              style={{ color: "var(--accent)", fontVariant: "small-caps", letterSpacing: ".06em" }}
            >
              Read all posts →
            </Link>
          </p>
        </>
      )}
    </SiteFrame>
  );
}
