/**
 * FieldRow — a single field row in the FieldsSection list. Presentational:
 * drag-and-drop, edit, and delete are surfaced as handler props; all state and
 * persistence live in FieldsSection.
 */
import type { DragEvent, ReactElement } from 'react'
import { Button } from '@ui/components/Button'
import { EditSolidIcon } from 'pixel-art-icons/icons/edit-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { LockSolidIcon } from 'pixel-art-icons/icons/lock-solid'
import { DragAndDropSolidIcon } from 'pixel-art-icons/icons/drag-and-drop-solid'
import { getFieldIcon } from '@admin/pages/data/utils/fieldIcons'
import type { DataField } from '@core/data/schemas'
import { FIELD_TYPE_LABELS } from './fieldGuards'
import styles from './DataInspector.module.css'

interface FieldRowProps {
  field: DataField
  canDrag: boolean
  canEdit: boolean
  deletable: boolean
  /** Tooltip for a disabled delete button (undefined when deletable). */
  deleteTooltip?: string
  /** Mandatory postType built-in — rendered as a locked row with no actions. */
  mandatory: boolean
  /** Optional postType built-in — shows the "built-in" badge. */
  optionalBuiltIn: boolean
  isEditing: boolean
  isDragOver: boolean
  isDragging: boolean
  onEditToggle: () => void
  onDelete: () => void
  onDragStart: (e: DragEvent<HTMLDivElement>) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

export function FieldRow({
  field,
  canDrag,
  canEdit,
  deletable,
  deleteTooltip,
  mandatory,
  optionalBuiltIn,
  isEditing,
  isDragOver,
  isDragging,
  onEditToggle,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FieldRowProps): ReactElement {
  return (
    <div
      className={[
        styles.fieldRow,
        isDragOver ? styles.fieldRowDragOver : '',
        isDragging ? styles.fieldRowDragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragOver={canDrag ? onDragOver : undefined}
      onDragLeave={canDrag ? onDragLeave : undefined}
      onDrop={canDrag ? onDrop : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
    >
      {/* Drag handle — shown only for draggable fields */}
      {canDrag ? (
        <span className={styles.dragHandle} aria-hidden="true">
          <DragAndDropSolidIcon size={12} />
        </span>
      ) : (
        <span className={styles.dragHandleSpacer} aria-hidden="true" />
      )}

      {/* Field type icon — called directly (not as <FieldIcon/>) to avoid the
          react-hooks/static-components rule, matching DataGridHeaderCell. */}
      <span className={styles.fieldIcon} aria-hidden="true">
        {getFieldIcon(field.type)({ size: 13 })}
      </span>

      {/* Name */}
      <span className={styles.fieldName}>{field.label}</span>

      {/* Mandatory built-in lock badge */}
      {mandatory && (
        <span className={styles.lockedBadge} aria-label="Required field — locked">
          <LockSolidIcon size={10} aria-hidden="true" />
        </span>
      )}

      {/* Optional built-in badge */}
      {!mandatory && optionalBuiltIn && (
        <span className={styles.typeBadge}>built-in</span>
      )}

      {/* Type badge */}
      {!mandatory && (
        <span className={styles.typeBadge}>{FIELD_TYPE_LABELS[field.type]}</span>
      )}

      {/* Actions — not shown for mandatory built-ins */}
      {!mandatory && canEdit && (
        <div className={styles.fieldActions}>
          {/* Edit — always shown (lock only for label/type in the form) */}
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            type="button"
            aria-label={`Edit ${field.label}`}
            tooltip={`Edit ${field.label}`}
            pressed={isEditing}
            onClick={onEditToggle}
          >
            <EditSolidIcon size={12} aria-hidden="true" />
          </Button>
          {/* Delete */}
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            tone="danger"
            type="button"
            aria-label={`Delete ${field.label}`}
            tooltip={deleteTooltip ?? `Delete ${field.label}`}
            disabled={!deletable}
            onClick={deletable ? onDelete : undefined}
          >
            <TrashSolidIcon size={12} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
