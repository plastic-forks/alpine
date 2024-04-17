import { onElAttrRemoved } from './mutation'
import { evaluate, evaluateLater } from './evaluator'
import { elementBoundEffect } from './reactivity'
import Alpine from './alpine'

let prefixAsString = 'x-'

export function prefix(subject = '') {
    return prefixAsString + subject
}

export function setPrefix(newPrefix) {
    prefixAsString = newPrefix
}

let directiveHandlers = {}

export function directive(name, callback) {
    directiveHandlers[name] = callback

    return {
        before(directive) {
            if (!directiveHandlers[directive]) {
                console.warn(
                    String.raw`Cannot find directive \`${directive}\`. \`${name}\` will use the default order of execution`
                )
                return
            }

            let index = directiveOrder.indexOf(directive)
            index = index >= 0 ? index : directiveOrder.indexOf('DEFAULT')
            insertElementToArray(directiveOrder, index, name)
        },
    }
}

function insertElementToArray(array, index, element) {
    array.splice(index, 0, element)
}

export function directives(el, attributes, originalAttributeOverride) {
    attributes = Array.from(attributes)

    if (el._x_virtualDirectives) {
        let vAttributes = Object.entries(el._x_virtualDirectives).map(([name, value]) => ({
            name,
            value,
        }))

        let staticAttributes = attributesOnly(vAttributes)

        // Handle binding normal HTML attributes (non-Alpine directives).
        vAttributes = vAttributes.map((attribute) => {
            if (staticAttributes.find((attr) => attr.name === attribute.name)) {
                return {
                    name: `x-bind:${attribute.name}`,
                    value: `"${attribute.value}"`,
                }
            }

            return attribute
        })

        attributes = attributes.concat(vAttributes)
    }

    let directives = attributes
        .filter(isAlpineAttribute)
        .map(createDirectiveAttributeParser(originalAttributeOverride))
        .sort(byPriority)

    return directives.map((directive) => {
        return getDirectiveHandler(el, directive)
    })
}

export function attributesOnly(attributes) {
    return Array.from(attributes).filter((attr) => !isAlpineAttribute(attr))
}

let isDeferringHandlers = false
let directiveHandlerStacks = new Map()
let currentHandlerStackKey = Symbol()

export function deferHandlingDirectives(callback) {
    isDeferringHandlers = true

    let key = Symbol()

    currentHandlerStackKey = key

    directiveHandlerStacks.set(key, [])

    let flushHandlers = () => {
        while (directiveHandlerStacks.get(key).length) directiveHandlerStacks.get(key).shift()()

        directiveHandlerStacks.delete(key)
    }

    let stopDeferring = () => {
        isDeferringHandlers = false
        flushHandlers()
    }

    callback(flushHandlers)

    stopDeferring()
}

export function getElementBoundUtilities(el) {
    let cleanups = []

    let cleanup = (callback) => cleanups.push(callback)

    let [effect, cleanupEffect] = elementBoundEffect(el)

    cleanups.push(cleanupEffect)

    let utilities = {
        Alpine,
        effect,
        cleanup,
        evaluateLater: evaluateLater.bind(evaluateLater, el),
        evaluate: evaluate.bind(evaluate, el),
    }

    let doCleanup = () => cleanups.forEach((i) => i())

    return [utilities, doCleanup]
}

export function getDirectiveHandler(el, directive) {
    let noop = () => {}

    let handler = directiveHandlers[directive.type] || noop

    let [utilities, cleanup] = getElementBoundUtilities(el)

    onElAttrRemoved(el, directive.original, cleanup)

    let fullHandler = () => {
        if (el._x_ignore || el._x_ignoreSelf) return

        handler.inline && handler.inline(el, directive, utilities)

        handler = handler.bind(handler, el, directive, utilities)

        isDeferringHandlers
            ? directiveHandlerStacks.get(currentHandlerStackKey).push(handler)
            : handler()
    }

    fullHandler.runCleanups = cleanup

    return fullHandler
}

function isAlpineAttribute({ name }) {
    return alpineAttributeRegex().test(name)
}

let alpineAttributeRegex = () => new RegExp(`^${prefixAsString}([^:^.]+)\\b`)

function createDirectiveAttributeParser(originalAttributeOverride) {
    return ({ name, value }) => {
        let typeMatch = name.match(alpineAttributeRegex())
        let valueMatch = name.match(/:([a-zA-Z0-9\-_:]+)/)
        let modifiers = name.match(/\.[^.\]]+(?=[^\]]*$)/g) || []
        let original = originalAttributeOverride || name

        return {
            type: typeMatch ? typeMatch[1] : null,
            value: valueMatch ? valueMatch[1] : null,
            modifiers: modifiers.map((i) => i.replace('.', '')),
            expression: value,
            original,
        }
    }
}

const DEFAULT = 'DEFAULT'

let directiveOrder = [
    'ignore',
    'ref',
    'data',
    'id',
    'anchor',
    'bind',
    'init',
    'for',
    'model',
    'modelable',
    'transition',
    'show',
    'if',
    DEFAULT,
    'teleport',
]

function byPriority(a, b) {
    let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type
    let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type

    return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB)
}
