import { effect, release, overrideEffect } from './reactivity'
import { initTree, isRoot } from './lifecycle'
import { walk } from './utils/walk'

export let isCloning = false

export function skipDuringClone(callback, fallback = () => {}) {
    return (...args) => (isCloning ? fallback(...args) : callback(...args))
}

export function onlyDuringClone(callback) {
    return (...args) => isCloning && callback(...args)
}

let interceptors = []

export function interceptClone(callback) {
    interceptors.push(callback)
}

export function clone(from, to) {
    interceptors.forEach((i) => i(from, to))

    isCloning = true

    dontRegisterReactiveSideEffects(() => {
        initShallowTree(to)
    })

    isCloning = false
}

export function cloneNode(from, to) {
    interceptors.forEach((i) => i(from, to))

    isCloning = true

    // We don't need reactive effects in the new tree.
    // Cloning is just used to seed new server HTML with
    // Alpine before "morphing" it onto live Alpine...
    dontRegisterReactiveSideEffects(() => {
        initTree(to, (el, callback) => {
            // We're hijacking the "walker" so that we
            // only initialize the element we're cloning...
            callback(el, () => {})
        })
    })

    isCloning = false
}

function initShallowTree(el) {
    let hasRunThroughFirstEl = false

    let shallowWalker = (el, callback) => {
        walk(el, (el, skip) => {
            if (hasRunThroughFirstEl && isRoot(el)) return skip()

            hasRunThroughFirstEl = true

            callback(el, skip)
        })
    }

    initTree(el, shallowWalker)
}

function dontRegisterReactiveSideEffects(callback) {
    let cache = effect

    overrideEffect((callback, el) => {
        let storedEffect = cache(callback)

        release(storedEffect)

        return () => {}
    })

    callback()

    overrideEffect(cache)
}
