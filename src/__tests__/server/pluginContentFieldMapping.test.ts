import { describe, expect, it } from 'bun:test'
import { Value } from '@sinclair/typebox/value'
import { DataFieldSchema } from '@core/data/schemas'
import { pluginContentFieldsToDataFields } from '../../../server/plugins/host/contentFieldMapping'

describe('pluginContentFieldsToDataFields', () => {
  it('maps plugin field projections to canonical host DataField shapes', () => {
    const fields = pluginContentFieldsToDataFields([
      { type: 'richText', id: 'body', label: 'Body', required: true },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [{ value: 'draft', label: 'Draft' }],
      },
      {
        type: 'relation',
        id: 'author',
        label: 'Author',
        targetTableSlug: 'authors',
      },
    ], new Map([['authors', 'table-authors']]))

    expect(fields).toHaveLength(3)
    expect(fields.every((field) => Value.Check(DataFieldSchema, field))).toBe(true)
    expect(fields[0]).toEqual({
      type: 'richText',
      id: 'body',
      label: 'Body',
      required: true,
      format: 'markdown',
    })
    expect(fields[1]).toEqual({
      type: 'select',
      id: 'status',
      label: 'Status',
      options: [{ id: 'draft', value: 'draft', label: 'Draft' }],
    })
    expect(fields[2]).toEqual({
      type: 'relation',
      id: 'author',
      label: 'Author',
      targetTableId: 'table-authors',
    })
  })

  it('rejects relation fields targeting unknown table slugs', () => {
    expect(() =>
      pluginContentFieldsToDataFields([
        { type: 'relation', id: 'author', label: 'Author', targetTableSlug: 'authors' },
      ], new Map()),
    ).toThrow(/unknown table "authors"/)
  })
})
