/**
 * FieldEditForm — the inline edit panel rendered below a field row in
 * FieldsSection. Renders a FieldEditState draft; all state ownership and
 * persistence live in FieldsSection.
 */
import { useId } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@ui/components/Button'
import { Input, Textarea } from '@ui/components/Input'
import { Select } from '@ui/components/Select'
import { Switch } from '@ui/components/Switch'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { CheckIcon } from 'pixel-art-icons/icons/check'
import type { DataField, DataTable } from '@core/data/schemas'
import { FIELD_TYPE_LABELS } from './fieldGuards'
import {
  MEDIA_KIND_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  RICH_TEXT_FORMAT_OPTIONS,
  type DraftOption,
  type FieldEditState,
} from './fieldEditState'
import styles from './DataInspector.module.css'

interface FieldEditFormProps {
  field: DataField
  tables: DataTable[]
  state: FieldEditState
  saving: boolean
  error: string | null
  /** When true, label input is disabled (built-in postType fields). */
  labelLocked: boolean
  onChange: <K extends keyof FieldEditState>(key: K, value: FieldEditState[K]) => void
  onOptionUpdate: (index: number, patch: Partial<DraftOption>) => void
  onOptionRemove: (index: number) => void
  onOptionAdd: () => void
  onSave: () => void
  onCancel: () => void
}

export function FieldEditForm({
  field,
  tables,
  state,
  saving,
  error,
  labelLocked,
  onChange,
  onOptionUpdate,
  onOptionRemove,
  onOptionAdd,
  onSave,
  onCancel,
}: FieldEditFormProps): ReactElement {
  const tableOptions = tables.map((t) => ({ value: t.id, label: t.name }))
  const labelInputId = useId()
  const descriptionId = useId()
  const textMaxLengthId = useId()
  const textPlaceholderId = useId()
  const numberMinId = useId()
  const numberMaxId = useId()
  const numberStepId = useId()
  const numberCurrencyId = useId()

  return (
    <div className={styles.fieldEditForm}>
      {/* Type — read only */}
      <div className={styles.fieldEditTypeRow}>
        <span className={styles.fieldEditTypeLabel}>Type:</span>
        <span className={styles.fieldEditTypeValue}>{FIELD_TYPE_LABELS[field.type]}</span>
        <span className={styles.fieldEditTypeNote}>(cannot be changed)</span>
      </div>

      {/* Label */}
      <div className={styles.formGroup}>
        <label htmlFor={labelInputId} className={styles.label}>
          Label
          {labelLocked && (
            <span className={styles.optional}> (locked)</span>
          )}
        </label>
        <Input
          id={labelInputId}
          fieldSize="sm"
          value={state.label}
          disabled={labelLocked}
          onChange={(e) => onChange('label', e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Required */}
      <div className={styles.switchRow}>
        <span className={styles.switchLabel}>Required</span>
        <Switch
          checked={state.required}
          onCheckedChange={(v) => onChange('required', v)}
        />
      </div>

      {/* Description */}
      <div className={styles.formGroup}>
        <label htmlFor={descriptionId} className={styles.label}>
          Description <span className={styles.optional}>(optional)</span>
        </label>
        <Textarea
          id={descriptionId}
          fieldSize="sm"
          value={state.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Shown next to the field in the editor"
          rows={2}
        />
      </div>

      {/* ── Type-specific (hidden for locked built-ins) ── */}

      {!labelLocked && field.type === 'text' && (
        <>
          <div className={styles.formGroup}>
            <label htmlFor={textMaxLengthId} className={styles.label}>
              Max length <span className={styles.optional}>(optional)</span>
            </label>
            <Input
              id={textMaxLengthId}
              fieldSize="sm"
              type="number"
              value={state.textMaxLength}
              onChange={(e) => onChange('textMaxLength', e.target.value)}
              placeholder="255"
              min={1}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor={textPlaceholderId} className={styles.label}>
              Placeholder <span className={styles.optional}>(optional)</span>
            </label>
            <Input
              id={textPlaceholderId}
              fieldSize="sm"
              value={state.textPlaceholder}
              onChange={(e) => onChange('textPlaceholder', e.target.value)}
              placeholder="Enter a value…"
            />
          </div>
        </>
      )}

      {!labelLocked && field.type === 'richText' && (
        <div className={styles.formGroup}>
          <span className={styles.label}>Format</span>
          <Select
            fieldSize="sm"
            value={state.richTextFormat}
            options={RICH_TEXT_FORMAT_OPTIONS}
            onChange={(e) => onChange('richTextFormat', e.target.value as 'markdown' | 'html')}
          />
        </div>
      )}

      {!labelLocked && field.type === 'number' && (
        <>
          <div className={styles.fieldRow3Col}>
            <div className={styles.formGroup}>
              <label htmlFor={numberMinId} className={styles.label}>Min</label>
              <Input
                id={numberMinId}
                fieldSize="sm"
                type="number"
                value={state.numberMin}
                onChange={(e) => onChange('numberMin', e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={numberMaxId} className={styles.label}>Max</label>
              <Input
                id={numberMaxId}
                fieldSize="sm"
                type="number"
                value={state.numberMax}
                onChange={(e) => onChange('numberMax', e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor={numberStepId} className={styles.label}>Step</label>
              <Input
                id={numberStepId}
                fieldSize="sm"
                type="number"
                value={state.numberStep}
                onChange={(e) => onChange('numberStep', e.target.value)}
              />
            </div>
          </div>
          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Integer only</span>
            <Switch
              checked={state.numberInteger}
              onCheckedChange={(v) => onChange('numberInteger', v)}
            />
          </div>
          <div className={styles.formGroup}>
            <span className={styles.label}>Format</span>
            <Select
              fieldSize="sm"
              value={state.numberFormat}
              options={NUMBER_FORMAT_OPTIONS}
              onChange={(e) =>
                onChange('numberFormat', e.target.value as 'number' | 'currency' | 'percent')
              }
            />
          </div>
          {state.numberFormat === 'currency' && (
            <div className={styles.formGroup}>
              <label htmlFor={numberCurrencyId} className={styles.label}>
                Currency code <span className={styles.optional}>(e.g. USD)</span>
              </label>
              <Input
                id={numberCurrencyId}
                fieldSize="sm"
                value={state.numberCurrency}
                onChange={(e) => onChange('numberCurrency', e.target.value)}
                placeholder="USD"
                maxLength={10}
              />
            </div>
          )}
        </>
      )}

      {!labelLocked && field.type === 'boolean' && (
        <div className={styles.switchRow}>
          <span className={styles.switchLabel}>Default value</span>
          <Switch
            checked={state.booleanDefault}
            onCheckedChange={(v) => onChange('booleanDefault', v)}
          />
        </div>
      )}

      {!labelLocked && (field.type === 'select' || field.type === 'multiSelect') && (
        <div className={styles.formGroup}>
          <span className={styles.label}>Options</span>
          <div className={styles.optionList}>
            {state.selectOptions.map((opt, index) => (
              <div key={opt.id} className={styles.optionRow}>
                <Input
                  fieldSize="sm"
                  value={opt.label}
                  onChange={(e) => onOptionUpdate(index, { label: e.target.value })}
                  placeholder="Label"
                  autoComplete="off"
                />
                <Input
                  fieldSize="sm"
                  value={opt.value}
                  onChange={(e) => onOptionUpdate(index, { value: e.target.value })}
                  placeholder="value"
                  autoComplete="off"
                  monospace
                />
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  type="button"
                  aria-label="Remove option"
                  onClick={() => onOptionRemove(index)}
                  disabled={state.selectOptions.length <= 1}
                >
                  <TrashSolidIcon size={12} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            type="button"
            align="start"
            onClick={onOptionAdd}
          >
            <PlusIcon size={11} aria-hidden="true" />
            Add option
          </Button>
        </div>
      )}

      {!labelLocked && field.type === 'media' && (
        <>
          <div className={styles.formGroup}>
            <span className={styles.label}>Media kind</span>
            <Select
              fieldSize="sm"
              value={state.mediaKind}
              options={MEDIA_KIND_OPTIONS}
              onChange={(e) =>
                onChange('mediaKind', e.target.value as 'image' | 'video' | 'any')
              }
            />
          </div>
          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Allow multiple</span>
            <Switch
              checked={state.mediaAllowMultiple}
              onCheckedChange={(v) => onChange('mediaAllowMultiple', v)}
            />
          </div>
        </>
      )}

      {!labelLocked && field.type === 'relation' && (
        <>
          <div className={styles.formGroup}>
            <span className={styles.label}>Target table</span>
            <span className={styles.caption}>
              {tableOptions.find((t) => t.value === field.targetTableId)?.label ?? field.targetTableId}
              {' '}
              <span className={styles.optional}>(cannot be changed after creation)</span>
            </span>
          </div>
          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Allow multiple</span>
            <Switch
              checked={state.relationAllowMultiple}
              onCheckedChange={(v) => onChange('relationAllowMultiple', v)}
            />
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <p role="alert" className={styles.errorBanner}>{error}</p>
      )}

      {/* Actions */}
      <div className={styles.fieldEditFormActions}>
        <Button variant="ghost" size="xs" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="xs"
          type="button"
          disabled={saving || (!labelLocked && !state.label.trim())}
          onClick={onSave}
        >
          <CheckIcon size={11} aria-hidden="true" />
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
