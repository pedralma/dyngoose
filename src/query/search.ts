import { DynamoDB } from 'aws-sdk'
import { get, has, includes, isArray } from 'lodash'
import { Attribute } from '../attribute'
import { HelpfulError, QueryError } from '../errors'
import { Metadata } from '../index'
import { ITable, Table } from '../table'
import { Condition } from './condition'
import { buildQueryExpression, keyConditionAllowedOperators } from './expression'
import { AttributeNames, ComplexFilters, Filter, Filters } from './filters'
import { GlobalSecondaryIndex } from './global-secondary-index'
import { LocalSecondaryIndex } from './local-secondary-index'
import { QueryOutput } from './output'
import { PrimaryKey } from './primary-key'
import { buildProjectionExpression } from './projection-expression'

type Index<T extends Table> = PrimaryKey<T, any, any> | GlobalSecondaryIndex<T> | LocalSecondaryIndex<T> | string

export interface MagicSearchInput<T extends Table> {
  limit?: number
  exclusiveStartKey?: DynamoDB.Key
  attributes?: string[]
  projectionExpression?: DynamoDB.ProjectionExpression
  rangeOrder?: 'ASC' | 'DESC'
  consistent?: DynamoDB.ConsistentRead
  returnOnlyCount?: boolean

  /**
   * Perform your query on the specified index, which can be a GSI object or a string
   */
  index?: Index<T>
}

export type SearchGroupFunction<T extends Table> = (condition: MagicSearch<T>) => any

/**
 * Use this via Table.search()
 */
export class MagicSearch<T extends Table> {
  private filters: ComplexFilters<T> = []

  constructor(private readonly tableClass: ITable<T>, filters?: Filters<T>, private input: MagicSearchInput<T> = {}) {
    if (filters != null) {
      this.addFilterGroup([filters])
    }
  }

  addFilterGroup(filters: Array<Filters<T>>): this {
    this.filters = this.filters.concat(filters)
    return this
  }

  parenthesis(value: SearchGroupFunction<T>): this {
    return this.group(value)
  }

  group(value: SearchGroupFunction<T>): this {
    const groupedSearch = new MagicSearch<T>(this.tableClass)
    value(groupedSearch)
    this.filters.push(groupedSearch.filters)
    return this
  }

  filter<
    K1 extends AttributeNames<T>
  >(a1: K1): Condition<T, Attr, NonNullable<T[K1]>>;
  filter<
    K1 extends NonNullable<AttributeNames<T>>,
    K2 extends keyof NonNullable<T[K1]>
  >(a1: K1, a2: K2): Condition<T, Attr, NonNullable<NonNullable<T[K1]>[K2]>>;
  filter<
    K1 extends AttributeNames<T>,
    K2 extends keyof NonNullable<T[K1]>,
    K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>
  >(a1: K1, a2: K2, a3: K3): Condition<T, Attr, NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>>;
  filter<
    K1 extends AttributeNames<T>,
    K2 extends keyof NonNullable<T[K1]>,
    K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>,
    K4 extends keyof NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>
  >(a1: K1, a2: K2, a3: K3, a4: K4): Condition<T, Attr, NonNullable<NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>[K4]>>;
  filter<Attr extends AttributeNames<T>>(...attributePropertyPath: any): Condition<T, Attr, T[Attr]> {
    return new Condition<T, Attr, T[Attr]>(this, attributePropertyPath.join('.'))
  }

  where<
    K1 extends AttributeNames<T>
  >(a1: K1): Condition<T, Attr, NonNullable<T[K1]>>;
  where<
    K1 extends NonNullable<AttributeNames<T>>,
    K2 extends keyof NonNullable<T[K1]>
  >(a1: K1, a2: K2): Condition<T, Attr, NonNullable<NonNullable<T[K1]>[K2]>>;
  where<
    K1 extends AttributeNames<T>,
    K2 extends keyof NonNullable<T[K1]>,
    K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>
  >(a1: K1, a2: K2, a3: K3): Condition<T, Attr, NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>>;
  where<
    K1 extends AttributeNames<T>,
    K2 extends keyof NonNullable<T[K1]>,
    K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>,
    K4 extends keyof NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>
  >(a1: K1, a2: K2, a3: K3, a4: K4): Condition<T, Attr, NonNullable<NonNullable<NonNullable<NonNullable<T[K1]>[K2]>[K3]>[K4]>>;
  where<Attr extends AttributeNames<T>>(...attributePropertyPath: any): Condition<T, Attr, T[Attr]> {
    return new Condition<T, Attr, T[Attr]>(this, attributePropertyPath.join('.'))
  }

  or(): this {
    this.filters.push('OR')
    return this
  }

  and(): this {
    return this
  }

  /**
   * This function will limit the number of documents that DynamoDB will process in this query request.
   *
   * Unlike most SQL databases this does not guarantee the response will contain 5 documents.
   * Instead DynamoDB will only query a maximum of 5 documents to see if they match and should be returned.
   * The limit parameter passed in should be a number representing how many documents you wish DynamoDB to process.
   */
  limit(limit: number): this {
    this.input.limit = limit
    return this
  }

  /**
   * When there are more documents available to your query than DynamoDB can return,
   * Dyngoose will let you know by specifying Results.lastEvaluatedKey.
   *
   * You can pass that object into this method to get additional results from your table.
   */
  startAt(exclusiveStartKey?: DynamoDB.Key): this {
    this.input.exclusiveStartKey = exclusiveStartKey
    return this
  }

  /**
   * This function will limit which attributes DynamoDB returns for each item in the table
   * by building a ProjectionExpression for you.
   *
   * This can limit the size of the DynamoDB response and helps you only retrieve the data you need.
   * Simply provide an array of strings representing the property names you wish DynamoDB to return.
   */
  properties<Attr extends AttributeNames<T>>(...propertyNames: Attr[]): this {
    const attributeNames: string[] = []

    for (const propertyName of propertyNames) {
      const attr = this.tableClass.schema.getAttributeByPropertyName(propertyName as string)
      attributeNames.push(attr.name)
    }

    if (this.input.attributes == null) {
      this.input.attributes = []
    }

    this.input.attributes = this.input.attributes.concat(attributeNames)
    return this
  }

  /**
   * This is similar to `.properties()` except it accepts a list of attribute names
   * instead of property names.
  */
  attributes(...attributeNames: string[]): this {
    if (this.input.attributes == null) {
      this.input.attributes = []
    }

    this.input.attributes = this.input.attributes.concat(attributeNames)
    return this
  }

  /**
   * Instead of returning the records, this function will cause the query operation to return only the count of possible results.
   */
  count(): this {
    this.input.returnOnlyCount = true
    return this
  }

  /**
   * This will cause the query to run in a consistent manner as opposed to the default eventually consistent manner.
   */
  consistent(consistent: DynamoDB.ConsistentRead = true): this {
    this.input.consistent = consistent
    return this
  }

  /**
   * This causes the query to be run on a specific index as opposed to the default table wide query.
   * The index parameter you pass in should represent the name of the index you wish to query on.
   */
  using(index: Index<T> | null): this {
    if (index === null) {
      this.input.index = undefined
    } else {
      this.input.index = index
    }

    return this
  }

  /**
   * This function sorts the documents you receive back by the rangeKey. By default, if not provided, it will sort in ascending order.
   *
   * The order parameter must be a string either equal to ascending or descending.
  */
  sort(direction: 'ascending' | 'descending'): this {
    if (direction === 'ascending') {
      this.input.rangeOrder = 'ASC'
    } else if (direction === 'descending') {
      this.input.rangeOrder = 'DESC'
    }

    return this
  }

  ascending(): this {
    return this.sort('ascending')
  }

  descending(): this {
    return this.sort('descending')
  }

  /**
   * This will execute the query you constructed and return one page of results.
   *
   * A promise will be returned that will resolve to the results array upon completion.
   */
  async exec(): Promise<QueryOutput<T>> {
    const input = this.getInput()
    return await this.page(input)
  }

  /**
   * This will execute the query you constructed and page, if necessary, until the
   * minimum number of requested documents is loaded.
   *
   * This can be useful if you are doing advanced queries without good indexing,
   * which should be avoided but can happen for infrequent operations such as analytics.
   *
   * Unlike `.all()` which pages until all results are loaded, `.minimum(min)` will
   * page only until the specified number of records is loaded and then halts.
   *
   * It is recommended you apply a `.limit(minOrMore)` before calling `.minimum` to ensure
   * you do not load too many results as well.
  */
  async minimum(minimum: number): Promise<QueryOutput<T>> {
    const input = this.getInput()
    const outputs: Array<QueryOutput<T>> = []
    let page: QueryOutput<T> | undefined
    let count = 0

    while (page == null || page.lastEvaluatedKey != null) {
      if (page?.lastEvaluatedKey != null) {
        input.ExclusiveStartKey = page.lastEvaluatedKey
      }

      page = await this.page(input)
      count += page.count
      outputs.push(page)

      // if we've loaded enough, stop loading more…
      if (count >= minimum || page.lastEvaluatedKey == null) {
        break
      }
    }

    return QueryOutput.fromSeveralOutputs(this.tableClass, outputs)
  }

  /**
   * Page internally and return all possible search results.
   *
   * Be cautious. This can easily cause timeouts if you're using Lambda functions.
   * This is also non-ideal for scans, for better performance use a segmented scan
   * via the Query.PrimaryKey.segmentedScan or Query.GlobalSecondaryIndex.segmentedScan.
   */
  async all(): Promise<QueryOutput<T>> {
    const input = this.getInput()
    const outputs: Array<QueryOutput<T>> = []
    let page: QueryOutput<T> | undefined

    // if this is the first page, or if we have not hit the last page, continue loading records…
    while (page == null || page.lastEvaluatedKey != null) {
      if (page?.lastEvaluatedKey != null) {
        input.ExclusiveStartKey = page.lastEvaluatedKey
      }

      page = await this.page(input)
      outputs.push(page)
    }

    return QueryOutput.fromSeveralOutputs(this.tableClass, outputs)
  }

  getInput(): DynamoDB.ScanInput | DynamoDB.QueryInput {
    let indexMetadata: Metadata.Index.GlobalSecondaryIndex | Metadata.Index.PrimaryKey | undefined

    if (this.input.index != null && typeof this.input.index === 'string') {
      const indexName = this.input.index

      // if we were given an index, find the metadata object for it
      for (const index of this.tableClass.schema.globalSecondaryIndexes) {
        if (index.name === indexName) {
          indexMetadata = index
        }
      }

      if (indexMetadata == null) {
        for (const index of this.tableClass.schema.localSecondaryIndexes) {
          if (index.name === indexName) {
            indexMetadata = Object.assign({
              hash: this.tableClass.schema.primaryKey.hash,
            }, index) as Metadata.Index.GlobalSecondaryIndex
          }
        }
      }

      if (indexMetadata == null) {
        throw new QueryError(`Attempted to perform ${this.tableClass.schema.name}.search using non-existent index ${indexName}`)
      }
    } else if (this.input.index != null) {
      if ((typeof this.input.index.metadata as any).hash === 'undefined') {
        const metadata: Metadata.Index.GlobalSecondaryIndex = Object.assign({
          hash: this.tableClass.schema.primaryKey.hash,
        }, this.input.index.metadata as Metadata.Index.LocalSecondaryIndex)

        indexMetadata = metadata
      } else {
        indexMetadata = this.input.index.metadata as Metadata.Index.GlobalSecondaryIndex | Metadata.Index.PrimaryKey
      }
    } else {
      // if no index was specified, look to see if there is an available index given the query
      indexMetadata = this.findAvailableIndex()
    }

    const query = buildQueryExpression(this.tableClass.schema, this.filters, indexMetadata)

    const input: DynamoDB.ScanInput | DynamoDB.QueryInput = {
      TableName: this.tableClass.schema.name,
      ConsistentRead: false,
      ExpressionAttributeNames: query.ExpressionAttributeNames,
      ExpressionAttributeValues: query.ExpressionAttributeValues,
      FilterExpression: query.FilterExpression,
    }

    if (this.input.projectionExpression != null) {
      input.ProjectionExpression = this.input.projectionExpression
    } else if (this.input.attributes != null) {
      const expression = buildProjectionExpression(this.tableClass, this.input.attributes, input.ExpressionAttributeNames)
      input.Select = 'SPECIFIC_ATTRIBUTES'
      input.ProjectionExpression = expression.ProjectionExpression
      input.ExpressionAttributeNames = expression.ExpressionAttributeNames
    }

    if (this.input.rangeOrder === 'DESC') {
      (input as DynamoDB.QueryInput).ScanIndexForward = false
    }

    if (this.input.limit != null) {
      input.Limit = this.input.limit
    }

    if (this.input.exclusiveStartKey != null) {
      input.ExclusiveStartKey = this.input.exclusiveStartKey
    }

    if (this.input.consistent != null) {
      input.ConsistentRead = this.input.consistent
    }

    if (indexMetadata != null && typeof (indexMetadata as any).name === 'string') {
      input.IndexName = (indexMetadata as Metadata.Index.GlobalSecondaryIndex | Metadata.Index.LocalSecondaryIndex).name
    }

    if (this.input.returnOnlyCount === true) {
      input.Select = 'COUNT'

      // count does not allow ProjectionExpression to be specified
      if (input.ProjectionExpression != null) {
        delete input.ProjectionExpression
      }
    }

    if (query.KeyConditionExpression != null) {
      (input as DynamoDB.QueryInput).KeyConditionExpression = query.KeyConditionExpression
    }

    return input
  }

  /**
   * @deprecated Use MagicSearch.prototype.exec()
   */
  async search(): Promise<QueryOutput<T>> {
    return await this.exec()
  }

  async page(input: DynamoDB.ScanInput | DynamoDB.QueryInput): Promise<QueryOutput<T>> {
    const hasProjection = input.ProjectionExpression == null
    let output: DynamoDB.ScanOutput | DynamoDB.QueryOutput

    // if we are filtering based on key conditions, run a query instead of a scan
    if ((input as DynamoDB.QueryInput).KeyConditionExpression != null) {
      try {
        output = await this.tableClass.schema.dynamo.query(input).promise()
      } catch (ex) {
        throw new HelpfulError(ex, this.tableClass, input)
      }
    } else {
      if ((input as DynamoDB.QueryInput).ScanIndexForward === false) {
        throw new Error('Cannot use specify a sort direction, range order, or use ScanIndexForward on a scan operation. Try specifying the index being used.')
      } else {
        delete (input as DynamoDB.QueryInput).ScanIndexForward
      }

      try {
        output = await this.tableClass.schema.dynamo.scan(input).promise()
      } catch (ex) {
        throw new HelpfulError(ex, this.tableClass, input)
      }
    }

    return QueryOutput.fromDynamoOutput(this.tableClass, output, !hasProjection)
  }

  private findAvailableIndex(): Metadata.Index.GlobalSecondaryIndex | Metadata.Index.PrimaryKey | undefined {
    // look at the primary key first
    const primaryKey = this.tableClass.schema.primaryKey
    if (this.checkFilters(primaryKey.hash, primaryKey.range)) {
      return primaryKey
    }

    // look through GlobalSecondaryIndexes
    for (const index of this.tableClass.schema.globalSecondaryIndexes) {
      // skip if it doesn't have a full projection
      if (index.projection === 'INCLUDE' || index.projection === 'KEYS_ONLY') {
        continue
      }

      // determine if we can use this index
      if (this.checkFilters(index.hash, index.range)) {
        return index
      }
    }

    // look through LocalSecondaryIndexes
    for (const index of this.tableClass.schema.localSecondaryIndexes) {
      // skip if it doesn't have a full projection
      if (index.projection === 'INCLUDE' || index.projection === 'KEYS_ONLY') {
        continue
      }

      // determine if we can use this index
      if (this.checkFilters(primaryKey.hash, index.range)) {
        const metadata: Metadata.Index.GlobalSecondaryIndex = Object.assign({
          hash: primaryKey.hash,
        }, index)
        return metadata
      }
    }
  }

  private checkFilters(hash: Attribute<any>, range?: Attribute<any>): boolean {
    // cannot filter by a key without a value for the hash key
    for (const filters of this.filters) {
      if (!has(filters, hash.name)) {
        continue
      }

      const hashFilter: Filter<any> = get(filters, hash.name)

      // if there is an operator, ensure it is allowed as a key expression
      if (isArray(hashFilter)) {
        const operator = hashFilter[0]

        if (!includes(keyConditionAllowedOperators, operator)) {
          continue
        }
      }

      // if it has no range, then we're all done
      if (range == null) {
        return true
      }

      // check for the range now
      if (!has(filters, range.name)) {
        continue
      }

      const rangeFilter: Filter<any> = get(filters, range.name)

      // if there is an operator, ensure it is allowed as a key expression
      if (isArray(rangeFilter)) {
        const operator = rangeFilter[0]

        if (!includes(keyConditionAllowedOperators, operator)) {
          continue
        }
      }

      return true
    }

    return false
  }
}
