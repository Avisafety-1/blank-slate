

## Horisontal scrolling for nyheter (>3 stk)

### Endring i `src/components/dashboard/NewsSection.tsx`

Erstatt grid-layouten (linje 111) med en horisontal flex-container med `overflow-x-auto` og faste bredder på kortene:

```tsx
<div className="flex gap-2 sm:gap-3 flex-1 overflow-x-auto pb-2">
  {sortedNews.map((news) => (
    <div
      key={news.id}
      onClick={() => handleNewsClick(news)}
      className="p-3 sm:p-4 bg-card/30 rounded hover:bg-card/50 transition-colors cursor-pointer flex-shrink-0 w-[280px] sm:w-[320px]"
    >
```

- Fjern `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` og `overflow-y-auto`
- Bruk `flex overflow-x-auto` med `flex-shrink-0` og fast bredde på hvert kort
- Legger til `pb-2` for plass til scrollbar
- Når ≤3 kort vises de side om side; flere kort scrolles horisontalt uten å bryte layouten

