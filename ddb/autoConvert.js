//@flow

// Functions to build DynamoDB queries.

import type {
    DynamoDbItem, DynamoDbAttribute, UpdateExpressionParams
} from './types'

// Convert a plain JavaScript object to a DynamoDbItem.
export const item
    : (obj:Object) => DynamoDbItem
    = obj =>
        mapValues(obj, attr)

// Convert a JavaScript value into a DynamoDbAttribute.
// TODO: Maps and Sets require special attention.
export const attr
    : (value:mixed) => DynamoDbAttribute
    = value => {
        if (typeof value === 'string') return { S: value }
        if (typeof value === 'number') return { N: String(value) }
        if (typeof value === 'boolean') return { BOOL: value }
        if (value == null) return { NULL: true }
        if (Array.isArray(value)) return { L: value.map(attr) }
        if (toString.call(value) === '[object Object]')
          return { M: mapValues(((value:any):Object), attr) }
        return { B: String(value) }
    }

type AttrHints = { [name:string]: 'SS' | 'NS' }

// Convert a plain JavaScript object to a DynamoDbItem.
// Provide mapping of special DynamoDB types (hints). Any array properties not
// mapped as hints will be conerted to DynamoDB lists (L type).  Mappings
// should look like:
//     `{ myStringSet: 'SS', myNumberSet: 'Ns' }`.
export const itemWithHints
    : (hints:AttrHints) => (obj:Object) => DynamoDbItem
    = hints => obj =>
        mapKeyValuePairs(
            obj,
            (key, value) => {
                if (!(key in hints))
                    return attr(value)
                else if (hints[key] == 'SS')
                    return { SS: value }
                else if (hints[key] == 'NS')
                    return { NS: value.map(String) }
            }
        )

// Convert a DynamoDBItem back into a normal JavaScript object.
export const fromItem
    : (item:DynamoDbItem) => Object
    = item =>
        mapValues(item, fromAttr)

// Convert a DynamoDBAttribute back into a JavaScript value.
// If the developer wants a true Map, they should transform the output of this
// function.
export const fromAttr
    : (attr:DynamoDbAttribute) => mixed
    = attr => {
        if (typeof attr.S !== 'undefined') return attr.S
        if (typeof attr.N !== 'undefined') return Number(attr.N)
        if (typeof attr.BOOL !== 'undefined') return Boolean(attr.BOOL)
        if (typeof attr.NULL !== 'undefined') return null
        if (typeof attr.L !== 'undefined') return attr.L.map(fromAttr)
        if (typeof attr.M !== 'undefined') return mapValues(attr.M, fromAttr)
        if (typeof attr.B !== 'undefined') return attr.B
        if (typeof attr.SS !== 'undefined') return attr.SS
        if (typeof attr.NS !== 'undefined') return attr.NS.map(Number)
        throw new Error(`Unknown DynamoDB attribute: ${ JSON.stringify(attr) }`)
    }

// Generates the UpdateExpression, ExpressionAttributeValues, and
// ExpressionAttributeNames params for a ddb updateItem operation.
// Does not (yet) merge lists or maps, not recursive! TODO
export const patch
    : Object => UpdateExpressionParams
    = obj => {
        const { sets, removes, names, values } = Object.keys(obj).reduce(
            ({ sets, removes, names, values }, key) => {
                const name = `#${key}`
                const value = `:${key}`
                if (obj[key] == null) {
                    removes.push(name)
                    names[name] = key
                }
                else {
                    sets.push(`${name} = ${value}`)
                    names[name] = key
                    values[value] = attr(obj[key])
                }
                return { sets, removes, names, values }
            },
            { sets: [], removes: [], names: {}, values: {} }
        )
        const setClause = sets.length ? `SET ${sets.join(',')}` : ''
        const removeClause = removes.length ? `REMOVE ${removes.join(',')}` : ''

        // If there are no set operations, don't return ExpressionAttributeValues
        // or AWS will throw.
        return sets.length
            ? {
                UpdateExpression: `${setClause} ${removeClause}`,
                ExpressionAttributeNames: names,
                ExpressionAttributeValues: values
            }
            : {
                UpdateExpression: `${setClause} ${removeClause}`,
                ExpressionAttributeNames: names
            }
    }

const toString = Object.prototype.toString

const mapValues
    = (o1, f) =>
        Object.keys(o1).reduce(
            (o2, key) => addProp(o2, key, f(o1[key])),
            {}
        )

const mapKeyValuePairs
    = (o1, f) =>
        Object.keys(o1).reduce(
            (o2, key) => addProp(o2, key, f(key, o1[key])),
            {}
        )

const addProp
    = (obj, key, value) =>
        (obj[key] = value, obj)
