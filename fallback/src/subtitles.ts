// One visible character corresponds to one normalized character in our Chinese articles.
export function subtitleWindow(article: string, correct: number) {
  const text = article.replace(/\s+/g, '');
  let start = 0;
  while (start < text.length) {
    let end = start;
    do { end++; } while (end < text.length && end - start < 24 && !/[。！？!?]/.test(text[end-1]));
    if (correct < end || end === text.length) return { text: text.slice(start,end), start };
    start = end;
  }
  return {text:'', start:0};
}
