import {
    startObservingMutations,
    onEveryElAdded,
    onEveryElRemoved,
    onEveryElAttrsAdded,
    cleanupElAttrs,
    cleanupEl,
} from './mutation'
import { deferHandlingDirectives, directives } from './directives'
import { dispatch } from './utils/dispatch'
import { walk } from './utils/walk'
import { warn } from './utils/warn'

let started = false

export function start() {
    if (started)
        warn(
            [
                'Alpine has already been initialized on this page.',
                'Calling Alpine.start() more than once can cause problems.',
            ].join(' ')
        )

    started = true

    if (!document.body)
        warn(
            [
                'Unable to initialize.',
                'Trying to load Alpine before `<body>` is available.',
                "Did you forget to add `defer` in Alpine's `<script>` tag?",
            ].join(' ')
        )

    dispatch(document, 'alpine:init')
    dispatch(document, 'alpine:initializing')

    startObservingMutations()

    onEveryElAdded((el) => initTree(el, walk))
    onEveryElRemoved((el) => destroyTree(el))

    onEveryElAttrsAdded((el, attrs) => {
        directives(el, attrs).forEach((handle) => handle())
    })

    allTopLevelComponents().forEach((el) => initTree(el))

    dispatch(document, 'alpine:initialized')
}

function allTopLevelComponents() {
    const selectors = allSelectors().join(',')
    const isTopLevelComponent = (el) => !findClosestRoot(el.parentElement, true)
    return Array.from(document.querySelectorAll(selectors)).filter(isTopLevelComponent)
}

let rootSelectorCallbacks = []
let initSelectorCallbacks = []

export function rootSelectors() {
    return rootSelectorCallbacks.map((fn) => fn())
}

export function initSelectors() {
    return initSelectorCallbacks.map((fn) => fn())
}

export function allSelectors() {
    return [...rootSelectorCallbacks, ...initSelectorCallbacks].map((fn) => fn())
}

export function addRootSelector(selectorCallback) {
    rootSelectorCallbacks.push(selectorCallback)
}
export function addInitSelector(selectorCallback) {
    initSelectorCallbacks.push(selectorCallback)
}

export function findClosestRoot(el, includeInitSelectors = false) {
    return findClosest(el, (element) => {
        const selectors = includeInitSelectors ? allSelectors() : rootSelectors()
        return selectors.some((selector) => element.matches(selector))
    })
}

export function findClosest(el, callback) {
    if (!el) return

    if (callback(el)) return el

    // TODO: understand it
    // Support crawling up teleports.
    if (el._x_teleportBack) el = el._x_teleportBack

    if (!el.parentElement) return

    return findClosest(el.parentElement, callback)
}

export function isRoot(el) {
    return rootSelectors().some((selector) => el.matches(selector))
}

let initInterceptors = []

export function interceptInit(callback) {
    initInterceptors.push(callback)
}

export function initTree(root, walker = walk, intercept = () => {}) {
    deferHandlingDirectives(() => {
        walker(root, (el, skip) => {
            intercept(el, skip)

            initInterceptors.forEach((fn) => fn(el, skip))

            directives(el, el.attributes).forEach((handle) => handle())

            el._x_ignore && skip()
        })
    })
}

export function destroyTree(root, walker = walk) {
    walker(root, (el) => {
        cleanupElAttrs(el)
        cleanupEl(el)
    })
}
