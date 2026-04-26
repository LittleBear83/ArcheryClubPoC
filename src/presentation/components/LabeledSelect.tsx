type LabeledSelectProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  value: string;
};

export function LabeledSelect({
  children,
  className = "profile-member-select",
  disabled = false,
  label,
  onChange,
  value,
}: LabeledSelectProps) {
  return (
    <label className={className}>
      {label}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {children}
      </select>
    </label>
  );
}
