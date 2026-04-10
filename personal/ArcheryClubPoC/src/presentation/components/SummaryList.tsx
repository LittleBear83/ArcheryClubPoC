type SummaryListProps<TItem> = {
  items: TItem[];
  renderItem: (item: TItem) => React.ReactNode;
};

export function SummaryList<TItem>({
  items,
  renderItem,
}: SummaryListProps<TItem>) {
  return (
    <ul className="event-summary-list">
      {items.map((item, index) => (
        <li key={index}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}
