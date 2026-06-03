export function MobileKeyValueList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="mobile-key-value-list">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="mobile-key-value-row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
