// Reading extensions (annotations, inserted passages and the two jump helpers)
// only have work to do on a chapter article. They used to be injected on every
// page, so the Harness directory downloaded them and their CSS for nothing.
// Load them lazily only where #chapter-content exists; the jump helpers stay
// behind the query flags that trigger them.

const article = document.querySelector('#chapter-content');

if (article) {
  void import('./annotations');
  void import('./inserts');
  const params = new URLSearchParams(location.search);
  if (params.has('hl')) void import('./highlights-jump');
  if (params.has('quote')) void import('./quote-jump');
}
