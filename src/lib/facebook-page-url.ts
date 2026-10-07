/** Link công khai tới Fanpage (Graph API page id). */
export function getFacebookPageUrl(pageId: string): string {
  return `https://www.facebook.com/${pageId}`;
}

/** Link xem bài đã đăng (Graph post id thường dạng `{pageId}_{storyId}`). */
export function getFacebookPostUrl(
  fbPostId: string,
  graphPageId?: string | null
): string {
  const trimmed = fbPostId.trim();
  if (!trimmed) {
    return graphPageId ? getFacebookPageUrl(graphPageId) : "https://www.facebook.com";
  }

  const underscore = trimmed.indexOf("_");
  if (underscore > 0) {
    const pagePart = trimmed.slice(0, underscore);
    const storyPart = trimmed.slice(underscore + 1);
    return `https://www.facebook.com/${pagePart}/posts/${storyPart}`;
  }

  if (graphPageId) {
    return `https://www.facebook.com/${graphPageId}/posts/${trimmed}`;
  }

  return `https://www.facebook.com/${trimmed}`;
}
