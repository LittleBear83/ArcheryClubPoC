type SectionPanelProps = {
  children: React.ReactNode;
  className?: string;
  title: string;
  titleClassName?: string;
};

export function SectionPanel({
  children,
  className = "",
  title,
  titleClassName = "",
}: SectionPanelProps) {
  const headingClassName = ["profile-section-title", titleClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={className}>
      <h3 className={headingClassName}>{title}</h3>
      {children}
    </section>
  );
}
