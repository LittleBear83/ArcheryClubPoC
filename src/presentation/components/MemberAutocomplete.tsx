import { useEffect, useMemo, useState } from "react";
import Autocomplete, {
  createFilterOptions,
} from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

export type MemberAutocompleteOption = {
  disabled?: boolean;
  keywords?: string[];
  label: string;
  secondaryText?: string;
  searchText?: string;
  value: string;
};

type MemberAutocompleteProps = {
  clearDisplayOnFocus?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  label: string;
  maxWidth?: string;
  minWidth?: string;
  noOptionsText?: string;
  onValueChange: (value: string) => void;
  options: MemberAutocompleteOption[];
  placeholder?: string;
  value: string;
};

const filterOptions = createFilterOptions<MemberAutocompleteOption>({
  stringify: (option) =>
    [
      option.label,
      option.searchText ?? "",
      ...(option.keywords ?? []),
      option.secondaryText ?? "",
    ]
      .join(" ")
      .trim(),
});

export function MemberAutocomplete({
  clearDisplayOnFocus = false,
  disabled = false,
  fullWidth = true,
  label,
  maxWidth,
  minWidth,
  noOptionsText = "No members match that search.",
  onValueChange,
  options,
  placeholder = "Search by name or username",
  value,
}: MemberAutocompleteProps) {
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? "");

  useEffect(() => {
    setInputValue(selectedOption?.label ?? "");
  }, [selectedOption]);

  return (
    <div
      style={{
        maxWidth: maxWidth ?? (fullWidth ? "100%" : undefined),
        minWidth,
        width: fullWidth ? "100%" : "auto",
      }}
    >
      <span>{label}</span>
      <Autocomplete
        size="small"
        disablePortal
        fullWidth={fullWidth}
        options={options}
        value={selectedOption}
        inputValue={inputValue}
        filterOptions={filterOptions}
        onChange={(_, option) => {
          onValueChange(option?.value ?? "");
          setInputValue(option?.label ?? "");
        }}
        onInputChange={(_, nextInputValue, reason) => {
          setInputValue(nextInputValue);

          if (reason === "clear") {
            onValueChange("");
            return;
          }

          if (
            reason === "input" &&
            selectedOption &&
            nextInputValue !== selectedOption.label
          ) {
            onValueChange("");
          }
        }}
        onFocus={() => {
          if (clearDisplayOnFocus && selectedOption) {
            setInputValue("");
          }
        }}
        onBlur={() => {
          if (clearDisplayOnFocus && selectedOption && inputValue.trim() === "") {
            setInputValue(selectedOption.label);
          }
        }}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, currentValue) =>
          option.value === currentValue.value
        }
        getOptionDisabled={(option) => Boolean(option.disabled)}
        disabled={disabled}
        noOptionsText={noOptionsText}
        renderOption={(props, option) => (
          <li {...props} key={option.value}>
            <div>
              <strong>{option.label}</strong>
              {option.secondaryText ? <div>{option.secondaryText}</div> : null}
            </div>
          </li>
        )}
        renderInput={(params) => (
          <TextField {...params} placeholder={placeholder} variant="outlined" />
        )}
        sx={{
          mt: 1,
          "& .MuiOutlinedInput-root": {
            minHeight: "3rem",
            padding: "0 2.6rem 0 0.9rem",
            backgroundColor: "#24211c",
            borderRadius: "1rem",
            alignItems: "center",
          },
          "& .MuiInputBase-root": {
            backgroundColor: "#24211c",
            borderRadius: "1rem",
            color: "#f8f3e7",
            minHeight: "3rem",
            paddingTop: "0",
            paddingBottom: "0",
          },
          "& .MuiInputBase-input": {
            color: "#f8f3e7",
            padding: "0 !important",
            lineHeight: "1.2",
            fontSize: "0.95rem",
          },
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(225, 193, 7, 0.4)",
          },
          "& .MuiAutocomplete-inputRoot": {
            padding: "0 2.6rem 0 0.9rem !important",
          },
          "& .MuiAutocomplete-input": {
            minWidth: "0 !important",
          },
          "& .MuiAutocomplete-endAdornment": {
            right: "0.8rem",
            top: "50%",
            transform: "translateY(-50%)",
          },
          "& .MuiAutocomplete-popupIndicator": {
            padding: "0",
          },
          "& .MuiSvgIcon-root": {
            color: "#f8f3e7",
            fontSize: "1rem",
          },
        }}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "#161512",
              border: "1px solid rgba(225, 193, 7, 0.4)",
              color: "#f8f3e7",
            },
          },
          listbox: {
            sx: {
              backgroundColor: "#161512",
              color: "#f8f3e7",
              "& .MuiAutocomplete-option": {
                alignItems: "flex-start",
                backgroundColor: "#161512",
                color: "#f8f3e7",
                minHeight: "2rem",
                paddingTop: "0.25rem",
                paddingBottom: "0.25rem",
              },
              "& .MuiAutocomplete-option[aria-selected='true']": {
                backgroundColor: "rgba(225, 193, 7, 0.22)",
              },
              "& .MuiAutocomplete-option.Mui-focused": {
                backgroundColor: "rgba(225, 193, 7, 0.14)",
              },
            },
          },
        }}
      />
    </div>
  );
}
