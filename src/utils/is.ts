import { DynamoDB } from 'aws-sdk'
import { isArray } from 'lodash'
import { Table } from '../table'

export function isDyngooseTableInstance(obj: any): obj is Table {
  return obj instanceof Table || isDyngooseTableClass(obj.constructor)
}

export function isDyngooseTableClass(obj: any): obj is typeof Table {
  const comp: boolean = obj.prototype instanceof Table || (obj?.schema?.isDyngoose)
  return comp
}

/**
 * Determines if a given object is a DynamoDB.AttributeValue
 */
export function isDynamoAttributeValue(obj: DynamoDB.AttributeValue | any): obj is DynamoDB.AttributeValue {
  if (typeof obj === 'object') {
    return (
      // detect string type
      typeof obj.S === 'string' ||
      // detect number type
      typeof obj.N === 'string' ||
      // detect boolean type
      typeof obj.BOOL === 'boolean' ||
      // detect list and sets
      isArray(obj.SS) || isArray(obj.NS) || isArray(obj.BS) || isArray(obj.L) ||
      // detect binary type
      typeof obj.B !== 'undefined' ||
      // detect map type
      typeof obj.M !== 'undefined' ||
      // detect null type
      typeof obj.NULL === 'boolean'
    )
  } else {
    return false
  }
}

/**
 * Determines if a given object is a DynamoDB.Key or DynamoDB.AttributeMap
 */
export function isDynamoAttributeMap(obj: DynamoDB.AttributeMap | any): obj is DynamoDB.AttributeMap {
  if (typeof obj === 'object') {
    const keys = Object.keys(obj)

    if (keys.length > 0) {
      const first = obj[keys[0]]
      if (typeof first === 'object') {
        return isDynamoAttributeValue(first)
      }
    }
  }

  return false
}
