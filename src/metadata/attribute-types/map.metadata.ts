import { AttributeDefinition } from '../../decorator/attribute-types'
import { AttributeMetadata } from '../attribute'

export interface MapAttributeMetadata<Value> extends AttributeMetadata<Value> {
  /**
   * The expected attributes in your map
   */
  attributes: { [propertyName: string]: AttributeDefinition }

  /**
   * Optionally, allow any attribute on the map
   */
  allowAny?: boolean
}
