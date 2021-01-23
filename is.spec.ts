import { expect } from 'chai'
import { isDynamoAttributeMap, isDynamoAttributeValue } from './is'

describe('utils/is', () => {
  describe('isDynamoAttributeMap', () => {
    it('determines if given object is a DynamoDB.AttributeMap', () => {
      expect(isDynamoAttributeMap(null)).to.eq(false)
      expect(isDynamoAttributeMap(undefined)).to.eq(false)
      expect(isDynamoAttributeMap({})).to.eq(false)
      expect(isDynamoAttributeMap('')).to.eq(false)
      expect(isDynamoAttributeMap({ a: true })).to.eq(false)
      expect(isDynamoAttributeMap({ a: { S: 'test' } })).to.eq(true)
      expect(isDynamoAttributeMap({ a: { N: '1234' } })).to.eq(true)
    })
  })

  describe('isDynamoAttributeValue', () => {
    it('determines if given object is a DynamoDB.AttributeMap', () => {
      expect(isDynamoAttributeValue(null)).to.eq(false)
      expect(isDynamoAttributeValue(undefined)).to.eq(false)
      expect(isDynamoAttributeValue({})).to.eq(false)
      expect(isDynamoAttributeValue('')).to.eq(false)
      expect(isDynamoAttributeValue({ a: true })).to.eq(false)
      expect(isDynamoAttributeValue({ S: 'test' })).to.eq(true)
      expect(isDynamoAttributeValue({ N: '1234' })).to.eq(true)
      expect(isDynamoAttributeValue({ NULL: true })).to.eq(true)
      expect(isDynamoAttributeValue({ NULL: false })).to.eq(true)
      expect(isDynamoAttributeValue({ BOOL: true })).to.eq(true)
      expect(isDynamoAttributeValue({ BOOL: false })).to.eq(true)
    })
  })
})
