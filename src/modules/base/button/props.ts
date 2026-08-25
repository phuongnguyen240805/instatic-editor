import { Type, type Static } from '@core/utils/typeboxHelpers'
import { AnchorTargetSchema } from '@modules/base/shared/anchorTarget'
import { HtmlAttributesPropSchemaOptions } from '@modules/base/shared/htmlAttributes'

export const ButtonPropsSchema = Type.Object({
  label: Type.String({ default: 'Get Started' }),
  href: Type.String({ default: '' }),
  target: AnchorTargetSchema,
  disabled: Type.Boolean({ default: false }),
  htmlAttributes: Type.Record(Type.String(), Type.String(), HtmlAttributesPropSchemaOptions),
})

export type ButtonStoredProps = Static<typeof ButtonPropsSchema>
