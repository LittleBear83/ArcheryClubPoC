import { ColourDropdown } from "../../components/ColourDropdown";
import { LabeledSelect } from "../../components/LabeledSelect";
import {
  ARROW_COLOUR_OPTIONS,
  ARROW_FLETCHING_COLOUR_OPTIONS,
  ARROW_MATERIAL_OPTIONS,
  ARROW_NOCK_COLOUR_OPTIONS,
} from "../../../../shared/arrowSchema.js";
import {
  EQUIPMENT_EXTENDED_HANDEDNESS_OPTIONS,
  EQUIPMENT_HANDEDNESS_OPTIONS,
  getEquipmentNumberFieldLabel,
  getEquipmentSizeFieldLabel,
  getEquipmentSizeOptions,
  shouldShowEquipmentSizeField,
} from "./equipmentUtils";

export function EquipmentAddDetailsFields({
  addForm,
  updateAddFormField,
}) {
  const showSizeField = shouldShowEquipmentSizeField(addForm.equipmentType);
  const sizeOptions = getEquipmentSizeOptions(addForm.equipmentType);

  return (
    <>
      {showSizeField ? (
        <LabeledSelect
          label={getEquipmentSizeFieldLabel(addForm.equipmentType)}
          value={addForm.sizeCategory}
          onChange={updateAddFormField("sizeCategory")}
        >
          {sizeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </LabeledSelect>
      ) : null}

      {addForm.equipmentType === "arrows" ? (
        <>
          <label>
            Arrow length (inches)
            <input
              type="number"
              min="20"
              inputMode="numeric"
              value={addForm.arrowLength}
              onChange={updateAddFormField("arrowLength")}
            />
          </label>

          <label>
            Arrow quantity
            <input
              type="number"
              min="1"
              max="12"
              inputMode="numeric"
              value={addForm.arrowQuantity}
              onChange={updateAddFormField("arrowQuantity")}
            />
          </label>

          <label>
            Arrow material
            <select
              value={addForm.arrowMaterial}
              onChange={updateAddFormField("arrowMaterial")}
            >
              <option value="">Select material</option>
              {ARROW_MATERIAL_OPTIONS.map((material) => (
                <option key={material} value={material}>
                  {material.charAt(0).toUpperCase() + material.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <ColourDropdown
            label="Arrow colour"
            options={ARROW_COLOUR_OPTIONS}
            value={addForm.arrowColour}
            onChange={updateAddFormField("arrowColour")}
          />

          <label>
            Arrow initial or number
            <input
              value={addForm.arrowIdentifier}
              onChange={updateAddFormField("arrowIdentifier")}
            />
          </label>

          <ColourDropdown
            label="Fletching colour 1"
            options={ARROW_FLETCHING_COLOUR_OPTIONS}
            value={addForm.fletchingColour1}
            onChange={updateAddFormField("fletchingColour1")}
          />

          <ColourDropdown
            label="Fletching colour 2"
            options={ARROW_FLETCHING_COLOUR_OPTIONS}
            value={addForm.fletchingColour2}
            onChange={updateAddFormField("fletchingColour2")}
          />

          <ColourDropdown
            label="Fletching colour 3"
            options={ARROW_FLETCHING_COLOUR_OPTIONS}
            value={addForm.fletchingColour3}
            onChange={updateAddFormField("fletchingColour3")}
          />

          <ColourDropdown
            label="Nock colour"
            options={ARROW_NOCK_COLOUR_OPTIONS}
            value={addForm.nockColour}
            onChange={updateAddFormField("nockColour")}
          />

          <label>
            Spine
            <input
              value={addForm.arrowSpine}
              onChange={updateAddFormField("arrowSpine")}
            />
          </label>
        </>
      ) : (
        <label>
          {getEquipmentNumberFieldLabel(addForm.equipmentType)}
          <input
            value={addForm.itemNumber}
            onChange={updateAddFormField("itemNumber")}
          />
        </label>
      )}

      {addForm.equipmentType === "riser" ? (
        <>
          <label>
            Make and model
            <input
              value={addForm.makeModel}
              onChange={updateAddFormField("makeModel")}
            />
          </label>

          <label>
            Length (for example 19, 23, 25)
            <input
              value={addForm.equipmentLength}
              onChange={updateAddFormField("equipmentLength")}
            />
          </label>

          <LabeledSelect
            label="Handedness"
            value={addForm.handedness}
            onChange={updateAddFormField("handedness")}
          >
            {EQUIPMENT_HANDEDNESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </LabeledSelect>

          <label>
            Colour
            <input
              value={addForm.colour}
              onChange={updateAddFormField("colour")}
            />
          </label>
        </>
      ) : null}

      {addForm.equipmentType === "limb" ? (
        <>
          <label>
            Make and model
            <input
              value={addForm.makeModel}
              onChange={updateAddFormField("makeModel")}
            />
          </label>

          <LabeledSelect
            label="Limb length"
            value={addForm.equipmentLength}
            onChange={updateAddFormField("equipmentLength")}
          >
            <option value="">Select length</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </LabeledSelect>

          <label>
            Poundage
            <input
              value={addForm.poundage}
              onChange={updateAddFormField("poundage")}
            />
          </label>
        </>
      ) : null}

      {addForm.equipmentType === "quiver" ? (
        <LabeledSelect
          label="Handedness"
          value={addForm.handedness}
          onChange={updateAddFormField("handedness")}
        >
          {EQUIPMENT_EXTENDED_HANDEDNESS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </LabeledSelect>
      ) : null}

      {addForm.equipmentType === "arm_guard" ? (
        <LabeledSelect
          label="Arm guard length"
          value={addForm.equipmentLength}
          onChange={updateAddFormField("equipmentLength")}
        >
          <option value="">Select length</option>
          <option value="short">Short</option>
          <option value="long">Long</option>
          <option value="extra-long">Extra long</option>
        </LabeledSelect>
      ) : null}

      {addForm.equipmentType === "finger_tab" ? (
        <>
          <LabeledSelect
            label="Finger tab size"
            value={addForm.fitSize}
            onChange={updateAddFormField("fitSize")}
          >
            <option value="">Select size</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
          </LabeledSelect>

          <LabeledSelect
            label="Handedness"
            value={addForm.handedness}
            onChange={updateAddFormField("handedness")}
          >
            {EQUIPMENT_EXTENDED_HANDEDNESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </LabeledSelect>
        </>
      ) : null}

      {addForm.equipmentType === "chest_guard" ? (
        <>
          <LabeledSelect
            label="Chest guard size"
            value={addForm.fitSize}
            onChange={updateAddFormField("fitSize")}
          >
            <option value="">Select size</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
          </LabeledSelect>

          <LabeledSelect
            label="Handedness"
            value={addForm.handedness}
            onChange={updateAddFormField("handedness")}
          >
            {EQUIPMENT_EXTENDED_HANDEDNESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </LabeledSelect>
        </>
      ) : null}
    </>
  );
}
