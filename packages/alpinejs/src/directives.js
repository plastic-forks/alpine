import { onElAttrRemoved } from './mutation'
import { evaluate, evaluateLater } from './evaluator'
import { elementBoundEffect } from './reactivity'
import Alpine from './alpine'

/* directives - prefix */

let prefixAsString = 'x-'

export function prefix(subject = '') {
    return prefixAsString + subject
}

export function setPrefix(newPrefix) {
    prefixAsString = newPrefix
}

/* directives - order */

const DEFAULT = 'DEFAULT'
const directiveOrder = [
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

function compareDirective(a, b) {
    let typeA = directiveOrder.indexOf(a.type) === -1 ? DEFAULT : a.type
    let typeB = directiveOrder.indexOf(b.type) === -1 ? DEFAULT : b.type
    return directiveOrder.indexOf(typeA) - directiveOrder.indexOf(typeB)
}

/* directives declaration */

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
            index = index >= 0 ? index : directiveOrder.indexOf(DEFAULT)
            insertElementToArray(directiveOrder, index, name)
        },
    }
}

function insertElementToArray(array, index, element) {
    array.splice(index, 0, element)
}

/* directives handling */

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
        .filter(isAlpineAttr)
        .map(createDirectiveAttributeParser(originalAttributeOverride))
        .sort(compareDirective)

    return directives.map((directive) => {
        return getDirectiveHandler(el, directive)
    })
}

export function attributesOnly(attributes) {
    return Array.from(attributes).filter((attr) => !isAlpineAttr(attr))
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
        queueDirectiveHandler(handler)
    }

    fullHandler.runCleanups = cleanup

    return fullHandler
}

function isAlpineAttr({ name }) {
    return alpineAttrRegex().test(name)
}

function alpineAttrRegex() {
    return new RegExp(`^${prefixAsString}([^:^.]+)\\b`)
}

function createDirectiveAttributeParser(originalAttributeOverride) {
    return ({ name, value }) => {
        let typeMatch = name.match(alpineAttrRegex())
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

const directiveHandlerQueues = new Map()
let isHandlingDirectives = true
let currentDirectiveHandlerQueueKey = Symbol()

export function deferHandlingDirectives(callback) {
    const key = Symbol()

    isHandlingDirectives = false
    currentDirectiveHandlerQueueKey = key

    directiveHandlerQueues.set(key, [])

    let flushHandlers = () => {
        while (directiveHandlerQueues.get(key).length) {
            const handler = directiveHandlerQueues.get(key).shift()
            handler()
        }

        directiveHandlerQueues.delete(key)
    }

    let stopDeferring = () => {
        isHandlingDirectives = true
        flushHandlers()
    }

    callback()

    stopDeferring()
}

export function queueDirectiveHandler(handler) {
    if (isHandlingDirectives) {
        handler()
    } else {
        directiveHandlerQueues.get(currentDirectiveHandlerQueueKey).push(handler)
    }
}
