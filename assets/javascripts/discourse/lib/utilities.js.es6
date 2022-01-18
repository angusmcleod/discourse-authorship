function likeButtonAttrs(attrs) {
  return {
    action: "like",
    icon: "d-liked",
    className: "toggle-like like",
    before: "like-count",
    title: "post.controls.like"
  };
}

function likeCountButtonAttrs(attrs) {
  const count = attrs.likeCount;
  return {
    action: "toggleWhoLiked",
    title: "post.has_likes_title",
    className: `button-count like-count highlight-action regular-likes`,
    contents: count,
    titleOptions: { count: attrs.liked ? count - 1 : count }
  };
}

export {
  likeButtonAttrs,
  likeCountButtonAttrs
}
