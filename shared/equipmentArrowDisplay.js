export function getArrowReference(item) {
  return item.details?.arrowIdentifier?.trim() || "Unmarked";
}

export function getArrowDescription(item) {
  const details = item.details ?? {};
  const fletching = [
    details.fletchingColour1,
    details.fletchingColour2,
    details.fletchingColour3,
  ].filter(Boolean);
  const quantity = item.arrowQuantity == null ? "" : `${item.arrowQuantity} arrows`;
  const length = item.arrowLength == null ? "" : `${item.arrowLength}"`;
  const measurements = [quantity, length].filter(Boolean).join(" · ");

  return [
    measurements,
    details.arrowMaterial,
    details.arrowColour,
    fletching.length ? `Fletch ${fletching.join("/")}` : details.fletchingColour ? `Fletch ${details.fletchingColour}` : "",
    details.nockColour ? `Nock ${details.nockColour}` : "",
    details.spine ? `Spine ${details.spine}` : "",
    !details.arrowIdentifier?.trim() && item.id != null ? `ID ${item.id}` : "",
  ].filter(Boolean).join(" | ");
}

export function getArrowDisplayLabel(item) {
  return `Arrows ${getArrowReference(item)} · ${getArrowDescription(item)}`;
}

export function getArrowSearchText(item) {
  return [getArrowReference(item), getArrowDescription(item), item.number].filter(Boolean).join(" ");
}

export function compareArrowReferences(left, right) {
  return getArrowReference(left).localeCompare(getArrowReference(right), undefined, {
    numeric: true,
    sensitivity: "base",
  }) || String(left.id ?? "").localeCompare(String(right.id ?? ""), undefined, { numeric: true });
}
