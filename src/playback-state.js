// Still-frame/sculpture URLs are inspection tools, never a persistent play mode.
export function leaveReview(app, location, history, body) {
  if (app) app.manual = false;
  body.classList.remove('sculpture-review');
  const url = new URL(location.href);
  const reviewKeys = ['frame', 'sculpture', 'film'];
  if (reviewKeys.some((key) => url.searchParams.has(key))) {
    reviewKeys.forEach((key) => url.searchParams.delete(key));
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
}
