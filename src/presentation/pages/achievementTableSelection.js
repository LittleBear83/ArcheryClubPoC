import { useState } from "react";

export function isAchievementRowSelected(row, actorUsername, selectedRowId) {
  if (selectedRowId !== null) return row.id === selectedRowId;
  return Boolean(actorUsername) && row.archerUsername?.toLowerCase() === actorUsername.toLowerCase();
}

export function getAchievementRowProps(row, actorUsername, selectedRowId, selectRow) {
  const isSelected = isAchievementRowSelected(row, actorUsername, selectedRowId);
  const select = () => selectRow(row.id);

  return {
    className: `outdoor-table-row${isSelected ? " is-selected" : ""}`,
    "aria-selected": isSelected,
    tabIndex: 0,
    onClick: select,
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const sibling = event.key === "ArrowDown"
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling;
        if (sibling?.focus) {
          event.preventDefault();
          sibling.focus();
        }
      }
    },
  };
}

export function useAchievementRowSelection(actorUsername) {
  const [selection, setSelection] = useState(null);
  const selectedRowId = selection?.actorUsername === actorUsername ? selection.id : null;

  return (row) => getAchievementRowProps(row, actorUsername, selectedRowId,
    (id) => setSelection({ actorUsername, id }));
}
