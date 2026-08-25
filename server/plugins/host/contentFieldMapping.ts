import type { ContentTableSchema as ContentTableSchemaShape } from '@core/plugin-sdk/contentSchemas'
import type { DataField } from '@core/data/schemas'
import { listDataTables } from '../../repositories/data'
import type { DbClient } from '../../db/client'

type PluginContentFieldForCreate = ContentTableSchemaShape['fields'][number]

function pluginFieldCommon(field: PluginContentFieldForCreate): {
  id: string
  label: string
  required?: boolean
} {
  const withRequired = field as { required?: boolean }
  return {
    id: field.id,
    label: field.label,
    ...(withRequired.required !== undefined ? { required: withRequired.required } : {}),
  }
}

export async function buildContentTableIdLookup(db: DbClient): Promise<Map<string, string>> {
  const tables = await listDataTables(db)
  return new Map(tables.map((t) => [t.slug, t.id]))
}

export function pluginContentFieldsToDataFields(
  fields: ContentTableSchemaShape['fields'],
  tableIdBySlug: Map<string, string>,
): DataField[] {
  const out: DataField[] = []

  for (const field of fields) {
    switch (field.type) {
      case 'text':
      case 'longText':
      case 'number':
      case 'boolean':
      case 'date':
      case 'dateTime':
      case 'url':
      case 'email':
      case 'media':
      case 'pageTree':
        out.push({ ...pluginFieldCommon(field), type: field.type })
        break
      case 'richText':
        out.push({ ...pluginFieldCommon(field), type: field.type, format: 'markdown' })
        break
      case 'select':
      case 'multiSelect':
        out.push({
          ...pluginFieldCommon(field),
          type: field.type,
          options: field.options.map((option) => ({
            id: option.value,
            value: option.value,
            label: option.label,
          })),
        })
        break
      case 'relation': {
        const targetTableId = tableIdBySlug.get(field.targetTableSlug)
        if (!targetTableId) {
          throw new Error(`Relation field "${field.id}" targets unknown table "${field.targetTableSlug}"`)
        }
        out.push({
          ...pluginFieldCommon(field),
          type: field.type,
          targetTableId,
        })
        break
      }
    }
  }

  return out
}
