export type PublishEvidence = {
  status: string;
  provider_post_id?: string | null;
  published_at?: string | null;
};

export type ProviderConfirmedPost<T extends PublishEvidence> = T & {
  status: "published";
  provider_post_id: string;
  published_at: string;
};

/**
 * Report published work only when durable state contains provider evidence.
 * This protects public-facing counts from legacy or corrupted status-only rows.
 */
export function isProviderConfirmedPost<T extends PublishEvidence>(
  post: T,
): post is ProviderConfirmedPost<T> {
  return (
    post.status === "published" &&
    typeof post.provider_post_id === "string" &&
    post.provider_post_id.trim().length > 0 &&
    typeof post.published_at === "string" &&
    Number.isFinite(Date.parse(post.published_at))
  );
}
